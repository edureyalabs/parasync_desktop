<!-- docs/HANDOFF.md -->
# Parasync project handoff (read this first after any context loss)

Last updated: 2026-10-24, at desktop v0.3.0. Written so a fresh session can carry on without the earlier conversation.
Keep it current: edit the "State" and "Next" sections whenever something ships.

## 0. The person and how to work with them
- The user owns Parasync (edureyalabs on GitHub). Non-expert in code: **explain in simple English**, short, say what they must do, warn about challenges.
- **Never ask for secrets in chat.** They handle all secrets locally. Public Supabase URL and publishable key are fine (they ship in clients).
- File path as a comment on line 1 of every file. TypeScript only. Production-grade, no MVP-quality shortcuts. **Ask before adding a dependency.**
- Do not build UI when only asked a question. Run typecheck/lint/build (and tests) before saying done. Push to `main` (all repos below).
- Commit message footer: `Co-Authored-By: Claude <noreply@anthropic.com>` and the `Claude-Session:` line. Never put a model name in commits.
- **Sandbox limits**: cannot push git tags (the proxy drops it); cannot reach parasync.in or Vercel; cannot delete GitHub releases (denied); `pkill -f <pattern>` kills your own shell (kill by PID/port instead);
  Windows behaviour (installer, DPAPI, protocol links, WSL2) cannot be run here: say so and let the user test it.
- Releases: the user runs **GitHub Actions → Release → Run workflow** on `main` (the workflow creates the `vX.Y.Z` tag and the release once, then electron-builder uploads). Bump the version first (`npm version minor --no-git-tag-version`).

## 1. Repos (all under github.com/edureyalabs, all push to `main`)
| Repo | What | Local path in the sandbox |
|---|---|---|
| `parasync_frontmain` | Next.js 16 web app (Vercel). Marketing site + signed-in app. CLAUDE.md there is the big architecture doc. | `/home/user/parasync_frontmain` |
| `parasync_bemain` | Python/FastAPI agent backend (Fly/Railway/Render; live address in Supabase `app_settings.runner_url`). `sandbox.md`, `microvm-migration.md`, `tools.md`, `pending.md` are its docs. | `/home/user/parasync_bemain` |
| `parasync_sandbox` | The MicroVM harness image (`microvm/`: `microvm_app.py`, `runner.py`, Dockerfile) bemain calls for tool code. | `/home/user/parasync_sandbox` |
| `parasync_wa` | WhatsApp gateway (Node/Baileys on Fly). | `/home/user/parasync_wa` |
| `parasync_mobile` | Expo phone app. Real app is on branch `claude/pensive-volta-d4ka4r` (main is the template). | worktree `/home/user/mobile_real` (may be gone) |
| `parasync_desktop` | **Electron Windows app** (public repo; installers are GitHub Releases). | `/home/user/parasync_desktop` |
| `parasync_localrunner` | **Private. The sealed Linux environment + runner that executes tool code on a PC** (this phase). | `/home/user/parasync_localrunner` (add with add_repo + clone) |
Supabase project (the live one): **ParasyncAgents, id `eyufwzhxxfebncwaxgci`**, URL `https://eyufwzhxxfebncwaxgci.supabase.co`. (The other project `oqlhrjqujsgqipyftnei` is old.) The Supabase MCP tools work from the sandbox (read SQL fine; ask before schema changes).
Website: `https://parasync.in` (also www). Site pages built this project: `/`, `/platform`, `/solutions`, `/security`, `/contact`, `/download`, `/auth/desktop`.

