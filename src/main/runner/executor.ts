// src/main/runner/executor.ts
// The brain of local execution. It keeps this PC registered as a device, proves the Linux box works with a self-test ("canary"),
// and only while that passes lets the cloud send work here. Work arrives as rows; each is claimed (first caller wins), run in the
// Linux box and answered. Three kinds of work: a code run (its own short process), and the three browser verbs (open / exec / close) that
// drive a long-lived browser process (browserHost.ts). It also keeps the Linux image up to date. Nothing here knows about Electron:
// everything it touches is passed in, so it is tested on its own (scripts/tests/executor.test.ts).
import { RUNNER_CONFIG, SEALED_CHECK_CODE, compareVersions, runnerHasBroker, runnerHasBrowser, runnerHasSenses, type RunnerStatus } from '../../shared/runner';
import type { HeldMap } from '../../shared/vault';
import { redactOutcome } from '../vault/redact';
import type { Ref } from '../vault/vault';
import { SignedOutError, type Cloud } from './cloud';
import { parseLocalSecrets, type BrokerSecrets } from './localSecrets';
import type { JobOutcome } from './wsl';

/** The secrets this PC holds, as the executor sees them (vault.ts implements it; the page can never reach these two calls). */
export interface VaultApi {
  held(userId: string): Promise<HeldMap>;
  resolve(userId: string, wanted: (Ref & { version?: number })[]): Promise<{ values: Map<string, { value: string; hosts: string[] }>; missing: Ref[] }>;
}

/** The browser side, as the executor sees it (browserHost.ts implements open/exec/close; index.ts adds the self-test). */
export interface BrowserApi {
  size(): number;
  open(sessionId: string): Promise<{ ok: boolean; error?: string }>;
  exec(sessionId: string, request: { code: string; files: Record<string, string>; env_vars: Record<string, string>; timeout: number }): Promise<Record<string, unknown>>;
  /** look / act: the cloud's page description and one-move actions (image 0.4.0+). */
  senses(sessionId: string, op: 'look' | 'act', body: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(sessionId: string): Promise<void>;
  closeAll(): Promise<void>;
  /** Self-test: start a browser, load a page, read it back, close it; with `senses` also look at the page. */
  check(senses: boolean): Promise<{ ok: boolean; note?: string }>;
}

/** Keeping the Linux image current: what is newest, and how to replace the installed one with it. */
export interface UpdateApi {
  latest(): Promise<string | null>;
  apply(onPercent: (percent: number) => void): Promise<string>;
}

export interface ExecutorDeps {
  cloud: Cloud;
  wslAvailable(): Promise<boolean>;
  distroInstalled(): Promise<boolean>;
  runJob(job: unknown, timeoutSeconds: number, broker?: BrokerSecrets): Promise<JobOutcome>;
  browser?: BrowserApi;
  vault?: VaultApi;
  update?: UpdateApi;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  newId(): string;
  deviceName: string;
  appVersion: string;
  now(): Date;
  publish(status: RunnerStatus): void;
  log(message: string): void;
}

const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const ENV_CHECK_EVERY_MS = 30_000;
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

interface Done { ok: boolean; result: unknown; error: string | null }
interface Prepared { payload: Record<string, unknown>; broker?: BrokerSecrets; values: string[]; credentialValues: string[]; spec: ReturnType<typeof parseLocalSecrets> }
interface Refused { refused: string; missing?: Ref[] }

export class Executor {
  private status: RunnerStatus = { state: 'off', enabled: false };
  private userId: string | null = null;
  private deviceId: string | null = null;
  private runnerVersion: string | null = null;
  private jobsRun = 0;
  private lastCanaryAt = 0;
  private lastBrowserCanaryAt = 0;
  private lastUpdateCheckAt = 0;
  private lastHeartbeatAt = 0;
  private lastHeartbeatTry = 0;
  private lastEnvCheckAt = 0;
  private lastJobAt = 0;
  private browserReady = false;
  /** Code jobs running in the Linux box right now (browser calls are counted by the browser hosts instead). */
  private codeRunning = 0;
  /** Browser sessions that were logged in with a saved login: everything their calls return is scrubbed of the login and of session tokens. */
  private readonly scrub = new Map<string, { values: Set<string> }>();
  private wslOk = false;
  private distroOk = false;
  private readonly inflight = new Set<Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private installing = false;
  private stopped = false;

