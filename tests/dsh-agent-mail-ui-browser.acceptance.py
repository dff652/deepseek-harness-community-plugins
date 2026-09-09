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
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.firefox.options import Options as FirefoxOptions
    from selenium.webdriver.firefox.service import Service as FirefoxService
    from selenium.webdriver.support.ui import Select, WebDriverWait
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
        self.send_failed = False
        self.send_completed = False
        self.status_calls = 0
        self.inbox_calls = 0
        self.agents_calls = 0
        self.diagnose_calls = 0
        self.claimed = False
        self.done = False
        self.acked = False
        self.external_ack = False
        self.calls: list[dict[str, object]] = []

    @property
    def item(self) -> dict[str, object]:
        delivery_status = "acked" if self.acked or self.external_ack else "claimed" if self.claimed else "pending"
        return {
            "message_id": "fixture-message-1",
            "thread_id": "fixture-thread-1",
            "task_id": "fixture-task-1",
            "type": "task",
            "from": "worker@local",
            "to": "ui-harness@local",
            "body_md": "Fixture task: verify the Agent Mail UI.",
            "effect_level": "read",
            "delivery_status": delivery_status,
        }

    def roster(self) -> list[str]:
        if self.scenario == "empty-roster":
            return []
        if self.scenario in {"directory", "recipient-refresh-failure", "identity-loss", "recipient-loss", "send-retry", "duplicate-send", "refresh-failure", "send-refresh-failure", "offline"}:
            if self.scenario == "recipient-loss" and self.agents_calls == 2:
                return ["ui-harness@local", "human@local"]
            return ["ui-harness@local", "peer-b@local", "human@local"]
        return ["ui-harness@local", "worker@local"]

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
            "delivery_status": self.item["delivery_status"],
        }]
        if self.done:
            rows.append({
                "message_id": "fixture-done-1",
                "type": "done",
                "from": "ui-harness@local",
                "to": "worker@local",
                "body_md": "done",
                "effect_level": "read",
                "delivery_status": "outbound",
            })
        return rows

    def handle(self, method: str, payload: dict[str, object]) -> tuple[int, bytes]:
        with self.lock:
            self.calls.append({"method": method, "payload": payload})
            if method == "status":
                self.status_calls += 1
                if self.scenario == "offline" and self.status_calls >= 2:
                    return HTTPStatus.OK, json_response(True, {
                        "live": False,
                        "missing": ["mcp__agent-mail__comm_inbox"],
                        "proxy": "existing-mcp-child",
                        "autoWake": False,
                        "clientPresence": "unknown",
                        "deliveryReceipts": "unavailable",
                        "manualRefresh": True,
                    })
                return HTTPStatus.OK, json_response(True, {
                    "live": True,
                    "missing": [],
                    "proxy": "existing-mcp-child",
                    "autoWake": False,
                    "clientPresence": "unknown",
                    "deliveryReceipts": "unavailable",
                    "manualRefresh": True,
                })
            if method == "diagnose":
                self.diagnose_calls += 1
                if self.scenario == "identity-loss" and self.diagnose_calls == 2:
                    return HTTPStatus.SERVICE_UNAVAILABLE, json_response(False, error="diagnostic fixture failure")
                return HTTPStatus.OK, json_response(True, {
                    "agent_id_env": "ui-harness@local",
                    "version": "fixture",
                    "implementation": "synthetic-browser-api",
                    "home_exists": True,
                    "database": {"counts": {"messages": 1}},
                    "agents": self.roster(),
                    "warnings": [],
                })
            if method == "agents":
                self.agents_calls += 1
                if self.scenario == "recipient-refresh-failure" and self.agents_calls == 2:
                    return HTTPStatus.SERVICE_UNAVAILABLE, json_response(False, error="recipient directory failed")
                return HTTPStatus.OK, json_response(True, {"agents": self.roster()})
            if method == "inbox":
                self.inbox_calls += 1
                if self.scenario in {"refresh-failure", "send-refresh-failure"} and self.inbox_calls == 2:
                    return HTTPStatus.SERVICE_UNAVAILABLE, json_response(False, error="directory refresh failed")
                unread_only = payload.get("unread_only", True) is not False
                if self.scenario == "empty-roster":
                    return HTTPStatus.OK, json_response(True, {"count": 0, "items": []})
                shown = [] if (self.acked or self.external_ack) and unread_only else [self.item]
                return HTTPStatus.OK, json_response(True, {
                    "count": len(shown),
                    "items": shown,
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
                if self.scenario == "send-retry" and not self.send_failed:
                    self.send_failed = True
                    return HTTPStatus.SERVICE_UNAVAILABLE, json_response(False, error="send fixture failure")
                if payload.get("type") != "done":
                    if self.scenario == "duplicate-send":
                        time.sleep(0.4)
                    self.send_completed = True
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
#sidebar-panel { width: min(420px, 100%); height: 760px; border: 1px solid #aaa; margin-top: 12px; box-sizing: border-box; }
#sidebar-open { font-size: 14px; padding: 6px 10px; }
html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="dark"] body { background: #151922; color: #eef2f7; }
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
  const theme = new URLSearchParams(location.search).get('theme');
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.__HARNESS__.theme = theme;
  }
  const sessionIds = ['fixture-session-1', 'fixture-session-2'];
  const drafts = Object.fromEntries(sessionIds.map((id) => [id, '']));
  const sessionListeners = new Set();
  const sessionSnapshot = {
    ids: sessionIds.slice(),
    byId: Object.fromEntries(sessionIds.map((id) => [id, { id, title: id }])) ,
    current: sessionIds[0],
  };
  const sessionList = {
    getSnapshot: () => sessionSnapshot,
    subscribe(listener) {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
  };
  const sessionScope = (id) => sessionIds.includes(id) ? { sessionId: id } : undefined;
  const openSession = (id) => {
    if (!sessionIds.includes(id)) throw new Error('unknown fixture session: ' + id);
    sessionSnapshot.current = id;
    for (const listener of sessionListeners) listener();
    window.__HARNESS__.currentSession = id;
  };
  const conversation = {
    input: {
      for(scope) {
        const id = scope?.sessionId;
        if (!sessionIds.includes(id)) throw new Error('unknown conversation scope');
        return {
          state: { getSnapshot: () => ({ draft: drafts[id] }) },
          setDraft(value) {
            drafts[id] = value;
            window.__HARNESS__.drafts = { ...drafts };
            window.__HARNESS__.draft = value;
          },
        };
      },
    },
  };
  window.__HARNESS__.drafts = { ...drafts };
  window.__HARNESS__.currentSession = sessionSnapshot.current;
  window.__HARNESS__.sessions = { list: sessionList, open: openSession, scope: sessionScope };
  window.__HARNESS__.toolViews = new Map();
  window.__HARNESS__.toolOwners = [];
  const sidebar = mode === 'sidebar' ? {
    tabs: new Map(),
    registerTab(descriptor) {
      this.tabs.set(descriptor.id, descriptor);
      window.__HARNESS__.tab = descriptor;
      return () => this.tabs.delete(descriptor.id);
    },
  } : undefined;
  const slots = {
    inject(_slot, factory) {
      factory();
      return () => {};
    },
    register(meta, component) {
      const key = meta.key || meta.id || meta.name;
      window.__HARNESS__.toolViews.set(key, { meta, component });
      return () => window.__HARNESS__.toolViews.delete(key);
    },
  };
  const pluginCtx = {
    sessions: { list: sessionList, scope: sessionScope },
    get(name) {
      if (name === 'betterSidebar') return sidebar;
      if (name === 'slots') return slots;
      if (name === 'conversation') return conversation;
      return undefined;
    },
    effect(callback) {
      const dispose = callback();
      window.__HARNESS__.dispose = dispose;
      return dispose;
    },
    inject(_deps, callback) {
      callback({ betterSidebar: sidebar });
      return () => {};
    },
  };
  const ownerCtx = {
    sessions: { list: sessionList, scope: sessionScope },
    get(name) {
      if (name === 'conversation') return conversation;
      return undefined;
    },
  };
  window.__HARNESS__.ctx = pluginCtx;
  window.__HARNESS__.ownerCtx = ownerCtx;
  const mountSidebar = () => {
    const descriptor = window.__HARNESS__.tab;
    if (!descriptor) throw new Error('sidebar tab was not registered');
    const root = window.ReactDOM.createRoot(document.getElementById('sidebar-panel'));
    window.__HARNESS__.panelRoot = root;
    root.render(descriptor.component({
      ctx: ownerCtx,
      store: { getState: () => ({}) },
      scope: { sessionId: sessionSnapshot.current },
      tab: { id: descriptor.id, title: descriptor.title },
      visible: true,
    }));
  };
  window.__HARNESS__.mountSidebar = mountSidebar;
  window.__HARNESS__.renderToolCards = () => {
    const root = window.ReactDOM.createRoot(document.getElementById('tool-cards'));
    window.__HARNESS__.toolRoot = root;
    const running = {
      callId: 'fixture-call-running',
      name: 'mcp__agent-mail__comm_inbox',
      argsRaw: '{}',
      turn: 1,
      step: 1,
      time: 1700000000000,
      callView: null,
      subCalls: [],
    };
    const success = {
      kind: 'tool-result',
      seq: 2,
      time: 1700000000100,
      callId: 'fixture-call-success',
      call: { name: 'mcp__agent-mail__comm_send', argsRaw: '{}' },
      callTime: 1700000000000,
      content: [{ type: 'text', text: '{"id":"fixture-success"}' }],
      isError: false,
      error: null,
      meta: null,
      callView: null,
      resultView: null,
      subCalls: [],
    };
    const failure = {
      kind: 'tool-result',
      seq: 3,
      time: 1700000000200,
      callId: 'fixture-call-error',
      call: { name: 'mcp__agent-mail__comm_send', argsRaw: '{}' },
      callTime: 1700000000000,
      content: [{ type: 'text', text: 'send failed' }],
      isError: true,
      error: { name: 'FixtureError', code: 'fixture-failed' },
      meta: null,
      callView: null,
      resultView: null,
      subCalls: [],
    };
    const cards = [
      ['mcp__agent-mail__comm_inbox', running],
      ['mcp__agent-mail__comm_send', success],
      ['mcp__agent-mail__comm_send', failure],
    ];
    const views = cards.map(([toolName, block], index) => {
      const view = window.__HARNESS__.toolViews.get(toolName);
      if (!view) throw new Error('tool view was not registered: ' + toolName);
      const owner = {
        callId: block.callId,
        toolName,
        block,
        cwd: '/fixture',
        openFile() {},
        inspect() {},
      };
      window.__HARNESS__.toolOwners.push(owner);
      return window.React.createElement(
        () => view.component(owner),
        { key: index },
      );
    });
    root.render(window.React.createElement('div', null, views));
  };
  if (mode === 'sidebar') {
    const open = document.createElement('button');
    open.id = 'sidebar-open';
    open.type = 'button';
    open.textContent = 'Agent Mail';
    open.addEventListener('click', mountSidebar);
    document.getElementById('fixture-shell').append(open);
  }
  const sessionTwo = document.createElement('button');
  sessionTwo.id = 'session-two';
  sessionTwo.type = 'button';
  sessionTwo.textContent = 'Open session 2';
  sessionTwo.addEventListener('click', () => openSession('fixture-session-2'));
  document.getElementById('fixture-shell').append(sessionTwo);
  const toolCards = document.createElement('div');
  toolCards.id = 'tool-cards';
  document.getElementById('fixture-shell').append(toolCards);
  window.__HARNESS__.ui.apply(pluginCtx);
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


def button_containing(driver, fragment: str):
    def find(_driver):
        for element in driver.find_elements(By.TAG_NAME, "button"):
            if fragment in element.text:
                return element
        return False

    return wait_for(driver, find, f"button containing {fragment!r}")


def select_values(driver) -> list[str]:
    return driver.execute_script(
        "return Array.from(document.querySelectorAll('select option'), (option) => option.value);"
    )


def recipient_element(driver, recipient: str):
    by_data = driver.find_elements(By.CSS_SELECTOR, f'[data-recipient-id="{recipient}"]')
    if by_data:
        return by_data[0]
    return wait_for(
        driver,
        lambda current: next(
            (
                element for element in current.find_elements(By.XPATH, "//*")
                if element.text.strip() == recipient
            ),
            False,
        ),
        f"recipient {recipient!r}",
    )


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


def api_calls(fixture: Fixture, method: str) -> list[dict[str, object]]:
    with fixture.lock:
        return [call for call in fixture.calls if call["method"] == method]


def assert_no_standalone(driver) -> None:
    assert not driver.find_elements(By.CSS_SELECTOR, '[data-dsh-agent-mail-ui="standalone"]'), (
        "sidebar mode mounted standalone drawer"
    )


def expand_diagnostics(driver) -> None:
    controls = [
        button for button in driver.find_elements(By.TAG_NAME, "button")
        if button.get_attribute("aria-expanded") == "false"
        and ("连接" in button.text or "诊断" in button.text)
    ]
    if controls:
        controls[0].click()
        wait_for(
            driver,
            lambda current: any(
                button.get_attribute("aria-expanded") == "true"
                for button in current.find_elements(By.TAG_NAME, "button")
                if "连接" in button.text or "诊断" in button.text
            ),
            "expanded connection diagnostics",
        )
        return
    details = [
        item for item in driver.find_elements(By.TAG_NAME, "details")
        if item.find_elements(By.TAG_NAME, "summary")
        and ("连接" in item.find_element(By.TAG_NAME, "summary").text
             or "诊断" in item.find_element(By.TAG_NAME, "summary").text)
    ]
    if details:
        details[0].find_element(By.TAG_NAME, "summary").click()


def run_sidebar_done_ack(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario=healthy")
    wait_for(driver, lambda current: current.execute_script("return Boolean(window.__HARNESS__.tab)"), "sidebar registration")
    assert_no_standalone(driver)
    tab_id = driver.execute_script("return window.__HARNESS__.tab.id")
    assert tab_id == "dsh-agent-mail:inbox", tab_id
    click_button(driver, "Agent Mail")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "fixture inbox")
    expand_diagnostics(driver)
    wait_for(driver, lambda current: "客户端连接：未知" in text_of(current), "presence status")
    wait_for(driver, lambda current: "自动唤醒：关闭" in text_of(current), "auto-wake status")
    wait_for(driver, lambda current: "最后刷新：" in text_of(current), "refresh timestamp")
    assert not driver.find_elements(By.CSS_SELECTOR, 'textarea[placeholder="请输入只读任务内容"]'), (
        "new-message composer unexpectedly opened"
    )

    click_button(driver, "写消息")
    wait_for(driver, lambda current: bool(current.find_elements(By.CSS_SELECTOR, 'textarea[placeholder="请输入只读任务内容"]')), "message composer")
    selects = driver.find_elements(By.TAG_NAME, "select")
    assert len(selects) == 2, "composer did not render recipient and type controls"
    Select(selects[0]).select_by_value("worker@local")
    Select(selects[1]).select_by_value("message")
    wait_for(driver, lambda current: bool(current.find_elements(By.CSS_SELECTOR, 'textarea[placeholder="请输入消息内容"]')), "message type label")
    composer = driver.find_element(By.CSS_SELECTOR, 'textarea[placeholder="请输入消息内容"]')
    composer.send_keys("Fixture message: roster presence is unknown.")
    click_button(driver, "发送消息")
    message_call = wait_api_call(
        server.fixture,
        "send",
        predicate=lambda call: call["payload"].get("type") == "message",
    )
    assert message_call["payload"] == {
        "to": "worker@local",
        "type": "message",
        "body": "Fixture message: roster presence is unknown.",
        "effect": "read",
    }, message_call
    wait_for(driver, lambda current: "已发送（本次面板：1）" in text_of(current), "local sent record")
    wait_for(driver, lambda current: "已提交到邮箱" in text_of(current), "outbound state")
    assert "签收状态未知" in text_of(driver), "outbound record claimed a receipt"
    click_button(driver, "收件箱")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "inbox after local send")

    click_button_containing(driver, "Fixture task: verify the Agent Mail UI.")
    wait_for(driver, lambda current: "Fixture task: verify the Agent Mail UI." in text_of(current), "fixture thread")
    wait_api_call(server.fixture, "claim")
    wait_for(
        driver,
        lambda current: any(
            "Fixture task: verify the Agent Mail UI." in button.text
            and "已领取" in button.text and "待领取" not in button.text
            for button in current.find_elements(By.TAG_NAME, "button")
        ),
        "inbox row synchronized after claim",
    )

    separator = driver.find_element(By.CSS_SELECTOR, '[role="separator"]')
    assert separator.get_attribute("tabindex") == "0", "resize separator is not keyboard focusable"
    assert separator.get_attribute("aria-orientation") == "horizontal", separator.get_attribute("outerHTML")
    separator.send_keys(Keys.ARROW_DOWN)
    wait_for(driver, lambda current: current.find_element(By.CSS_SELECTOR, '[role="separator"]').get_attribute("aria-valuenow") is not None, "keyboard resize")
    separator = driver.find_element(By.CSS_SELECTOR, '[role="separator"]')
    separator.send_keys(Keys.ESCAPE)
    wait_for(driver, lambda current: current.find_element(By.CSS_SELECTOR, '[role="separator"]').get_attribute("aria-valuenow") is None, "automatic resize reset")
    details = driver.find_element(By.TAG_NAME, "details")
    assert details.get_attribute("open") is None, "internal IDs should be collapsed initially"
    details.find_element(By.TAG_NAME, "summary").click()
    wait_for(driver, lambda current: "thread_id：fixture-thread-1" in text_of(current), "expanded message IDs")

    ack = button_with_text(driver, "确认收悉")
    assert button_disabled(ack), "Ack was enabled before the task became terminal"
    done = button_with_text(driver, "标记完成")
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
    ack = button_with_text(driver, "确认收悉")
    assert not button_disabled(ack), "Ack stayed disabled after Done"
    ack.click()
    ack_call = wait_api_call(server.fixture, "ack")
    assert ack_call["payload"] == {"message_id": "fixture-message-1"}, ack_call
    wait_for(driver, lambda current: "暂无邮件" in text_of(current), "acked inbox refresh")
    checkbox = driver.find_element(By.CSS_SELECTOR, 'input[type="checkbox"]')
    assert checkbox.is_selected(), "Unread only filter was not enabled initially"
    checkbox.click()
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "all-mail acknowledged row")
    wait_api_call(
        server.fixture,
        "inbox",
        predicate=lambda call: call["payload"].get("unread_only") is False,
    )
    assert driver.execute_script("return window.__HARNESS__.tab.badge()") is None, (
        "acknowledged all-mail row incorrectly contributes to unread badge"
    )
    return {
        "surface": "sidebar",
        "tabId": tab_id,
        "donePayload": payload,
        "ackPayload": ack_call["payload"],
        "allMailAcked": True,
        "unreadBadge": None,
        "backend": "synthetic local HTTP fixture",
    }


