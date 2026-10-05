import test from 'node:test';
import assert from 'node:assert/strict';
import {
  motionMode,
  normalizeMotionPreference,
  boundedScrollProgress,
  pointerTilt,
} from '../app/studio/motion.mjs';
test('system preference always reduces motion and stored opt-out survives reload', () => {
  assert.equal(motionMode(true, 'system'), 'system-reduced');
  assert.equal(motionMode(true, 'reduced'), 'system-reduced');
  assert.equal(motionMode(false, 'reduced'), 'manual-reduced');
  assert.equal(motionMode(false, 'system'), 'full');
  for (const invalid of [null, 'full', 'unknown', '<script>'])
    assert.equal(normalizeMotionPreference(invalid), 'system');
});
test('scroll animation progress remains bounded for overscroll and invalid geometry', () => {
  assert.equal(boundedScrollProgress(-100), 0);
  assert.equal(boundedScrollProgress(400), 0.5);
  assert.equal(boundedScrollProgress(99999), 1);
  assert.equal(boundedScrollProgress(NaN), 0);
  assert.equal(boundedScrollProgress(10, 0), 0);
});
test('pointer tilt has bounded angles and handles centered, outside and zero-sized targets', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(pointerTilt(110, 70, rect), { x: -0, y: 0 });
  assert.deepEqual(pointerTilt(9999, -9999, rect), { x: 7, y: 7 });
  assert.deepEqual(pointerTilt(9999, -9999, rect, 999), { x: 10, y: 10 });
  assert.deepEqual(pointerTilt(0, 0, { ...rect, width: 0 }), { x: 0, y: 0 });
  assert.deepEqual(pointerTilt(NaN, 0, rect), { x: 0, y: 0 });
});
