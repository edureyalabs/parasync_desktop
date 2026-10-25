// scripts/tests/executor.test.ts
// Run with: node --no-warnings --test scripts/tests/executor.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Executor, type ExecutorDeps } from '../../src/main/runner/executor.ts';
import type { Cloud, JobRow } from '../../src/main/runner/cloud.ts';
import { decodeWslText } from '../../src/main/runner/wsl.ts';
import { parseManifest } from '../../src/main/runner/install.ts';
import type { RunnerStatus } from '../../src/shared/runner.ts';

function setup(opts: { wsl?: boolean; distro?: boolean; canary?: unknown; jobs?: JobRow[]; claimWins?: boolean; run?: (job: unknown) => unknown } = {}) {
  const settings = new Map<string, string>();
  const devices: Record<string, unknown>[] = [];
  const finished: { id: string; ok: boolean; result: unknown; error: string | null }[] = [];
  const statuses: RunnerStatus[] = [];
  let queue = [...(opts.jobs ?? [])];
  const cloud: Cloud = {
    async saveDevice(_id, _u, patch) { devices.push(patch as Record<string, unknown>); },
    async queuedJobs() { const q = queue; queue = []; return q; },
    async claim(id) { return opts.claimWins === false ? null : { id, agent_id: 'a', payload: { code: 'x', mode: 'script' }, timeout_seconds: 30 }; },
    async touch() { return true; },
    async finish(id, ok, result, error) { finished.push({ id, ok, result, error }); return true; },
  };
  const deps: ExecutorDeps = {
    cloud,
    wslAvailable: async () => opts.wsl !== false,
    distroInstalled: async () => opts.distro !== false,
    runJob: async (job) => {
      const j = job as { agent_id?: string };
      if (j.agent_id === 'canary') return opts.canary === undefined ? { kind: 'result', result: { ok: true, result: { sum: 42, bad: [] } } } : (opts.canary as never);
      return { kind: 'result', result: (opts.run ? opts.run(job) : { ok: true, result: 1 }) as Record<string, unknown> };
    },
    getSetting: async (k) => settings.get(k) ?? null,
    setSetting: async (k, v) => { settings.set(k, v); },
    newId: () => 'dev-1',
    deviceName: 'TEST-PC',
    appVersion: '0.4.0',
    now: () => new Date(),
    publish: (s) => statuses.push(s),
    log: () => undefined,
  };
  const ex = new Executor(deps);
  return { ex, devices, finished, statuses, settings };
}

async function enable(ex: Executor) {
  await ex.setSession('user-1');
  await ex.setEnabled(true);
  ex.stop(); // the real app polls on a timer; the test drives ticks by hand
  await ex.tick();
  ex.stop();
}

test('off until the person switches it on; nothing is registered as ready', async () => {
  const { ex, devices } = setup();
  await ex.setSession('user-1');
  assert.equal(ex.getStatus().state, 'off');
  assert.equal(devices.length, 0);
});

test('a passing self-test makes the device ready and tells the cloud', async () => {
  const { ex, devices } = setup();
  await enable(ex);
  assert.equal(ex.getStatus().state, 'ready');
  assert.ok(devices.some((d) => d['ready'] === true && d['last_canary_ok'] === true));
});

test('a failing self-test never becomes ready', async () => {
  const { ex, devices } = setup({ canary: { kind: 'result', result: { ok: true, result: { sum: 41, bad: [] } } } });
  await enable(ex);
  assert.equal(ex.getStatus().state, 'error');
  assert.ok(!devices.some((d) => d['ready'] === true));
});

test('missing WSL and missing Linux box are reported, not ready', async () => {
  const a = setup({ wsl: false });
  await enable(a.ex);
  assert.equal(a.ex.getStatus().state, 'no-wsl');
  const b = setup({ distro: false });
  await enable(b.ex);
  assert.equal(b.ex.getStatus().state, 'needs-install');
  assert.ok(![...a.devices, ...b.devices].some((d) => d['ready'] === true));
});

test('a queued job is claimed, run and answered', async () => {
  const { ex, finished } = setup({ jobs: [{ id: 'j1', agent_id: 'a', payload: { code: 'x', mode: 'script' }, timeout_seconds: 30 }], run: () => ({ ok: true, result: 'hi' }) });
  await enable(ex);
  assert.equal(finished.length, 1);
  assert.equal(finished[0]?.ok, true);
  assert.deepEqual(finished[0]?.result, { ok: true, result: 'hi' });
  assert.equal(ex.getStatus().state, 'ready');
});

