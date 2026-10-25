// scripts/tests/vault.test.ts
// Run with: npm test   (bundled together with the executor tests)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { redactDeep } from '../../src/main/vault/redact.ts';
import { Vault, VAULT_LIMITS, keyOf, type VaultDeps } from '../../src/main/vault/vault.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AGENT = '11111111-1111-4111-8111-111111111111';
const ACCESS = '22222222-2222-4222-8222-222222222222';

function make(opts: { available?: boolean; start?: number } = {}) {
  let file: string | null = null;
  let clock = opts.start ?? Date.parse('2026-11-01T00:00:00Z');
  let foreign = false; // simulate a profile written by another Windows user: nothing decrypts
  const deps: VaultDeps = {
    crypto: {
      available: () => opts.available !== false,
      encrypt: (p) => Buffer.from(`enc:${p}`).toString('base64'),
      decrypt: (e) => {
        if (foreign) throw new Error('cannot decrypt');
        const t = Buffer.from(e, 'base64').toString();
        if (!t.startsWith('enc:')) throw new Error('bad');
        return t.slice(4);
      },
    },
    io: { read: async () => file, write: async (t) => { file = t; } },
    now: () => new Date(clock),
  };
  return {
    vault: new Vault(deps),
    deps,
    disk: () => file,
    advance: (ms: number) => { clock += ms; },
    setForeign: (v: boolean) => { foreign = v; },
    restart: () => new Vault(deps),
  };
}

const put = (name = 'API_KEY', value = 'sk-live-12345678', extra: Record<string, unknown> = {}) =>
  ({ agentId: AGENT, kind: 'secret' as const, name, value, version: 3, deviceOnly: false, ...extra });

test('a value is stored encrypted, never in the clear on disk', async () => {
  const t = make();
  await t.vault.put(A, put());
  assert.ok(t.disk());
  assert.ok(!t.disk()!.includes('sk-live-12345678'));
});

test('nothing is stored when the system cannot protect it', async () => {
  const t = make({ available: false });
  await assert.rejects(() => t.vault.put(A, put()), /Secure storage is not available/);
  assert.equal(t.disk(), null);
});

test('the list shows names and dates, never a value', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'super-secret-value'));
  const list = await t.vault.list(A);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.name, 'TOKEN');
  assert.ok(!JSON.stringify(list).includes('super-secret-value'));
});

test('one account cannot see or resolve another account’s secrets', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'only-for-a'));
  assert.deepEqual(await t.vault.list(B), []);
  const r = await t.vault.resolve(B, [{ agentId: AGENT, kind: 'secret', name: 'TOKEN' }]);
  assert.equal(r.values.size, 0);
  assert.equal(r.missing.length, 1);
  assert.deepEqual(await t.vault.held(B), {});
});

test('secrets survive a restart and a sign-out (nothing is wiped by switching account)', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'persisted'));
  await t.vault.put(B, put('OTHER', 'persisted-b'));
  const again = t.restart();
  assert.equal((await again.list(A)).length, 1);
  assert.equal((await again.list(B)).length, 1);
  const r = await again.resolve(A, [{ agentId: AGENT, kind: 'secret', name: 'TOKEN', version: 3 }]);
  assert.equal(r.values.get(keyOf({ agentId: AGENT, kind: 'secret', name: 'TOKEN' }))!.value, 'persisted');
});

test('a stale copy is not supplied: the version must match the cloud, unless it lives on this PC only', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'old-value')); // version 3
  const stale = await t.vault.resolve(A, [{ agentId: AGENT, kind: 'secret', name: 'TOKEN', version: 4 }]);
  assert.equal(stale.values.size, 0);
  assert.equal(stale.missing.length, 1);
  await t.vault.put(A, put('LOCAL_ONLY', 'here-only', { deviceOnly: true, version: 1 }));
  const local = await t.vault.resolve(A, [{ agentId: AGENT, kind: 'secret', name: 'LOCAL_ONLY', version: 99 }]);
  assert.equal(local.values.size, 1);
});

