import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageStore } from '../src/bot/message-store.ts';

test('recent returns the newest lines within the requested count', () => {
  const store = new MessageStore();

  for (let index = 0; index < 5; index += 1) {
    store.add('system', `line ${index}`);
  }

  assert.deepEqual(store.recent(2).map((message) => message.text), ['line 3', 'line 4']);
  assert.equal(store.recent(0).length, 0);
  assert.equal(store.recent(100).length, 5);
});

test('the buffer stops growing once it is full', () => {
  const store = new MessageStore();

  for (let index = 0; index < store.capacity + 50; index += 1) {
    store.add('system', `line ${index}`);
  }

  const kept = store.recent(store.capacity);
  assert.equal(kept.length, store.capacity);
  assert.equal(kept[kept.length - 1]?.text, `line ${store.capacity + 49}`);
});

test('waitFor resolves with the first matching message only', async () => {
  const store = new MessageStore();
  const waiting = store.waitFor((message) => message.text.includes('quest'), 1_000);

  store.add('system', 'nothing to see');
  store.add('chat', 'your quest is ready');
  store.add('chat', 'your quest is ready again');

  const matched = await waiting;

  assert.equal(matched?.text, 'your quest is ready');
  assert.equal(matched?.source, 'chat');
});

test('waitFor gives up after the timeout', async () => {
  const store = new MessageStore();

  assert.equal(await store.waitFor(() => false, 20), null);
});

test('waitFor ignores messages that arrived before the call', async () => {
  const store = new MessageStore();

  store.add('chat', 'already here');

  assert.equal(await store.waitFor((message) => message.text === 'already here', 20), null);
});

test('abandonWaiters releases everyone waiting when the bot goes away', async () => {
  const store = new MessageStore();
  const waiting = [
    store.waitFor(() => false, 60_000),
    store.waitFor(() => false, 60_000),
  ];

  store.abandonWaiters();

  assert.deepEqual(await Promise.all(waiting), [null, null]);
});

test('a resolved waiter is not fed later messages', async () => {
  const store = new MessageStore();
  const waiting = store.waitFor(() => true, 1_000);

  store.add('chat', 'first');
  await waiting;
  store.add('chat', 'second');

  assert.equal((await waiting)?.text, 'first');
});

test('addDistinct collapses the repeat an action bar sends every tick', () => {
  const store = new MessageStore();

  store.addDistinct('actionbar', 'Mana 40/40');
  store.addDistinct('actionbar', 'Mana 40/40');
  store.addDistinct('actionbar', 'Mana 40/40');
  store.addDistinct('actionbar', 'Mana 30/40');
  store.addDistinct('actionbar', 'Mana 40/40');

  assert.deepEqual(store.recent(10).map((line) => [line.text, line.repeats]), [
    ['Mana 40/40', 3],
    ['Mana 30/40', 1],
    ['Mana 40/40', 1],
  ]);
});

test('a collapsed repeat still moves the timestamp, so "is it still showing" stays answerable', async () => {
  const store = new MessageStore();

  store.addDistinct('actionbar', 'Mana 40/40');
  const first = store.recent(1)[0]!;

  await new Promise((resolve) => setTimeout(resolve, 5));
  store.addDistinct('actionbar', 'Mana 40/40');
  const latest = store.recent(1)[0]!;

  assert.equal(latest.firstSeen, first.firstSeen);
  assert.ok(latest.timestamp > first.firstSeen, 'the last sighting must be newer than the first');
});

test('a dropped repeat never reaches a waiter, which is why callers check the latest line first', async () => {
  const store = new MessageStore();
  store.addDistinct('actionbar', 'Quest complete');

  const waiting = store.waitFor((line) => line.text === 'Quest complete', 30);
  store.addDistinct('actionbar', 'Quest complete');

  assert.equal(await waiting, null);
  assert.equal(store.recent(1)[0]?.text, 'Quest complete');
});
