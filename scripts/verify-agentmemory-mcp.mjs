#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const EXPECTED_TOOLS = [
  'memory_consolidate',
  'memory_diagnose',
  'memory_lesson_save',
  'memory_recall',
  'memory_reflect',
  'memory_save',
  'memory_sessions',
  'memory_smart_search',
];

function usage() {
  console.error(
    'Usage: node scripts/verify-agentmemory-mcp.mjs --command /absolute/path ' +
      '[--arg VALUE] [--project SLUG] [--query TEXT] [--expect TEXT] ' +
      '[--marker TEXT] [--benchmark FILE] [--check-save-requires-project] ' +
      '[--timeout-ms 15000]',
  );
}

function parseArgs(argv) {
  const options = {
    args: [],
    expects: [],
    checkSaveRequiresProject: false,
    timeoutMs: 15000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--check-save-requires-project') {
      options.checkSaveRequiresProject = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${key}`);
    index += 1;

    if (key === '--command') options.command = value;
    else if (key === '--arg') options.args.push(value);
    else if (key === '--project') options.project = value;
    else if (key === '--marker') options.marker = value;
    else if (key === '--query') options.query = value;
    else if (key === '--expect') options.expects.push(value);
    else if (key === '--benchmark') options.benchmark = value;
    else if (key === '--timeout-ms') options.timeoutMs = Number(value);
    else throw new Error(`unknown option: ${key}`);
  }

  if (!options.command?.startsWith('/')) {
    throw new Error('--command must be an absolute executable path');
  }
  if (options.benchmark && (options.query || options.expects.length > 0 || options.marker)) {
    throw new Error('--benchmark cannot be combined with --query, --expect or --marker');
  }
  if (options.query && options.expects.length === 0) {
    throw new Error('--query requires at least one --expect assertion');
  }
  if ((options.marker || options.query) && !options.project) {
    throw new Error('recall checks require an explicit --project');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer >= 1000');
  }
  return options;
}

async function loadCases(options) {
  if (!options.benchmark && !options.query && !options.marker) return [];

  if (!options.benchmark) {
    const query = options.query ?? options.marker;
    const expects = options.expects.length > 0 ? options.expects : [options.marker];
    return [{ name: 'recall-smoke', query, expects, project: options.project }];
  }

  const document = JSON.parse(await readFile(options.benchmark, 'utf8'));
  if (document.version !== 1 || !Array.isArray(document.cases) || document.cases.length === 0) {
    throw new Error('benchmark must contain a non-empty version 1 cases array');
  }
  return document.cases.map((item, index) => {
    if (
      !item.name ||
      !item.query ||
      !item.expectedObservationId ||
      !Array.isArray(item.expects) ||
      item.expects.length === 0 ||
      !item.project
    ) {
      throw new Error(
        `benchmark case ${index} requires name, query, project, expectedObservationId and expects`,
      );
    }
    if (
      item.forbiddenObservationIds !== undefined &&
      (!Array.isArray(item.forbiddenObservationIds) ||
        item.forbiddenObservationIds.length === 0 ||
        item.forbiddenObservationIds.some(
          (observationId) => typeof observationId !== 'string' || !observationId.trim(),
        ))
    ) {
      throw new Error(`benchmark case ${index} forbiddenObservationIds must be non-empty strings`);
    }
    return item;
  });
}

function textFromResult(result) {
  return (result?.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

const CONTENT_KEYS = ['content', 'text', 'narrative', 'title'];

function collectFactText(facts) {
  if (typeof facts === 'string') return facts.trim() ? [facts] : [];
  if (!Array.isArray(facts)) return [];
  const values = [];
  for (const item of facts) {
    if (typeof item === 'string' && item.trim()) {
      values.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    for (const key of ['text', 'content', 'narrative']) {
      if (typeof item[key] === 'string' && item[key].trim()) values.push(item[key]);
    }
  }
  return values;
}

function observationText(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return '';
  }
  const values = [];
  for (const key of CONTENT_KEYS) {
    const value = observation[key];
    if (typeof value === 'string' && value.trim()) values.push(value);
  }
  values.push(...collectFactText(observation.facts));
  return values.join('\n');
}

function toolDeclaresProject(tool) {
  const properties = tool?.inputSchema?.properties;
  return Boolean(properties && typeof properties === 'object' && properties.project);
}

function observationProject(item) {
  return String(item?.observation?.project ?? item?.project ?? '').trim();
}

function summarizeStderr(stderr) {
  const lines = stderr.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  const levels = [
    ...new Set(
      lines.map((line) => {
        const match = line.match(/\b(trace|debug|info|notice|warn|warning|error|fatal|critical)\b/i);
        return match ? match[1].toLowerCase() : 'other';
      }),
    ),
  ].sort();
  return {
    lineCount: lines.length,
    byteLength: Buffer.byteLength(stderr),
    levels,
    redacted: true,
  };
}

function childHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildClose(child, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const onClose = () => finish(true);
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(exited);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = await loadCases(options);
  const child = spawn(options.command, options.args, {
    env: process.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let nextId = 1;
  let stdoutBuffer = '';
  let stderr = '';

  const failPending = (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdin.on('error', (error) => failPending(error));
  child.on('error', (error) => failPending(error));
  child.on('close', (code, signal) => {
    if (pending.size > 0) {
      failPending(new Error(`MCP child exited ${code ?? signal} with pending requests`));
    }
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    while (stdoutBuffer.includes('\n')) {
      const newline = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        failPending(new Error('MCP child returned invalid JSON'));
        continue;
      }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    }
  });

  const request = (method, params = {}) => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${options.timeoutMs} ms`));
      }, options.timeoutMs);
      pending.set(id, { reject, resolve, timer });
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  };

  const notify = (method, params = {}) => {
    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    } catch (error) {
      failPending(error);
    }
  };

  let report;
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agentmemory-acceptance', version: '1.0.0' },
    });
    notify('notifications/initialized');

    const listed = await request('tools/list');
    const names = (listed.tools ?? []).map((tool) => tool.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
      throw new Error(`unexpected tool contract: ${names.join(',')}`);
    }

    const diagnosis = await request('tools/call', {
      name: 'memory_diagnose',
      arguments: { categories: 'sessions,memories,mesh' },
    });
    if (diagnosis.isError) throw new Error(`memory_diagnose failed: ${textFromResult(diagnosis)}`);
    const diagnosisText = textFromResult(diagnosis);
    let diagnosisReport;
    try {
      diagnosisReport = JSON.parse(diagnosisText);
    } catch {
      throw new Error(`memory_diagnose returned non-JSON output: ${diagnosisText}`);
    }
    if (diagnosisReport?.summary?.fail !== 0) {
      throw new Error(`memory_diagnose reported failures: ${diagnosisText}`);
    }

    const recallTool = listed.tools.find((tool) => tool.name === 'memory_recall');
    const saveTool = listed.tools.find((tool) => tool.name === 'memory_save');
    const projectScoped = cases.some((item) => item.project);
    if (projectScoped && !toolDeclaresProject(recallTool)) {
      throw new Error('memory_recall schema must declare project for project-scoped recall');
    }

    let saveRequiresProject = null;
    if (options.checkSaveRequiresProject) {
      if (!toolDeclaresProject(saveTool)) {
        throw new Error('memory_save schema must declare project');
      }
      const saved = await request('tools/call', {
        name: 'memory_save',
        arguments: { content: 'DSH_PUBLIC_BUNDLE_SHOULD_NOT_PERSIST' },
      });
      if (!saved.isError) {
        throw new Error('memory_save without project must fail closed');
      }
      saveRequiresProject = 'PASS';
    }
    const benchmarkResults = [];
    for (const testCase of cases) {
      const recallArgs = { query: testCase.query, limit: 5, format: 'full' };
      if (testCase.project) {
        if (!toolDeclaresProject(recallTool)) {
          throw new Error(`${testCase.name}: memory_recall schema must declare project`);
        }
        recallArgs.project = testCase.project;
      }
      const recalled = await request('tools/call', {
        name: 'memory_recall',
        arguments: recallArgs,
      });
      const recallText = textFromResult(recalled);
      if (recalled.isError) throw new Error(`${testCase.name} recall failed: ${recallText}`);
      let recallReport;
      try {
        recallReport = JSON.parse(recallText);
      } catch {
        throw new Error(`${testCase.name} returned non-JSON output: ${recallText}`);
      }
      const results = recallReport.results ?? [];
      if (!Array.isArray(results)) {
        throw new Error(`${testCase.name} returned a non-array results field`);
      }
      if (recallReport.truncated !== false) {
        throw new Error(`${testCase.name} must explicitly report truncated: false`);
      }
      const rankedResults = results.slice(0, 5);
      const forbiddenIds = Array.isArray(testCase.forbiddenObservationIds)
        ? testCase.forbiddenObservationIds
        : [];
      let isolationEvidence = null;
      if (testCase.project) {
        const strongBenchmark = Boolean(testCase.expectedObservationId);
        const leaked = rankedResults.filter((item) => {
          const project = observationProject(item);
          return project && project !== testCase.project;
        });
        if (leaked.length > 0) {
          throw new Error(`${testCase.name} returned observations from another project`);
        }
        const projectless = rankedResults.filter((item) => !observationProject(item));
        if (strongBenchmark && projectless.length > 0 && forbiddenIds.length === 0) {
          throw new Error(
            `${testCase.name} requires forbiddenObservationIds when recall results omit project`,
          );
        }
        isolationEvidence = strongBenchmark
          ? projectless.length > 0
            ? 'forbidden-observation-ids'
            : 'response-project'
          : 'content-smoke-only';
      }
      if (forbiddenIds.length > 0) {
        const leakedIds = rankedResults
          .map((item) => item?.observation?.id)
          .filter((id) => id && forbiddenIds.includes(id));
        if (leakedIds.length > 0) {
          throw new Error(`${testCase.name} returned observations from another project`);
        }
      }
      const expectedResult = testCase.expectedObservationId
        ? rankedResults.find((item) => item?.observation?.id === testCase.expectedObservationId)
        : null;
      if (testCase.expectedObservationId && !expectedResult) {
        const returnedIds = rankedResults
          .map((item) => item?.observation?.id)
          .filter(Boolean)
          .join(', ');
        throw new Error(
          `${testCase.name} expected observation ${testCase.expectedObservationId} in top-5; got ${returnedIds || 'none'}`,
        );
      }
      const sameObservationMatch = (item) => {
        const content = observationText(item?.observation);
        return testCase.expects.every((expected) => content.includes(expected));
      };
      const matchedResult = expectedResult ?? rankedResults.find(sameObservationMatch);
      const content = matchedResult ? observationText(matchedResult.observation) : '';
      const missing = testCase.expects.filter((expected) => !content.includes(expected));
      if (missing.length > 0) {
        throw new Error(
          `${testCase.name} missed expected values in the matched observation: ${missing.join(', ')}`,
        );
      }
      benchmarkResults.push({
        name: testCase.name,
        status: 'PASS',
        query: testCase.query,
        expected: testCase.expects,
        expectedObservationId: testCase.expectedObservationId ?? null,
        projectRequested: recallArgs.project ?? null,
        isolationEvidence,
        resultCount: results.length,
        truncated: recallReport.truncated ?? null,
        matches: results.map((item, rank) => ({
          rank: rank + 1,
          observationId: item.observation?.id ?? null,
          type: item.observation?.type ?? null,
          score: item.score ?? null,
        })),
        expectedRank: testCase.expectedObservationId
          ? results.findIndex((item) => item.observation?.id === testCase.expectedObservationId) + 1
          : null,
        expectedTerms: testCase.expects,
        expectedTermsMatched: testCase.expects.every((expected) => content.includes(expected)),
      });
    }

    const rankedCases = benchmarkResults.filter((item) => item.expectedObservationId);
    const benchmarkSummary = {
      caseCount: benchmarkResults.length,
      passed: benchmarkResults.length,
      rank1Evaluated: rankedCases.length,
      expectedAtRank1: rankedCases.filter((item) => item.expectedRank === 1).length,
      expectedWithinTop5: rankedCases.filter(
        (item) => item.expectedRank >= 1 && item.expectedRank <= 5,
      ).length,
    };

    report = {
      status: 'PASS',
      server: initialized.serverInfo ?? null,
      protocolVersion: initialized.protocolVersion ?? null,
      toolCount: names.length,
      tools: names,
      diagnosis: diagnosisReport.summary,
      checks: {
        initialize: 'PASS',
        toolContract: 'PASS',
        diagnosis: 'PASS',
        saveRequiresProject: saveRequiresProject ?? 'SKIPPED',
        recall: cases.length > 0 ? 'PASS' : 'SKIPPED',
      },
      benchmarkSummary,
      benchmarks: benchmarkResults,
      readOnly: !options.checkSaveRequiresProject,
    };
  } finally {
    child.stdin.end();
    let termination = 'already-exited';
    if (!childHasExited(child)) {
      child.kill('SIGTERM');
      if (await waitForChildClose(child, 1000)) termination = 'SIGTERM';
      else {
        child.kill('SIGKILL');
        if (!(await waitForChildClose(child, 1000))) {
          throw new Error('MCP child did not exit after SIGKILL');
        }
        termination = 'SIGKILL';
      }
    }
    if (stderr.trim()) {
      console.error(`provider stderr summary: ${JSON.stringify(summarizeStderr(stderr))}`);
    }
    if (report) {
      report.processCleanup = { exited: childHasExited(child), termination };
      console.log(JSON.stringify(report, null, 2));
    }
  }
}

main().catch((error) => {
  usage();
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
