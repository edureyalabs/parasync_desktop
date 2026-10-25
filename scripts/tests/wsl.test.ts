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
  // A stand-in for the root-owned supervisor: it only shows what the app sent it, so the envelope can be checked from here.
  writeFileSync(join(dir, 'fake_supervisor.py'), `import json, sys
envelope = json.load(sys.stdin)
print('__PARASYNC_JOB_RESULT__' + json.dumps({'ok': True, 'result': {'keys': sorted(envelope), 'names': [s['name'] for s in envelope['broker']['secrets']], 'code': envelope['job']['code'], 'limit': sys.argv[1]}}))
`);
  // Stand-in for: wsl.exe -d NAME -u root --exec sh -c SCRIPT. It runs the script as-is, minus the parts that only exist inside the
  // real box (the runuser switch, the /opt path), so the job-start script itself is exercised.
  writeFileSync(bin, `#!/bin/sh
case "$1" in
  --status) exit 0;;
  --list) printf 'ParasyncRunner\\n'; exit 0;;
esac
script="$8"
script=$(printf '%s' "$script" | sed -e 's#exec runuser -u runner -- env -u WSL_INTEROP #cd ${checkout}/runner \\&\\& exec #' -e 's#/opt/runner/run_job.py#${checkout}/runner/run_job.py#' -e 's#/opt/runner/job_supervisor.py#${dir}/fake_supervisor.py#')
exec sh -c "$script"
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


test('a job with secrets for the broker goes to the supervisor as {job, broker} on standard input, not on a command line', { skip: !checkout }, async () => {
  fake();
  const out = await runJob(false, { mode: 'script', code: 'result = 1' }, 20, { secrets: [{ name: 'API_KEY', value: 'sk-live-0123456789', hosts: ['api.example.com'] }], cloud: null });
  assert.equal(out.kind, 'result');
  const r = (out.kind === 'result' ? out.result['result'] : null) as { keys: string[]; names: string[]; code: string; limit: string };
  assert.deepEqual(r.keys, ['broker', 'job']);
  assert.deepEqual(r.names, ['API_KEY']);
  assert.equal(r.code, 'result = 1');
  assert.equal(r.limit, '20');
});
