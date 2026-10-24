// src/main/runner/install.ts
// Downloads the Linux environment from the public parasync_localrunner release, checks its SHA-256 against the manifest published
// with it, and hands the verified archive to wsl --import. A file that does not match is deleted and never imported.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { RUNNER_CONFIG } from '../../shared/runner';

const HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
const FILE_NAME = /^parasync-runner-rootfs-[0-9A-Za-z.\-]+\.tar\.gz$/;

export interface Manifest {
  version: string;
  file: string;
  sha256: string;
  bytes: number;
}

export function parseManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest> | null;
  if (!m || typeof m.version !== 'string' || typeof m.file !== 'string' || typeof m.sha256 !== 'string' || typeof m.bytes !== 'number') {
    throw new Error('The runner manifest is malformed.');
  }
  if (!FILE_NAME.test(m.file)) throw new Error('The runner manifest names an unexpected file.');
  if (!/^[0-9a-f]{64}$/.test(m.sha256)) throw new Error('The runner manifest has a bad checksum.');
  if (m.bytes <= 0 || m.bytes > 4 * 1024 ** 3) throw new Error('The runner manifest has a bad size.');
  return { version: m.version, file: m.file, sha256: m.sha256, bytes: m.bytes };
}

function allowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

async function get(url: string, signal: AbortSignal): Promise<Response> {
  if (!allowed(url)) throw new Error('blocked download address');
  // Releases redirect to a storage host; follow by hand so every hop is checked against the allowed hosts.
  let current = url;
  for (let hops = 0; hops < 5; hops++) {
    const res = await fetch(current, { redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new Error('bad redirect');
      current = new URL(next, current).toString();
      if (!allowed(current)) throw new Error('blocked download address');
      continue;
    }
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return res;
  }
  throw new Error('too many redirects');
}

export async function fetchManifest(signal: AbortSignal): Promise<Manifest> {
  const res = await get(RUNNER_CONFIG.manifestUrl, signal);
  return parseManifest(await res.json());
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Downloads and verifies the archive into `dir`; returns its path. */
export async function downloadRootfs(dir: string, manifest: Manifest, onPercent: (p: number) => void, signal: AbortSignal): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const target = join(dir, manifest.file);
  const part = `${target}.part`;
  const res = await get(`${RUNNER_CONFIG.releaseBase}${manifest.file}`, signal);
  if (!res.body) throw new Error('empty download');
  let received = 0;
  const source = Readable.fromWeb(res.body as never);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onPercent(Math.min(99, Math.floor((received / manifest.bytes) * 100)));
  });
  await pipeline(source, createWriteStream(part), { signal });
  const actual = await sha256OfFile(part);
  if (actual !== manifest.sha256) {
    await fs.rm(part, { force: true });
    throw new Error('The downloaded Linux environment did not match its checksum, so it was discarded.');
  }
  await fs.rename(part, target);
  return target;
}
