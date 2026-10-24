// scripts/tests/wsl.test.ts
// Exercises src/main/runner/wsl.ts against a stand-in for wsl.exe that runs the real localrunner harness on this machine.
// Set PARASYNC_LOCALRUNNER to the parasync_localrunner checkout; the test is skipped without it.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { distroInstalled, runJob, wslAvailable } from '../../src/main/runner/wsl.ts';

const checkout = process.env['PARASYNC_LOCALRUNNER'];

function fake(): void {
  const dir = mkdtempSync(join(tmpdir(), 'fakewsl-'));
  const bin = join(dir, 'wsl.sh');
  writeFileSync(bin, `#!/bin/sh
case "$1" in
  --status) exit 0;;
  --list) printf 'ParasyncRunner\\n'; exit 0;;
esac
# -d NAME -u runner -- timeout --signal=KILL N python3 /opt/runner/run_job.py
shift 5   # -d NAME -u runner --
exec "$@" 
`.replace('python3 /opt/runner/run_job.py', ''), { mode: 0o755 });
  // Redirect the harness path to the checkout.
  writeFileSync(bin, `#!/bin/sh
case "$1" in
  --status) exit 0;;
  --list) printf 'ParasyncRunner\\n'; exit 0;;
esac
shift 5
timeout_flag="$1"; sig="$2"; secs="$3"
cd "${checkout}/runner" && exec timeout "$sig" "$secs" python3 "${checkout}/runner/run_job.py"
`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  process.env['PARASYNC_WSL_BIN'] = bin;
}

test('wsl.exe stand-in: availability, distro, a real job, an error, a timeout', { skip: !checkout }, async () => {
  fake();
  assert.equal(await wslAvailable(false), true);
  assert.equal(await distroInstalled(false), true);

  const ok = await runJob(false, { mode: 'script', code: 'result = 6 * 7' }, 20);
  assert.equal(ok.kind, 'result');
  assert.deepEqual(ok.kind === 'result' ? ok.result['result'] : null, 42);

  const bad = await runJob(false, { mode: 'script', code: 'raise ValueError("nope")' }, 20);
  assert.equal(bad.kind === 'result' ? bad.result['ok'] : null, false);

  const slow = await runJob(false, { mode: 'script', code: 'import time\ntime.sleep(30)' }, 2);
  assert.equal(slow.kind, 'failed');
});