  constructor(private readonly d: ExecutorDeps) {}

  getStatus(): RunnerStatus { return this.status; }

  /** Waits for every job that is running right now (tests, and a clean shutdown). */
  async drain(): Promise<void> { await Promise.all([...this.inflight]); }

  /** Called when the person signs in or out, and every time their token is renewed. */
  async setSession(userId: string | null): Promise<void> {
    const changed = userId !== this.userId;
    if (changed && this.userId && this.status.enabled) {
      // Signing out, or switching to another account: the browsers of this account end with it, and the cloud is told this account's PC is
      // no longer taking work, so its runs go to the cloud at once instead of waiting for the check-in to go stale. (Best effort: the old
      // token is still held here.)
      await this.d.browser?.closeAll();
      this.scrub.clear();
      await this.heartbeat(false).catch(() => undefined);
    }
    this.userId = userId;
    if (!userId) {
      this.browserReady = false;
      this.set({ state: 'off', enabled: false });
      this.stop();
      return;
    }
    if (changed) {
      this.stopped = false;
      this.browserReady = false;
      this.lastEnvCheckAt = 0;
      this.deviceId = (await this.d.getSetting(`runner.deviceId.${userId}`)) ?? null; // one device id per signed-in account on this PC
      this.runnerVersion = await this.d.getSetting('runner.version');
      const enabled = (await this.d.getSetting(`runner.enabled.${userId}`)) === '1';
      this.set({ state: enabled ? 'checking' : 'off', enabled });
      if (enabled) this.schedule(0);
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.userId) return;
    await this.d.setSetting(`runner.enabled.${this.userId}`, enabled ? '1' : '0');
    this.lastCanaryAt = 0;
    this.lastEnvCheckAt = 0;
    if (!enabled) {
      this.browserReady = false;
      await this.d.browser?.closeAll();
      this.scrub.clear();
      this.set({ state: 'off', enabled: false });
      await this.heartbeat(false).catch(() => undefined); // tell the cloud right away: not ready, not accepting work
      return;
    }
    this.set({ state: 'checking', enabled: true });
    this.schedule(0);
  }

  /** The Linux box was just installed or replaced: remember which version, and test it afresh. */
  async afterInstall(version: string): Promise<void> {
    this.runnerVersion = version;
    await this.d.setSetting('runner.version', version);
    this.lastCanaryAt = 0;
    this.lastBrowserCanaryAt = 0;
    this.lastEnvCheckAt = 0;
    this.browserReady = false;
    this.set({ ...this.status, state: 'checking', percent: undefined, message: undefined });
    this.schedule(0);
  }

  setInstalling(percent: number | null): void {
    this.installing = percent !== null;
    if (percent !== null) this.set({ ...this.status, state: 'installing', percent });
  }

  /** Called as the app quits: end the browsers and tell the cloud this PC is gone now, instead of leaving it "ready" until its check-in goes stale. */
  async goodbye(): Promise<void> {
    if (!this.userId || !this.status.enabled) return;
    this.stop();
    this.scrub.clear();
    await Promise.all([this.d.browser?.closeAll(), this.heartbeat(false).catch(() => undefined)]);
  }

  /** The vault changed (a secret was added or removed): tell the cloud at the next opportunity, not in 30 s. */
  notifyHeldChanged(): void {
    this.lastHeartbeatAt = 0;
    this.lastHeartbeatTry = 0;
    if (this.status.enabled) this.schedule(0);
  }

  reportError(message: string): void {
    this.installing = false;
    this.set({ ...this.status, state: 'error', percent: undefined, message });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ── loop ──────────────────────────────────────────────────────────────────

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.stopped || !this.userId || !this.status.enabled) return;
    this.timer = setTimeout(() => { void this.tick(); }, ms);
  }

