<!-- docs/LOCAL_SECRETS.md -->
# Secrets kept on the person's own PC — the whole design in one document

Companion to `docs/LOCAL_EXECUTION.md` (read that first: it describes the mailbox, the executor and the sealed Linux box this builds on).
Built 2026-10-26; **redesigned 2026-10-26 (desktop 0.7.0)** to the model below. Repos touched: `parasync_desktop` (vault, executor, screen), `parasync_localrunner` (supervisor + broker, image 0.3.0),
`parasync_bemain` (routing), `parasync_frontmain` (migration + three small API routes).

## 1. The idea in five lines
1. A secret has a NAME that is visible on both sides (the cloud's rows, and this PC's list). The VALUE is kept separately, wherever the person chose: the cloud, this PC, or both.
2. Nothing is ever transferred between the two, and the two copies are never compared. The person keeps each copy up to date (typing it once into a save dialog and ticking both places counts as "each").
3. A run that needs a secret goes to this PC first if the PC holds the name; otherwise it runs in the cloud with the cloud's copy; if neither has a value it fails with a clear message.
4. A secret whose cloud row is a name-only stub (saved with "Save in the cloud" unticked) can only run on a PC that holds it.
5. Values on the PC are encrypted by Windows for that account only and can never be read back. The PC tells the cloud only the NAMES it holds.

**Where it is managed (not in About):** the agent's **Secrets** tab (each secret, and the New secret dialog), **My Keys**, and each **Browser Access** site's Manage panel. The web screens carry four no-op slots (`parasync_frontmain/components/local-copy/LocalCopy.tsx`: `LocalSaveChoice`, `LocalCopyRow`, `DesktopNavFooter`, `DesktopAccountLinks`); the desktop answers that module with `src/renderer/src/shims/localCopy.tsx`. The About page only lists what the PC holds, with Remove / Remove all.

