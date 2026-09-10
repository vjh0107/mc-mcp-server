import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreTracker } from '../src/minecraft/scoreboard.ts';

interface Listener { (packet: unknown): void }

function fakeClient(): { client: { on: (e: string, l: (p: never) => void) => unknown }; emit: (e: string, p: unknown) => void } {
  const listeners = new Map<string, Listener>();
  return {
    client: { on: (event, listener) => listeners.set(event, listener as unknown as Listener) },
    emit: (event, packet) => listeners.get(event)?.(packet),
  };
}

test('a score packet without an action field still lands, which mineflayer drops', () => {
  const tracker = new ScoreTracker();
  const { client, emit } = fakeClient();
  tracker.attach(client);

  emit('scoreboard_score', { itemName: 'Coins', scoreName: 'stats', value: 1250 });
  emit('scoreboard_score', { itemName: 'Level', scoreName: 'stats', value: 7 });

  assert.deepEqual(tracker.entriesFor('stats'), [
    { name: 'Coins', score: 1250 },
    { name: 'Level', score: 7 },
  ]);
});

test('a display name in NBT form replaces the raw entry name', () => {
  const tracker = new ScoreTracker();
  const { client, emit } = fakeClient();
  tracker.attach(client);

  emit('scoreboard_score', {
    itemName: 'Coins',
    scoreName: 'stats',
    value: 5,
    display_name: { type: 'compound', value: { text: { type: 'string', value: 'Gold Coins' } } },
  });

  assert.deepEqual(tracker.entriesFor('stats'), [{ name: 'Gold Coins', score: 5 }]);
});

test('reset_score removes one entry, or the entry everywhere when no objective is named', () => {
  const tracker = new ScoreTracker();
  const { client, emit } = fakeClient();
  tracker.attach(client);

  emit('scoreboard_score', { itemName: 'Coins', scoreName: 'stats', value: 1 });
  emit('scoreboard_score', { itemName: 'Coins', scoreName: 'other', value: 2 });
  emit('scoreboard_score', { itemName: 'Level', scoreName: 'stats', value: 3 });

  emit('reset_score', { entity_name: 'Coins', objective_name: 'stats' });
  assert.deepEqual(tracker.entriesFor('stats').map((e) => e.name), ['Level']);
  assert.deepEqual(tracker.entriesFor('other').map((e) => e.name), ['Coins']);

  emit('reset_score', { entity_name: 'Coins', objective_name: null });
  assert.deepEqual(tracker.entriesFor('other'), []);
});

test('removing an objective drops everything scored under it', () => {
  const tracker = new ScoreTracker();
  const { client, emit } = fakeClient();
  tracker.attach(client);

  emit('scoreboard_score', { itemName: 'Coins', scoreName: 'stats', value: 1 });
  emit('scoreboard_objective', { name: 'stats', action: 1 });

  assert.deepEqual(tracker.entriesFor('stats'), []);
});

test('a malformed packet is ignored rather than stored', () => {
  const tracker = new ScoreTracker();
  const { client, emit } = fakeClient();
  tracker.attach(client);

  emit('scoreboard_score', { scoreName: 'stats', value: 1 });
  emit('scoreboard_score', { itemName: 'Coins', value: 1 });
  emit('reset_score', {});

  assert.deepEqual(tracker.entriesFor('stats'), []);
});
