// scripts/tests/executor.test.ts
// Run with: node --no-warnings --test scripts/tests/executor.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BrowserHosts, type HostProcess } from '../../src/main/runner/browserHost.ts';
import { Executor, type BrowserApi, type ExecutorDeps, type UpdateApi, type VaultApi } from '../../src/main/runner/executor.ts';
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
  vault?: VaultApi;
}

function setup(opts: SetupOpts = {}) {
  const settings = new Map<string, string>();
  if (opts.version) settings.set('runner.version', opts.version);
  const devices: Record<string, unknown>[] = [];
  const finished: { id: string; ok: boolean; result: unknown; error: string | null }[] = [];
  const ran: { job: unknown; broker: unknown }[] = [];
  const statuses: RunnerStatus[] = [];
  let queue = [...(opts.jobs ?? [])];
  const pushed: JobRow[] = [];
  const cloud: Cloud = {
    async saveDevice(_id, _u, patch) { devices.push(patch as Record<string, unknown>); },
    async queuedJobs() { const q = queue; queue = []; return q; },
    async claim(id) {
      if (opts.claimWins === false) return null;
      const queued = [...(opts.jobs ?? []), ...pushed].find((j) => j.id === id);
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
    runJob: async (job, _seconds, broker) => {
      ran.push({ job, broker });
      const j = job as { agent_id?: string };
      if (j.agent_id === 'canary') return opts.canary === undefined ? { kind: 'result', result: { ok: true, result: { sum: 42, bad: [] } } } : (opts.canary as never);
      return { kind: 'result', result: (opts.run ? opts.run(job) : { ok: true, result: 1 }) as Record<string, unknown> };
    },
    browser: opts.browser,
    update: opts.update,
    vault: opts.vault,
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
  return { ex, devices, finished, statuses, settings, ran, push: (...jobs: JobRow[]) => { pushed.push(...jobs); queue.push(...jobs); } };
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
    senses: async (id, op, body) => { calls.push(`${op}:${id}:${JSON.stringify(body)}`); return { ok: true, report: `PAGE ${op}`, output_files: {} }; },
    close: async (id) => { calls.push(`close:${id}`); open = Math.max(0, open - 1); },
    closeAll: async () => { calls.push('closeAll'); open = 0; },
    check: async (withSenses) => { calls.push(`check:${withSenses}`); return { ok: true }; },
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

test('a job with secrets for the broker starts through the root-owned supervisor, which starts the script itself as the unprivileged user', async () => {
  const { jobArgs } = await import('../../src/main/runner/wsl.ts');
  const script = jobArgs(120, true)[7] ?? '';
  assert.match(script, /echo -1 > \/proc\/sys\/fs\/binfmt_misc\/WSLInterop/);
  assert.match(script, /exec timeout --signal=KILL 140 python3 \/opt\/runner\/job_supervisor\.py 120$/);
  assert.ok(!script.includes('runuser'), 'the supervisor does the privilege drop, not the shell');
  assert.ok(!script.includes('"'));
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

test('look and act jobs go to the browser with the request exactly as the cloud sent it, and are answered', async () => {
  const { api, calls } = fakeBrowser();
  const t = setup({
    version: '0.4.0', browser: api,
    jobs: [
      { id: 'l', agent_id: null, payload: { kind: 'browser_look', session_id: SID, query: 'search', allowed_hosts: ['erp.test'] }, timeout_seconds: 90 },
      { id: 'a', agent_id: null, payload: { kind: 'browser_act', session_id: SID, action: 'click', target: 'k3x.1', settle_ms: 500 }, timeout_seconds: 150 },
    ],
  });
  await enable(t.ex);
  assert.ok(calls.includes(`look:${SID}:${JSON.stringify({ query: 'search', allowed_hosts: ['erp.test'] })}`));     // the job's own kind and session id are not part of the body
  assert.ok(calls.includes(`act:${SID}:${JSON.stringify({ action: 'click', target: 'k3x.1', settle_ms: 500 })}`));
  const byId = Object.fromEntries(t.finished.map((f) => [f.id, f]));
  assert.equal(byId['l']?.ok, true);
  assert.equal((byId['l']?.result as { report?: string }).report, 'PAGE look');
  assert.equal(byId['a']?.ok, true);
  assert.equal(t.ex.getStatus().senses, true);
});

test('look and act are refused, not run, while the Linux box is older than 0.4.0 or the session id is bad', async () => {
  const { api, calls } = fakeBrowser();
  const old = setup({ version: '0.3.1', browser: api, jobs: [{ id: 'l', agent_id: null, payload: { kind: 'browser_look', session_id: SID }, timeout_seconds: 90 }] });
  await enable(old.ex);
  assert.equal(old.finished[0]?.ok, false);
  assert.match(String(old.finished[0]?.error), /has to update first/);
  assert.equal(old.ex.getStatus().senses, false);
  const bad = setup({ version: '0.4.0', browser: api, jobs: [{ id: 'l', agent_id: null, payload: { kind: 'browser_act', session_id: '../x', action: 'click' }, timeout_seconds: 90 }] });
  await enable(bad.ex);
  assert.equal(bad.finished[0]?.ok, false);
  assert.ok(!calls.some((c) => c.startsWith('look:') || c.startsWith('act:')));
});

test('a failed action is a failed job with the browser\'s own words; the self-test asks for the page description only on an image that has it', async () => {
  const failing = fakeBrowser({ senses: async () => ({ ok: false, error: 'no control named Save on the page', output_files: {} }) });
  const t = setup({ version: '0.4.0', browser: failing.api, jobs: [{ id: 'a', agent_id: null, payload: { kind: 'browser_act', session_id: SID, action: 'click', target: 'Save' }, timeout_seconds: 90 }] });
  await enable(t.ex);
  assert.equal(t.finished[0]?.ok, false);
  assert.match(String(t.finished[0]?.error), /no control named Save/);
  assert.ok(failing.calls.includes('check:true'));
  const older = fakeBrowser();
  await enable(setup({ version: '0.3.1', browser: older.api }).ex);
  assert.ok(older.calls.includes('check:false'));
});

test('what a logged-in browser shows is scrubbed of its login before a look or an act answer leaves the PC', async () => {
  const { api } = fakeBrowser({ senses: async () => ({ ok: true, report: 'PAGE https://erp.test/home?sid=SESSIONTOKEN123 "Welcome hunter2hunter2"', output_files: { 'a.png': 'iVBORw0KGgo=' } }) });
  const t = setup({ version: '0.4.0', browser: api, jobs: [{ id: 'a', agent_id: null, payload: { kind: 'browser_act', session_id: SID, action: 'click', target: 'Go' }, timeout_seconds: 90 }] });
  (t.ex as unknown as { scrub: Map<string, { values: Set<string> }> }).scrub.set(SID, { values: new Set(['SESSIONTOKEN123', 'hunter2hunter2']) });
  await enable(t.ex);
  const out = t.finished[0]?.result as { report: string; output_files: Record<string, string> };
  assert.ok(!out.report.includes('SESSIONTOKEN123') && !out.report.includes('hunter2hunter2'));
  assert.equal(out.output_files['a.png'], 'iVBORw0KGgo=');                      // files are bytes: never rewritten
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

test('the host manager sends look and act with the cloud\'s own body and answers them', async () => {
  const seen: Record<string, unknown>[] = [];
  const host = fakeHost((line, reply) => {
    const req = JSON.parse(line) as { id: string; op: string };
    seen.push(req);
    reply({ type: 'response', id: req.id, outcome: { ok: true, report: `PAGE ${req.op}`, output_files: {} } });
  });
  const hosts = new BrowserHosts(host.spawn);
  await hosts.open(SID);
  const look = await hosts.senses(SID, 'look', { query: 'x', id: 'sneaky', op: 'exec' });                       // the protocol's own fields cannot be set by a body
  const act = await hosts.senses(SID, 'act', { action: 'click', target: 'k1.2' });
  assert.equal(look['report'], 'PAGE look');
  assert.equal(act['report'], 'PAGE act');
  assert.equal(seen[0]?.['op'], 'look');
  assert.notEqual(seen[0]?.['id'], 'sneaky');
  assert.equal(seen[0]?.['query'], 'x');
  assert.equal(seen[1]?.['action'], 'click');
  assert.equal((await hosts.senses('99999999-0000-4000-8000-000000000000', 'look', {}))['session_gone'], true);
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


// ── secrets held on this PC ────────────────────────────────────────────────────────────

const AGENT = '11111111-1111-4111-8111-111111111111';
const ACCESS = '22222222-2222-4222-8222-222222222222';

/** A vault with fixed contents: key "agent|kind|name" -> value, version, hosts. Supplies a ref only when its version matches. */
function fakeVault(entries: Record<string, { value: string; version: number; hosts?: string[]; deviceOnly?: boolean }>): VaultApi & { resolved: string[][] } {
  const resolved: string[][] = [];
  return {
    resolved,
    held: async () => ({}),
    resolve: async (_u, wanted) => {
      const values = new Map<string, { value: string; hosts: string[] }>();
      const missing: { agentId: string; kind: 'secret' | 'user_secret' | 'browser_access'; name: string }[] = [];
      resolved.push(wanted.map((w) => w.name));
      for (const w of wanted) {
        const k = `${w.agentId}|${w.kind}|${w.name}`;
        const e = entries[k];
        if (!e || (!e.deviceOnly && w.version !== undefined && e.version !== w.version)) { missing.push({ agentId: w.agentId, kind: w.kind, name: w.name }); continue; }
        values.set(k, { value: e.value, hosts: e.hosts ?? [] });
      }
      return { values, missing };
    },
  };
}

const withSecrets = (extra: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ code: 'x', mode: 'function', env_vars: {}, local_secrets: { agent_id: AGENT, ...extra }, ...more });

test('a job that names secrets gets them from this PC as environment variables, and they are blanked from the answer', async () => {
  const vault = fakeVault({ [`${AGENT}|secret|API_KEY`]: { value: 'sk-live-abcdef123456', version: 3 } });
  const t = setup({
    vault,
    jobs: [{ id: 'j1', agent_id: 'a', payload: withSecrets({ env: [{ kind: 'secret', name: 'API_KEY', version: 3 }] }), timeout_seconds: 30 }],
    run: () => ({ ok: true, result: 'sent with sk-live-abcdef123456', stdout: 'key sk-live-abcdef123456', output_files: { 'a.txt': 'c2stbGl2ZS1hYmNkZWYxMjM0NTY=' } }),
  });
  await enable(t.ex);
  const job = t.ran.find((r) => (r.job as { code?: string }).code === 'x')!.job as Record<string, unknown>;
  assert.deepEqual(job['env_vars'], { API_KEY: 'sk-live-abcdef123456' });
  assert.ok(!('local_secrets' in job), 'the request itself is not passed on to the script');
  const answer = t.finished[0]!.result as Record<string, unknown>;
  assert.equal(answer['result'], 'sent with [REDACTED]');
  assert.equal(answer['stdout'], 'key [REDACTED]');
  assert.ok(!JSON.stringify(answer).includes('abcdef123456'.slice(0, 6) + 'x'), 'sanity');
  assert.deepEqual(answer['output_files'], { 'a.txt': 'c2stbGl2ZS1hYmNkZWYxMjM0NTY=' }, 'output files are left alone');
});

test('a free-form script is never handed a raw secret, even if the request asks for one', async () => {
  const vault = fakeVault({ [`${AGENT}|secret|API_KEY`]: { value: 'sk-live-abcdef123456', version: 3 } });
  const t = setup({ vault, jobs: [{ id: 'j', agent_id: 'a', payload: withSecrets({ env: [{ kind: 'secret', name: 'API_KEY', version: 3 }] }, { mode: 'script' }), timeout_seconds: 30 }] });
  await enable(t.ex);
  assert.equal(t.ran.filter((r) => (r.job as { code?: string }).code === 'x').length, 0);
  const result = t.finished[0]!.result as Record<string, unknown>;
  assert.equal(result['not_run'], true);
  assert.match(String(result['error']), /saved tools/);
  assert.deepEqual(vault.resolved, [], 'the vault was not even asked');
});

test('a secret this PC does not hold, or holds an old copy of, refuses the job BEFORE any code runs', async () => {
  const vault = fakeVault({ [`${AGENT}|secret|API_KEY`]: { value: 'old-value-1234', version: 2 } });
  const t = setup({
    vault,
    jobs: [
      { id: 'a', agent_id: 'a', payload: withSecrets({ env: [{ kind: 'secret', name: 'API_KEY', version: 3 }] }), timeout_seconds: 30 },
      { id: 'b', agent_id: 'a', payload: withSecrets({ env: [{ kind: 'secret', name: 'NOT_HERE' }] }), timeout_seconds: 30 },
    ],
  });
  await enable(t.ex);
  assert.equal(t.ran.filter((r) => (r.job as { code?: string }).code === 'x').length, 0, 'no code ran');
  for (const f of t.finished) {
    assert.equal(f.ok, false);
    assert.equal((f.result as Record<string, unknown>)['not_run'], true);
    assert.ok(!JSON.stringify(f.result).includes('old-value-1234'));
  }
  assert.match(String((t.finished.find((f) => f.id === 'a')!.result as Record<string, unknown>)['error']), /API_KEY/);
});

test('a malformed secrets request is refused, never run: bad names, program-changing names, duplicate names, a non-https cloud broker', async () => {
  const vault = fakeVault({});
  const bad = [
    { env: [{ kind: 'secret', name: 'lower' }] },
    { env: [{ kind: 'secret', name: 'LD_PRELOAD' }] },
    { env: [{ kind: 'secret', name: 'PARASYNC_BROKER_URL' }] },
    { env: [{ kind: 'secret', name: 'A_KEY' }, { kind: 'user_secret', name: 'A_KEY' }] },
  ];
  const t = setup({ vault, version: '0.3.0', jobs: bad.map((b, i) => ({ id: `j${i}`, agent_id: 'a', payload: withSecrets(b), timeout_seconds: 30 })) });
  await enable(t.ex);
  assert.equal(t.ran.filter((r) => (r.job as { code?: string }).code === 'x').length, 0);
  assert.equal(t.finished.length, bad.length);
  assert.ok(t.finished.every((f) => !f.ok && (f.result as Record<string, unknown>)['not_run'] === true));
});

test('more malformed requests: a saved login in an env list, a non-https cloud broker', async () => {
  const bad = [
    { env: [{ kind: 'browser_access', name: ACCESS }] },
    { broker: { names: [], cloud: { url: 'http://insecure.example.com', token: 'abcdefghijklmnop1234' } } },
  ];
  const t = setup({ vault: fakeVault({}), version: '0.3.0', jobs: bad.map((b, i) => ({ id: `j${i}`, agent_id: 'a', payload: withSecrets(b), timeout_seconds: 30 })) });
  await enable(t.ex);
  assert.equal(t.ran.filter((r) => (r.job as { code?: string }).code === 'x').length, 0);
  assert.ok(t.finished.length === 2 && t.finished.every((f) => !f.ok && (f.result as Record<string, unknown>)['not_run'] === true));
});

test('secrets for the local broker need a Linux box that has it, and go to the box separately from the script\'s environment', async () => {
  const entries = { [`${AGENT}|secret|API_KEY`]: { value: 'broker-only-value-99', version: 1, hosts: ['api.example.com'], deviceOnly: true } };
  const spec = { broker: { names: [{ kind: 'secret', name: 'API_KEY', hosts: [] }], cloud: { url: 'https://bemain.example.com', token: 'abcdefghijklmnop1234' } } };
  const old = setup({ vault: fakeVault(entries), version: '0.2.0', jobs: [{ id: 'j', agent_id: 'a', payload: withSecrets(spec), timeout_seconds: 30 }] });
  await enable(old.ex);
  assert.match(String((old.finished[0]!.result as Record<string, unknown>)['error']), /update/);
  assert.equal(old.ran.filter((r) => (r.job as { code?: string }).code === 'x').length, 0);

  const fresh = setup({ vault: fakeVault(entries), version: '0.3.0', jobs: [{ id: 'j', agent_id: 'a', payload: withSecrets(spec), timeout_seconds: 30 }], run: () => ({ ok: true, result: 'used broker-only-value-99' }) });
  await enable(fresh.ex);
  const r = fresh.ran.find((x) => (x.job as { code?: string }).code === 'x')!;
  assert.deepEqual((r.job as Record<string, unknown>)['env_vars'], {}, 'the value is NOT in the script environment');
  assert.deepEqual(r.broker, { secrets: [{ name: 'API_KEY', value: 'broker-only-value-99', hosts: ['api.example.com'] }], cloud: { url: 'https://bemain.example.com', token: 'abcdefghijklmnop1234' } });
  assert.equal((fresh.finished[0]!.result as Record<string, unknown>)['result'], 'used [REDACTED]');
});

test('the heartbeat tells the cloud the NAMES this PC holds, never values', async () => {
  const vault = fakeVault({});
  vault.held = async () => ({ [AGENT]: { secret: { API_KEY: 3 } } });
  const t = setup({ vault });
  await enable(t.ex);
  const beat = t.devices.find((d) => d['held_secrets']);
  assert.deepEqual(beat?.['held_secrets'], { [AGENT]: { secret: { API_KEY: 3 } } });
  t.ex.notifyHeldChanged(); // adding a secret makes the next poll report at once
  t.ex.stop();
});

test('a browser call with a saved login gets it as PARASYNC_CREDS only for that call; the session is scrubbed from then on', async () => {
  const vault = fakeVault({ [`${AGENT}|browser_access|${ACCESS}`]: { value: JSON.stringify({ username: 'boss@acme.com', password: 'p4ssw0rd-long' }), version: 2 } });
  const seen: Record<string, string>[] = [];
  const { api } = fakeBrowser({
    exec: async (_id, request) => {
      seen.push(request.env_vars);
      if (request.code === 'login') return { ok: true, result: { ok: true, url: 'https://acme.test/home', note: 'welcome boss@acme.com' }, stdout: '', output_files: {} };
      if (request.code === 'probe') return { ok: true, result: { values: ['cookie-session-value-123456', 'short'] }, stdout: '' };
      return { ok: true, result: { page: 'user cookie-session-value-123456 and p4ssw0rd-long', jwt: 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4' }, stdout: '' };
    },
  });
  const login = { kind: 'browser_exec', session_id: SID, code: 'login', files: {}, timeout: 30, local_secrets: { agent_id: AGENT, credentials: { access_id: ACCESS, version: 2 } } };
  const probe = { kind: 'browser_exec', session_id: SID, code: 'probe', files: {}, timeout: 30, learn_values: true };
  const later = { kind: 'browser_exec', session_id: SID, code: 'read page', files: {}, timeout: 30 };
  const t = setup({ version: '0.3.0', browser: api, vault, jobs: [{ id: 'l', agent_id: null, payload: login, timeout_seconds: 60 }] });
  await enable(t.ex);
  for (const [id, payload] of [['p', probe], ['r', later]] as const) {
    t.push({ id, agent_id: null, payload, timeout_seconds: 60 });
    await t.ex.tick();
    await t.ex.drain();
  }
  t.ex.stop();
  const byId = Object.fromEntries(t.finished.map((f) => [f.id, f]));
  assert.equal(JSON.parse(seen[0]!['PARASYNC_CREDS']!).password, 'p4ssw0rd-long', 'the login script gets the login');
  assert.deepEqual(seen.slice(1), [{}, {}], 'later calls get nothing');
  assert.match(String((byId['l']!.result as { result: { note: string } }).result.note), /welcome \[REDACTED\]/);
  assert.deepEqual((byId['p']!.result as { result: unknown }).result, { learned: 1 }, 'only the count of noted session values goes back');
  const page = (byId['r']!.result as { result: { page: string; jwt: string } }).result;
  assert.equal(page.page, 'user [REDACTED] and [REDACTED]');
  assert.equal(page.jwt, '[REDACTED]');
});

test('a browser call asking for the local broker is refused (it is for code runs only)', async () => {
  const { api, calls } = fakeBrowser();
  const spec = { broker: { names: [{ kind: 'secret', name: 'API_KEY', hosts: [] }], cloud: null } };
  const t = setup({ version: '0.3.0', browser: api, vault: fakeVault({}), jobs: [{ id: 'e', agent_id: null, payload: { kind: 'browser_exec', session_id: SID, code: 'x', local_secrets: { agent_id: AGENT, ...spec } }, timeout_seconds: 60 }] });
  await enable(t.ex);
  assert.equal(t.finished[0]!.ok, false);
  assert.ok(!calls.some((c) => c.startsWith('exec:')));
});