test('held reports names and versions by agent and kind, nothing else', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'v1'));
  await t.vault.put(A, { agentId: AGENT, kind: 'user_secret', name: 'MY_KEY', value: 'k', version: 2, deviceOnly: false });
  await t.vault.put(A, { agentId: AGENT, kind: 'browser_access', name: ACCESS, value: '{"user":"a"}', version: 5, deviceOnly: true });
  const held = await t.vault.held(A);
  assert.deepEqual(held, { [AGENT]: { secret: { TOKEN: 3 }, user_secret: { MY_KEY: 2 }, browser_access: { [ACCESS]: 5 } } });
  assert.ok(!JSON.stringify(held).includes('v1'));
});

test('an entry nobody saved or used for 30 days is deleted; using it keeps it', async () => {
  const t = make();
  await t.vault.put(A, put('USED', 'a-used-value'));
  await t.vault.put(A, put('IDLE', 'an-idle-value'));
  t.advance(VAULT_LIMITS.idleExpiryMs - 2 * VAULT_LIMITS.touchEveryMs);
  await t.vault.resolve(A, [{ agentId: AGENT, kind: 'secret', name: 'USED', version: 3 }]); // a use renews it
  t.advance(3 * VAULT_LIMITS.touchEveryMs);
  assert.deepEqual((await t.vault.list(A)).map((m) => m.name), ['USED']);
  assert.equal((await t.vault.resolve(A, [{ agentId: AGENT, kind: 'secret', name: 'IDLE' }])).values.size, 0);
  assert.equal(await t.vault.sweep(), 1);
  assert.ok(JSON.parse(t.disk()!).accounts[A]);
  t.advance(VAULT_LIMITS.idleExpiryMs + 1000);
  assert.equal(await t.vault.sweep(), 1);
  assert.deepEqual(JSON.parse(t.disk()!).accounts, {}); // an empty account leaves no blob behind
});

test('sweep also cleans accounts that are not signed in right now', async () => {
  const t = make();
  await t.vault.put(A, put('A_OLD', 'a-old-value'));
  t.advance(VAULT_LIMITS.idleExpiryMs + 1000);
  await t.vault.put(B, put('B_NEW', 'b-new-value'));
  assert.equal(await t.vault.sweep(), 1);
  assert.deepEqual(await t.vault.list(A), []);
  assert.equal((await t.vault.list(B)).length, 1);
});

test('input is validated: names, agent ids, hosts, size', async () => {
  const t = make();
  await assert.rejects(() => t.vault.put(A, put('lower_case')), /UPPER_SNAKE_CASE/);
  await assert.rejects(() => t.vault.put(A, put('PATH')), /reserved/);
  await assert.rejects(() => t.vault.put(A, { ...put(), agentId: 'nope' }), /invalid agent/);
  await assert.rejects(() => t.vault.put(A, put('API_KEY', '')), /value is required/i);
  await assert.rejects(() => t.vault.put(A, put('API_KEY', 'x'.repeat(VAULT_LIMITS.maxValueChars + 1))), /too large/);
  await assert.rejects(() => t.vault.put(A, put('API_KEY', 'ok-value', { hosts: ['not a host'] })), /valid host/);
  await assert.rejects(() => t.vault.put('not-a-user', put()), /not signed in/);
  await assert.rejects(() => t.vault.put(A, { agentId: AGENT, kind: 'browser_access', name: 'API_KEY', value: 'x', version: 1, deviceOnly: false }), /login id/);
  const ok = await t.vault.put(A, put('API_KEY', 'ok-value', { hosts: ['API.Example.com', 'api.example.com'] }));
  assert.deepEqual(ok.hosts, ['api.example.com']);
});

test('remove and wipe delete only what was asked', async () => {
  const t = make();
  await t.vault.put(A, put('ONE', 'one-value'));
  await t.vault.put(A, put('TWO', 'two-value'));
  await t.vault.put(B, put('THREE', 'three-value'));
  assert.equal(await t.vault.remove(A, { agentId: AGENT, kind: 'secret', name: 'ONE' }), true);
  assert.equal(await t.vault.remove(A, { agentId: AGENT, kind: 'secret', name: 'ONE' }), false);
  await t.vault.wipeAccount(A);
  assert.deepEqual(await t.vault.list(A), []);
  assert.equal((await t.vault.list(B)).length, 1);
});

