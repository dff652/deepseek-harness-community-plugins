#!/usr/bin/env python3
"""Browser acceptance for the generated Agent Mail UI client bundle.

This is an optional, fixture-backed browser test.  It loads the checked-in
generated ``packages/dsh-agent-mail-ui/client.js`` in a small host that
provides the same module-loader and sidebar hooks used by DSH.  The HTTP API
is a local synthetic fixture, so this test does not connect to Agent Mail,
write a mailbox, or mutate a DSH profile.

The Selenium package and browser assets are intentionally not repository
dependencies.  Point the test at the reviewed UMD assets from a local DSH
installation, for example:

    DSH_BROWSER_REACT_UMD=/path/to/react/umd/react.production.min.js \
    DSH_BROWSER_REACT_DOM_UMD=/path/to/react-dom/umd/react-dom.production.min.js \
    python3 tests/dsh-agent-mail-ui-browser.acceptance.py

The script uses a temporary Firefox profile and a temporary local HTTP
server.  The report distinguishes this mocked-browser result from full DSH
web/MCP acceptance.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


try:
    from selenium import webdriver
    from selenium.common.exceptions import WebDriverException
    from selenium.webdriver.common.by import By
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service
    from selenium.webdriver.support.ui import WebDriverWait
except ModuleNotFoundError as error:  # pragma: no cover - optional local gate
    print(
        f"SKIP: Selenium is not installed ({error}). "
        "Use a Python environment with Selenium to run browser acceptance.",
    )
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[1]
CLIENT_JS = ROOT / "packages" / "dsh-agent-mail-ui" / "client.js"
WAIT_SECONDS = 15


def required_asset(env_name: str) -> Path:
    value = os.environ.get(env_name, "").strip()
    if not value:
        raise SystemExit(
            f"{env_name} is required; point it at the reviewed local UMD asset "
            "(see this file's docstring).",
        )
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"{env_name} does not name a file: {path}")
    return path


def json_response(ok: bool, value: object = None, error: str = "") -> bytes:
    if ok:
        body = {"ok": True, "value": value}
    else:
        body = {"ok": False, "error": {"code": "fixture", "message": error}}
    return json.dumps(body, separators=(",", ":")).encode("utf-8")


class Fixture:
    """Deterministic Agent Mail API responses for one browser scenario."""

    def __init__(self, scenario: str):
        self.scenario = scenario
        self.lock = threading.Lock()
        self.claim_failed = False
        self.claimed = False
        self.done = False
        self.acked = False
        self.calls: list[dict[str, object]] = []

    @property
    def item(self) -> dict[str, object]:
        return {
            "message_id": "fixture-message-1",
            "thread_id": "fixture-thread-1",
            "task_id": "fixture-task-1",
            "type": "task",
            "from": "worker@local",
            "to": "ui-harness@local",
            "body_md": "Fixture task: verify the Agent Mail UI.",
            "effect_level": "read",
            "unread": True,
            "delivery_status": "claimed" if self.claimed else "pending",
        }

    def thread(self) -> list[dict[str, object]]:
        # Agent Mail alpha4 comm_tail responses may omit thread/task IDs.
        # The UI must therefore retain the IDs from the inbox row and use its
        # local terminalTaskIds fallback after sending Done.
        rows = [{
            "message_id": self.item["message_id"],
            "type": self.item["type"],
            "from": self.item["from"],
            "to": self.item["to"],
            "body_md": self.item["body_md"],
            "effect_level": self.item["effect_level"],
            "unread": self.item["unread"],
        }]
        if self.done:
            rows.append({
                "message_id": "fixture-done-1",
                "type": "done",
                "from": "ui-harness@local",
                "to": "worker@local",
                "body_md": "done",
                "effect_level": "read",
                "unread": False,
            })
        return rows

    def handle(self, method: str, payload: dict[str, object]) -> tuple[int, bytes]:
        with self.lock:
            self.calls.append({"method": method, "payload": payload})
            if method == "status":
                return HTTPStatus.OK, json_response(True, {
                    "live": True,
                    "missing": [],
                    "proxy": "existing-mcp-child",
                    "autoWake": False,
                })
            if method == "diagnose":
                return HTTPStatus.OK, json_response(True, {
                    "agent_id_env": "ui-harness@local",
                    "version": "fixture",
                    "implementation": "synthetic-browser-api",
                    "home_exists": True,
                    "database": {"counts": {"messages": 1}},
                    "warnings": [],
                })
            if method == "agents":
                return HTTPStatus.OK, json_response(True, {
                    "agents": ["ui-harness@local", "worker@local"],
                })
            if method == "inbox":
                return HTTPStatus.OK, json_response(True, {
                    "count": 0 if self.acked else 1,
                    "items": [] if self.acked else [self.item],
                })
            if method == "claim":
                if self.scenario == "failed-claim" and not self.claim_failed:
                    self.claim_failed = True
                    return HTTPStatus.CONFLICT, json_response(False, error="claim fixture failure")
                self.claimed = True
                return HTTPStatus.OK, json_response(True, {"status": "claimed"})
            if method == "tail":
                return HTTPStatus.OK, json_response(True, {"messages": self.thread()})
            if method == "send":
                if payload.get("type") != "done":
                    return HTTPStatus.OK, json_response(True, {
                        "id": "fixture-message-new",
                        "thread_id": "fixture-thread-new",
                        "task_id": "fixture-task-new",
                        "type": payload.get("type", "task"),
                    })
                self.done = True
                return HTTPStatus.OK, json_response(True, {
                    "id": "fixture-done-1",
                    "message_id": "fixture-done-1",
                    "thread_id": "fixture-thread-1",
                    "task_id": "fixture-task-1",
                    "type": "done",
                })
            if method == "ack":
                if not self.done:
                    return HTTPStatus.CONFLICT, json_response(False, error="message is not terminal")
                self.acked = True
                return HTTPStatus.OK, json_response(True, {"status": "acked"})
            if method == "approvals":
                return HTTPStatus.OK, json_response(True, {"items": []})
            return HTTPStatus.NOT_FOUND, json_response(False, error=f"unknown fixture method: {method}")


class Handler(BaseHTTPRequestHandler):
    server_version = "dsh-agent-mail-ui-fixture/1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlparse(self.path).path
        if path == "/":
            self._send(HTTPStatus.OK, self.server.harness_html, "text/html; charset=utf-8")
            return
        if path == "/client.js":
            self._send(HTTPStatus.OK, self.server.client_js, "application/javascript; charset=utf-8")
            return
        if path == "/react.js":
            self._send(HTTPStatus.OK, self.server.react_js, "application/javascript; charset=utf-8")
            return
        if path == "/react-dom.js":
            self._send(HTTPStatus.OK, self.server.react_dom_js, "application/javascript; charset=utf-8")
            return
        self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlparse(self.path).path
        prefix = "/agent-mail-ui/api/"
        if not path.startswith(prefix):
            self._send(HTTPStatus.NOT_FOUND, json_response(False, error="unknown fixture path"), "application/json")
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(size) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("payload is not an object")
        except (ValueError, json.JSONDecodeError) as error:
            self._send(HTTPStatus.BAD_REQUEST, json_response(False, error=str(error)), "application/json")
            return
        status, body = self.server.fixture.handle(path[len(prefix):], payload)
        self._send(status, body, "application/json")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, fixture: Fixture, react_js: bytes, react_dom_js: bytes):
        super().__init__(("127.0.0.1", 0), Handler)
        self.fixture = fixture
        self.client_js = CLIENT_JS.read_bytes()
        self.react_js = react_js
        self.react_dom_js = react_dom_js
        self.harness_html = harness_html()


def harness_html() -> bytes:
    # The test intentionally uses the production-generated bundle, while the
    # surrounding page supplies only the minimum DSH module/context contracts.
    html = r"""<!doctype html>
