// src/main/runner/wsl.ts
// Everything that touches wsl.exe. The Linux box is a dedicated WSL2 distribution owned by this app; each job is its own short-lived
// process inside it (JSON in on standard input, one marked line out). Nothing listens on a port.
import { spawn } from 'node:child_process';

import { RUNNER_CONFIG } from '../../shared/runner';
import type { HostProcess } from './browserHost';

const MARKER = '__PARASYNC_JOB_RESULT__';
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024; // the result carries output files as base64; the cloud caps them at 25 MB

// Only an unpackaged (development/test) run may swap in a different program, so tests can use a stand-in on any machine.
export function wslBinary(packaged: boolean): string {
  return !packaged && process.env['PARASYNC_WSL_BIN'] ? process.env['PARASYNC_WSL_BIN'] : 'wsl.exe';
}

/** wsl.exe writes its own messages as UTF-16 LE. Linux programs run through it write plain UTF-8. */
export function decodeWslText(buf: Buffer): string {
  const looksUtf16 = buf.length >= 2 && buf.includes(0);
  return (looksUtf16 ? buf.toString('utf16le') : buf.toString('utf8')).replace(/\u0000/g, '').replace(/^﻿/, '');
}

interface Ran {
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  spawnError?: string;
}

function run(bin: string, args: string[], opts: { input?: string; timeoutMs: number }): Promise<Ran> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, spawnError: e instanceof Error ? e.message : String(e) });
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      size += d.length;
      if (size > MAX_OUTPUT_BYTES) { overflow = true; child.kill('SIGKILL'); return; }
      out.push(d);
    });
    child.stderr.on('data', (d: Buffer) => { if (err.reduce((n, b) => n + b.length, 0) < 1_000_000) err.push(d); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut, spawnError: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: overflow ? null : code, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut, spawnError: overflow ? 'the result was larger than the limit' : undefined });
    });
    child.stdin.on('error', () => { /* the process ended before reading everything: reported through its exit */ });
    child.stdin.end(opts.input ?? '');
  });
}

export async function wslAvailable(packaged: boolean): Promise<boolean> {
  const r = await run(wslBinary(packaged), ['--status'], { timeoutMs: 15_000 });
  return !r.spawnError && r.code === 0;
}

export async function distroInstalled(packaged: boolean): Promise<boolean> {
  const r = await run(wslBinary(packaged), ['--list', '--quiet'], { timeoutMs: 15_000 });
  if (r.spawnError || r.code !== 0) return false;
  return decodeWslText(r.stdout).split(/\r?\n/).some((l) => l.trim() === RUNNER_CONFIG.distro);
}

export async function importDistro(packaged: boolean, installDir: string, archive: string): Promise<void> {
  const r = await run(wslBinary(packaged), ['--import', RUNNER_CONFIG.distro, installDir, archive, '--version', '2'], { timeoutMs: 10 * 60_000 });
  if (r.spawnError || r.code !== 0) {
    throw new Error(`Windows could not set up the Linux box: ${decodeWslText(r.stderr).trim() || decodeWslText(r.stdout).trim() || r.spawnError || 'unknown error'}`);
  }
}

export async function unregisterDistro(packaged: boolean): Promise<void> {
  await run(wslBinary(packaged), ['--unregister', RUNNER_CONFIG.distro], { timeoutMs: 2 * 60_000 });
}

/**
 * How one job is started. wsl.exe leaves Windows' "interop" switched on in this box whatever wsl.conf says (checked on a real PC),
 * which would let code ask Windows to start a program. So each job starts as root for a moment, switches interop off and locks the
 * interop sockets, then drops to the unprivileged user BEFORE any agent code exists. The user cannot switch it back on (needs root).
 * `--exec` passes the script as one argument, so no shell re-parses it. No double quotes in the script: Windows quoting.
 */
