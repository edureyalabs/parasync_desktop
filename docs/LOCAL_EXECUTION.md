<!-- docs/LOCAL_EXECUTION.md -->
# Local execution — the whole system in one document

Read this first in any new session that touches the Windows desktop app, `parasync_localrunner`, `desktop_*` tables, or how bemain routes sandbox work.
Companion files: `docs/HANDOFF.md` (project status + working rules), `parasync_bemain/local-execution.md` (bemain-side detail), `parasync_localrunner/README.md`.
Last updated 2026-10-25.

## 1. What it is, in one paragraph
Agents' tool code (code_executor, Tool Builder tools, agent-built tools, and — when enabled — browser sessions) normally runs in AWS Lambda MicroVMs (the "cloud",
metered per run). If the person who is chatting has the Windows desktop app open, signed in, switched on and **Ready**, bemain sends that code to **their own PC**
instead. It runs in a sealed Linux box (a dedicated WSL2 distro named `ParasyncRunner`). Local runs are **not metered** (their own hardware). If the PC is not
available, the cloud runs it exactly as before. bemain (prompts, memory, keys, billing, LLM calls) always stays in the cloud; the PC is "remote hands" only.

## 2. The four repos and what each owns
| Repo | Owns |
|---|---|
| `parasync_bemain` (Python, Fly/Railway/Render) | The routing decision. `desktop_dispatch.py` (code runs), `desktop_browser.py` (browser sessions), hook at the top of `tools_executor._call_sandbox`. Flags read from `app_settings`. |
| `parasync_desktop` (Electron, TypeScript) | The app. `src/main/runner/*` is the executor: registers the PC, self-tests, claims jobs, runs them via `wsl.exe`, reports back. UI: "Run tools on this PC" card on the About page. |
| `parasync_localrunner` (Python + Docker) | The Linux box: harness copy (`runner/runner.py`, never edit by hand), `run_job.py` (one job per process), `browser_host.py` (one browser session per process), `image/` (Dockerfile, wsl.conf), CI that builds and publishes the root file system (rootfs) as a GitHub release. |
| `parasync_frontmain` (Next.js + Supabase migrations) | The migration `20261026000000_desktop_local_execution.sql` (and later ones for browser) plus the web API the desktop screens call. **Not in the run path.** |
Supabase (project `eyufwzhxxfebncwaxgci`) is the mailbox between bemain and the app. No new server exists or is planned for this.