<html><head><meta charset="utf-8"><title>Agent Mail UI fixture</title>
<style>
html, body, #root { margin: 0; min-height: 100%; height: 100%; }
body { font: 14px sans-serif; color: #222; background: #fff; }
#root { padding: 12px; box-sizing: border-box; }
#sidebar-panel { width: 420px; height: 760px; border: 1px solid #aaa; margin-top: 12px; }
#sidebar-open { font-size: 14px; padding: 6px 10px; }
</style></head><body>
<div id="root"><div id="fixture-shell"></div><div id="sidebar-panel"></div></div>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script>
window.__HARNESS__ = { mode: new URLSearchParams(location.search).get('mode') || 'sidebar' };
window.__ModuleLoader__ = {
  modules: new Map(),
  load(entry) {
    const require = (name) => {
      if (name === 'react') return window.React;
      if (name === 'react-dom/client') return window.ReactDOM;
      throw new Error('fixture module not provided: ' + name);
    };
    const value = entry.factory(require);
    this.modules.set(entry.id, value);
    window.__HARNESS__.ui = value;
  },
};
</script><script src="/client.js"></script>
<script>
(function boot() {
  const mode = window.__HARNESS__.mode;
  const sessionId = 'fixture-session-1';
  const conversationState = { draft: '' };
  const sidebar = mode === 'sidebar' ? {
    tabs: new Map(),
    registerTab(descriptor) {
      this.tabs.set(descriptor.id, descriptor);
      window.__HARNESS__.tab = descriptor;
      return () => this.tabs.delete(descriptor.id);
    },
  } : undefined;
  const ctx = {
    get(name) {
      if (name === 'betterSidebar') return sidebar;
      return undefined;
    },
    effect(callback) {
      const dispose = callback();
      window.__HARNESS__.dispose = dispose;
      return dispose;
    },
    inject() { return () => {}; },
    sessions: {
      list: { getSnapshot: () => [{ id: sessionId }] },
      scope: (id) => id === sessionId ? { id } : undefined,
    },
    get conversation() {
      return {
        input: {
          for() {
            return {
              state: { getSnapshot: () => ({ draft: conversationState.draft }) },
              setDraft(value) {
                conversationState.draft = value;
                window.__HARNESS__.draft = value;
              },
            };
          },
        },
      };
    },
  };
  window.__HARNESS__.ctx = ctx;
  if (mode === 'sidebar') {
    const open = document.createElement('button');
    open.id = 'sidebar-open';
    open.type = 'button';
    open.textContent = 'Agent Mail';
    open.addEventListener('click', () => {
      const descriptor = window.__HARNESS__.tab;
      if (!descriptor) throw new Error('sidebar tab was not registered');
      const root = window.ReactDOM.createRoot(document.getElementById('sidebar-panel'));
      window.__HARNESS__.panelRoot = root;
      root.render(descriptor.component({ ctx, scope: { sessionId }, visible: true }));
    });
    document.getElementById('fixture-shell').append(open);
  }
  window.__HARNESS__.ui.apply(ctx);
})();
</script></body></html>"""
    return html.encode("utf-8")


def text_of(driver) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


def wait_for(driver, predicate, message: str):
    try:
        return WebDriverWait(driver, WAIT_SECONDS, poll_frequency=0.1).until(predicate)
    except Exception as error:
        raise AssertionError(f"timeout waiting for {message}: {text_of(driver)}") from error


def button_with_text(driver, label: str):
    def find(_driver):
        for element in driver.find_elements(By.TAG_NAME, "button"):
            if element.text.strip() == label:
                return element
        return False

    return wait_for(driver, find, f"button {label!r}")


def button_disabled(element) -> bool:
    return element.get_attribute("disabled") is not None or element.get_property("disabled") is True


def click_button(driver, label: str) -> None:
    def find(_driver):
        for element in driver.find_elements(By.TAG_NAME, "button"):
            if element.text.strip() == label and not button_disabled(element):
                return element
        return False

    wait_for(driver, find, f"enabled button {label!r}").click()


def click_button_containing(driver, fragment: str) -> None:
    def find(_driver):
        for element in driver.find_elements(By.TAG_NAME, "button"):
            if fragment in element.text and not button_disabled(element):
                return element
        return False

    wait_for(driver, find, f"button containing {fragment!r}").click()


def wait_api_call(fixture: Fixture, method: str, *, predicate=None) -> dict[str, object]:
    def find() -> dict[str, object] | bool:
        with fixture.lock:
            calls = [call for call in fixture.calls if call["method"] == method]
            if predicate is None and calls:
                return calls[-1]
            if predicate is not None:
                for call in calls:
                    if predicate(call):
                        return call
        return False

    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        result = find()
        if result:
            return result
        time.sleep(0.05)
    with fixture.lock:
        seen = fixture.calls[:]
    raise AssertionError(f"timeout waiting for fixture {method}: {seen}")


def assert_no_standalone(driver) -> None:
    assert not driver.find_elements(By.CSS_SELECTOR, '[data-dsh-agent-mail-ui="standalone"]'), (
        "sidebar mode mounted standalone drawer"
    )


def run_sidebar_done_ack(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario=healthy")
    wait_for(driver, lambda current: current.execute_script("return Boolean(window.__HARNESS__.tab)"), "sidebar registration")
    assert_no_standalone(driver)
    tab_id = driver.execute_script("return window.__HARNESS__.tab.id")
    assert tab_id == "dsh-agent-mail:inbox", tab_id
    click_button(driver, "Agent Mail")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "fixture inbox")
    assert not driver.find_elements(By.CSS_SELECTOR, 'textarea[placeholder="Read-only task body"]'), (
        "new-message composer unexpectedly opened"
    )
    click_button_containing(driver, "Fixture task: verify the Agent Mail UI.")
    wait_for(driver, lambda current: "fixture-thread-1" in text_of(current), "fixture thread")
    wait_api_call(server.fixture, "claim")

    ack = button_with_text(driver, "Ack")
    assert button_disabled(ack), "Ack was enabled before the task became terminal"
    done = button_with_text(driver, "Done")
    assert not button_disabled(done), "Done is coupled to the new-message draft"
    done.click()
    done_call = wait_api_call(
        server.fixture,
        "send",
        predicate=lambda call: call["payload"].get("type") == "done",
    )
    payload = done_call["payload"]
    assert payload == {
        "to": "worker@local",
        "type": "done",
        "body": "done",
        "thread_id": "fixture-thread-1",
        "task_id": "fixture-task-1",
        "effect": "read",
    }, payload
    wait_for(driver, lambda current: "done" in text_of(current), "terminal done row")
    ack = button_with_text(driver, "Ack")
    assert not button_disabled(ack), "Ack stayed disabled after Done"
    ack.click()
    ack_call = wait_api_call(server.fixture, "ack")
    assert ack_call["payload"] == {"message_id": "fixture-message-1"}, ack_call
    wait_for(driver, lambda current: "No mail yet" in text_of(current), "acked inbox refresh")
    return {
        "surface": "sidebar",
        "tabId": tab_id,
        "donePayload": payload,
        "ackPayload": ack_call["payload"],
        "backend": "synthetic local HTTP fixture",
    }


def run_standalone(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=standalone&scenario=healthy")
    wait_for(
        driver,
        lambda current: bool(current.find_elements(By.CSS_SELECTOR, '[data-dsh-agent-mail-ui="standalone"]')),
        "standalone surface",
    )
    assert not driver.find_elements(By.ID, "sidebar-open"), "standalone mode registered sidebar control"
    fab = wait_for(driver, lambda current: current.find_element(By.CSS_SELECTOR, 'button[title="Agent Mail"]'), "mail FAB")
    fab.click()
    wait_for(driver, lambda current: "Agent Mail" in text_of(current), "standalone panel")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "standalone fixture inbox")
    return {
        "surface": "standalone",
        "standaloneHost": True,
        "sidebarTab": False,
        "backend": "synthetic local HTTP fixture",
    }


def run_failed_claim(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario=failed-claim")
    wait_for(driver, lambda current: current.execute_script("return Boolean(window.__HARNESS__.tab)"), "failed-claim sidebar")
    click_button(driver, "Agent Mail")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "failed-claim inbox")
    click_button_containing(driver, "Fixture task: verify the Agent Mail UI.")
    wait_api_call(server.fixture, "claim")

    def visible_claim_error(current) -> bool:
        body = text_of(current).lower()
        return "claim" in body and ("failure" in body or "failed" in body or "error" in body)

    wait_for(driver, visible_claim_error, "claim failure message")
    ack_buttons = driver.find_elements(By.XPATH, "//button[normalize-space()='Ack']")
    assert not ack_buttons or all(button_disabled(button) for button in ack_buttons), (
        "Ack was enabled after claim failed"
    )
    with server.fixture.lock:
        ack_calls = [call for call in server.fixture.calls if call["method"] == "ack"]
    assert not ack_calls, ack_calls
    return {
        "surface": "sidebar",
        "claimFailureVisible": True,
        "ackBlocked": True,
        "backend": "synthetic local HTTP fixture",
    }


def make_driver() -> webdriver.Firefox:
    options = Options()
    options.add_argument("-headless")
    options.add_argument("--width=1200")
    options.add_argument("--height=900")
    firefox = os.environ.get("DSH_BROWSER_FIREFOX", "").strip()
    # Let Selenium Manager resolve distro/snap Firefox by default.  On this
    # host ``which firefox`` is a shell wrapper, which geckodriver correctly
    # rejects as it is not the browser binary itself.
    if firefox:
        options.binary_location = firefox
    gecko = os.environ.get("DSH_BROWSER_GECKODRIVER", "").strip() or shutil.which("geckodriver")
    service = Service(executable_path=gecko) if gecko else Service()
    return webdriver.Firefox(options=options, service=service)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit only the final JSON report (diagnostics still go to stderr)",
    )
    args = parser.parse_args()
    if not CLIENT_JS.is_file():
        raise SystemExit(f"generated client bundle is missing: {CLIENT_JS}")
    react = required_asset("DSH_BROWSER_REACT_UMD").read_bytes()
    react_dom = required_asset("DSH_BROWSER_REACT_DOM_UMD").read_bytes()
    results: list[dict[str, object]] = []
    server: FixtureServer | None = None
    driver = None
    browser_capabilities: dict[str, object] = {}

    def start_server(fixture: Fixture) -> FixtureServer:
        started = FixtureServer(fixture, react, react_dom)
        thread = threading.Thread(target=started.serve_forever, daemon=True)
        thread.start()
        return started

    try:
        server = start_server(Fixture("healthy"))
        driver = make_driver()
        browser_capabilities = dict(driver.capabilities)
        results.append(run_sidebar_done_ack(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("healthy"))
        results.append(run_standalone(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("failed-claim"))
        results.append(run_failed_claim(driver, server))
    except WebDriverException as error:
        print(f"browser startup/transport failure: {error}", file=sys.stderr)
        return 2
    finally:
        if driver is not None:
            driver.quit()
        if server is not None:
            server.shutdown()
            server.server_close()
    report = {
        "status": "PASS",
        "tests": results,
        "generatedBundle": str(CLIENT_JS.relative_to(ROOT)),
        "browser": "Firefox via Selenium",
        "browserVersion": browser_capabilities.get("browserVersion", "unknown"),
        "geckodriverVersion": browser_capabilities.get("moz:geckodriverVersion", "unknown"),
        "backend": "mocked local HTTP fixture; full DSH web/MCP acceptance is not established",
        "writes": "none: temporary browser profile and synthetic in-memory API only",
    }
    if args.json:
        print(json.dumps(report, separators=(",", ":")))
    else:
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
