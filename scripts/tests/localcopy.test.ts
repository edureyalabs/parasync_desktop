// scripts/tests/localcopy.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { savedFrom } from '../../src/renderer/src/lib/localCopy.ts';

const AGENT = '11111111-1111-4111-8111-111111111111';
const ACCESS = '22222222-2222-4222-8222-222222222222';
const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, version: 3, ...extra });

test('an agent secret saved in the cloud is also kept here, at the version the cloud gave it', () => {
  assert.deepEqual(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'API_KEY', context: 'x', value: 'sk-123' }, ok()), { kind: 'secret', agentId: AGENT, name: 'API_KEY', value: 'sk-123', version: 3 });
  assert.deepEqual(savedFrom(`/api/agents/${AGENT}/user-secrets`, { name: 'MY_KEY', value: 'k' }, ok({ version: 1 })), { kind: 'user_secret', agentId: AGENT, name: 'MY_KEY', value: 'k', version: 1 });
});

test('nothing is kept when the cloud did not accept it, gave no version, or the secret is meant for this PC only', () => {
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: 'v' }, { ok: false, error: 'no' }), null);
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: 'v' }, { ok: true }), null, 'an older cloud that sends no version: a copy could never match');
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: '', storage: 'device_only' }, ok()), null, 'the screen stores PC-only secrets itself');
  assert.equal(savedFrom('/api/agents/not-an-id/secrets', { name: 'A_KEY', value: 'v' }, ok()), null);
  assert.equal(savedFrom(`/api/agents/${AGENT}/other`, { name: 'A_KEY', value: 'v' }, ok()), null);
});

test('a saved login is kept only when the submission carried every field', () => {
  const path = `/api/agents/${AGENT}/browser-access/${ACCESS}/credentials`;
  const values = { username: 'me@acme.test', password: 'pw', remember: true, blank: '  ' };
  assert.equal(savedFrom(path, { values }, ok()), null, 'not marked complete by the cloud');
  const saved = savedFrom(path, { values }, ok({ complete: true }));
  assert.deepEqual(saved && { ...saved, value: JSON.parse(saved.value) }, { kind: 'browser_access', agentId: AGENT, name: ACCESS, value: { username: 'me@acme.test', password: 'pw', remember: 'true' }, version: 3 });
  assert.equal(savedFrom(path, { values: {} }, ok({ complete: true })), null);
});
