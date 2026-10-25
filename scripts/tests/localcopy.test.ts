// scripts/tests/localcopy.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { savedFrom, withoutCloudValue } from '../../src/renderer/src/lib/localCopy.ts';

const AGENT = '11111111-1111-4111-8111-111111111111';
const ACCESS = '22222222-2222-4222-8222-222222222222';
const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, version: 3, ...extra });

test('an agent secret saved in the cloud is also kept here when asked', () => {
  assert.deepEqual(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'API_KEY', context: 'x', value: 'sk-123' }, ok()), { kind: 'secret', agentId: AGENT, name: 'API_KEY', value: 'sk-123', version: 3 });
  assert.deepEqual(savedFrom(`/api/agents/${AGENT}/user-secrets`, { name: 'MY_KEY', value: 'k' }, ok({ version: 1 })), { kind: 'user_secret', agentId: AGENT, name: 'MY_KEY', value: 'k', version: 1 });
});

test('the cloud giving no version no longer matters: the two copies are never compared', () => {
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: 'v' }, { ok: true })?.version, 0);
});

test('nothing is kept when the cloud did not accept it, or the request is not a save of ours', () => {
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: 'v' }, { ok: false, error: 'no' }), null);
  assert.equal(savedFrom(`/api/agents/${AGENT}/secrets`, { name: 'A_KEY', value: '' }, ok()), null);
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

test('"keep it on this PC only" sends the cloud just the name', () => {
  const path = `/api/agents/${AGENT}/secrets`;
  const body = { name: 'API_KEY', context: 'x', value: 'sk-123' };
  assert.deepEqual(withoutCloudValue(path, body, { cloud: false, pc: true }), { name: 'API_KEY', context: 'x', storage: 'device_only' });
  assert.deepEqual(withoutCloudValue(`/api/agents/${AGENT}/user-secrets`, { name: 'K', value: 'v' }, { cloud: false, pc: true }), { name: 'K', storage: 'device_only' });
  assert.equal(withoutCloudValue(path, body, { cloud: true, pc: true }), body, 'cloud kept: unchanged');
  assert.equal(withoutCloudValue(path, body, null), body, 'no dialog: unchanged');
  assert.equal(withoutCloudValue(path, body, { cloud: false, pc: false }), body, 'neither ticked is never a way to lose the value silently');
  const login = { values: { a: 'b' } };
  assert.equal(withoutCloudValue(`/api/agents/${AGENT}/browser-access/${ACCESS}/credentials`, login, { cloud: false, pc: true }), login, 'a login always goes to the cloud');
});