def run_external_ack_refresh(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario=external-ack")
    wait_for(driver, lambda current: current.execute_script("return Boolean(window.__HARNESS__.tab)"), "external-ack sidebar")
    click_button(driver, "Agent Mail")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "external-ack inbox")
    click_button_containing(driver, "Fixture task: verify the Agent Mail UI.")
    wait_for(driver, lambda current: "已领取" in text_of(current), "claimed state")
    wait_api_call(server.fixture, "claim")

    with server.fixture.lock:
        server.fixture.external_ack = True
    click_button(driver, "手动刷新")
    wait_for(driver, lambda current: "暂无邮件" in text_of(current), "externally acknowledged inbox")
    wait_for(driver, lambda current: "投递/签收：已确认收悉" in text_of(current), "refreshed acknowledgement state")
    assert not driver.find_elements(By.XPATH, "//button[normalize-space()='确认收悉']"), (
        "confirmation action remained available after external acknowledgement"
    )
    return {
        "surface": "sidebar",
        "externalAck": True,
        "manualRefreshSyncedSelectedState": True,
        "ackActionHidden": True,
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
    click_button_containing(driver, "Fixture task: verify the Agent Mail UI.")
    wait_for(driver, lambda current: "参与者：worker@local、ui-harness@local" in text_of(current), "standalone fixture thread")
    click_button(driver, "Open session 2")
    wait_for(
        driver,
        lambda current: current.execute_script("return window.__HARNESS__.currentSession") == "fixture-session-2",
        "active session navigation while drawer is open",
    )
    click_button(driver, "引用到对话")
    quote = driver.execute_script("return window.__HARNESS__.drafts")
    assert "message_id=fixture-message-1" in quote["fixture-session-2"], quote
    assert quote["fixture-session-1"] == "", quote
    return {
        "surface": "standalone",
        "standaloneHost": True,
        "sidebarTab": False,
        "activeSession": "fixture-session-2",
        "quoteDraft": quote["fixture-session-2"],
        "backend": "synthetic local HTTP fixture",
    }


def run_tool_cards(driver, server: FixtureServer) -> dict[str, object]:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=tool-cards&scenario=tool-cards")
    wait_for(
        driver,
        lambda current: current.execute_script("return window.__HARNESS__.toolViews.size") >= 4,
        "tool-card registrations",
    )
    driver.execute_script("window.__HARNESS__.renderToolCards()")
    wait_for(driver, lambda current: "执行中" in text_of(current), "running tool card")
    wait_for(driver, lambda current: "已提交到邮箱" in text_of(current), "successful tool card")
    wait_for(driver, lambda current: "发送失败" in text_of(current), "failed tool card")
    owners = driver.execute_script("return window.__HARNESS__.toolOwners")
    assert len(owners) == 3, owners
    assert all(owner.get("block") for owner in owners), owners
    assert owners[0]["block"].get("kind") is None, owners[0]
    assert owners[1]["block"].get("kind") == "tool-result", owners[1]
    assert owners[2]["block"].get("isError") is True, owners[2]
    return {
        "surface": "fixture-tool-cards",
        "running": True,
        "success": True,
        "error": True,
        "ownerShape": "DSH ToolCallOwnerProps with block",
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
    ack_buttons = driver.find_elements(By.XPATH, "//button[normalize-space()='确认收悉']")
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


def open_sidebar(driver, server: FixtureServer, scenario: str) -> None:
    driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario={scenario}")
    wait_for(driver, lambda current: current.execute_script("return Boolean(window.__HARNESS__.tab)"), f"{scenario} sidebar")
    click_button(driver, "Agent Mail")
    wait_for(driver, lambda current: "当前邮箱：" in text_of(current), f"{scenario} panel")


def run_recipient_directory(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "directory")
    wait_for(
        driver,
        lambda current: (
            "当前邮箱：ui-harness@local" in text_of(current)
            or "当前身份：ui-harness@local" in text_of(current)
        ),
        "current identity",
    )
    diagnostic_controls = [
        button for button in driver.find_elements(By.TAG_NAME, "button")
        if button.get_attribute("aria-expanded") is not None
        and ("连接" in button.text or "诊断" in button.text)
    ]
    diagnostic_details = [
        details for details in driver.find_elements(By.TAG_NAME, "details")
        if "诊断" in details.text
        or "诊断" in (details.find_element(By.TAG_NAME, "summary").text if details.find_elements(By.TAG_NAME, "summary") else "")
    ]
    assert diagnostic_controls or diagnostic_details, "diagnostics are not exposed as a collapsible control"
    assert all(
        control.get_attribute("aria-expanded") == "false" for control in diagnostic_controls
    ), "diagnostics expanded by default"
    assert all(details.get_attribute("open") is None for details in diagnostic_details), "diagnostics expanded by default"

    click_button(driver, "收件人")
    wait_for(driver, lambda current: "peer-b@local" in text_of(current), "registered recipient")
    node = recipient_element(driver, "peer-b@local")
    assert "human@local" not in node.text, node.text
    assert "在线" not in node.text, node.text
    assert not driver.find_elements(By.XPATH, "//*[normalize-space()='human@local']"), "human identity leaked into recipient view"
    assert not driver.find_elements(By.XPATH, "//*[normalize-space()='ui-harness@local']"), "current identity leaked into recipient rows"

    click_button(driver, "收件箱")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "inbox view")
    click_button_containing(driver, "已发送")
    wait_for(driver, lambda current: "发送记录" in text_of(current) or "还没有发送" in text_of(current), "sent view")
    click_button(driver, "收件人")
    wait_for(driver, lambda current: "peer-b@local" in text_of(current), "recipient view after folder navigation")

    node = recipient_element(driver, "peer-b@local")
    driver.execute_script("arguments[0].closest('button')?.click() || arguments[0].click()", node)
    if not any(
        select.get_attribute("value") == "peer-b@local"
        for select in driver.find_elements(By.TAG_NAME, "select")
    ):
        click_button_containing(driver, "写消息")
    wait_for(
        driver,
        lambda current: any(
            select.get_attribute("value") == "peer-b@local"
            for select in current.find_elements(By.TAG_NAME, "select")
        ),
        "composer preselected recipient",
    )
    assert "peer-b@local" in select_values(driver), select_values(driver)
    return {
        "surface": "sidebar",
        "identity": "ui-harness@local",
        "recipient": "peer-b@local",
        "excluded": ["ui-harness@local", "human@local"],
        "diagnosticsCollapsed": True,
        "views": ["inbox", "sent", "recipients"],
        "composerPreselected": True,
        "backend": "synthetic local HTTP fixture",
    }


def run_empty_roster(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "empty-roster")
    click_button(driver, "收件人")
    wait_for(
        driver,
        lambda current: not current.find_elements(By.XPATH, "//*[normalize-space()='peer-b@local']"),
        "empty recipient directory",
    )
    values = select_values(driver)
    assert "peer-b@local" not in values and "human@local" not in values, values
    body = text_of(driver)
    assert any(word in body for word in ("暂无", "为空", "登记", "注册", "目录")), body
    return {
        "surface": "sidebar",
        "emptyRoster": True,
        "inventedRecipients": False,
        "enrollmentGuidance": True,
        "backend": "synthetic local HTTP fixture",
    }


def run_recipient_refresh_retry(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "recipient-refresh-failure")
    click_button(driver, "收件人")
    wait_for(driver, lambda current: "peer-b@local" in text_of(current), "recipient refresh initial list")
    click_button_containing(driver, "刷新收件人")
    wait_for(driver, lambda current: "recipient directory failed" in text_of(current), "recipient refresh failure")
    assert "peer-b@local" not in text_of(driver), "stale recipients remained after directory refresh failed"
    click_button_containing(driver, "刷新收件人")
    wait_for(
        driver,
        lambda current: "peer-b@local" in text_of(current) and "recipient directory failed" not in text_of(current),
        "recipient refresh retry",
    )
    return {
        "surface": "sidebar",
        "refreshFailureVisible": True,
        "staleRecipientsCleared": True,
        "refreshRetrySucceeded": True,
        "backend": "synthetic local HTTP fixture",
    }


def compose_recipient_draft(driver, server: FixtureServer, scenario: str, body: str):
    open_sidebar(driver, server, scenario)
    click_button_containing(driver, "写消息")
    wait_for(driver, lambda current: len(current.find_elements(By.TAG_NAME, "select")) >= 1, f"{scenario} composer")
    Select(driver.find_elements(By.TAG_NAME, "select")[0]).select_by_value("peer-b@local")
    composer = wait_for(
        driver,
        lambda current: next(
            (element for element in current.find_elements(By.TAG_NAME, "textarea") if element.is_displayed()),
            False,
        ),
        f"{scenario} draft textarea",
    )
    composer.send_keys(body)
    return body


def run_identity_loss_disables_send(driver, server: FixtureServer) -> dict[str, object]:
    draft = compose_recipient_draft(
        driver,
        server,
        "identity-loss",
        "Keep this draft while identity diagnostics recover.",
    )
    click_button(driver, "手动刷新")
    wait_for(driver, lambda current: "诊断读取失败" in text_of(current), "diagnostic failure")
    assert "peer-b@local" not in select_values(driver), "stale recipient remained after identity loss"
    send = button_with_text(driver, "发送只读任务")
    assert button_disabled(send), "send remained enabled without a confirmed sender identity"
    assert len(api_calls(server.fixture, "send")) == 0, api_calls(server.fixture, "send")

    click_button_containing(driver, "重试")
    wait_for(
        driver,
        lambda current: "peer-b@local" in select_values(current)
        and "诊断读取失败" not in text_of(current),
        "diagnostic recovery",
    )
    composer = driver.find_element(By.TAG_NAME, "textarea")
    assert composer.get_attribute("value") == draft, "identity recovery discarded the draft"
    assert driver.find_element(By.CSS_SELECTOR, "select").get_attribute("value") == "peer-b@local"
    send = button_with_text(driver, "发送只读任务")
    assert not button_disabled(send), "send stayed disabled after identity recovery"
    send.click()
    wait_api_call(server.fixture, "send")
    assert len(api_calls(server.fixture, "send")) == 1, api_calls(server.fixture, "send")
    wait_for(driver, lambda current: "已发送" in text_of(current), "send after identity recovery")
    return {
        "surface": "sidebar",
        "diagnosticFailure": True,
        "sendDisabledWithoutIdentity": True,
        "zeroMutationDuringFailure": True,
        "draftRetainedOnRecovery": True,
        "sendCalls": 1,
        "backend": "synthetic local HTTP fixture",
    }


def run_recipient_loss_disables_send(driver, server: FixtureServer) -> dict[str, object]:
    draft = compose_recipient_draft(
        driver,
        server,
        "recipient-loss",
        "Keep this draft while the recipient directory recovers.",
    )
    click_button(driver, "手动刷新")
    wait_for(
        driver,
        lambda current: "peer-b@local" not in select_values(current)
        and server.fixture.agents_calls >= 2,
        "recipient removal",
    )
    send = button_with_text(driver, "发送只读任务")
    assert button_disabled(send), "send remained enabled for a recipient removed from the roster"
    assert len(api_calls(server.fixture, "send")) == 0, api_calls(server.fixture, "send")

    click_button(driver, "手动刷新")
    wait_for(
        driver,
        lambda current: "peer-b@local" in select_values(current)
        and server.fixture.agents_calls >= 3,
        "recipient recovery",
    )
    composer = driver.find_element(By.TAG_NAME, "textarea")
    assert composer.get_attribute("value") == draft, "recipient recovery discarded the draft"
    assert driver.find_element(By.CSS_SELECTOR, "select").get_attribute("value") == "peer-b@local"
    send = button_with_text(driver, "发送只读任务")
    assert not button_disabled(send), "send stayed disabled after recipient recovery"
    send.click()
    wait_api_call(server.fixture, "send")
    assert len(api_calls(server.fixture, "send")) == 1, api_calls(server.fixture, "send")
    wait_for(driver, lambda current: "已发送" in text_of(current), "send after recipient recovery")
    return {
        "surface": "sidebar",
        "recipientRemoved": True,
        "sendDisabledForUnknownRecipient": True,
        "zeroMutationDuringFailure": True,
        "draftRetainedOnRecovery": True,
        "sendCalls": 1,
        "backend": "synthetic local HTTP fixture",
    }


def run_send_retry(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "send-retry")
    click_button_containing(driver, "写消息")
    wait_for(driver, lambda current: len(current.find_elements(By.TAG_NAME, "select")) >= 1, "retry composer")
    selects = driver.find_elements(By.TAG_NAME, "select")
    Select(selects[0]).select_by_value("peer-b@local")
    composer = wait_for(
        driver,
        lambda current: next(
            (element for element in current.find_elements(By.TAG_NAME, "textarea") if element.is_displayed()),
            False,
        ),
        "retry draft textarea",
    )
    draft = "Keep this draft while the first send fails."
    composer.send_keys(draft)
    send = next(
        element for element in driver.find_elements(By.TAG_NAME, "button")
        if "发送" in element.text and not button_disabled(element)
    )
    send.click()
    wait_api_call(server.fixture, "send")
    wait_for(driver, lambda current: "send fixture failure" in text_of(current), "send failure")
    composer = driver.find_element(By.TAG_NAME, "textarea")
    assert composer.get_attribute("value") == draft, "failed send discarded the draft"
    wait_for(
        driver,
        lambda current: any("发送" in element.text and not button_disabled(element)
                            for element in current.find_elements(By.TAG_NAME, "button")),
        "retry action enabled",
    )
    click_button_containing(driver, "发送")
    wait_for(driver, lambda current: len(api_calls(server.fixture, "send")) == 2, "successful retry")
    wait_for(driver, lambda current: "已发送" in text_of(current), "sent view after retry")
    return {
        "surface": "sidebar",
        "failureVisible": True,
        "draftRetainedOnFailure": True,
        "retrySucceeded": True,
        "sendCalls": len(api_calls(server.fixture, "send")),
        "backend": "synthetic local HTTP fixture",
    }


def run_duplicate_send_guard(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "duplicate-send")
    click_button_containing(driver, "写消息")
    wait_for(driver, lambda current: len(current.find_elements(By.TAG_NAME, "select")) >= 1, "duplicate composer")
    Select(driver.find_elements(By.TAG_NAME, "select")[0]).select_by_value("peer-b@local")
    composer = wait_for(
        driver,
        lambda current: next(
            (element for element in current.find_elements(By.TAG_NAME, "textarea") if element.is_displayed()),
            False,
        ),
        "duplicate draft textarea",
    )
    composer.send_keys("Only one request should be issued.")
    send = next(
        element for element in driver.find_elements(By.TAG_NAME, "button")
        if "发送" in element.text and not button_disabled(element)
    )
    driver.execute_script("arguments[0].click(); arguments[0].click();", send)
    wait_api_call(server.fixture, "send")
    wait_for(driver, lambda _current: server.fixture.send_completed, "single send completion")
    assert len(api_calls(server.fixture, "send")) == 1, api_calls(server.fixture, "send")
    wait_for(driver, lambda current: "已发送" in text_of(current), "single sent record")
    return {
        "surface": "sidebar",
        "duplicateClicks": 2,
        "sendCalls": 1,
        "backend": "synthetic local HTTP fixture",
    }


def run_refresh_retry(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "refresh-failure")
    wait_for(driver, lambda current: "Fixture task" in text_of(current), "initial refresh")
    click_button_containing(driver, "刷新")
    wait_for(
        driver,
        lambda current: "directory refresh failed" in text_of(current)
        or "收件箱读取失败" in text_of(current),
        "refresh failure",
    )
    click_button_containing(driver, "刷新")
    wait_for(
        driver,
        lambda current: "Fixture task" in text_of(current)
        and "收件箱读取失败" not in text_of(current)
        and "directory refresh failed" not in text_of(current),
        "refresh retry",
    )
    return {
        "surface": "sidebar",
        "refreshFailureVisible": True,
        "refreshRetrySucceeded": True,
        "backend": "synthetic local HTTP fixture",
    }


def run_send_refresh_failure(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "send-refresh-failure")
    click_button_containing(driver, "写消息")
    wait_for(driver, lambda current: len(current.find_elements(By.TAG_NAME, "select")) >= 1, "post-send-refresh composer")
    Select(driver.find_elements(By.TAG_NAME, "select")[0]).select_by_value("peer-b@local")
    composer = wait_for(
        driver,
        lambda current: next(
            (element for element in current.find_elements(By.TAG_NAME, "textarea") if element.is_displayed()),
            False,
        ),
        "post-send-refresh draft textarea",
    )
    composer.send_keys("Mutation succeeds before the refresh fails.")
    click_button_containing(driver, "发送")
    wait_api_call(server.fixture, "send")
    wait_for(
        driver,
        lambda current: "directory refresh failed" in text_of(current)
        or "刷新失败" in text_of(current),
        "post-send refresh failure",
    )
    body = text_of(driver)
    assert "已提交" in body or "操作已成功" in body, body
    assert "发送失败" not in body, body
    assert len(api_calls(server.fixture, "send")) == 1
    visible_textareas = [
        element for element in driver.find_elements(By.TAG_NAME, "textarea")
        if element.is_displayed()
    ]
    assert not visible_textareas or all(element.get_attribute("value") == "" for element in visible_textareas), (
        "successful send retained a draft that could be submitted again"
    )
    return {
        "surface": "sidebar",
        "mutationSucceeded": True,
        "refreshFailureVisible": True,
        "sendCalls": 1,
        "reportedAsSendFailure": False,
        "backend": "synthetic local HTTP fixture",
    }


def run_offline_clears_recipients(driver, server: FixtureServer) -> dict[str, object]:
    open_sidebar(driver, server, "offline")
    click_button(driver, "收件人")
    wait_for(driver, lambda current: "peer-b@local" in text_of(current), "initial roster")
    click_button_containing(driver, "刷新")
    wait_for(driver, lambda current: "通信工具未加载" in text_of(current), "offline state")
    assert "peer-b@local" not in text_of(driver), "stale roster remained after MCP went offline"
    send_buttons = [
        element for element in driver.find_elements(By.TAG_NAME, "button")
        if element.text.strip() in {"写消息", "发送只读任务", "发送消息"}
    ]
    assert not send_buttons or all(button_disabled(button) for button in send_buttons), (
        "send action remained enabled while MCP was offline"
    )
    return {
        "surface": "sidebar",
        "initialRoster": True,
        "offline": True,
        "staleRosterCleared": True,
        "sendDisabled": True,
        "backend": "synthetic local HTTP fixture",
    }


def run_theme_and_narrow_geometry(driver, server: FixtureServer) -> dict[str, object]:
    driver.set_window_size(380, 800)
    try:
        measurements = {}
        for theme in ("light", "dark"):
            driver.get(f"http://127.0.0.1:{server.server_port}/?mode=sidebar&scenario=directory&theme={theme}")
            wait_for(
                driver,
                lambda current, expected=theme: (
                    current.execute_script("return document.documentElement.dataset.theme") == expected
                    and current.execute_script("return document.documentElement.style.colorScheme") == expected
                ),
                f"{theme} theme",
            )
            click_button(driver, "Agent Mail")
            wait_for(driver, lambda current: "当前邮箱：" in text_of(current) or "当前身份：" in text_of(current), f"{theme} panel")
            measurements[theme] = driver.execute_script("""
          const panel = document.querySelector('#sidebar-panel > div');
          const rect = panel?.getBoundingClientRect();
          return {
            viewport: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            panelWidth: rect?.width ?? 0,
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            bodyColor: getComputedStyle(document.body).color,
            bodyBackground: getComputedStyle(document.body).backgroundColor,
          };
        """)
            assert measurements[theme]["scrollWidth"] <= measurements[theme]["viewport"] + 1, measurements[theme]
            assert measurements[theme]["panelWidth"] <= measurements[theme]["viewport"] + 1, measurements[theme]
            assert measurements[theme]["colorScheme"] == theme, measurements[theme]
        dark = measurements["dark"]
        assert dark["bodyColor"] != "rgb(34, 34, 34)", dark
        assert dark["bodyBackground"] != "rgb(255, 255, 255)", dark
        return {
            "surface": "sidebar",
            "themes": ["light", "dark"],
            "narrowViewport": dark["viewport"],
            "noHorizontalOverflow": True,
            "panelFitsViewport": True,
            "backend": "synthetic local HTTP fixture",
        }
    finally:
        driver.set_window_size(1200, 900)


def make_driver(browser: str):
    if browser == "firefox":
        options = FirefoxOptions()
        options.add_argument("-headless")
        options.add_argument("--width=1200")
        options.add_argument("--height=900")
        firefox = os.environ.get("DSH_BROWSER_FIREFOX", "").strip()
        # Let Selenium Manager resolve distro/snap Firefox by default.  On
        # this host ``which firefox`` is a shell wrapper, which geckodriver
        # correctly rejects as it is not the browser binary itself.
        if firefox:
            options.binary_location = firefox
        gecko = os.environ.get("DSH_BROWSER_GECKODRIVER", "").strip() or shutil.which("geckodriver")
        service = FirefoxService(executable_path=gecko) if gecko else FirefoxService()
        return webdriver.Firefox(options=options, service=service)
    options = ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1200,900")
    # The acceptance runner is commonly executed in a root-owned disposable
    # CI/container account, where Chrome's setuid sandbox cannot initialize.
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    chrome = os.environ.get("DSH_BROWSER_CHROME", "").strip()
    if chrome:
        options.binary_location = chrome
    chromedriver = os.environ.get("DSH_BROWSER_CHROMEDRIVER", "").strip() or shutil.which("chromedriver")
    service = ChromeService(executable_path=chromedriver) if chromedriver else ChromeService()
    return webdriver.Chrome(options=options, service=service)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit only the final JSON report (diagnostics still go to stderr)",
    )
    parser.add_argument(
        "--browser",
        choices=("firefox", "chrome"),
        default="firefox",
        help="browser engine (default: firefox); Chrome paths may be set with DSH_BROWSER_CHROME and DSH_BROWSER_CHROMEDRIVER",
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
        driver = make_driver(args.browser)
        browser_capabilities = dict(driver.capabilities)
        results.append(run_sidebar_done_ack(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("external-ack"))
        results.append(run_external_ack_refresh(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("healthy"))
        results.append(run_standalone(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("failed-claim"))
        results.append(run_failed_claim(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("directory"))
        results.append(run_recipient_directory(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("empty-roster"))
        results.append(run_empty_roster(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("recipient-refresh-failure"))
        results.append(run_recipient_refresh_retry(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("identity-loss"))
        results.append(run_identity_loss_disables_send(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("recipient-loss"))
        results.append(run_recipient_loss_disables_send(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("send-retry"))
        results.append(run_send_retry(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("duplicate-send"))
        results.append(run_duplicate_send_guard(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("refresh-failure"))
        results.append(run_refresh_retry(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("send-refresh-failure"))
        results.append(run_send_refresh_failure(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("offline"))
        results.append(run_offline_clears_recipients(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("directory"))
        results.append(run_theme_and_narrow_geometry(driver, server))
        server.shutdown()
        server.server_close()

        server = start_server(Fixture("tool-cards"))
        results.append(run_tool_cards(driver, server))
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
        "browser": f"{args.browser.capitalize()} via Selenium",
        "browserVersion": browser_capabilities.get("browserVersion", "unknown"),
        "driverVersion": (
            browser_capabilities.get("moz:geckodriverVersion")
            if args.browser == "firefox"
            else browser_capabilities.get("chrome", {}).get("chromedriverVersion", "unknown")
        ),
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
