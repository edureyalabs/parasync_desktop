// scripts/tests/zoom.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { zoomFor } from '../../src/shared/zoom.ts';

test('a normal window is not zoomed', () => {
  for (const w of [1280, 1440, 1600, 1920]) assert.equal(zoomFor(w), 1);
});

test('a narrow window shows everything a little smaller, never below 0.8', () => {
  assert.equal(zoomFor(720), 0.8);
  assert.equal(zoomFor(400), 0.8);
  assert.ok(zoomFor(1000) < 1 && zoomFor(1000) > 0.8);
});

test('a very wide window is enlarged a little, never above 1.2', () => {
  assert.ok(zoomFor(2560) > 1);
  assert.equal(zoomFor(9000), 1.2);
});

test('it never returns nonsense', () => {
  assert.equal(zoomFor(Number.NaN), 1);
  for (let w = 300; w < 6000; w += 37) { const z = zoomFor(w); assert.ok(z >= 0.8 && z <= 1.2); }
});
