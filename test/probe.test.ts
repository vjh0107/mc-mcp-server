import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenMotd, looksLikeProxy, probeServer } from '../src/minecraft/probe.ts';

test('a chat component MOTD is flattened and stripped of colour codes', () => {
  assert.equal(flattenMotd('A Velocity Server'), 'A Velocity Server');
  assert.equal(flattenMotd('§aGreen §lBold'), 'Green Bold');
  assert.equal(
    flattenMotd({ text: 'Test', extra: [{ text: 'Server' }, { text: ' §cdev' }] }),
    'TestServer dev',
  );
  assert.equal(flattenMotd({ text: '   ' }), null);
  assert.equal(flattenMotd(undefined), null);
});

test('proxy software is recognised from the version string', () => {
  assert.equal(looksLikeProxy('Velocity 1.7.2-26.2'), true);
  assert.equal(looksLikeProxy('BungeeCord 1.8.x-1.21.x'), true);
  assert.equal(looksLikeProxy('Paper 1.21.11'), false);
  assert.equal(looksLikeProxy(null), false);
});

test('an unreachable address comes back as a result, not a throw', async () => {
  const result = await probeServer('127.0.0.1', 1, 500);

  assert.equal(result.reachable, false);
  assert.equal(result.version, null);
  assert.ok(result.error);
});
