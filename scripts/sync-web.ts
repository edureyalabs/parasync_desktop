// scripts/sync-web.ts
// Copies the web app's own screens into this app, so the desktop shows the same UI as the web instead of an imitation.
//
//   node scripts/sync-web.ts ../parasync_frontmain
//
// It starts from every page and layout under app/(shell)/ in the web repo and follows their imports, copying only the files
// they actually need (components, lib helpers, icons) into src/renderer/src/web/. Files are copied as they are: the few places the
// web code leans on Next.js (links, routing, images, the Supabase client, /api calls) are answered by the small adapters in
// src/renderer/src/shims/, never by editing the copies. Re-run it whenever the web UI changes, then review the diff.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const webDir = resolve(process.argv[2] ?? '');
const outDir = resolve(import.meta.dirname, '../src/renderer/src/web');

if (!process.argv[2] || !existsSync(join(webDir, 'app', '(shell)'))) {
  console.error('Usage: node scripts/sync-web.ts <path to the parasync_frontmain checkout>');
  process.exit(1);
}

// Answered by an adapter in this app instead of being copied (see vite alias / tsconfig paths).
const REPLACED = new Set(['lib/supabase/client.ts']);
// Never part of the desktop UI even if something imports it.
const FORBIDDEN_IMPORTS = ['next/headers', 'server-only', '@supabase/ssr'];

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(webDir, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null; // a package: installed normally
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const entries = walk(join(webDir, 'app', '(shell)')).filter((f) => /\.(ts|tsx)$/.test(f));
const seen = new Set<string>();
const queue = [...entries];
const warnings: string[] = [];

while (queue.length > 0) {
  const file = queue.pop()!;
  if (seen.has(file)) continue;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const spec = match[1]!;
    if (FORBIDDEN_IMPORTS.some((f) => spec === f || spec.startsWith(`${f}/`))) warnings.push(`${relative(webDir, file)} imports ${spec}`);
    const target = resolveImport(file, spec);
    if (target && /\.(ts|tsx)$/.test(target) && !REPLACED.has(relative(webDir, target).split(sep).join('/'))) queue.push(target);
  }
}

rmSync(outDir, { recursive: true, force: true });
for (const file of [...seen].sort()) {
  const rel = relative(webDir, file);
  const dest = join(outDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(file, dest);
}

// Images the screens refer to by address.
const publicOut = join(outDir, 'public');
mkdirSync(join(publicOut, 'icons'), { recursive: true });
cpSync(join(webDir, 'public', 'logo.png'), join(publicOut, 'logo.png'));
for (const f of readdirSync(join(webDir, 'public', 'icons'))) cpSync(join(webDir, 'public', 'icons', f), join(publicOut, 'icons', f));

// The desktop swaps the web's payment pop-ups for "continue on the web" ones (src/renderer/src/shims/subscribeAgentModal.tsx), and that
// copy carries the web's monthly price table. Warn if the web has changed it.
try {
  const web = readFileSync(join(outDir, 'app', '(shell)', 'account', 'organizations', 'SubscribeAgentModal.tsx'), 'utf8').match(/MONTHLY_RATE_USD[^=]*=\s*(\{[^}]*\})/)?.[1]?.replace(/\s+/g, '');
  const shim = readFileSync(resolve(import.meta.dirname, '../src/renderer/src/shims/subscribeAgentModal.tsx'), 'utf8').match(/MONTHLY_RATE_USD[^=]*=\s*(\{[^}]*\})/)?.[1]?.replace(/\s+/g, '');
  if (web !== shim) warnings.push(`MONTHLY_RATE_USD differs: web ${web}, desktop shim ${shim}. Update src/renderer/src/shims/subscribeAgentModal.tsx`);
} catch { /* the files moved: the typecheck will say so */ }

let sha = 'unknown';
try { sha = execFileSync('git', ['-C', webDir, 'rev-parse', 'HEAD']).toString().trim(); } catch { /* not a git checkout */ }
writeFileSync(join(outDir, 'SYNCED_FROM.json'), `${JSON.stringify({ repo: 'parasync_frontmain', commit: sha, files: seen.size }, null, 2)}\n`);

console.log(`Copied ${seen.size} files from ${webDir} (${sha.slice(0, 7)}) into ${relative(process.cwd(), outDir)}.`);
if (warnings.length > 0) {
  console.warn('\nThese copied files import something the desktop app cannot use. Check them:');
  for (const w of warnings) console.warn(`  ${w}`);
}
