import assert from 'node:assert/strict';
import test from 'node:test';
import type { EntityLike } from '../src/tools/interact-tools.ts';
import { entityLabel, findNearestEntity, matchesEntityName } from '../src/tools/interact-tools.ts';

function entity(name: string, x: number, extra: Partial<EntityLike> = {}): EntityLike {
  return { name, type: 'mob', position: { x, y: 0, z: 0 }, ...extra };
}

const origin = { x: 0, y: 0, z: 0 };

test('a fragment of either the entity name or the player name counts as a match', () => {
  const villager = entity('villager', 0);
  const player = entity('player', 0, { username: 'Notch' });

  assert.equal(matchesEntityName(villager, 'villa'), true);
  assert.equal(matchesEntityName(villager, 'VILLAGER'), true);
  assert.equal(matchesEntityName(villager, ' villager '), true);
  assert.equal(matchesEntityName(villager, 'zombie'), false);
  assert.equal(matchesEntityName(player, 'notc'), true);
  assert.equal(matchesEntityName(player, '   '), false);
});

test('the nearest match wins even when a farther one comes first in the list', () => {
  const far = entity('villager', 9);
  const near = entity('villager', 3);
  const search = findNearestEntity([far, near], { origin, query: 'villager', maxDistance: 16 });

  assert.equal(search.match?.entity, near);
  assert.equal(search.match?.distance, 3);
  assert.deepEqual(search.nearby.map(({ entity: found }) => found), [near, far]);
});

test('the bot itself never matches its own search', () => {
  const self = entity('player', 0, { username: 'Bot' });
  const other = entity('player', 5, { username: 'Botanist' });
  const search = findNearestEntity([self, other], { origin, query: 'bot', maxDistance: 16, self });

  assert.equal(search.match?.entity, other);
  assert.equal(search.nearby.length, 1);
});

test('entities past the search radius are left out of the match and out of the report', () => {
  const outOfRange = entity('villager', 20);
  const search = findNearestEntity([outOfRange], { origin, query: 'villager', maxDistance: 8 });

  assert.equal(search.match, null);
  assert.deepEqual(search.nearby, []);
});

test('a failed search still reports what was in range, ordered by distance', () => {
  const cow = entity('cow', 6);
  const zombie = entity('zombie', 2);
  const search = findNearestEntity([cow, zombie], { origin, query: 'villager', maxDistance: 8 });

  assert.equal(search.match, null);
  assert.deepEqual(search.nearby.map(({ entity: found }) => entityLabel(found)), ['zombie', 'cow']);
});

test('a player is labelled by username and everything else by its entity name', () => {
  assert.equal(entityLabel(entity('player', 0, { username: 'Steve' })), 'Steve');
  assert.equal(entityLabel(entity('villager', 0)), 'villager');
  assert.equal(entityLabel({ type: 'object', position: origin }), 'object');
});