## 2. Where things live
| Piece | File | Notes |
|---|---|---|
| The vault (pure logic, tested alone) | `src/main/vault/vault.ts` | per-account encrypted blob, 30-day idle expiry, no function returns a value to the page |
| Windows glue | `src/main/vault/index.ts` | `safeStorage` (DPAPI), file `userData/local-secrets.json`, sweep every 6 h, the only IPC the page may call |
| Copy check (HMAC) | `src/main/vault/verify.ts` | cross-language vectors tested against bemain |
| Output redaction | `src/main/vault/redact.ts` | blanks injected values from answers before they leave the PC |
| Job requests | `src/main/runner/localSecrets.ts` | strict parser of the `local_secrets` object in a job |
| Executor | `src/main/runner/executor.ts` `prepareSecrets` | resolves, refuses before running, injects, redacts |
| Linux box side | `parasync_localrunner/runner/job_supervisor.py`, `local_broker.py` | image 0.3.0+ |
| Cloud planning | `parasync_bemain/local_secrets.py` | who may use what, builds the request; `desktop_dispatch.py` sends it |
| Screens | `shims/localCopy.tsx` (the controls), `lib/localCopy.ts` + `shims/apiBridge.ts` (acts on the save dialog's choice), `components/LocalSecretsCard.tsx` + `hooks/useVault.ts` (About list) | see "Where it is managed" above |
| Migration | `parasync_frontmain/supabase/migrations/20261026020000_device_held_secrets.sql` | applied 2026-10-26 |

## 3. Data model (all additive)
- `desktop_devices.held_secrets jsonb` — `{agent_id: {secret|user_secret|browser_access: {name or access id: version}}}`. Self-reported by the app (a column the person can write), so bemain treats it as a hint, never proof.
- `secrets`, `agent_user_secrets`, `browser_access_credentials`: `storage` (`cloud` | `device_only`) and `version` (bumped by a trigger whenever `value` changes). A `device_only` row is a stub whose `value` is the text `device-only` (not valid ciphertext, so `vault.decrypt_value()` returns `None` and every existing reader skips it with no code change).
- `browser_accesses.credentials_version/credentials_storage` — what the owner's screens may see about a saved login (the credentials table itself has no read policy).

## 4. Kinds of secret and who may use them where
| Kind | What it is | Held by | Used by a run for |
|---|---|---|---|
| `secret` | an agent secret the admin set | the org OWNER's PC | the owner only. A member's PC never gets it (bemain checks the owner, not the device's claim) |
| `user_secret` | a key a connected person supplies for an agent | that person's own PC | that person only |
| `browser_access` | a saved website login (JSON of its fields) | the org OWNER's PC | the owner's logged-in sessions only |

## 5. How a run uses them
**Saved tools (Tool Builder, function mode; admin-written code) — raw environment variables.** bemain removes the values from a COPY of the payload (the cloud fallback keeps its own) and adds `local_secrets.env = [{kind, name, version}]`. The app resolves each from the vault (by name; the version in the job is not compared), merges them into `env_vars` for that one run, and blanks them from the answer. **A free-form script is refused raw secrets by the app even if asked** (defence in depth).
**Model-written code (`code_executor`) — the local broker.** Only for secrets that exist on a PC only (cloud-stored ones already reach the script through the cloud broker, which also works for a local run). The job carries `local_secrets.broker = {names:[{name, hosts}], cloud:{url, token}}`. The app puts the values on the standard input of `job_supervisor.py`, which runs as root inside the box, keeps them in memory, starts a broker on `127.0.0.1`, and starts the script as the unprivileged user with only the broker's address and a one-time token. The script calls `POST $PARASYNC_BROKER_URL/broker/relay` exactly as in the cloud (`{{secret:NAME}}` placeholders). The broker: https only; only to hosts on THAT secret's allow list (no list = no use); only public addresses, connecting to the checked address with the real name verified; no redirects; every local value blanked from the response. A call that names no local secret is passed to the cloud broker with the cloud token; a call mixing a local and a cloud secret is refused (two calls).
**Browser Access login — `PARASYNC_CREDS`.** For the owner whose PC holds the current copy, the browser opens on the PC and the platform's login script (`recipe.build_script(values=None)`) reads the login from `PARASYNC_CREDS`, which the app fills in for that one call. What the session then holds (cookies, storage) is noted by the app itself (`learn_values`) and scrubbed from every later answer there; the cloud is told only how many. Setup and onboarding always stay in the cloud.

## 6. Refusals and fallbacks
- The app refuses a job BEFORE running anything when it lacks a secret, the box is too old for the broker, or the request is malformed. The answer carries `not_run: true`. bemain then: cloud-stored secrets → runs it in the cloud (nothing happened); a this-PC-only secret → a clear `local_required` failure.
- A call that needs a this-PC-only secret never runs in the cloud: not when the PC is off, asleep, signed out, switched off, too old, or missing the secret. The model is told plainly and not to work around it.
- A job the app already claimed and then lost is still never re-run in the cloud (unchanged rule).

## 7. Lifecycle
- Per account: each account has its own encrypted blob; working as another account never decrypts it. Sign-out and account switch DELETE NOTHING.
- Expiry: an entry nobody saved or used for 30 days is deleted (sweep at start and every 6 h, for every account on the PC). Using it renews it. "Remove all from this PC" wipes one account.
- Saving: the save dialogs (New secret, Set/Update value, a Browser Access sign-in form) show "Save in Parasync's cloud" and "Keep a copy on this PC" (both ticked by default; the cloud one is always on for a website login). Unticking the cloud sends it only the name (`storage: 'device_only'`). A saved login is kept on the PC only when that submission carried every field.
- Existing secrets: each row shows whether this PC holds its own copy, with **Add for this PC / Replace / Remove**. The person types the value again; the cloud's value is never read.
- No version matching, no "Check" button, no out-of-date state (`desktop_devices.held_secrets` still carries a version number for older apps; bemain ignores it). **Known cost, accepted:** if a key is rotated in one place and not the other, a run that uses the old copy fails and the error is shown as is; it is not retried in the cloud.

## 8. What this does NOT protect against (read before trusting it)
- Windows DPAPI protects against another Windows user or a copied disk. Malware running as the same Windows user can decrypt the vault like the app can.
- The cloud (bemain) decides which code runs with a held secret. Anyone who controls bemain's service credentials can enqueue a job that asks the PC to inject a held secret into code of their choosing. This is the same trust placed in bemain for everything else; the app limits the damage (raw secrets only to function-mode jobs, broker secrets only to their allowed hosts, names validated, nothing sent back unredacted) but cannot remove it. A future hardening: signed jobs / pinned tool code hashes.
- A tool's own code (admin-written, function mode) receives the raw value in its environment, as it always has in the cloud.
- A browser session logged in on the PC lets agent scripts act as that login for as long as it is open (as in the cloud). The box's network is open, so a script in a logged-in session could send page content anywhere; the scrub list only covers values the app noted.
- `held_secrets` is self-reported. It cannot give a member the admin's secret (bemain checks the owner), but a member can make their own PC fail a run by lying (or by holding a wrong value).

## 9. Not built / open
- Browser Access logins that exist on a PC only (onboarding needs the cloud copy to test the login first). Browser calls cannot use the local broker (`browser_execute` with a name-only secret).
- A yes/no "Check" button and a drift warning between the two copies were removed on purpose; `POST /api/agents/[id]/secrets/verify` still exists and can come back as an optional helper.
- Signed jobs; per-secret "allow on this PC" prompts; showing which runs used a PC-held secret.
- Verification of Windows `safeStorage` on a real PC is by Electron's documented behaviour: here the stand-in encryption was used in tests, and the real refusal path (no system key store → store nothing) was seen on a build server.

## 10. Release order
1. Migration applied (done). 2. bemain pushed (Fly deploys on push). 3. `parasync_localrunner` 0.3.0: CI green, then publish release `v0.3.0` (the app's PCs update their Linux box by themselves; the broker needs ≥ 0.3.0). 4. Desktop 0.6.0 / 0.7.0: Actions → Release (0.7.0 carries the redesign; bemain and frontmain work with both). Nothing changes for anyone until a PC holds a secret.