export function jobArgs(limit: number): string[] {
  const script = `${LOCK_INTEROP} exec runuser -u runner -- env -u WSL_INTEROP timeout --signal=KILL ${limit} python3 /opt/runner/run_job.py`;
  return ['-d', RUNNER_CONFIG.distro, '-u', 'root', '--exec', 'sh', '-c', script];
}

const LOCK_INTEROP = 'echo -1 > /proc/sys/fs/binfmt_misc/WSLInterop 2>/dev/null; chmod 700 /run/WSL 2>/dev/null;';

/** The same start-up as a job, for a browser host: interop locked as root, then the unprivileged user runs browser_host.py for one session. */
export function browserHostArgs(sessionId: string): string[] {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) throw new Error('invalid session id');
  const script = `${LOCK_INTEROP} exec runuser -u runner -- env -u WSL_INTEROP PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 /opt/runner/browser_host.py ${sessionId}`;
  return ['-d', RUNNER_CONFIG.distro, '-u', 'root', '--exec', 'sh', '-c', script];
}

/** Starts one browser host and hands back its pipes. The process lives until its pipe closes or `kill()`. */
export function spawnBrowserHost(packaged: boolean, sessionId: string): HostProcess {
  const child = spawn(wslBinary(packaged), browserHostArgs(sessionId), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const lineListeners: ((line: string) => void)[] = [];
  const exitListeners: ((code: number | null) => void)[] = [];
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    let at = buffered.indexOf('\n');
    while (at >= 0) {
      const line = buffered.slice(0, at).replace(/\r$/, '');
      buffered = buffered.slice(at + 1);
      for (const cb of lineListeners) cb(line);
      at = buffered.indexOf('\n');
    }
  });
  child.stderr.on('data', () => { /* Chromium and Playwright chatter: not part of the protocol */ });
  child.stdin.on('error', () => { /* the process ended: reported through its exit */ });
  let exited = false;
  const notifyExit = (code: number | null) => {
    if (exited) return;
    exited = true;
    for (const cb of exitListeners) cb(code);
  };
  child.on('error', () => notifyExit(null));
  child.on('close', (code) => notifyExit(code));
  return {
    write: (line) => { child.stdin.write(line); },
    onLine: (cb) => { lineListeners.push(cb); },
    onExit: (cb) => { exitListeners.push(cb); },
    kill: () => { try { child.stdin.end(); } catch { /* closed */ } child.kill('SIGKILL'); },
  };
}

export type JobOutcome = { kind: 'result'; result: Record<string, unknown> } | { kind: 'failed'; message: string };

/** Runs one job. `timeoutSeconds` is the call's own limit; the Linux side enforces it with `timeout`, and a little extra covers start-up. */
export async function runJob(packaged: boolean, job: unknown, timeoutSeconds: number): Promise<JobOutcome> {
  const limit = Math.max(1, Math.min(Math.floor(timeoutSeconds), 900));
  const args = jobArgs(limit);
  const r = await run(wslBinary(packaged), args, { input: JSON.stringify(job), timeoutMs: (limit + 30) * 1000 });
  if (r.timedOut) return { kind: 'failed', message: `The code did not finish within ${limit}s and was stopped.` };
  if (r.spawnError) return { kind: 'failed', message: `The Linux box could not be started: ${r.spawnError}` };
  const text = r.stdout.toString('utf8');
  const line = text.split('\n').reverse().find((l) => l.startsWith(MARKER));
  if (!line) {
    if (r.code === 137) return { kind: 'failed', message: `The code did not finish within ${limit}s and was stopped.` };
    const why = decodeWslText(r.stderr).trim().slice(0, 500);
    return { kind: 'failed', message: `The Linux box gave no answer${why ? `: ${why}` : '.'}` };
  }
  try {
    const parsed: unknown = JSON.parse(line.slice(MARKER.length));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { kind: 'result', result: parsed as Record<string, unknown> };
  } catch { /* falls through */ }
  return { kind: 'failed', message: 'The Linux box gave an unreadable answer.' };
}