  /** Is anything going on that a person is waiting for? Then look for work faster. */
  private active(now: number): boolean {
    return this.inflight.size > 0 || (this.d.browser?.size() ?? 0) > 0 || now - this.lastJobAt < RUNNER_CONFIG.activeWindowMs;
  }

  async tick(): Promise<void> {
    if (this.ticking || this.installing || !this.userId || !this.status.enabled) return;
    this.ticking = true;
    try {
      const now = this.d.now().getTime();
      // wsl.exe is a real process on the PC: ask it whether Linux is there at most every 30 s (and again whenever something is wrong).
      const stable = this.status.state === 'ready' || this.status.state === 'busy';
      if (!stable || now - this.lastEnvCheckAt >= ENV_CHECK_EVERY_MS) {
        this.wslOk = await this.d.wslAvailable();
        this.distroOk = this.wslOk && (await this.d.distroInstalled());
        this.lastEnvCheckAt = now;
      }
      if (!this.wslOk) return this.fail('no-wsl', 'Windows’ Linux support (WSL2) is not available on this PC.');
      if (!this.distroOk) return this.fail('needs-install', 'The Linux box is not installed yet.');

      if (this.inflight.size === 0 && (now - this.lastCanaryAt >= RUNNER_CONFIG.canaryEveryMs || this.status.state === 'checking')) {
        const ok = await this.canary();
        this.lastCanaryAt = now;
        if (!ok) return;
      }
      if (this.status.state !== 'ready' && this.status.state !== 'busy') return;
      if (this.inflight.size === 0) {
        await this.maybeUpdate(now);
        if (this.installing) return;
        await this.maybeBrowserCanary(now);
      }
      if (now - this.lastHeartbeatAt >= RUNNER_CONFIG.heartbeatMs && now - this.lastHeartbeatTry >= 10_000) {
        this.lastHeartbeatTry = now; // a failing register call is retried every 10 s at most, never every poll
        try {
          await this.heartbeat(true);
          if (this.status.message?.startsWith('Could not register')) this.set({ ...this.status, message: undefined });
        } catch (e) {
          if (e instanceof SignedOutError) throw e;
          this.d.log(`heartbeat failed: ${e instanceof Error ? e.message : String(e)}`);
          this.set({ ...this.status, message: 'Could not register this PC with Parasync. Retrying…' });
        }
      }

      if (this.inflight.size < RUNNER_CONFIG.maxParallelJobs) {
        const jobs = await this.d.cloud.queuedJobs(await this.ensureDeviceId());
        for (const queued of jobs) {
          if (this.inflight.size >= RUNNER_CONFIG.maxParallelJobs) break;
          const job = await this.d.cloud.claim(queued.id);
          if (job) this.start(job);
        }
      }
    } catch (e) {
      if (e instanceof SignedOutError) {
        this.set({ ...this.status, state: 'error', message: 'Signed out. Sign in again to use this PC for tool runs.' });
      } else {
        this.d.log(`tick failed: ${e instanceof Error ? e.message : String(e)}`);
        // A cloud hiccup is not a broken Linux box: keep the state, try again shortly.
      }
    } finally {
      this.ticking = false;
      const live = this.status.state === 'ready' || this.status.state === 'busy';
      const delay = !live ? 15_000 : this.active(this.d.now().getTime()) ? RUNNER_CONFIG.activePollMs : RUNNER_CONFIG.pollMs;
      this.schedule(delay); // not working yet: look again later, without spawning wsl.exe every second
    }
  }

  // ── self-tests ────────────────────────────────────────────────────────────

