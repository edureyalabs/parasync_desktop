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
  canaryEveryMs: 5 * 60_000,
} as const;

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
}
