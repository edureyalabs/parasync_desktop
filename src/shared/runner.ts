// src/shared/runner.ts
// Local execution: running an agent's tool code on this PC, in a sealed Linux box (its own WSL2 distribution), instead of the cloud.
// The status below is all the page ever sees; the work itself happens in the main process.

export const RUNNER_CONFIG = {
  /** Name of the WSL distribution the app owns. Nothing else on the PC is touched. */
  distro: 'ParasyncRunner',
  /** Public release of the Linux environment (see the parasync_localrunner repository). */
  manifestUrl: 'https://github.com/edureyalabs/parasync_localrunner/releases/latest/download/manifest.json',
  releaseBase: 'https://github.com/edureyalabs/parasync_localrunner/releases/latest/download/',
  /** How often the app tells the cloud it is alive, and how often it looks for work. */
  heartbeatMs: 30_000,
  pollMs: 1_500,
  /** Poll faster while work is flowing (a browser session, or a job in the last 20 s): each browser step waits for one poll. */
  activePollMs: 400,
  activeWindowMs: 20_000,
  canaryEveryMs: 5 * 60_000,
  /** The browser self-test launches Chromium, so it runs less often (and never while a browser session is open). */
  browserCanaryEveryMs: 30 * 60_000,
  /** How often to look for a newer Linux image, and the first image version that has a browser. */
  updateCheckEveryMs: 6 * 60 * 60_000,
  minBrowserRunner: '0.2.0',
  /** The first Linux image that can hold secrets away from the script (the local broker). */
  minBrokerRunner: '0.3.0',
  /** Most browsers one PC keeps open at once, and most jobs it runs at once. */
  maxBrowserSessions: 3,
  maxParallelJobs: 4,
} as const;

/** Compares dotted version numbers ("0.10.0" > "0.9.2"). Anything that is not a number counts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export const runnerHasBrowser = (version: string | null): boolean => !!version && compareVersions(version, RUNNER_CONFIG.minBrowserRunner) >= 0;
export const runnerHasBroker = (version: string | null): boolean => !!version && compareVersions(version, RUNNER_CONFIG.minBrokerRunner) >= 0;

export type RunnerState =
  | 'off'            // the person has not switched it on
  | 'no-wsl'         // Windows' Linux support (WSL2) is missing
  | 'needs-install'  // switched on, the Linux box is not installed yet
  | 'installing'     // downloading / importing
  | 'checking'       // running the self-test
  | 'ready'          // self-test passed: the cloud may send work here
  | 'busy'           // running a job
  | 'error';         // something failed; `message` says what

export interface RunnerStatus {
  state: RunnerState;
  enabled: boolean;
  message?: string;
  /** Install progress 0-100 while `installing`. */
  percent?: number;
  deviceName?: string;
  lastCanaryAt?: string;
  jobsRun?: number;
  /** Version of the Linux image installed on this PC, and whether it can run browser sessions (and does, per its own self-test). */
  runnerVersion?: string;
  browser?: 'unavailable' | 'checking' | 'ready' | 'error';
  browserNote?: string;
  /** Browsers open on this PC right now. */
  browserSessions?: number;
  /** Code jobs (tool runs) running in the Linux box right now. */
  sandboxRunning?: number;
}

/**
 * The self-test script, run inside the Linux box as the same unprivileged user that runs agent code. It proves the box is sealed as
 * promised: no Windows drives, no way to start Windows programs, not root. A PC is "ready" only while `bad` comes back empty.
 */
export const SEALED_CHECK_CODE = `
import glob, getpass, os, shutil
bad = []
if os.path.exists('/mnt/c') or any(os.path.isdir(p) for p in glob.glob('/mnt/[a-z]')):
    bad.append('windows-drives')
try:
    if open('/proc/sys/fs/binfmt_misc/WSLInterop').read().startswith('enabled'):
        bad.append('windows-interop')
except OSError:
    pass
try:
    os.listdir('/run/WSL')
    bad.append('interop-socket')
except OSError:
    pass
if shutil.which('cmd.exe') or shutil.which('powershell.exe'):
    bad.append('windows-path')
if getpass.getuser() != 'runner' or os.getuid() == 0:
    bad.append('not-unprivileged')
result = {'sum': 6 * 7, 'bad': bad}
`;