  private async canary(): Promise<boolean> {
    this.set({ ...this.status, state: 'checking' });
    const outcome = await this.d.runJob({ mode: 'script', code: SEALED_CHECK_CODE, agent_id: 'canary' }, 60);
    const answer = outcome.kind === 'result' ? (outcome.result['result'] as { sum?: unknown; bad?: unknown } | null) : null;
    const bad = Array.isArray(answer?.bad) ? (answer.bad as unknown[]).map(String) : null;
    const ok = outcome.kind === 'result' && outcome.result['ok'] === true && answer?.sum === 42 && bad !== null && bad.length === 0;
    const note = ok
      ? null
      : (outcome.kind === 'failed' ? outcome.message
        : bad && bad.length > 0 ? `The Linux box is not sealed (${bad.join(', ')}), so tool runs stay in the cloud.`
        : String(outcome.result['error'] ?? 'unexpected answer')).slice(0, 400);
    this.set({ ...this.status, state: ok ? 'ready' : 'error', message: ok ? undefined : `Self-test failed: ${note}`, lastCanaryAt: this.d.now().toISOString() });
    await this.heartbeat(ok, { last_canary_at: this.d.now().toISOString(), last_canary_ok: ok, last_canary_note: note }).catch(() => undefined);
    return ok;
  }

  /** Browsers need image 0.2.0+. Tested on its own, rarely, and never while a browser is open (an open one proves it works). */
  private async maybeBrowserCanary(now: number): Promise<void> {
    const browser = this.d.browser;
    if (!browser) return;
    if (!runnerHasBrowser(this.runnerVersion)) {
      this.browserReady = false;
      this.set({ ...this.status, browser: 'unavailable', browserNote: 'The Linux box has no browser yet; it updates itself when a newer one is published.' });
      return;
    }
    if (browser.size() > 0) return;
    if (this.browserReady && now - this.lastBrowserCanaryAt < RUNNER_CONFIG.browserCanaryEveryMs) return;
    if (!this.browserReady && this.lastBrowserCanaryAt !== 0 && now - this.lastBrowserCanaryAt < RUNNER_CONFIG.canaryEveryMs) return; // a failing one: retry like the code self-test
    this.set({ ...this.status, browser: 'checking', browserNote: undefined });
    const result = await browser.check(runnerHasSenses(this.runnerVersion));
    this.lastBrowserCanaryAt = now;
    this.browserReady = result.ok;
    this.set({ ...this.status, browser: result.ok ? 'ready' : 'error', browserNote: result.ok ? undefined : (result.note ?? 'The browser self-test failed.').slice(0, 300) });
    await this.heartbeat(true, {
      last_browser_canary_ok: result.ok,
      last_browser_canary_note: result.ok ? null : (result.note ?? '').slice(0, 400),
    }).catch(() => undefined);
  }