## 3. The mailbox (Supabase)
- `app_settings.local_execution_enabled` (`'true'`/`'false'`, default false) — master switch for code runs. `local_browser_enabled` — separate switch for browser sessions.
- `desktop_devices`: one row per **(PC, account)**: `id` (client-chosen uuid, stored per account as `runner.deviceId.<userId>`), `user_id`, `name`, `app_version`,
  `runner_version`, `local_enabled` (the person's own switch), `ready` (true only while the self-test passes), `last_seen` (heartbeat), `last_canary_*`, and for browsers `browser_ready`.
  RLS: a person sees/changes only their own rows; client can update only a column-granted subset.
- `desktop_jobs`: one row per run: `payload` (same body the cloud sandbox takes: code, mode, files, env_vars, ...), `status` queued → claimed → running → done/failed/cancelled/lost,
  `result`, `error`, `timeout_seconds`, `lease_expires_at`. Clients can only SELECT their own rows; everything else is by function.
- Functions (all `security definer`, `search_path=public`): `claim_desktop_job(id)` (atomic, first caller wins, only the addressed device's owner),
  `finish_desktop_job(id, ok, result, error)`, `touch_desktop_job(id)` (lease +90 s, status running), `cancel_unclaimed_desktop_job(id)` (service role only: cancels ONLY while queued).
  `desktop_cleanup_tick()` hourly (cron job `desktop_cleanup`, :23): claimed/running past lease → `lost`; queued older than 10 min → cancelled; finished older than 1 day deleted; devices idle 90 days deleted.
- Realtime publication includes `desktop_jobs` but the app **polls** (see §6); realtime is not used yet.

## 4. How a code run is routed (bemain)
Every sandbox call goes through `tools_executor._call_sandbox(payload, timeout)`. Order:
1. No billing actor (nobody to charge) → cloud, unmetered, as before.
2. `desktop_dispatch.try_dispatch(...)`. Returns a result (ran on the PC) or `None` (use the cloud). It returns `None` — silently, falling to the cloud — when ANY of these holds:
   flag off or unreadable; payload is not **broker mode** (strict allowlist: env_vars only `PARASYNC_BROKER_URL`, `PARASYNC_BROKER_TOKEN`, `PARASYNC_AVAILABLE_SECRETS`, so admin Tool Builder tools that carry raw secrets NEVER leave the cloud);
   payload over 2 MB; no device of the chatting user with `local_enabled`, `ready`, and `last_seen` within 60 s; any exception before a job row exists.
3. Otherwise it inserts a `desktop_jobs` row, waits up to 6 s for it to leave `queued`. **Never claimed** → `cancel_unclaimed_desktop_job`; if that succeeds → `None` (cloud runs it). If the cancel loses the race (the app claimed meanwhile) → keep waiting. If the cancel call itself fails → report lost (never risk double-running).
4. Claimed → wait for `done`/`failed`. Gives up when the job's lease (renewed by the app every 30 s, 90 s long) has run out (+5 s), or after timeout+90 s. **A claimed job that is lost is NEVER re-run in the cloud** (side effects may have happened); the caller gets `{"ok": false, "local_execution_lost": true, error: ...}`. The agent's own repair loop may retry as a new call.
5. Local runs return before `compute_billing.gate/record_launch`, so they are **never metered**: no allowance drawn, no wallet debit, no refusal. Cloud runs are metered as always. (Tests: `tests/test_desktop_dispatch.py`.)
Who is "the person": the billing actor's `user_id` = the chat's creator (`chats.created_by`, or a task's `created_by`). The PC must belong to **that** account. Scheduled tasks, shifts, projects and planner exploration all use the same door, so they run locally whenever that person's app is open and Ready, otherwise in the cloud.

## 5. The desktop executor (`src/main/runner/`)
- `executor.ts` — pure logic (no Electron imports; tested alone by `npm test`). State machine `off → checking → ready ⇄ busy`, plus `no-wsl`, `needs-install`, `installing`, `error`.
  Loop (`tick`): WSL present? distro installed? (asked of `wsl.exe` at most every 30 s while stable — it is a real process) → self-test (canary) every 5 min and when entering `checking` → when idle: image update check, browser self-test → heartbeat (30 s; retried at most every 10 s on failure) →
  list queued jobs for this device → claim (RPC) → run **in the background** (up to 4 jobs in parallel; `drain()` waits for them in tests) → finish (RPC). Poll is 1.5 s idle, 0.4 s while a job or browser is active or a job finished in the last 20 s.
  **Image self-update** (`maybeUpdate`, every 6 h and at start, only while idle and with no browser open): fetch the public manifest; if its version is newer than the stored `runner.version`, tell the cloud not-ready, download + sha256-verify the new rootfs FIRST, only then `wsl --unregister` the old distro and import the new one (`installFromManifest(..., replace=true)` in `index.ts`), then `afterInstall()` re-tests everything.
  If the replace fails after the old box was removed, the next tick sees no box (`needs-install`) and the person can press Install.
  Per-account: device id and the on/off switch are keyed by user id. Sign-out or account switch sends a heartbeat `ready=false` first (best effort, old token still held). Quit sends the same (3 s cap). While a job runs: lease touch + heartbeat every 30 s.
- `wsl.ts` — everything touching `wsl.exe`. Job command (`jobArgs`): `wsl.exe -d ParasyncRunner -u root --exec sh -c '<prelude>; exec runuser -u runner -- env -u WSL_INTEROP timeout --signal=KILL N python3 /opt/runner/run_job.py'`;
  job JSON on stdin; the answer is one line `__PARASYNC_JOB_RESULT__{json}` on stdout. Prelude (root, before any agent code): `echo -1 > /proc/sys/fs/binfmt_misc/WSLInterop; chmod 700 /run/WSL`.
  `--exec` and no double quotes in the script are deliberate (Windows argument quoting).
- `install.ts` — downloads `manifest.json` + the rootfs from the public `parasync_localrunner` GitHub release (hosts allowlisted, redirects checked per hop), verifies **sha256**, then `wsl --import`.
- `cloud.ts` — plain REST + RPC against Supabase **as the signed-in person** (publishable key + their access token). No service key exists in the app. The token is pushed from the page on every session change and kept only in memory.
- `index.ts` — wires the real machine in; handles the quit goodbye.
- Page side: `hooks/useRunner.ts`, `components/LocalExecutionCard.tsx` (About page), `lib/auth.tsx` pushes `{userId, accessToken}` to main.
- IPC channels `runner:get|set-enabled|install|session|status` (`src/shared/ipc.ts`); types/constants in `src/shared/runner.ts`.

## 6. Timing numbers (so symptoms are easy to read)
Poll 1.5 s idle, 0.4 s while active · claim latency seen live 0.3–2.5 s (before the faster poll) · typical run 1–6 s · heartbeat 30 s · device "fresh" 60 s · cloud wait for a claim 6 s (code runs, browser open), 20 s (a call in an existing browser) ·
lease 90 s renewed every 30 s · code self-test every 5 min · browser self-test every 30 min · image update check every 6 h · hourly DB cleanup at :23 · up to 4 parallel jobs and 3 browsers per PC.

## 7. The sealed box — what is and is not true
`image/wsl.conf` sets automount off, interop off, appendWindowsPath off, default user `runner`. **Verified on a real PC:** automount and appendWindowsPath are honoured (no `/mnt/c`, no `cmd.exe` on PATH);
**interop is NOT honoured** by wsl.exe in this build (`WSLInterop` read `enabled`), so the per-job prelude above disables it and locks `/run/WSL` before agent code exists.
The **self-test** (`SEALED_CHECK_CODE` in `src/shared/runner.ts`) runs as `runner` and checks: no Windows drives, interop not enabled, `/run/WSL` not listable, no `cmd.exe`/`powershell.exe`, not root.
A PC is Ready only if `bad` is empty (fail closed; the card shows which check failed). Accepted residue: `/usr/lib/wsl/drivers` (read-only GPU driver mount; removable only via the Windows user's `.wslconfig`).
Network egress from the box is open (same as the cloud MicroVMs).

## 8. Trust rules that must not be loosened
1. Only broker-mode payloads go local; raw-secret payloads (admin Tool Builder tools, anything with other env vars) stay in the cloud — EXCEPT when the PC itself holds the secrets (its vault): then only names go down and the PC fills the values in. See `docs/LOCAL_SECRETS.md`.
2. Never run a claimed-then-lost job in the cloud. Never cancel a claimed job.
3. The app never holds a service key, a Fernet key, or a provider key. Only the person's own token, in memory.
4. A device is Ready only while the sealed-box self-test passes.
5. Rootfs downloads are host-allowlisted and sha256-checked before import.
6. One account at a time per app: only the signed-in account's runs go local; others go to the cloud (a second account's token is never held).
7. Browser sessions that carry credentials (Browser Access logins) stay in the cloud (see §10).

## 9. Releases and how to ship each piece
- **Linux image** (`parasync_localrunner`): bump `VERSION`, push to `main` (CI builds, tests inside the image, uploads artifact), then create a GitHub release `vX.Y.Z` (tag created on publish, set as latest);
  the CI tag run attaches `manifest.json` + `parasync-runner-rootfs-X.Y.Z.tar.gz`. The app downloads `…/releases/latest/download/manifest.json`. The repo MUST stay public.
- **Desktop app**: `npm version patch|minor --no-git-tag-version`, push, GitHub → Actions → Release → Run workflow (sandbox cannot push tags). Auto-update from GitHub Releases.
- **bemain**: push to `main`; Fly deploy workflow runs (check its job log — a "success" can still hide a skipped deploy, see `deployment.md`). Live backend is whatever `app_settings.runner_url` says (currently Fly).
- **Migrations**: files in `parasync_frontmain/supabase/migrations/`; applying through the Supabase tool can hang on its confirmation prompt (statements with `delete`/`drop`) — apply in small pieces via `execute_sql`, or have the user run the SQL editor. Never put `DROP` in a migration applied through the tool.

## 10. Browser sessions (built 2026-10-25, off until switched on)
**Shape.** A browser session on a PC is ONE long-lived process in the Linux box: `runner/browser_host.py` (one per session), launched by the app as a child `wsl.exe` process (same root-prelude/`runuser` start-up as a job, see `browserHostArgs` in `wsl.ts`,
plus `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). It starts headless Chromium through synchronous Playwright (in-memory profile, nothing written to disk, **no network port**: Playwright talks to Chromium over a pipe) and then answers
requests the app writes to its stdin, one JSON line each (`exec` / `ping` / `close`), replying with `__PARASYNC_BROWSER__{json}` lines (`ready`, `response`, `fatal`). An `exec` runs the model's script in-process with `browser`, `context`, `page` bound — the same
script contract as the cloud (`result` variable, files in, new/changed files out as base64, per-call env vars only while the call runs, stdout captured). The time limit is a `SIGALRM`-raised `BaseException` (scripts cannot swallow it); if a timeout leaves
Playwright unusable the host reports `fatal` and exits. The process also exits when the app closes the pipe (quit, sign-out, crash) and after 45 min idle.
**App side** (`src/main/runner/browserHost.ts`, no Electron imports): `BrowserHosts` keeps a map of session id → host process, with at most `maxBrowserSessions` (3) open; a session that does not exist or died answers `{ok:false, session_gone:true}`. The executor
(`executor.ts`) handles three job kinds in the same mailbox: `browser_open {session_id}`, `browser_exec {session_id, code, files, env_vars, timeout}`, `browser_close {session_id}`; a browser job is refused unless this PC passed the **browser self-test**
(`check()` in `index.ts`: open a browser, load a data: page, read its title, close it; run every 30 min and never while a browser is open; needs image ≥ 0.2.0). Heartbeats carry `browser_ready`.
**Routing (bemain)** — `desktop_browser.py`: `open_new_session(..., allow_local=True)` first asks `try_open()`; it returns None (→ cloud MicroVM, exactly as before) unless BOTH `local_execution_enabled` and `local_browser_enabled` are `'true'` and the person has a device that is
`local_enabled`, `ready`, `browser_ready` and seen in the last 60 s; a PC that does not claim the open within 6 s is cancelled → cloud; an open that fails after being claimed → cloud (nothing happened) and a `browser_close` is queued. A local session is stored in
`agent_browser_sessions` like any other with `daytona_sandbox_id = 'local:<device_id>:<session uuid>'`, `microvm_endpoint = 'local'`. The seam is `microvm_sandbox.call_session/close_session`: an id with the `local:` prefix goes to `desktop_browser.call/close`
(so `browser_execute`, the probes, the idle sweep and the planner all work unchanged). **A call RAISES when the PC is gone** (unclaimed in 20 s, lost mid-call, device deleted, `session_gone`) and `browser_execute` already turns an exception into "session gone, open a new one";
a local session is NEVER moved to the cloud (page state cannot move).
**Rules.** Local sessions are unmetered (`browser_execute` skips the gate/charge for `local:` ids; `open_new_session` skips gate + `record_browser_open`; `meter_session_lifetime` skips them). Sessions that carry credentials — Browser Access **login** and **onboarding**
(`browser_access/login.py`, `onboarding.py`) — are always opened in the cloud (`allow_local=False`) because the owner's saved logins must not be sent to a member's PC. `desktop_browser.call` refuses any call whose env vars are not broker-mode, and more than 2 MB of input files.
**Switching it on:** apply `20261026010000_desktop_browser.sql` (done 2026-10-25), publish image ≥ 0.2.0 (tag `v0.2.0`), release a desktop ≥ 0.5.0, let the PC update its Linux box and pass the browser self-test (the card shows "Browsers: Ready"), then set `app_settings.local_browser_enabled = 'true'`.
**Latency note:** each browser step is a mailbox round trip (poll 0.4 s while work is flowing, plus the claim/finish calls), so expect roughly 1–2 s of overhead per call versus the cloud.
**Residue:** Chromium on the PC reaches the internet with no filter (like the cloud). Downloads and files live only under `/tmp/parasync-browser/<session>/work` in the box and are returned as output files.

## 10b. Secrets kept on the PC (built 2026-10-26)
The whole design — the vault, the `local_secrets` job request, the local broker (image 0.3.0), the owner's local Browser Access login, the yes/no copy check, lifecycle, what it does not protect against, release order — is in **`docs/LOCAL_SECRETS.md`**. Read it before touching any of it.

## 11. Known limits / not built
Per-agent owner consent for running agent code on a member's PC (deliberately deferred; "handle it a different way") · serving two accounts at once on one PC · files over 2 MB in a local run or browser call · Windows code signing ·
realtime push instead of polling · macOS/Linux desktop · scheduled/background work that must run while the PC is off (falls to the cloud by design).
**Billing decision (2026-10-25, the owner's):** the compute limits/charges (800 runs personal, 1600 private, overflow price) exist only to cover cloud costs, so **local runs and local browser sessions are never counted or charged**. Cloud runs stay metered as always.

## 12. Debugging cookbook
- "Count is 0 / nothing runs locally": check `desktop_devices` for that **user_id** (ready, local_enabled, last_seen within 60 s); check `app_settings.local_execution_enabled`; check bemain is the new build.
- Two accounts on one PC: each has its own device row; the signed-in one must be Ready.
- Supabase API logs (`query_logs`, source `edge_logs`) show REST calls from bemain (`GET desktop_devices`, `POST desktop_jobs`) and the app (`PATCH/POST desktop_devices`).
- A job stuck `running`: the app signed out/quit mid-run; cleanup marks it `lost` at :23; the caller was told "lost" and did not rerun in the cloud.
- Interop/drives questions: ask the agent to run `print(open('/proc/sys/fs/binfmt_misc/WSLInterop').read())` (should raise FileNotFoundError) and `os.listdir('/mnt')`.
- Local tests: `parasync_desktop`: `npm test` (executor); stand-in `wsl.exe` test needs `PARASYNC_LOCALRUNNER=<checkout>` (bundle `scripts/tests/wsl.test.ts` with rolldown). bemain: `pytest tests/test_desktop_dispatch.py`. localrunner: `pytest tests` (library tests skip without libs; CI runs them inside the image).

## 13. Current state log (append new entries at the bottom)
- 2026-10-24/25 — code runs local: built, deployed, proven on a real PC (claim 0.3–2.5 s, scheduled/chain/planner runs local, cloud fallback when app closed, sign-out mid-run handled).
- 2026-10-25 — desktop 0.4.4, localrunner image 0.1.0 (reportlab pinned 4.2.5), bemain `30961f6`+. Billing: local = unmetered (tests added).
- 2026-10-25 — cloud sandbox `reportlab==4.2.5` pin committed in `parasync_sandbox` (applies at next image build, running image unchanged).
- 2026-10-25 — built (tests green; not yet proven on a real PC): browser sessions end to end (localrunner image 0.2.0 with Chromium, `browser_host.py`; app 0.5.0 `browserHost.ts`/executor; bemain `desktop_browser.py` + seam + no-metering; migration `20261026010000_desktop_browser.sql` APPLIED, flag `local_browser_enabled='false'`),
  image self-update in the app, parallel jobs, cached `wsl.exe` checks, billing tests. Order to turn browsers on: CI green for localrunner `main` → publish release `v0.2.0` → release desktop 0.5.0 → PC updates its box and shows "Browsers: Ready" → set `local_browser_enabled='true'` → test a task that uses a browser.
- 2026-10-25 — localrunner CI (commit 5aec9a1) is GREEN with `PARASYNC_REQUIRE_BROWSER=1`: inside the built 0.2.0 image a real Chromium session ran two scripts on the same page and returned a screenshot (so the image, Playwright 1.49.1 and Chromium are proven; WSL itself is not yet). Release `v0.2.0` of localrunner has NOT been published yet (the owner creates it on GitHub); desktop 0.5.0 is pushed, not yet released.
- Open questions to verify on the first real run: Playwright 1.49.1 + Chromium inside WSL (CI proves the image; the PC proves WSL), `runuser`/`--exec` start-up for the host, browser step latency, behaviour when the PC sleeps mid-session.
- 2026-10-25 — PROVEN on a real PC: image self-updated to 0.2.0, `browser_ready=true`, `local_browser_enabled='true'`; a real task ran `browser_open` → `browser_exec` → `browser_close` as `desktop_jobs` (all done, ~1 s claim), screenshot came back correct.
- 2026-10-25 — desktop 0.5.1: every `/api` call from the app failed ("Parasync could not be reached", Platform tools / Database integration empty, attachment download "no longer available"). Cause: `parasync.in` answers 308 → `www.parasync.in` and `webApi.ts` uses `redirect: 'error'`. Fix: `APP_CONFIG.webUrl` is now `https://www.parasync.in`. Google sign-in return stays on the bare host via `APP_CONFIG.bridgeBase` (that is the one listed in Supabase Redirect URLs). Rule: never point `webUrl` at a host that redirects. Also: app icon now has rounded corners (transparent).
- 2026-10-26 — SECRETS ON THE PC built (desktop 0.6.0, localrunner image 0.3.0, bemain `local_secrets.py`, migration `20261026020000_device_held_secrets.sql` APPLIED). Tests: desktop 61, bemain 1038, localrunner 46+; the screens were exercised in the real Electron app against fakes (`scripts/ui-test/sweep.ts`). NOT yet proven on a real PC: Windows DPAPI encryption of the vault, the supervisor/broker inside the real WSL box (image 0.3.0 not published yet), a real PC-only secret used by a tool. Order: CI green on localrunner → publish `v0.3.0` → release desktop 0.6.0.

- 2026-10-26 (desktop 0.7.0): secrets on the PC redesigned. Name visible on both sides, value kept separately (cloud, PC, or both); no transfer, no comparison, no versions; PC first, then cloud, else fail. Managed on the Secrets tab / My Keys / Browser Access (web slots answered by `shims/localCopy.tsx`); About is only a list. Version label moved clear of Sign out; Account menu has "About this app". bemain `local_secrets.holds()` ignores versions. Details: `docs/LOCAL_SECRETS.md`.
