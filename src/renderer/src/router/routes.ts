// src/renderer/src/router/routes.ts
// Builds the app's screens from the web app's own folder layout, the way Next.js does: every page.tsx is a screen, every
// layout.tsx wraps the screens below it, [name] folders are parameters and (group) folders add nothing to the address.
// Nothing here lists screens by hand, so a screen added to the web and synced over appears by itself.
import type { ComponentType } from 'react';

type Mod = { default: ComponentType<Record<string, unknown>> };

// Parentheses in the folder name "(shell)" are special in glob patterns, so match everything and filter below.
const modules = import.meta.glob<Mod>('../web/app/**/{page,layout}.tsx', { eager: true });

interface Entry {
  segments: string[];
  Component: ComponentType<Record<string, unknown>>;
}

const pages: Entry[] = [];
const layouts: Entry[] = [];

for (const [key, mod] of Object.entries(modules)) {
  const rel = key.replace('../web/app/', '');
  if (!rel.startsWith('(shell)/')) continue; // the desktop app has its own sign-in; marketing pages are not part of it
  const parts = rel.split('/');
  const file = parts.pop()!;
  const segments = parts.filter((p) => !/^\(.*\)$/.test(p));
  (file === 'page.tsx' ? pages : layouts).push({ segments, Component: mod.default });
}

export interface Match {
  Page: ComponentType<Record<string, unknown>>;
  layouts: ComponentType<Record<string, unknown>>[];
  params: Record<string, string>;
}

const isDynamic = (s: string) => /^\[[^\]]+\]$/.test(s);

export function matchRoute(pathname: string): Match | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  let best: { entry: Entry; params: Record<string, string>; statics: number } | null = null;

  for (const entry of pages) {
    if (entry.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let statics = 0;
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = entry.segments[i]!;
      if (isDynamic(seg)) params[seg.slice(1, -1)] = parts[i]!;
      else if (seg === parts[i]) statics++;
      else { ok = false; break; }
    }
    if (ok && (!best || statics > best.statics)) best = { entry, params, statics };
  }
  if (!best) return null;

  const chain = layouts
    .filter((l) => l.segments.length <= best!.entry.segments.length && l.segments.every((s, i) => s === best!.entry.segments[i]))
    .sort((a, b) => a.segments.length - b.segments.length)
    .map((l) => l.Component);

  return { Page: best.entry.Component, layouts: chain, params: best.params };
}