  /** Replaces the Linux box with a newer published one, but only while nothing is running (and tells the cloud first). */
  private async maybeUpdate(now: number): Promise<void> {
    const update = this.d.update;
    if (!update || !this.runnerVersion) return;
    if (this.lastUpdateCheckAt !== 0 && now - this.lastUpdateCheckAt < RUNNER_CONFIG.updateCheckEveryMs) return;
    if ((this.d.browser?.size() ?? 0) > 0) return; // idle only: do not end somebody's browser
    this.lastUpdateCheckAt = now;
    let latest: string | null = null;
    try {
      latest = await update.latest();
    } catch (e) {
      this.d.log(`update check failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!latest || compareVersions(latest, this.runnerVersion) <= 0) return;
    this.d.log(`updating the Linux box ${this.runnerVersion} -> ${latest}`);
    await this.heartbeat(false).catch(() => undefined);
    this.browserReady = false;
    this.installing = true;
    this.set({ ...this.status, state: 'installing', percent: 0, message: `Updating the Linux box to ${latest}…` });
    try {
      const installed = await update.apply((percent) => this.set({ ...this.status, state: 'installing', percent }));
      this.installing = false;
      await this.afterInstall(installed);
    } catch (e) {
      this.installing = false;
      this.lastEnvCheckAt = 0;
      this.set({ ...this.status, state: 'error', percent: undefined, message: `The Linux box update failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // ── running work ──────────────────────────────────────────────────────────

  private start(job: { id: string; payload: unknown; timeout_seconds: number }): void {
    this.lastJobAt = this.d.now().getTime();
    const running = this.runOne(job).finally(() => {
      this.inflight.delete(running);
      this.lastJobAt = this.d.now().getTime();
      if (this.status.state === 'busy' && this.inflight.size === 0) this.set({ ...this.status, state: 'ready', jobsRun: this.jobsRun });
    });
    this.inflight.add(running);
  }

  private async runOne(job: { id: string; payload: unknown; timeout_seconds: number }): Promise<void> {
    this.set({ ...this.status, state: 'busy' });
    const keepAlive = setInterval(() => {
      void this.d.cloud.touch(job.id).catch(() => undefined);
      void this.heartbeat(true).catch(() => undefined); // a long job must not make this PC look gone
    }, 30_000);
    let done: Done;
    try {
      void this.d.cloud.touch(job.id).catch(() => undefined);
      const kind = job.payload && typeof job.payload === 'object' ? (job.payload as { kind?: unknown }).kind : undefined;
      if (typeof kind === 'string' && kind.startsWith('browser_')) {
        done = await this.runBrowserJob(kind, job.payload as Record<string, unknown>);
      } else {
        this.codeRunning += 1;
        this.set({ ...this.status });
        try { done = await this.runCodeJob(job); } finally { this.codeRunning -= 1; }
      }
      this.jobsRun += 1;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      done = { ok: false, result: { ok: false, error }, error };
    } finally {
      clearInterval(keepAlive);
      this.set({ ...this.status }); // the counts in the header: a browser may have opened or closed, a code job has ended
    }
    try {
      await this.d.cloud.finish(job.id, done.ok, done.result, done.error);
    } catch (e) {
      this.d.log(`could not report job ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async runCodeJob(job: { payload: unknown; timeout_seconds: number }): Promise<Done> {
    let payload: unknown = job.payload;
    let broker: BrokerSecrets | undefined;
    let secretValues: string[] = [];
    const raw = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? (job.payload as Record<string, unknown>) : null;
    if (raw && 'local_secrets' in raw) {
      const prepared = await this.prepareSecrets(raw, false);
      if ('refused' in prepared) return this.refuse(prepared);
      payload = prepared.payload;
      broker = prepared.broker;
      secretValues = prepared.values;
    }
    const outcome = await this.d.runJob(payload, job.timeout_seconds, broker);
    if (outcome.kind !== 'result') return { ok: false, result: { ok: false, error: outcome.message }, error: outcome.message };
    // A secret that only this PC holds is unknown to the cloud, so this PC blanks it from the answer before it leaves.
    const answer = secretValues.length ? redactOutcome(outcome.result, secretValues) : outcome.result;
    let ok = answer['ok'] === true;
    let result: unknown = answer;
    let error: string | null = ok ? null : String(answer['error'] ?? 'The code reported an error.').slice(0, 1900);
    if (JSON.stringify(result).length > MAX_RESULT_BYTES) {
      ok = false;
      result = null;
      error = 'The result was too large to send back (over 20 MB).';
    }
    return { ok, result, error };
  }

  /**
   * Turns a job's `local_secrets` request into what the Linux box is given. Anything this PC cannot supply (not held, an out-of-date copy,
   * a box too old for the broker, a malformed request) refuses the job BEFORE any code runs, with `not_run: true`, so the cloud knows
   * nothing happened and may run it itself when the secrets also exist there.
   */
  private async prepareSecrets(raw: Record<string, unknown>, browser: boolean): Promise<Prepared | Refused> {
    const { local_secrets: request, ...rest } = raw;
    let spec: ReturnType<typeof parseLocalSecrets>;
    try {
      spec = parseLocalSecrets(request);
    } catch (e) {
      return { refused: `This PC cannot use that secrets request: ${e instanceof Error ? e.message : 'invalid'}.` };
    }
    if (!spec) return { payload: rest, values: [], credentialValues: [], spec: null };
    if (!this.d.vault || !this.userId) return { refused: 'This PC has no secrets to give.' };
    if (browser && spec.broker) return { refused: 'Browser calls cannot use the local broker.' };
    if (!browser && spec.credentials) return { refused: 'A saved login can only be used by a browser call.' };
    // Raw environment secrets are for saved tools only (function mode: code an admin fixed, with declared inputs). Free-form scripts get a secret
    // only through the broker, so even a mistaken or forged request cannot hand one to a script that could read and send it anywhere.
    if (!browser && spec.env.length > 0 && rest['mode'] !== 'function') return { refused: 'Raw secrets are only given to saved tools, never to a free-form script.' };
    if (spec.broker && !runnerHasBroker(this.runnerVersion)) return { refused: 'The Linux box on this PC has to update before it can keep secrets away from a script.' };

    const wanted = [...spec.env, ...(spec.broker?.names ?? []), ...(spec.credentials ? [spec.credentials] : [])];
    const { values, missing } = await this.d.vault.resolve(this.userId, wanted);
    if (missing.length > 0) {
      return { refused: `This PC does not hold the current copy of: ${missing.map((m) => m.name).join(', ')}.`, missing };
    }
    const key = (r: Ref) => `${r.agentId}|${r.kind}|${r.name}`;
    const env: Record<string, string> = {};
    const all: string[] = [];
    for (const e of spec.env) {
      const v = values.get(key(e))!.value;
      env[e.name] = v;
      all.push(v);
    }
    let broker: BrokerSecrets | undefined;
    if (spec.broker) {
      broker = {
        secrets: spec.broker.names.map((n) => {
          const entry = values.get(key(n))!;
          all.push(entry.value);
          return { name: n.name, value: entry.value, hosts: n.hosts.length > 0 ? n.hosts : entry.hosts };
        }),
        cloud: spec.broker.cloud,
      };
    }
    const credentialValues: string[] = [];
    if (spec.credentials) {
      const text = values.get(key(spec.credentials))!.value;
      env['PARASYNC_CREDS'] = text;
      credentialValues.push(text);
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') for (const v of Object.values(parsed as Record<string, unknown>)) if (typeof v === 'string') credentialValues.push(v);
      } catch { /* a login that is not JSON is used whole */ }
    }
    const existing = rest['env_vars'] && typeof rest['env_vars'] === 'object' && !Array.isArray(rest['env_vars']) ? (rest['env_vars'] as Record<string, string>) : {};
    return { payload: { ...rest, env_vars: { ...existing, ...env } }, broker, values: all, credentialValues, spec };
  }

  private refuse(r: Refused): Done {
    const result = { ok: false, error: r.refused, not_run: true, ...(r.missing ? { local_secrets_missing: r.missing.map((m) => ({ kind: m.kind, name: m.name })) } : {}) };
    return { ok: false, result, error: r.refused };
  }

  private async runBrowserJob(kind: string, p: Record<string, unknown>): Promise<Done> {
    const browser = this.d.browser;
    const fail = (error: string): Done => ({ ok: false, result: { ok: false, error }, error });
    const sessionId = typeof p['session_id'] === 'string' ? p['session_id'] : '';
    if (!browser || !SESSION_ID.test(sessionId)) return fail('browser jobs are not available here');
    if (kind === 'browser_open') {
      if (!this.browserReady) return fail('This PC is not ready for browsers.');
      const r = await browser.open(sessionId);
      return { ok: r.ok, result: r, error: r.ok ? null : (r.error ?? 'The browser could not be opened.') };
    }
    if (kind === 'browser_close') {
      this.scrub.delete(sessionId);
      await browser.close(sessionId);
      return { ok: true, result: { ok: true }, error: null };
    }
    if (kind === 'browser_exec') {
      const code = typeof p['code'] === 'string' ? p['code'] : '';
      const files = p['files'] && typeof p['files'] === 'object' ? (p['files'] as Record<string, string>) : {};
      const timeout = typeof p['timeout'] === 'number' ? p['timeout'] : 120;
      if (!code.trim()) return fail('no code provided');
      let env = p['env_vars'] && typeof p['env_vars'] === 'object' ? (p['env_vars'] as Record<string, string>) : {};
      const needles: string[] = [];
      let credentialCall = false;
      if ('local_secrets' in p) {
        const prepared = await this.prepareSecrets(p, true);
        if ('refused' in prepared) return this.refuse(prepared);
        env = (prepared.payload['env_vars'] ?? {}) as Record<string, string>;
        needles.push(...prepared.values, ...prepared.credentialValues);
        credentialCall = prepared.spec?.credentials != null;
      }
      const session = this.scrub.get(sessionId) ?? (credentialCall ? { values: new Set<string>() } : undefined);
      if (session) {
        for (const v of needles) session.values.add(v);
        this.scrub.set(sessionId, session);
      }
      let outcome = await browser.exec(sessionId, { code, files, env_vars: env, timeout });
      if (p['learn_values'] === true && session && outcome['ok'] === true) {
        // The cloud asked this PC to note what a logged-in session holds (cookies, storage), so later answers can be scrubbed here. The
        // values themselves stay on this PC: only how many were noted goes back.
        const found = (outcome['result'] as { values?: unknown } | null)?.values;
        const list = Array.isArray(found) ? found.filter((v): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 4000).slice(0, 40) : [];
        for (const v of list) session.values.add(v);
        outcome = { ok: true, result: { learned: list.length }, stdout: '' };
      }
      if (session || needles.length > 0) outcome = redactOutcome(outcome, [...(session?.values ?? []), ...needles], session !== undefined);
      const ok = outcome['ok'] === true;
      if (JSON.stringify(outcome).length > MAX_RESULT_BYTES) return fail('The result was too large to send back (over 20 MB).');
      return { ok, result: outcome, error: ok ? null : String(outcome['error'] ?? 'The script failed.').slice(0, 1900) };
    }
    if (kind === 'browser_look' || kind === 'browser_act') {
      if (!runnerHasSenses(this.runnerVersion)) return fail('The Linux box on this PC has to update first (look and act need image 0.4.0); it updates itself while the app is idle.');
      const { kind: _kind, session_id: _session, ...body } = p;
      let outcome = await browser.senses(sessionId, kind === 'browser_look' ? 'look' : 'act', body);
      // A browser that was logged in with a saved login: what the page shows (a report, a path, a title) never carries that login or the session's tokens out.
      const session = this.scrub.get(sessionId);
      if (session) outcome = redactOutcome(outcome, [...session.values], true);
      const ok = outcome['ok'] === true;
      if (JSON.stringify(outcome).length > MAX_RESULT_BYTES) return fail('The result was too large to send back (over 20 MB).');
      return { ok, result: outcome, error: ok ? null : String(outcome['error'] ?? 'The browser could not do that.').slice(0, 1900) };
    }
    return fail(`unknown job kind ${kind}`);
  }

  // ── cloud bookkeeping ─────────────────────────────────────────────────────

  private async ensureDeviceId(): Promise<string> {
    if (!this.deviceId) {
      this.deviceId = this.d.newId();
      await this.d.setSetting(`runner.deviceId.${this.userId}`, this.deviceId);
    }
    return this.deviceId;
  }

  private async heartbeat(ready: boolean, extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.userId) return;
    const id = await this.ensureDeviceId();
    const isReady = ready && this.status.enabled;
    const held = this.d.vault ? await this.d.vault.held(this.userId).catch(() => undefined) : undefined;
    await this.d.cloud.saveDevice(id, this.userId, {
      ...(held ? { held_secrets: held } : {}),
      name: this.d.deviceName,
      app_version: this.d.appVersion,
      runner_version: this.runnerVersion,
      local_enabled: this.status.enabled,
      ready: isReady,
      browser_ready: isReady && this.browserReady,
      last_seen: this.d.now().toISOString(),
      ...extra,
    });
    this.lastHeartbeatAt = this.d.now().getTime();
  }

  private async fail(state: 'no-wsl' | 'needs-install', message: string): Promise<void> {
    this.set({ ...this.status, state, message });
    await this.heartbeat(false).catch(() => undefined);
  }

  private set(next: RunnerStatus): void {
    this.status = {
      ...next,
      deviceName: this.d.deviceName,
      runnerVersion: this.runnerVersion ?? undefined,
      browserSessions: this.d.browser?.size() ?? 0,
      sandboxRunning: this.codeRunning,
      senses: runnerHasSenses(this.runnerVersion),
    };
    this.d.publish(this.status);
  }
}