test('losing the claim means the job is not run here', async () => {
  const { ex, finished } = setup({ jobs: [{ id: 'j1', agent_id: 'a', payload: {}, timeout_seconds: 30 }], claimWins: false });
  await enable(ex);
  assert.equal(finished.length, 0);
});

test('code that reports an error is a failed job carrying its message', async () => {
  const { ex, finished } = setup({ jobs: [{ id: 'j1', agent_id: 'a', payload: {}, timeout_seconds: 30 }], run: () => ({ ok: false, error: 'boom' }) });
  await enable(ex);
  assert.equal(finished[0]?.ok, false);
  assert.equal(finished[0]?.error, 'boom');
});

test('switching off tells the cloud it is not ready', async () => {
  const { ex, devices } = setup();
  await enable(ex);
  await ex.setEnabled(false);
  assert.equal(ex.getStatus().state, 'off');
  assert.equal(devices.at(-1)?.['ready'], false);
});

test('wsl.exe UTF-16 text decodes; normal text is untouched', () => {
  assert.equal(decodeWslText(Buffer.from('Ubuntu\r\nParasyncRunner\r\n', 'utf16le')).includes('ParasyncRunner'), true);
  assert.equal(decodeWslText(Buffer.from('hello', 'utf8')), 'hello');
});

test('the manifest is validated before anything is downloaded', () => {
  const ok = { version: '0.1.0', file: 'parasync-runner-rootfs-0.1.0.tar.gz', sha256: 'a'.repeat(64), bytes: 1000 };
  assert.equal(parseManifest(ok).version, '0.1.0');
  assert.throws(() => parseManifest({ ...ok, file: '../evil.tar.gz' }));
  assert.throws(() => parseManifest({ ...ok, sha256: 'xyz' }));
  assert.throws(() => parseManifest(null));
});

test('a second account on the same PC gets its own device id', async () => {
  const a = setup();
  await enable(a.ex);
  assert.ok(a.settings.has('runner.deviceId.user-1'));
  await a.ex.setSession('user-2');
  await a.ex.setEnabled(true);
  a.ex.stop();
  await a.ex.tick();
  a.ex.stop();
  assert.ok(a.settings.has('runner.deviceId.user-2'));
});

test('a failing device registration does not stop the loop and is not retried on every poll', async () => {
  const t = setup();
  let attempts = 0;
  const cloud = (t.ex as unknown as { d: { cloud: Cloud } }).d.cloud;
  cloud.saveDevice = async () => { attempts += 1; throw new Error('boom'); };
  await t.ex.setSession('user-1');
  await t.ex.setEnabled(true);
  t.ex.stop();
  await t.ex.tick();
  await t.ex.tick();
  await t.ex.tick();
  t.ex.stop();
  // the self-test registers once (it fails quietly); the poll registers at most once more inside the 10 s window
  assert.ok(attempts >= 1 && attempts <= 3, `registered ${attempts} times`);
});

test('signing out or switching accounts marks the previous account\'s device not ready', async () => {
  const t = setup();
  await enable(t.ex);
  assert.equal(t.devices.at(-1)?.['ready'], true);
  await t.ex.setSession('user-2');
  assert.equal(t.devices.at(-1)?.['ready'], false);
  t.ex.stop();
});

test('a box that is not sealed never becomes ready, and says why', async () => {
  const { ex, devices } = setup({ canary: { kind: 'result', result: { ok: true, result: { sum: 42, bad: ['windows-interop'] } } } });
  await enable(ex);
  assert.equal(ex.getStatus().state, 'error');
  assert.match(ex.getStatus().message ?? '', /windows-interop/);
  assert.ok(!devices.some((d) => d['ready'] === true));
});

test('each job starts as root only to lock interop, then runs as the unprivileged user via --exec', async () => {
  const { jobArgs } = await import('../../src/main/runner/wsl.ts');
  const args = jobArgs(120);
  assert.deepEqual(args.slice(0, 6), ['-d', 'ParasyncRunner', '-u', 'root', '--exec', 'sh']);
  const script = args[7] ?? '';
  assert.match(script, /echo -1 > \/proc\/sys\/fs\/binfmt_misc\/WSLInterop/);
  assert.match(script, /exec runuser -u runner -- env -u WSL_INTEROP timeout --signal=KILL 120 python3 \/opt\/runner\/run_job\.py/);
  assert.ok(!script.includes('"'), 'no double quotes (Windows argument quoting)');
});

test('quitting tells the cloud this PC is not ready', async () => {
  const t = setup();
  await enable(t.ex);
  assert.equal(t.devices.at(-1)?.['ready'], true);
  await t.ex.goodbye();
  assert.equal(t.devices.at(-1)?.['ready'], false);
});
