// scripts/tests/executor.test.ts
// Run with: node --no-warnings --test scripts/tests/executor.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BrowserHosts, type HostProcess } from '../../src/main/runner/browserHost.ts';
import { Executor, type BrowserApi, type ExecutorDeps, type UpdateApi } from '../../src/main/runner/executor.ts';
import type { Cloud, JobRow } from '../../src/main/runner/cloud.ts';
import { browserHostArgs, decodeWslText } from '../../src/main/runner/wsl.ts';
import { parseManifest } from '../../src/main/runner/install.ts';
import { compareVersions, type RunnerStatus } from '../../src/shared/runner.ts';

interface SetupOpts {
  wsl?: boolean;
  distro?: boolean;
  canary?: unknown;
  jobs?: JobRow[];
  claimWins?: boolean;
  run?: (job: unknown) => unknown;
  version?: string;
  browser?: BrowserApi;
  update?: UpdateApi;
}

function setup(opts: SetupOpts = {}) {
  const settings = new Map<string, string>();
  if (opts.version) settings.set('runner.version', opts.version);
  const devices: Record<string, unknown>[] = [];
  const finished: { id: string; ok: boolean; result: unknown; error: string | null }[] = [];
  const statuses: RunnerStatus[] = [];
  let queue = [...(opts.jobs ?? [])];
  const cloud: Cloud = {
    async saveDevice(_id, _u, patch) { devices.push(patch as Record<string, unknown>); },
    async queuedJobs() { const q = queue; queue = []; return q; },
    async claim(id) {
      if (opts.claimWins === false) return null;
      const queued = (opts.jobs ?? []).find((j) => j.id === id);
      const payload = queued && Object.keys(queued.payload as object).length > 0 ? queued.payload : { code: 'x', mode: 'script' };
      return { id, agent_id: 'a', payload, timeout_seconds: 30 };
    },
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
    browser: opts.browser,
    update: opts.update,
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
  await ex.drain(); // jobs run in the background now: wait for the ones just started
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

// ── parallel jobs, browsers, image updates ───────────────────────────────────────────────

function fakeBrowser(over: Partial<BrowserApi> = {}) {
  const calls: string[] = [];
  let open = 0;
  const api: BrowserApi = {
    size: () => open,
    open: async (id) => { calls.push(`open:${id}`); open += 1; return { ok: true }; },
    exec: async (id, request) => { calls.push(`exec:${id}:${request.code}`); return { ok: true, result: 'page-result', stdout: '', output_files: {} }; },
    close: async (id) => { calls.push(`close:${id}`); open = Math.max(0, open - 1); },
    closeAll: async () => { calls.push('closeAll'); open = 0; },
    check: async () => ({ ok: true }),
    ...over,
  };
  return { api, calls };
}

const SID = '11111111-2222-4333-8444-555555555555';

test('two jobs run at the same time, and both are answered', async () => {
  let running = 0;
  let peak = 0;
  const t = setup({
    jobs: [{ id: 'j1', agent_id: 'a', payload: {}, timeout_seconds: 30 }, { id: 'j2', agent_id: 'a', payload: {}, timeout_seconds: 30 }],
  });
  const deps = (t.ex as unknown as { d: ExecutorDeps }).d;
  const original = deps.runJob;
  deps.runJob = async (job, seconds) => {
    if ((job as { agent_id?: string }).agent_id === 'canary') return original(job, seconds);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 30));
    running -= 1;
    return { kind: 'result', result: { ok: true, result: 1 } };
  };
  await enable(t.ex);
  assert.equal(peak, 2);
  assert.equal(t.finished.length, 2);
});

test('browser jobs: open, exec and close drive the browser and are answered', async () => {
  const { api, calls } = fakeBrowser();
  const t = setup({
    version: '0.2.0', browser: api,
    jobs: [
      { id: 'o', agent_id: null, payload: { kind: 'browser_open', session_id: SID }, timeout_seconds: 30 },
      { id: 'e', agent_id: null, payload: { kind: 'browser_exec', session_id: SID, code: 'result = 1', files: {}, env_vars: {}, timeout: 30 }, timeout_seconds: 60 },
      { id: 'c', agent_id: null, payload: { kind: 'browser_close', session_id: SID }, timeout_seconds: 30 },
    ],
  });
  await enable(t.ex);
  assert.equal(t.ex.getStatus().browser, 'ready');
  assert.ok(calls.includes(`open:${SID}`) && calls.includes(`exec:${SID}:result = 1`) && calls.includes(`close:${SID}`));
  const byId = Object.fromEntries(t.finished.map((f) => [f.id, f]));
  assert.equal(byId['o']?.ok, true);
  assert.equal(byId['e']?.ok, true);
  assert.equal((byId['e']?.result as { result?: string }).result, 'page-result');
  assert.equal(byId['c']?.ok, true);
});

