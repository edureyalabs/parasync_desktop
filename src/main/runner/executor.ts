// src/main/runner/executor.ts
// The brain of local execution. It keeps this PC registered as a device, proves the Linux box works with a self-test ("canary"),
// and only while that passes lets the cloud send work here. Work arrives as rows; each is claimed (first caller wins), run in the
// Linux box as its own process, and answered. Nothing here knows about Electron: everything it touches is passed in, so it is tested
// on its own (scripts/tests/executor.test.ts).
import { RUNNER_CONFIG, type RunnerStatus } from '../../shared/runner';
import { SignedOutError, type Cloud } from './cloud';
import type { JobOutcome } from './wsl';

export interface ExecutorDeps {
  cloud: Cloud;
  wslAvailable(): Promise<boolean>;
  distroInstalled(): Promise<boolean>;
  runJob(job: unknown, timeoutSeconds: number): Promise<JobOutcome>;
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

export class Executor {
  private status: RunnerStatus = { state: 'off', enabled: false };
  private userId: string | null = null;
  private deviceId: string | null = null;
  private runnerVersion: string | null = null;
  private jobsRun = 0;
  private lastCanaryAt = 0;
  private lastHeartbeatAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private installing = false;
  private stopped = false;

  constructor(private readonly d: ExecutorDeps) {}

  getStatus(): RunnerStatus { return this.status; }

  /** Called when the person signs in or out, and every time their token is renewed. */
  async setSession(userId: string | null): Promise<void> {
    const changed = userId !== this.userId;
    this.userId = userId;
    if (!userId) {
      this.set({ state: 'off', enabled: false });
      this.stop();
      return;
    }
    if (changed) {
      this.stopped = false;
      this.deviceId = (await this.d.getSetting('runner.deviceId')) ?? null;
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
    if (!enabled) {
      this.set({ state: 'off', enabled: false });
      await this.heartbeat(false).catch(() => undefined); // tell the cloud right away: not ready, not accepting work
      return;
    }
    this.set({ state: 'checking', enabled: true });
    this.schedule(0);
  }

  /** The person pressed "Install" (the Linux box itself is added by install.ts through `afterInstall`). */
  async afterInstall(version: string): Promise<void> {
    this.runnerVersion = version;
    await this.d.setSetting('runner.version', version);
    this.lastCanaryAt = 0;
    this.set({ ...this.status, state: 'checking', percent: undefined, message: undefined });
    this.schedule(0);
  }

  setInstalling(percent: number | null): void {
    this.installing = percent !== null;
    if (percent !== null) this.set({ ...this.status, state: 'installing', percent });
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

  async tick(): Promise<void> {
    if (this.ticking || this.installing || !this.userId || !this.status.enabled) return;
    this.ticking = true;
    try {
      if (!(await this.d.wslAvailable())) return this.fail('no-wsl', 'Windows’ Linux support (WSL2) is not available on this PC.');
      if (!(await this.d.distroInstalled())) return this.fail('needs-install', 'The Linux box is not installed yet.');

      const now = this.d.now().getTime();
      if (now - this.lastCanaryAt >= RUNNER_CONFIG.canaryEveryMs || this.status.state === 'checking') {
        const ok = await this.canary();
        this.lastCanaryAt = now;
        if (!ok) return;
      }
      if (this.status.state !== 'ready' && this.status.state !== 'busy') return;
      if (now - this.lastHeartbeatAt >= RUNNER_CONFIG.heartbeatMs) await this.heartbeat(true);

      const jobs = await this.d.cloud.queuedJobs(await this.ensureDeviceId());
      for (const queued of jobs) {
        const job = await this.d.cloud.claim(queued.id);
        if (job) await this.runOne(job);
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
      this.schedule(live ? RUNNER_CONFIG.pollMs : 15_000); // not working yet: look again later, without spawning wsl.exe every second
    }
  }

  private async canary(): Promise<boolean> {
    this.set({ ...this.status, state: 'checking' });
    const outcome = await this.d.runJob({ mode: 'script', code: 'result = 6 * 7', agent_id: 'canary' }, 60);
    const ok = outcome.kind === 'result' && outcome.result['ok'] === true && outcome.result['result'] === 42;
    const note = ok ? null : (outcome.kind === 'failed' ? outcome.message : String(outcome.result['error'] ?? 'unexpected answer')).slice(0, 400);
    this.set({ ...this.status, state: ok ? 'ready' : 'error', message: ok ? undefined : `Self-test failed: ${note}`, lastCanaryAt: this.d.now().toISOString() });
    await this.heartbeat(ok, { last_canary_at: this.d.now().toISOString(), last_canary_ok: ok, last_canary_note: note }).catch(() => undefined);
    return ok;
  }

  private async runOne(job: { id: string; payload: unknown; timeout_seconds: number }): Promise<void> {
    this.set({ ...this.status, state: 'busy' });
    const keepAlive = setInterval(() => { void this.d.cloud.touch(job.id).catch(() => undefined); }, 30_000);
    let ok = false;
    let result: unknown = null;
    let error: string | null = null;
    try {
      void this.d.cloud.touch(job.id).catch(() => undefined);
      const outcome = await this.d.runJob(job.payload, job.timeout_seconds);
      if (outcome.kind === 'result') {
        result = outcome.result;
        ok = outcome.result['ok'] === true;
        if (!ok) error = String(outcome.result['error'] ?? 'The code reported an error.').slice(0, 1900);
        if (JSON.stringify(result).length > MAX_RESULT_BYTES) {
          ok = false;
          result = null;
          error = 'The result was too large to send back (over 20 MB).';
        }
      } else {
        error = outcome.message;
        result = { ok: false, error: outcome.message };
      }
      this.jobsRun += 1;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      result = { ok: false, error };
    } finally {
      clearInterval(keepAlive);
    }
    try {
      await this.d.cloud.finish(job.id, ok, result, error);
    } catch (e) {
      this.d.log(`could not report job ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.set({ ...this.status, state: 'ready', jobsRun: this.jobsRun });
  }

  // ── cloud bookkeeping ─────────────────────────────────────────────────────

  private async ensureDeviceId(): Promise<string> {
    if (!this.deviceId) {
      this.deviceId = this.d.newId();
      await this.d.setSetting('runner.deviceId', this.deviceId);
    }
    return this.deviceId;
  }

  private async heartbeat(ready: boolean, extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.userId) return;
    const id = await this.ensureDeviceId();
    await this.d.cloud.saveDevice(id, this.userId, {
      name: this.d.deviceName,
      app_version: this.d.appVersion,
      runner_version: this.runnerVersion,
      local_enabled: this.status.enabled,
      ready: ready && this.status.enabled,
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
    this.status = { ...next, deviceName: this.d.deviceName };
    this.d.publish(this.status);
  }
}
