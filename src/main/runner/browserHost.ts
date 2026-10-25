// src/main/runner/browserHost.ts
// Keeps the browser sessions that live on this PC. One session = one long-lived process in the Linux box (parasync_localrunner's
// browser_host.py) that the app talks to over its standard input and output: one JSON line in per request, one marked line out per answer.
// Nothing listens on a port. When the app quits, signs out or the pipe closes, the browser goes with it.
//
// No Electron imports here, and the process itself is injected (`spawn`), so this is tested alone with a fake host.
import { RUNNER_CONFIG } from '../../shared/runner';

const MARKER = '__PARASYNC_BROWSER__';
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;
const READY_TIMEOUT_MS = 90_000;

/** What the app needs from the process that runs one browser host. */
export interface HostProcess {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  onExit(cb: (code: number | null) => void): void;
  kill(): void;
}
export type SpawnHost = (sessionId: string) => HostProcess;

export interface ExecRequest {
  code: string;
  files: Record<string, string>;
  env_vars: Record<string, string>;
  timeout: number;
}
export type Outcome = Record<string, unknown>;

interface Session {
  proc: HostProcess;
  ready: Promise<{ ok: boolean; error?: string }>;
  pending: Map<string, (outcome: Outcome) => void>;
  exited: boolean;
  nextId: number;
}

const gone = (error: string): Outcome => ({ ok: false, error, stdout: '', output_files: {}, session_gone: true });

export class BrowserHosts {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly spawn: SpawnHost) {}

  size(): number {
    return this.sessions.size;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Starts a browser. Fails (so the caller can use the cloud) when it cannot start or this PC already holds too many. */
  async open(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    if (!SESSION_ID.test(sessionId)) return { ok: false, error: 'invalid session id' };
    if (this.sessions.has(sessionId)) return { ok: true };
    if (this.sessions.size >= RUNNER_CONFIG.maxBrowserSessions) {
      return { ok: false, error: `This PC already has ${RUNNER_CONFIG.maxBrowserSessions} browsers open.` };
    }
    let proc: HostProcess;
    try {
      proc = this.spawn(sessionId);
    } catch (e) {
      return { ok: false, error: `The browser could not be started: ${e instanceof Error ? e.message : String(e)}` };
    }
    const session: Session = { proc, pending: new Map(), exited: false, nextId: 1, ready: Promise.resolve({ ok: false }) };
    let settleReady: (value: { ok: boolean; error?: string }) => void = () => undefined;
    session.ready = new Promise((resolve) => { settleReady = resolve; });
    const timer = setTimeout(() => settleReady({ ok: false, error: 'The browser did not start in time.' }), READY_TIMEOUT_MS);

    proc.onLine((line) => {
      if (!line.startsWith(MARKER)) return; // anything else the process prints is noise
      let message: { type?: string; id?: string; outcome?: Outcome; error?: string };
      try {
        message = JSON.parse(line.slice(MARKER.length));
      } catch {
        return;
      }
      if (message.type === 'ready') settleReady({ ok: true });
      else if (message.type === 'fatal') {
        settleReady({ ok: false, error: message.error ?? 'The browser stopped.' });
        this.finish(sessionId, session, message.error ?? 'The browser closed.');
      } else if (message.type === 'response' && message.id) {
        session.pending.get(message.id)?.(message.outcome ?? { ok: false, error: 'empty answer' });
        session.pending.delete(message.id);
      }
    });
    proc.onExit(() => {
      settleReady({ ok: false, error: 'The browser process ended.' });
      this.finish(sessionId, session, 'The browser closed unexpectedly.');
    });

    this.sessions.set(sessionId, session);
    const result = await session.ready;
    clearTimeout(timer);
    if (!result.ok) await this.close(sessionId);
    return result;
  }

  /** Runs one script in a browser. A session that is not here (the app restarted, the browser crashed) is reported gone, never faked. */
  async exec(sessionId: string, request: ExecRequest): Promise<Outcome> {
    const session = this.sessions.get(sessionId);
    if (!session || session.exited) return gone('This browser no longer exists on this PC (it closed when the app restarted or stopped).');
    const id = String(session.nextId++);
    const limitMs = (Math.max(1, request.timeout) + 30) * 1000;
    return await new Promise<Outcome>((resolve) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        resolve({ ok: false, error: 'The browser did not answer in time.', stdout: '', output_files: {} });
      }, limitMs);
      session.pending.set(id, (outcome) => { clearTimeout(timer); resolve(outcome); });
      try {
        session.proc.write(JSON.stringify({ id, op: 'exec', code: request.code, files: request.files, env_vars: request.env_vars, timeout: request.timeout }) + '\n');
      } catch {
        clearTimeout(timer);
        session.pending.delete(id);
        resolve(gone('The browser could not be reached.'));
      }
    });
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.proc.write(JSON.stringify({ id: 'close', op: 'close' }) + '\n');
    } catch { /* already gone */ }
    // Give it a moment to shut Chromium down by itself, then make sure.
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.finish(sessionId, session, 'The browser was closed.');
    session.proc.kill();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }

  /** Forgets a session and answers everything still waiting on it. */
  private finish(sessionId: string, session: Session, why: string): void {
    if (session.exited) return;
    session.exited = true;
    this.sessions.delete(sessionId);
    for (const resolve of session.pending.values()) resolve(gone(why));
    session.pending.clear();
  }
}
