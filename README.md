<!-- README.md -->
# Parasync for Windows

The Parasync desktop app. Phase 1 is a chat client: sign in, talk to your agents, see their notifications, discover
public agents, accept invitations and check your account. It talks only to Supabase (row-level security protects
the data), the same way the web app and the phone app do. The agent backend (bemain) is unchanged and still runs in
the cloud.

Later phases move parts of the runtime onto the PC (tool execution first). See "Roadmap".

## How the screens are made

The desktop app **runs the web app's own screens**. It does not imitate them. `src/renderer/src/web/` holds a copy of the web
repo's `app/(shell)` pages and layouts plus every component, helper and icon they import (about 180 files), copied as they are.
Because they are the same code, they look and behave like the web, and a screen the web adds shows up here after a sync.

Next.js itself is not used. The few places the web code leans on it are answered by small adapters in `src/renderer/src/shims/`:

| The web code uses | The desktop does |
|---|---|
| `next/link`, `next/navigation` (`useRouter`, `usePathname`, `useParams`, `redirect`) | `shims/nextLink.tsx`, `shims/nextNavigation.tsx`, and `router/` which builds the screens from the same folder layout (`routes.ts`) and nests the web's layouts |
| `next/image` | `shims/nextImage.tsx` (a plain image) |
| the web's Supabase client | `shims/supabaseClient.ts` (the app's one client) |
| `fetch('/api/...')` with a browser cookie | `shims/apiBridge.ts` sends it through the main process (`src/main/webApi.ts`) to the real site with the person's login token, including file uploads |
| a page navigation to an `/api/...` sign-in address | the main process asks that address and opens the provider's page in the browser |
| card payment pop-ups | `shims/webOnlyModal.tsx`: "Continue on the web" (payments are made on the web only) |
| the Tool Builder's code editor package | `shims/codemirror.tsx`: a plain text box for now (see Known gaps) |

Desktop-only code (sign-in, the About page, update notice, reply notifications) lives outside `web/` and imports as `~/...`;
the web copy imports as `@/...`.

### Keeping up with the web
When the web's screens change, bring the changes over:

```bash
npm run sync-web -- ../parasync_frontmain   # path to your frontmain checkout; copies only what the screens need
npm run typecheck                           # also checks the copied files; a web change that needs an adapter shows up here
npm run build
git diff --stat                             # review what changed, then commit and release
```

Never edit files under `src/renderer/src/web/`: the next sync overwrites them. If something needs to differ on desktop, change an
adapter in `shims/` (or tell the web repo to change).

## What is in this version

Everything the web app's signed-in area has: My Agents and chat (attachments, uploads, notifications feed), the agent settings tabs
(Runsheet, Platform Tools, Emails, WhatsApp, Tool Builder, Instructions, Secrets, Database Integrations, MCP, Browser Access, Add
Users, Workspace, Agent Profile), Account (Organizations, Billing, Usage, Profile), Marketplace and Requests. Plus, desktop only:
Windows notifications for replies, automatic updates, and an About page (click the version at the foot of the left strip).

### Known gaps
- **Payments are on the web.** Adding funds and paying for a plan open the web app.
- **Tool Builder code editor** is a plain text box until the editor package (`@uiw/react-codemirror`, `@codemirror/lang-python`) is added to this app.
- **Signing in to an MCP server** finishes in your browser; come back to the app and refresh the list.
- Local tool execution and local bemain are not built yet (see Roadmap).

## Develop

```bash
npm install          # also downloads the Electron binary
npm run dev          # opens the app with hot reload
npm run typecheck    # must pass before every commit
npm run build        # builds main, preload and renderer into ./out
npm run dist         # builds an installer into ./dist (run on Windows)
```

Needs Node 22 or newer. There is no `.env`: every setting the app needs is public and lives in
`src/shared/config.ts` (Supabase URL and publishable key, web URL). Never put a service-role key, a Fernet key or
any provider key in this app.

### One-time Supabase setting for Google sign-in
Google sign-in returns to the app through a `parasync://auth/callback` link. In the Supabase dashboard, open
Authentication → URL Configuration and add `parasync://auth/callback` to **Redirect URLs**. Until it is added,
email and password sign-in works and Google sign-in lands on the website instead of returning to the app.

## How it is built

```
src/main/        Electron main process: window, secure session store, auto-update, deep link, IPC
src/preload/     the only bridge between the page and the PC (a short, fixed list of functions)
src/shared/      config and the IPC contract, used by both sides
src/renderer/    the app UI (React): views/, components/, hooks/, lib/
```

Security choices, so they are not undone by accident:

- The page runs with context isolation and the Chromium sandbox on, with no Node access. It reaches the PC only
  through `src/preload/index.ts`, and the main process re-checks every call comes from our own page.
- The Supabase session is encrypted with Windows DPAPI (`safeStorage`) before it is written to disk. If Windows
  encryption is unavailable the session stays in memory only.
- A strict Content-Security-Policy is built into the app: scripts only from the app itself, network only to Supabase.
- Agent replies are untrusted. Markdown is rendered without raw HTML and without remote images; links open in the
  default browser and only for http(s) and mailto.
- Anything navigating away from the app, or opening a new window, is sent to the browser instead.
- No camera, microphone, location or other device permission is ever granted.
- The web API (`/api/...`) is called from the main process, never the page, with the person's own login token in an
  `Authorization: Bearer` header (`src/main/webApi.ts`). Only our own site, only `/api/` paths, with time and size limits. The web
  side accepts that token in `createSupabaseRequestClient`.
- The built app is served from its own `app://renderer` address; navigation anywhere else is blocked or sent to the browser.

## Release and upgrade (how a new version reaches everyone)

Each release is a version tag. GitHub Actions builds the Windows installer, publishes it as a Release, and every
installed copy downloads it in the background and offers "Restart to update".

```bash
# 1. make your changes, then check them
npm run typecheck && npm run build

# 2. commit, then bump the version (this edits package.json and creates the tag, e.g. v0.1.1)
git add -A && git commit -m "Describe the change"
npm run release:patch        # bug fixes.   Use release:minor for new features

# 3. push the commit and the tag; the Release workflow does the rest (about 5 minutes)
git push origin main --follow-tags
```

Then check the Actions tab: the "Release" run turns green and the new version appears under Releases with
`Parasync-Setup.exe`. The workflow refuses to build if the tag and `package.json` version differ.

**Download link for the website:**
`https://github.com/edureyalabs/parasync_desktop/releases/latest/download/Parasync-Setup.exe`

First install: run `Parasync-Setup.exe`. It installs for the current Windows user, with no administrator rights.

### Known limits of the first builds
- **Not code-signed.** Windows SmartScreen shows "Windows protected your PC" on first install; click More info →
  Run anyway. Buy or set up a signing certificate (Azure Trusted Signing or an EV certificate) before customers install.
- Windows 10/11 64-bit only.

## Roadmap

1. This chat client, installable and self-updating.
2. A desktop executor: run an agent's tool calls on this PC, with the cloud as fallback.
3. Local agent runtime per agent, behind a small cloud control plane that holds the keys (LLM, secrets, billing).