test('a browser job with a malformed session id or no code is refused, never run', async () => {
  const { api, calls } = fakeBrowser();
  const t = setup({
    version: '0.2.0', browser: api,
    jobs: [
      { id: 'a', agent_id: null, payload: { kind: 'browser_open', session_id: '../../etc' }, timeout_seconds: 30 },
      { id: 'b', agent_id: null, payload: { kind: 'browser_exec', session_id: SID, code: '   ' }, timeout_seconds: 30 },
    ],
  });
  await enable(t.ex);
  assert.deepEqual(t.finished.map((f) => f.ok), [false, false]);
  assert.ok(!calls.some((c) => c.startsWith('open:') || c.startsWith('exec:')));
});

test('the device is browser-ready only after the browser self-test passes on an image that has a browser', async () => {
  const good = setup({ version: '0.2.0', browser: fakeBrowser().api });
  await enable(good.ex);
  assert.equal(good.devices.at(-1)?.['browser_ready'], true);

  const old = setup({ version: '0.1.0', browser: fakeBrowser().api });
  await enable(old.ex);
  assert.equal(old.ex.getStatus().browser, 'unavailable');
  assert.ok(!old.devices.some((d) => d['browser_ready'] === true));

  const broken = setup({ version: '0.2.0', browser: fakeBrowser({ check: async () => ({ ok: false, note: 'no chromium' }) }).api });
  await enable(broken.ex);
  assert.equal(broken.ex.getStatus().browser, 'error');
  assert.ok(!broken.devices.some((d) => d['browser_ready'] === true));
  assert.equal(broken.ex.getStatus().state, 'ready'); // code runs still work
});

test('an open browser is not refused when the PC is not browser-ready, and nothing opens', async () => {
  const { api, calls } = fakeBrowser({ check: async () => ({ ok: false, note: 'x' }) });
  const t = setup({ version: '0.2.0', browser: api, jobs: [{ id: 'o', agent_id: null, payload: { kind: 'browser_open', session_id: SID }, timeout_seconds: 30 }] });
  await enable(t.ex);
  assert.equal(t.finished[0]?.ok, false);
  assert.ok(!calls.some((c) => c.startsWith('open:')));
});

test('signing out or quitting ends the browsers', async () => {
  const a = fakeBrowser();
  const t = setup({ version: '0.2.0', browser: a.api });
  await enable(t.ex);
  await t.ex.setSession('user-2');
  assert.ok(a.calls.includes('closeAll'));
  const b = fakeBrowser();
  const u = setup({ version: '0.2.0', browser: b.api });
  await enable(u.ex);
  await u.ex.goodbye();
  assert.ok(b.calls.includes('closeAll'));
});

test('a newer Linux image is installed when idle, and the new version is remembered', async () => {
  let applied = 0;
  const update: UpdateApi = { latest: async () => '0.2.0', apply: async (onPercent) => { applied += 1; onPercent(50); return '0.2.0'; } };
  const t = setup({ version: '0.1.0', update });
  await enable(t.ex);
  assert.equal(applied, 1);
  assert.equal(t.settings.get('runner.version'), '0.2.0');
  assert.equal(t.ex.getStatus().runnerVersion, '0.2.0');
});

test('no update when the image is current, when a browser is open, or when the check fails', async () => {
  let applied = 0;
  const apply = async () => { applied += 1; return '9.9.9'; };
  const current = setup({ version: '0.2.0', update: { latest: async () => '0.2.0', apply } });
  await enable(current.ex);
  const busy = setup({ version: '0.1.0', browser: fakeBrowser({ size: () => 1 }).api, update: { latest: async () => '0.2.0', apply } });
  await enable(busy.ex);
  const failing = setup({ version: '0.1.0', update: { latest: async () => { throw new Error('offline'); }, apply } });
  await enable(failing.ex);
  assert.equal(applied, 0);
});

test('a failed update reports the problem and leaves the self-test to decide readiness', async () => {
  const t = setup({ version: '0.1.0', update: { latest: async () => '0.2.0', apply: async () => { throw new Error('disk full'); } } });
  await enable(t.ex);
  assert.equal(t.ex.getStatus().state, 'error');
  assert.match(t.ex.getStatus().message ?? '', /disk full/);
  assert.equal(t.devices.at(-1)?.['ready'], false); // the cloud was told before the update began, and nothing has said "ready" since
});

test('version numbers compare as numbers, not text', () => {
  assert.equal(compareVersions('0.10.0', '0.9.2'), 1);
  assert.equal(compareVersions('0.2.0', '0.2'), 0);
  assert.equal(compareVersions('0.1.9', '0.2.0'), -1);
});

