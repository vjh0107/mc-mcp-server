import assert from 'node:assert/strict';
import test from 'node:test';
import { viewBossBar, viewPlayerList, viewScoreboard } from '../src/tools/hud-tools.ts';

const nbtString = (value: string) => ({ type: 'string', value });

test('scoreboard entries come back highest score first however the server ordered them', () => {
  const view = viewScoreboard({
    title: 'Stats',
    items: [
      { name: 'Deaths', value: 3 },
      { name: 'Coins', value: 1200 },
      { name: 'Level', value: 42 },
    ],
  });

  assert.deepEqual(view.entries, [
    { name: 'Coins', score: 1200 },
    { name: 'Level', score: 42 },
    { name: 'Deaths', score: 3 },
  ]);
});

test('entries tied on score keep a stable order instead of shuffling between reads', () => {
  const items = [
    { name: 'Zeta', value: 5 },
    { name: 'Alpha', value: 5 },
    { name: 'Mu', value: 5 },
  ];

  assert.deepEqual(
    viewScoreboard({ items }).entries.map((entry) => entry.name),
    ['Alpha', 'Mu', 'Zeta'],
  );
  assert.deepEqual(
    viewScoreboard({ items: [...items].reverse() }).entries.map((entry) => entry.name),
    ['Alpha', 'Mu', 'Zeta'],
  );
});

test('the NBT shape the server sends for the title and for entries is unwrapped', () => {
  const view = viewScoreboard({
    title: {
      type: 'compound',
      value: { color: nbtString('gold'), text: nbtString('§6Server  Stats') },
    },
    items: [
      {
        name: 'coins',
        value: 1200,
        displayName: { type: 'compound', value: { text: nbtString('Coins earned') } },
      },
      {
        name: 'level',
        value: 42,
        displayName: { text: '', extra: [{ text: '§a[VIP] ' }, { text: 'Level' }] },
      },
    ],
  });

  assert.equal(view.title, 'Server Stats');
  assert.deepEqual(view.entries, [
    { name: 'Coins earned', score: 1200 },
    { name: '[VIP] Level', score: 42 },
  ]);
});

test('an entry without a usable display name falls back to its raw name', () => {
  const view = viewScoreboard({
    items: [
      { name: '§bBalance', value: 10 },
      { name: 'Rank', value: 9, displayName: '' },
      { name: 'Kills', value: 8, displayName: '{"text":"Total kills"}' },
    ],
  });

  assert.deepEqual(view.entries, [
    { name: 'Balance', score: 10 },
    { name: 'Rank', score: 9 },
    { name: 'Total kills', score: 8 },
  ]);
});

test('a boss bar title arrives as NBT and its health becomes a progress fraction', () => {
  assert.deepEqual(
    viewBossBar({
      title: { type: 'compound', value: { text: nbtString('§5Wither') } },
      health: 0.735,
      color: 'purple',
      dividers: 10,
    }),
    { title: 'Wither', progress: 0.735, color: 'purple', dividers: 10 },
  );
});

test('a boss bar the server has not fully described still reads', () => {
  assert.deepEqual(
    viewBossBar({ health: 1 }),
    { title: '', progress: 1, color: 'unknown', dividers: 0 },
  );
});

test('the player list is sorted by name and marks the bot itself', () => {
  const players = viewPlayerList(
    {
      zoe: { username: 'zoe', gamemode: 1, ping: 40 },
      HyperBot: { username: 'HyperBot', gamemode: 0, ping: 12 },
      adam: { username: 'adam', gamemode: 3, ping: 210 },
    },
    'HyperBot',
  );

  assert.deepEqual(players, [
    { name: 'adam', gameMode: 'spectator', ping: 210, self: false },
    { name: 'HyperBot', gameMode: 'survival', ping: 12, self: true },
    { name: 'zoe', gameMode: 'creative', ping: 40, self: false },
  ]);
});

test('a player the server has not described yet does not break the list', () => {
  assert.deepEqual(
    viewPlayerList({ ghost: { username: 'ghost' }, odd: { username: 'odd', gamemode: 9, ping: 5 } }, 'me'),
    [
      { name: 'ghost', gameMode: 'unknown', ping: null, self: false },
      { name: 'odd', gameMode: 'unknown', ping: 5, self: false },
    ],
  );
});

test('a tracked score list survives NBT display names and sorts by score', () => {
  const board = {
    title: { type: 'compound', value: { text: { type: 'string', value: 'Player Stats' } } },
    items: [
      { name: 'Level', value: 7 },
      { name: 'Coins', value: 1250, displayName: { type: 'string', value: 'Gold Coins' } },
    ],
  };

  const view = viewScoreboard(board);

  assert.equal(view.title, 'Player Stats');
  assert.deepEqual(view.entries, [
    { name: 'Gold Coins', score: 1250 },
    { name: 'Level', score: 7 },
  ]);
});
