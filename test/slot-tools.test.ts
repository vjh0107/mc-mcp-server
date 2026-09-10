import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSlotInWindow, isContainerBlock, planClick } from '../src/tools/slot-tools.ts';

test('the mouse button and the click mode follow the requested button and shift', () => {
  assert.deepEqual(planClick('left', false), { mouseButton: 0, mode: 0 });
  assert.deepEqual(planClick('right', false), { mouseButton: 1, mode: 0 });
  assert.deepEqual(planClick('left', true), { mouseButton: 0, mode: 1 });
  assert.deepEqual(planClick('right', true), { mouseButton: 1, mode: 1 });
});

test('a slot outside the window is rejected with the range spelled out', () => {
  assert.doesNotThrow(() => assertSlotInWindow(0, 45));
  assert.doesNotThrow(() => assertSlotInWindow(44, 45));

  assert.throws(() => assertSlotInWindow(45, 45), /slots run 0-44/);
  assert.throws(() => assertSlotInWindow(-1, 45), /slots run 0-44/);
  assert.throws(() => assertSlotInWindow(1.5, 45), /Slot 1.5/);
});

test('every shulker box colour counts as a container', () => {
  assert.equal(isContainerBlock('chest'), true);
  assert.equal(isContainerBlock('barrel'), true);
  assert.equal(isContainerBlock('shulker_box'), true);
  assert.equal(isContainerBlock('light_blue_shulker_box'), true);
  assert.equal(isContainerBlock('crafting_table'), false);
  assert.equal(isContainerBlock('chest_boat'), false);
});
