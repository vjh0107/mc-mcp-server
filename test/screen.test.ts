import assert from 'node:assert/strict';
import test from 'node:test';
import type { Bot } from 'mineflayer';
import { describeDialog, soundName } from '../src/minecraft/screen.ts';

function botWithSounds(sounds: Record<number, { name: string }>): Bot {
  return { registry: { sounds } } as unknown as Bot;
}

const REGISTRY = botWithSounds({ 147: { name: 'block.basalt.fall' } });

test('a sound arrives either as a registry index or as its own name', () => {
  assert.equal(soundName(REGISTRY, { soundId: 147 }), 'block.basalt.fall');
  assert.equal(soundName(REGISTRY, 147), 'block.basalt.fall');
  assert.equal(
    soundName(REGISTRY, { data: { soundName: 'minecraft:replaced.block.wood.step' } }),
    'minecraft:replaced.block.wood.step',
  );
});

test('an index the registry does not know still identifies itself', () => {
  assert.equal(soundName(REGISTRY, { soundId: 9999 }), 'sound #9999');
  assert.equal(soundName(REGISTRY, undefined), '');
});

function nbt(value: string): unknown {
  return { type: 'string', value };
}

function compound(value: Record<string, unknown>): unknown {
  return { type: 'compound', value };
}

function list(values: unknown[]): unknown {
  return { type: 'list', value: { type: 'compound', value: values } };
}

test('a dialog reports what it says and what it offers to press', () => {
  const dialog = compound({
    type: nbt('minecraft:multi_action'),
    title: nbt('Notice'),
    body: list([
      { type: nbt('minecraft:plain_message'), contents: nbt('Cast from the bank only') },
      { type: nbt('minecraft:plain_message'), contents: nbt('Bait required') },
    ]),
    actions: list([
      { label: nbt('Got it') },
      { label: nbt('Later') },
    ]),
  });

  assert.equal(
    describeDialog(dialog),
    'Notice | Cast from the bank only / Bait required | buttons: Got it, Later',
  );
});

test('a dialog whose title is built from pieces keeps them apart', () => {
  const dialog = compound({
    title: compound({
      extra: list([
        { font: nbt('server:space'), text: nbt('') },
        { font: nbt('server:dialog/head'), text: nbt('Shop') },
      ]),
      text: nbt(''),
    }),
  });

  assert.equal(describeDialog(dialog), '[dialog/head] Shop');
});

test('input fields are counted, since their values are not in the packet', () => {
  const dialog = compound({
    title: nbt('Name it'),
    inputs: list([{ key: nbt('name') }]),
  });

  assert.equal(describeDialog(dialog), 'Name it | 1 input field(s)');
});

test('nothing to describe produces nothing, so the store is not fed empty lines', () => {
  assert.equal(describeDialog(undefined), '');
  assert.equal(describeDialog(null), '');
  assert.equal(describeDialog(compound({})), '');
});

function holder(value: unknown): unknown {
  return { data: value };
}

test('the blob sits under data, the way show_dialog wraps it', () => {
  const dialog = holder(compound({ title: nbt('Notice'), body: list([{ contents: nbt('one line') }]) }));

  assert.equal(describeDialog(dialog), 'Notice | one line');
});

test('a single body line arrives as a bare compound, not a list of one', () => {
  const single = holder(compound({
    type: nbt('minecraft:notice'),
    title: nbt('Notice'),
    body: compound({ type: nbt('minecraft:plain_message'), contents: nbt('Cast from the bank only') }),
  }));

  assert.equal(describeDialog(single), 'Notice | Cast from the bank only');
});

test('a lone button is read the same way', () => {
  const dialog = holder(compound({
    title: nbt('Confirm'),
    actions: compound({ label: nbt('Got it') }),
  }));

  assert.equal(describeDialog(dialog), 'Confirm | buttons: Got it');
});
