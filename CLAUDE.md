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
- Do not restyle web screens here; they must stay identical to the web. Fonts (Newsreader, Inter, IBM Plex Mono) are bundled.
- Use `async/await`, no `.then()` chains for new code.
- Run `npm run typecheck` and `npm run build` before saying a task is done.
- Ask before adding a dependency.

## The web screens
`src/renderer/src/web/` is a copy of the web repo's `(shell)` screens and what they import, made by `npm run sync-web -- <path to
parasync_frontmain>`. **Never edit it by hand**; the next sync overwrites it. Differences from the web go in `src/renderer/src/shims/`
(adapters for Next.js links/routing/images, the Supabase client, `/api` calls, payments, the code editor). Desktop-only code imports as
`~/...`; the web copy imports as `@/...`. After a sync run `npm run typecheck` (it checks the copy too) and `npm run build`.

## Data
Screens read and write Supabase under row-level security, through the single client in `src/renderer/src/lib/supabase.ts`. Things that
need the web's server go through `fetch('/api/...')`, which `shims/apiBridge.ts` sends via the main process (`src/main/webApi.ts`) with the
person's token as `Authorization: Bearer`. Do not add direct calls to bemain from the app. Never request secret values, tokens or
credential columns.

## Releasing
`npm run release:patch` (or `release:minor`) then `git push origin main --follow-tags`. See README.

## Local execution (src/main/runner/)
Runs agents' tool code in the app's own WSL2 distro (`ParasyncRunner`, built in the parasync_localrunner repo). Rules: the main process
never gets service keys (only the person's own token, in memory, RLS-limited); every download is host-allowlisted and sha256-checked before
`wsl --import`; the executor (`executor.ts`) imports nothing from Electron so it can be tested alone (`npm test`); a device is `ready` only
while its self-test passes; never loosen who may claim a job (the database function checks the owner). Design and status: docs/HANDOFF.md.
**Read `docs/LOCAL_EXECUTION.md` first** for anything in this area: it is the single self-contained description of the whole system (all four repos, the
mailbox tables, routing rules, trust rules, timings, release steps, debugging cookbook) and has a state log at the bottom — append to it when you change things.

**Secrets kept on the PC** (vault, local broker, PC-only secrets): `docs/LOCAL_SECRETS.md` — read it before touching `src/main/vault/`, `src/main/runner/localSecrets.ts`, `LocalSecretsCard.tsx` or `lib/localCopy.ts`. The page may add and remove copies but must never be able to read one back; keep it that way. The controls live in `shims/localCopy.tsx` (the answer to the web's `components/local-copy/LocalCopy.tsx` slots), not in the About page.

**Four repos ship together** (frontmain, bemain, desktop, localrunner): a change to any shared contract needs the matching change in the others, released in order migration -> bemain/frontmain -> localrunner -> desktop, and old/new must degrade to the cloud. Rules: `parasync_desktop/docs/LOCAL_EXECUTION.md` section 0.