## 2. State (what exists and works)
### Web (frontmain)
- Marketing site rebuilt (kit in `components/site/`, copy rule: every claim is true today, no customers/certifications invented).
- `/download` page links `https://github.com/edureyalabs/parasync_desktop/releases/latest/download/Parasync-Setup.exe`.
- `lib/supabase/server.ts` `createSupabaseRequestClient` also accepts `Authorization: Bearer <access token>` (desktop). Tested with a fake Supabase (cookie path unchanged, bearer wins over cookie, bad token = 401, RLS queries carry the token).
- `/auth/desktop`: hands Google's one-time code to `parasync://auth/callback` (forwards only `code`/`error`/`error_description`).
- Supabase Redirect URLs already include `parasync://auth/callback`, `https://parasync.in/auth/desktop`, `https://www.parasync.in/auth/desktop` (user added).
### Desktop (this repo), version 0.3.0
- **The signed-in UI is the web's own code.** `src/renderer/src/web/` is a verbatim copy (about 180 files) of frontmain `app/(shell)` + everything it imports, made by `npm run sync-web -- ../parasync_frontmain` (`scripts/sync-web.ts`). **Never edit `web/`**; adapters in `src/renderer/src/shims/` answer the Next.js bits (see README "How the screens are made"). Desktop-only code imports as `~/...`, web copy as `@/...`.
- Routing: `router/routes.ts` builds screens from the web's folder layout (`import.meta.glob`), `router/AppRouter.tsx` nests the web layouts. Desktop-only route `/desktop` = About page. `VersionTag` (left strip foot) opens it.
- Main process: `src/main/index.ts` (window, `app://renderer` protocol, single instance, `parasync://` deep link, IPC with caller check, will-download shows file in folder), `secureStore.ts` (Windows DPAPI via safeStorage for the Supabase session), `updater.ts` (electron-updater from GitHub Releases), `webApi.ts` (calls the web `/api/*` as the person with Bearer token: JSON, multipart upload, downloads follow the temporary storage link, `openApiRedirect` opens provider sign-in in the browser).
- Auth: email+password and Google (`APP_CONFIG.googleReturn = 'web-bridge'`, falls back to deep link if switched back). Config in `src/shared/config.ts` (public values only).
- Payments are web-only (`shims/webOnlyModal.tsx`). Tool Builder code editor is a plain textarea placeholder (`shims/codemirror.tsx`) until the user approves `@uiw/react-codemirror` + `@codemirror/lang-python`.
- Windows reply notifications (`components/ReplyNotifier.tsx`), update toast.
- Security posture: sandboxed renderer, context isolation, strict CSP (fonts bundled; the web's Google Fonts `@import` is blocked on purpose and logs a harmless console error), navigation locked, permissions denied except notifications.
- Release pipeline: `.github/workflows/ci.yml` (typecheck+build on push), `release.yml` (see section 0). Installer is **unsigned** (SmartScreen warns; user must buy a signing option before customers).
- Released so far: 0.1.0, 0.2.0 (a duplicate release object with only the blockmap exists; optional manual cleanup), 0.2.1; **0.3.0 was pushed to `main`; the user still has to run the Release workflow for it.**
### Testing the screens (no real data needed)
`scripts/ui-test/sweep.ts` and `transfers.ts` drive the built app with Playwright + xvfb against a fake Supabase and fake web API (`npm run build` first; `NODE_PATH=$(npm root -g) xvfb-run -a -s "-screen 0 1440x900x24" node --no-warnings scripts/ui-test/sweep.ts`). A screen crashing there is usually thin fake data (the web expects full rows), not an app bug.

## 3. Findings that shape the work
- **Compute ledger (Oct 10-24, test accounts only):** 100% of recorded sandbox usage was background work (task planning, task runs, shifts, scheduled tasks); **no live-chat source appeared**. About 75% of VM-seconds were browser sessions (avg session 305 s, session time about 2x exec time). So desktop execution only saves money if it also serves background work while the PC is on; cloud-side trimming (browser idle timeouts, fewer planner browser sessions) is a separate lever. Real customer usage will differ.
- bemain `tools_executor._dispatch_sandbox` is the single funnel for tool code (MicroVM only; `compute_billing.gate` before, `record_launch` after). Payload in, JSON out. `custom_tool_runner.run_tool(trust="admin"|"model")`: admin tools get RAW secrets as env vars (must never go to a PC); model-authored code uses the secretless broker (`broker.py`, opaque token + `BEMAIN_PUBLIC_URL`), safe for a PC.
- The sandbox harness (`parasync_sandbox/runner.py`) uses Linux `resource` limits and paths: run the SAME harness in a Linux environment locally, do not port to native Windows Python (behaviour must match the cloud).
- The web workspace download route returns `{ok,url}` (a temporary link), not the file.

## 4. NEXT: local tool execution (phase 3). Design already agreed with the user
Goal: when the person's desktop app is online and ready, run an agent's tool code on their PC instead of a MicroVM; otherwise (never claimed) use the cloud as today. **No new cloud server is needed**: Supabase is the mailbox.
1. **Local Linux box**: a dedicated WSL2 distro (`ParasyncRunner`, imported from a rootfs built from the sandbox harness image; automount/interop/Windows PATH disabled so it cannot see C:\\). Built in `parasync_localrunner` (Dockerfile, CI that exports the rootfs, harness, tests). Desktop (Electron main) manages it: detect WSL2/virtualization, import, run each job as its own process (see 4a, replaces the earlier HTTP-server idea), health check, **canary run** every few minutes; device is "ready" only while the canary passes.
2. **Supabase tables** (new, additive): `desktop_devices` (device id, user, name, ready, last_seen, capabilities, version), `desktop_jobs` (id, user, device, agent, status queued→claimed→running→done/failed/cancelled, payload ref, result ref, lease times). Small JSON in rows; files via a short-lived Storage bucket; TTL cleanup by pg_cron. RLS: a person sees/updates only their own rows; claim via an atomic RPC (compare-and-set) so a late claim after cloud take-over is impossible.
3. **bemain routing branch** in `_dispatch_sandbox` (behind a feature flag, default OFF): only for the chatting person's own ready device, only broker-mode calls (never raw-secret tool payloads), only if the agent owner enabled local execution and the person enabled it on that device. Wait up to a few seconds for a claim; **if never claimed -> cloud. If claimed then lost mid-run -> do NOT re-run in the cloud** (side effects may have happened): return a clear failure. Local runs are not metered against allowance/wallet (decision: exempt).
4. **Desktop executor** (Electron main): register/heartbeat device, subscribe to jobs (Realtime + polling fallback), claim, run in the local box, upload result. UI: a "Local execution" section in the desktop-only About/Settings page (toggle, status, canary result, WSL setup help).
5. **Later phases** (user's vision): browser sessions locally (session affinity to one device, isolated Chromium profile), scheduled work on the PC, then local bemain behind a small cloud control plane that holds all keys (LLM proxy + metering, secrets broker, leases so cloud and desktop never both run the same cron: trading tools make double-fire a real-money risk). Never ship service-role keys or the Fernet key to a PC.
6. **Open decisions to confirm with the user**: WSL2 required for pilots?; who may enable (owner only vs any org member); exempt local runs from compute billing (assumed yes); scheduled/background work on the PC (assumed phase 2).
Needs from the user: output of `wsl --status` on their laptop; approval to apply the SQL migration to Supabase (prepared as a file, not yet applied).

### 4a. Status and refinements (updated 2026-10-24)
- **`parasync_localrunner` is built and pushed** (main): `runner/runner.py` (verbatim cloud harness, commit in `runner/SYNCED_FROM.json`), `runner/run_job.py`, `image/` (Dockerfile on python:3.9-slim-bookworm to match the cloud's 3.9, baseline libraries, `wsl.conf` sealed-room settings, non-root `runner` user), `scripts/build_rootfs.sh` (rootfs tar.gz + `manifest.json` with sha256), CI (tests, build, tests again inside the image, upload artifact; `v*` tag publishes a release). 20 tests pass locally; 15 library tests skip here and run in CI. **Docker is not available in the sandbox, so the image build is first proven by CI.**
- **Per-job process, not an HTTP server**: desktop runs `wsl.exe -d ParasyncRunner -- timeout --signal=KILL <N> python3 /opt/runner/run_job.py`, sends the job JSON on stdin, reads one `__PARASYNC_JOB_RESULT__{json}` line from stdout (anything else on stdout is ignored, forgery-safe). Nothing listens on a port; a hung job is killed by `timeout`.
- **Rootfs hosting**: public release of `parasync_localrunner` (private-repo assets are not downloadable by the app); desktop checks the sha256 from the manifest before `wsl --import`.
- **Done 2026-10-24 (pushed)**: (a) migration file `parasync_frontmain/supabase/migrations/20261026000000_desktop_local_execution.sql` (devices, jobs, RLS, claim/finish/touch/cancel functions, hourly cleanup, Realtime, flag `app_settings.local_execution_enabled='false'`), **NOT applied yet: needs the user's OK**; (b) bemain `desktop_dispatch.py` + hook at the top of `tools_executor._call_sandbox` (flag off by default, broker-mode allowlist only, never-claimed -> cancel and cloud, claimed-then-lost -> `local_execution_lost`, unmetered), 9 tests, full suite 973 pass. Not yet: a per-agent owner switch (only the global flag + the person's device switch exist).
- **Done 2026-10-24 (c, desktop executor, v0.4.0)**: `src/main/runner/{wsl,install,cloud,executor,index}.ts`, `src/shared/runner.ts`, IPC `runner:*`, `hooks/useRunner.ts`, `components/LocalExecutionCard.tsx` (on the About page), the page pushes `{userId, access token}` to main on every session change (token kept in memory only). Flow: person turns it on -> WSL2 check -> "Install the Linux box" (downloads the public parasync_localrunner release, verifies sha256, `wsl --import`) -> canary (`6*7`) -> device `ready` -> poll `desktop_jobs` every 1.5s -> `claim_desktop_job` -> `wsl.exe ... run_job.py` -> `finish_desktop_job`. Heartbeat every 30s (bemain treats a device as fresh for 90s). Tests: `npm test` (executor, 10 cases) and `scripts/tests/wsl.test.ts` (needs `PARASYNC_LOCALRUNNER=<checkout>`; bundle with rolldown like npm test does) which ran a real job, an error and a timeout through a stand-in wsl.exe.
- **Status 2026-10-25**: localrunner release v0.1.0 is published with manifest + rootfs (public URL verified by the user). Migration `20261026000000_desktop_local_execution` is APPLIED to Supabase (applied in 4 pieces via execute_sql, plus `cron.schedule` job id 78; verified tables 2, functions 5, policies 5, cron 1, realtime 1, flag 'false'; security advisor shows nothing new except the expected claim/finish/touch being callable by signed-in users, they check auth.uid()). Remaining: release desktop 0.4.0, set the flag to true, test on one Windows PC.
- **Order to switch it on** (steps 1 and 2 done): (1) localrunner CI green and a `v0.1.0` tag pushed so the public release + manifest exist (user pushes the tag; sandbox cannot); (2) user approves, then apply the migration; (3) release desktop 0.4.0; (4) set `app_settings.local_execution_enabled='true'`; (5) on one Windows PC: turn on, install, check status reaches Ready, then chat with an agent that runs code and look for a `done` row in `desktop_jobs`.
- **Unproven until a real Windows PC runs it**: wsl.exe flags (`-d`, `-u`, `--import ... --version 2`), UTF-16 output decoding, the Docker image build, the DPAPI-stored settings.
- **Not built**: runner updates (new rootfs version -> reimport), per-agent owner switch, large files via Storage, local browser sessions, scheduled work.
- **Old to-do list below is superseded by the lines above** (kept for context): (a) Supabase migration file (`desktop_devices`, `desktop_jobs`, RLS, claim RPC, cleanup, Storage bucket), prepared and shown to the user BEFORE applying; (b) bemain `desktop_dispatch` + routing branch in `tools_executor._dispatch_sandbox` behind a default-OFF flag; (c) desktop executor in Electron main + "Local execution" UI on the About page.

## 5. Other pending items
- User to run Release workflow for 0.3.0 and test the update path (0.2.1 -> 0.3.0), Google bridge sign-in, chat, settings tabs on Windows.
- Code signing for the installer (Azure Trusted Signing / OV / EV certificate): user decision/purchase.
- Tool Builder editor packages approval.
- Optional: delete the stray 0.2.0 release (only has the .blockmap).
- Possible future: shared UI package instead of copying; macOS build; remaining editors work in the web copy automatically after each `sync-web`.