test('a profile that cannot be decrypted is treated as empty, not as a crash', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'was-here'));
  const again = t.restart();
  t.setForeign(true);
  assert.deepEqual(await again.list(A), []);
  assert.deepEqual(await again.held(A), {});
  assert.equal(await again.sweep(), 0);
});

test('two quick saves both land', async () => {
  const t = make();
  await Promise.all([t.vault.put(A, put('ONE', 'one-value')), t.vault.put(A, put('TWO', 'two-value')), t.vault.put(A, put('THREE', 'three-value'))]);
  assert.deepEqual((await t.vault.list(A)).map((m) => m.name).sort(), ['ONE', 'THREE', 'TWO']);
});

test('redaction blanks every verbatim occurrence, longest first, and leaves the rest', () => {
  const out = redactDeep({ result: 'key=abcd1234 and abcd12345678', stdout: ['x', 'abcd12345678'], n: 5, ok: true }, ['abcd1234', 'abcd12345678', 'ab']);
  assert.deepEqual(out, { result: 'key=[REDACTED] and [REDACTED]', stdout: ['x', '[REDACTED]'], n: 5, ok: true });
  assert.deepEqual(redactDeep({ a: 'nothing here' }, []), { a: 'nothing here' });
  assert.equal(redactDeep('token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4 end', [], true), 'token [REDACTED] end');
});

// ── the copy check ─────────────────────────────────────────────────────────────────────

import { canonicalJson, comparableText, proofOf, readAnswer } from '../../src/main/vault/verify.ts';

test('the keyed hash and the canonical text are byte for byte what the cloud computes (vectors taken from bemain/secret_verify.py)', () => {
  assert.equal(proofOf('A'.repeat(24), 'the-cloud-value'), 'f00ff7e2ba0f2ccb93b118ddcf342cad08d81d21bcd9c5fc8f0c54e1ac124a32');
  const text = comparableText('browser_access', JSON.stringify({ username: 'me', password: 'pw1', n: 'é"x' }));
  assert.equal(text, '{"n":"é\\"x","password":"pw1","username":"me"}');
  assert.equal(proofOf('A'.repeat(24), text), '84e488bf42187c64bedbbd8817d0c1191c21b791475b93758486b39c1fa0d5b3');
  assert.equal(canonicalJson({ b: 1, a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1},"b":1}');
  assert.equal(comparableText('secret', 'plain value'), 'plain value', 'only a saved login is re-written');
});

test('the cloud’s answer becomes a plain result, and failures never carry a value', () => {
  assert.deepEqual(readAnswer(200, { ok: true, exists: true, match: true, version: 4 }), { state: 'match', cloudVersion: 4 });
  assert.deepEqual(readAnswer(200, { ok: true, exists: true, match: false, version: 5 }), { state: 'differs', cloudVersion: 5 });
  assert.deepEqual(readAnswer(200, { ok: true, exists: false, match: false }), { state: 'cloud-has-none' });
  assert.equal(readAnswer(429, {}).state, 'error');
  assert.deepEqual(readAnswer(403, { ok: false, error: 'Not authorized for this agent.' }), { state: 'error', message: 'Not authorized for this agent.' });
  assert.equal(readAnswer(500, null).state, 'error');
});

test('the vault hands a value to main-process code only through peek', async () => {
  const t = make();
  await t.vault.put(A, put('TOKEN', 'peek-me-123456'));
  const got = await t.vault.peek(A, { agentId: AGENT, kind: 'secret', name: 'TOKEN' });
  assert.equal(got?.value, 'peek-me-123456');
  assert.equal(await t.vault.peek(B, { agentId: AGENT, kind: 'secret', name: 'TOKEN' }), null, 'another account sees nothing');
  assert.equal(await t.vault.peek(A, { agentId: AGENT, kind: 'secret', name: 'NOPE' }), null);
});
