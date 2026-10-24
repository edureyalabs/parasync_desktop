<!-- CLAUDE.md -->
# Parasync Desktop — project instructions

Electron + React + TypeScript app for Windows. Read README.md first (structure, security choices, release steps).

## Rules
- File path as a comment on the first line of every file (`// path`, `<!-- path -->`, `# path`). JSON files cannot carry it.
- TypeScript only. No `.js` source files.
- Never put secrets in this repo or the app: only the public Supabase URL and publishable key. Privileged work belongs
  in the cloud control plane, never in the installer.
- The renderer never gets Node. New capabilities go through `src/shared/ipc.ts` (contract), `src/preload/index.ts`
  (bridge) and `src/main/index.ts` (handler with `handle()`, which verifies the caller). Validate every argument in main.
- Agent output is untrusted text: render it through `components/Markdown.tsx`, never as HTML.
- Match the web app: "Stone & Brass" tokens in `src/renderer/src/lib/theme.ts`, fonts Newsreader / Inter / IBM Plex Mono.
- Use `async/await`, no `.then()` chains for new code.
- Run `npm run typecheck` and `npm run build` before saying a task is done.
- Ask before adding a dependency.

## Data
All data goes through the Supabase client in `src/renderer/src/lib/supabase.ts` under row-level security, mirroring
the web app (`parasync_frontmain`) and phone app (`parasync_mobile`). Table and RPC names must match those apps.
Do not add direct calls to bemain from the app. Things that need the web's server (file downloads, the connected-users list,
catalogs) go through `window.parasync.api` / `download` (`src/renderer/src/lib/api.ts` → `src/main/webApi.ts`), which sends the
person's token as `Authorization: Bearer` to our own `/api/` routes. Never select secret values, tokens or credential columns:
list names and flags only (see the comments in `views/agent/SecretsTab.tsx`, `McpTab.tsx`, `SignedApisTab.tsx`).
Agent settings screens are read-only until their editing is built; each ends with a `WebNote` pointing at the web page.

## Releasing
`npm run release:patch` (or `release:minor`) then `git push origin main --follow-tags`. See README.
