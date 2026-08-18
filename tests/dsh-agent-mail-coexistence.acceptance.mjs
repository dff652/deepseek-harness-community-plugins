import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  execFileAsync,
  initMailHome,
  mailEnv,
  pidsMatching,
  resolveDsh,
  resolveReviewedProvider,
  runDsh,
  sha256File,
  stopProcessGroup,
  toolEnv,
  waitFor,
} from '../scripts/lib/agent-mail-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aiahIdentity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'aiah-provider-identity.json'), 'utf8'),
);
const mailIdentity = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'agent-mail-provider-identity.json'), 'utf8'),
);

async function resolveReviewedAiah(work) {
  if (process.env.DSH_AIAH_COMMAND) {
    const command = process.env.DSH_AIAH_COMMAND.trim();
    assert.equal(path.isAbsolute(command), true, 'DSH_AIAH_COMMAND must be absolute');
    assert.equal(
      await sha256File(command),
      aiahIdentity.linuxAmd64.sha256,
      'DSH_AIAH_COMMAND is not the reviewed v0.1.11 linux_amd64 asset',
    );
    const unique = path.join(work, 'bin', 'aiah');
    await mkdir(path.dirname(unique), { recursive: true });
    await writeFile(unique, await readFile(command));
    await chmod(unique, 0o755);
    return unique;
  }

  const assetDir = path.join(work, 'release');
  await mkdir(assetDir, { recursive: true });
  await execFileAsync(
    'gh',
    [
      'release',
      'download',
      aiahIdentity.releaseTag,
      '--repo',
      'dff652/ai-asset-hub',
      '--pattern',
      aiahIdentity.linuxAmd64.asset,
      '--pattern',
      'SHA256SUMS',
      '--dir',
      assetDir,
    ],
    { timeout: 120000 },
  );
  await execFileAsync('sha256sum', ['--check', '--ignore-missing', 'SHA256SUMS'], { cwd: assetDir });
  const downloaded = path.join(assetDir, aiahIdentity.linuxAmd64.asset);
  assert.equal(await sha256File(downloaded), aiahIdentity.linuxAmd64.sha256);
  const command = path.join(work, 'bin', 'aiah');
  await mkdir(path.dirname(command), { recursive: true });
  await writeFile(command, await readFile(downloaded));
  await chmod(command, 0o755);
  return command;
}

async function packWorkspace(workspace, destination, cache) {
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', destination],
    { cwd: path.join(root, 'packages', workspace) },
  );
  return path.join(destination, JSON.parse(stdout)[0].filename);
}

const dshBin = resolveDsh('Agent Mail coexistence acceptance');
const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-agent-mail-coexist.'));

try {
  const aiahCommand = await resolveReviewedAiah(work);
  const mail = await resolveReviewedProvider(work, mailIdentity);
  const { home } = await initMailHome(mail.cli, work, ['dsh-export@local']);
  const cache = path.join(work, 'npm-cache');
  const aiahTarball = await packWorkspace('dsh-ai-asset-hub', work, cache);
  const mailTarball = await packWorkspace('dsh-agent-mail', work, cache);

  const env = mailEnv(home, 'dsh-export@local', mail.command, {
    DSH_HOME: path.join(work, 'dsh-home'),
    DSH_AIAH_COMMAND: aiahCommand,
  });

  for (const profile of ['web', 'headless']) {
    for (const artifact of [aiahTarball, mailTarball]) {
      const added = await runDsh(
        dshBin,
        ['plugin', '--profile', profile, 'add', '-w', artifact],
        env,
        work,
        120000,
      );
      if (added.code !== 0 && /pnpm not found/i.test(`${added.stdout}\n${added.stderr}`)) {
        throw new Error(`pnpm is required for coexistence install acceptance: ${added.stderr}`);
      }
      assert.equal(added.code, 0, `${profile} add ${artifact}: ${added.stdout}\n${added.stderr}`);
    }
    const dumped = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(dumped.code, 0, dumped.stderr);
    assert.equal((dumped.stdout.match(/id: mcp-aiah\b/g) ?? []).length, 1, profile);
    assert.equal((dumped.stdout.match(/id: mcp-agent-mail\b/g) ?? []).length, 1, profile);
    assert.match(dumped.stdout, /serverName: aiah/);
    assert.match(dumped.stdout, /serverName: agent-mail/);
  }

  const child = spawn(dshBin, ['--profile', 'web', '--port', '0'], {
    cwd: work,
    env: toolEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  try {
    const aiahPids = await waitFor(async () => {
      const pids = await pidsMatching(aiahCommand);
      return pids.length > 0 ? pids : null;
    }, 30000, `coexisting aiah child; output=${output.slice(-500)}`);
    const mailPids = await waitFor(async () => {
      const pids = await pidsMatching(mail.pattern);
      return pids.length > 0 ? pids : null;
    }, 30000, `coexisting agent-mail child; output=${output.slice(-500)}`);
    assert.ok(!aiahPids.includes(child.pid));
    assert.ok(!mailPids.includes(child.pid));
  } finally {
    await stopProcessGroup(child);
  }
  await waitFor(async () => (await pidsMatching(aiahCommand)).length === 0, 10000, 'aiah cleanup');
  await waitFor(async () => (await pidsMatching(mail.pattern)).length === 0, 10000, 'agent-mail cleanup');

  for (const profile of ['web', 'headless']) {
    const removeAiah = await runDsh(
      dshBin,
      ['plugin', '--profile', profile, 'remove', '@dff652/dsh-ai-asset-hub'],
      env,
      work,
      120000,
    );
    assert.equal(removeAiah.code, 0, `${profile} remove aiah: ${removeAiah.stdout}\n${removeAiah.stderr}`);
    const afterAiah = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(afterAiah.code, 0, afterAiah.stderr);
    assert.doesNotMatch(afterAiah.stdout, /id: mcp-aiah\b/);
    assert.match(afterAiah.stdout, /id: mcp-agent-mail\b/);

    const removeMail = await runDsh(
      dshBin,
      ['plugin', '--profile', profile, 'remove', '@dff652/dsh-agent-mail'],
      env,
      work,
      120000,
    );
    assert.equal(removeMail.code, 0, `${profile} remove mail: ${removeMail.stdout}\n${removeMail.stderr}`);
    const afterBoth = await runDsh(dshBin, ['--profile', profile, '--dump-config'], env, work);
    assert.equal(afterBoth.code, 0, afterBoth.stderr);
    assert.doesNotMatch(afterBoth.stdout, /id: mcp-aiah\b/);
    assert.doesNotMatch(afterBoth.stdout, /id: mcp-agent-mail\b/);
  }
  assert.deepEqual(await pidsMatching(aiahCommand), []);
  assert.deepEqual(await pidsMatching(mail.pattern), []);

  console.log('Agent Mail + AIAH coexistence: PASS (install, both children, remove AIAH then Agent Mail)');
} finally {
  await rm(work, { recursive: true, force: true });
}