// ── the browser host manager (a fake host stands in for the process) ──────────────────────

function fakeHost(script: (line: string, reply: (m: object) => void) => void, readyDelay = 0): { spawn: (id: string) => HostProcess; killed: string[] } {
  const killed: string[] = [];
  return {
    killed,
    spawn: (id) => {
      let onLine: (l: string) => void = () => undefined;
      let onExit: (c: number | null) => void = () => undefined;
      const reply = (m: object) => onLine('__PARASYNC_BROWSER__' + JSON.stringify(m));
      setTimeout(() => reply({ type: 'ready' }), readyDelay);
      return {
        write: (line) => script(line, reply),
        onLine: (cb) => { onLine = cb; },
        onExit: (cb) => { onExit = cb; },
        kill: () => { killed.push(id); onExit(0); },
      };
    },
  };
}

test('the host manager opens a browser, runs a script and closes it', async () => {
  const host = fakeHost((line, reply) => {
    const req = JSON.parse(line) as { id: string; op: string; code?: string };
    if (req.op === 'exec') reply({ type: 'response', id: req.id, outcome: { ok: true, result: `ran ${req.code}`, stdout: '', output_files: {} } });
    if (req.op === 'close') reply({ type: 'response', id: req.id, outcome: { ok: true } });
  });
  const hosts = new BrowserHosts(host.spawn);
  assert.deepEqual(await hosts.open(SID), { ok: true });
  assert.equal(hosts.size(), 1);
  const out = await hosts.exec(SID, { code: 'x', files: {}, env_vars: {}, timeout: 5 });
  assert.equal(out['result'], 'ran x');
  await hosts.close(SID);
  assert.equal(hosts.size(), 0);
  assert.deepEqual(host.killed, [SID]);
});

test('the host manager reports a session that does not exist as gone, and refuses bad ids and too many browsers', async () => {
  const hosts = new BrowserHosts(fakeHost(() => undefined).spawn);
  const gone = await hosts.exec(SID, { code: 'x', files: {}, env_vars: {}, timeout: 5 });
  assert.equal(gone['session_gone'], true);
  assert.equal((await hosts.open('nope')).ok, false);
  for (let i = 0; i < 3; i++) assert.equal((await hosts.open(`aaaaaaaa-0000-4000-8000-00000000000${i}`)).ok, true);
  const fourth = await hosts.open('bbbbbbbb-0000-4000-8000-000000000000');
  assert.equal(fourth.ok, false);
  assert.match(fourth.error ?? '', /already has 3 browsers/);
  await hosts.closeAll();
  assert.equal(hosts.size(), 0);
});

test('a browser that dies mid-script answers the waiting call as gone', async () => {
  const host = fakeHost((line, reply) => {
    const req = JSON.parse(line) as { op: string };
    if (req.op === 'exec') reply({ type: 'fatal', error: 'the browser stopped responding after a timeout and was closed' });
  });
  const hosts = new BrowserHosts(host.spawn);
  await hosts.open(SID);
  const out = await hosts.exec(SID, { code: 'x', files: {}, env_vars: {}, timeout: 5 });
  assert.equal(out['ok'], false);
  assert.equal(out['session_gone'], true);
  assert.equal(hosts.size(), 0);
});

test('a browser that fails to start is not kept', async () => {
  const host = {
    spawn: (): HostProcess => {
      let onLine: (l: string) => void = () => undefined;
      setTimeout(() => onLine('__PARASYNC_BROWSER__' + JSON.stringify({ type: 'fatal', error: 'no chromium' })), 0);
      return { write: () => undefined, onLine: (cb) => { onLine = cb; }, onExit: () => undefined, kill: () => undefined };
    },
  };
  const hosts = new BrowserHosts(host.spawn);
  const out = await hosts.open(SID);
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /no chromium/);
  assert.equal(hosts.size(), 0);
});

test('the browser host starts like a job: interop locked as root, then the unprivileged user, no double quotes', () => {
  const args = browserHostArgs(SID);
  assert.deepEqual(args.slice(0, 6), ['-d', 'ParasyncRunner', '-u', 'root', '--exec', 'sh']);
  const script = args[7] ?? '';
  assert.match(script, /echo -1 > \/proc\/sys\/fs\/binfmt_misc\/WSLInterop/);
  assert.match(script, new RegExp(`exec runuser -u runner -- env -u WSL_INTEROP PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 /opt/runner/browser_host\\.py ${SID}`));
  assert.ok(!script.includes('"'));
  assert.throws(() => browserHostArgs('x; rm -rf /'));
});
