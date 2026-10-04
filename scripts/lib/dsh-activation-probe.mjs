import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stopProcessGroup, toolEnv, waitFor } from './agent-mail-host.mjs';

// DSH 0.2 treats a failed optional plugin as a warning. Inspect the actual
// Loader and tool registry instead of mistaking the host's exit code for
// successful plugin activation. The probe exists only in the disposable home.
export async function probeActivation(dshBin, patches, env, work, entryIds, { expectFailure = true, calls = [] } = {}) {
  const suffix = path.basename(env.DSH_HOME);
  const plugin = path.join(work, `probe-${suffix}.mjs`);
  const overlay = path.join(work, `probe-${suffix}.yml`);
  const report = path.join(work, `probe-${suffix}.json`);
  await rm(report, { force: true });
  await writeFile(plugin, `import { writeFileSync } from 'node:fs';
export const inject = ['tools'];
export default function(ctx, config) {
  const timer = setInterval(async () => {
    const entries = [...ctx.get('loader').entries()]
      .filter(entry => config.entryIds.includes(entry.options.id));
    if (entries.length !== config.entryIds.length) return;
    if (entries.some(entry => entry.fiber && [0, 1].includes(entry.fiber.state))) return;
    clearInterval(timer);
    const rows = await Promise.all(entries.map(async entry => {
      let error;
      if (entry.fiber?.state === 3) {
        try { await entry.fiber.await(); } catch (cause) { error = String(cause); }
      }
      return { id: entry.options.id, state: entry.fiber?.state ?? null, error };
    }));
    const runtime = ctx.get('tools');
    const tools = [...runtime.view(undefined).visible.keys()];
    const results = [];
    for (const [index, call] of config.calls.entries()) {
      results.push(await runtime.execute({
        callId: 'activation-probe-' + index,
        name: call.name,
        arguments: call.arguments,
        signal: AbortSignal.timeout(10000),
      }));
    }
    writeFileSync(config.report, JSON.stringify({ rows, tools, results }));
  }, 100);
  ctx.on('dispose', () => clearInterval(timer));
}
`);
  await writeFile(overlay, `- insert:
    - id: dsh-activation-probe
      name: ${JSON.stringify(plugin)}
      config:
        report: ${JSON.stringify(report)}
        entryIds: ${JSON.stringify(entryIds)}
        calls: ${JSON.stringify(calls)}
`);
  const args = patches.flatMap(patch => ['--patch', patch]);
  args.push('--patch', overlay, '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open');
  const child = spawn(dshBin, args, {
    cwd: work,
    env: toolEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  let spawnError;
  child.on('error', error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { output += chunk; });
  }
  try {
    const state = await waitFor(async () => {
      if (spawnError) throw spawnError;
      try {
        const value = JSON.parse(await readFile(report, 'utf8'));
        // The audit warning establishes that the tree settled. A registry
        // snapshot made before that point cannot establish failed activation.
        const audited = expectFailure
          ? /entry did not activate|entries did not activate|startup failed/.test(output)
          : /dsh web: http/.test(output);
        if (audited) return value;
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
      if (child.exitCode !== null) throw new Error(`DSH exited before activation evidence: ${output}`);
      return null;
    }, 30000, 'plugin activation evidence');
    return { ...state, output };
  } finally {
    await stopProcessGroup(child);
  }
}
