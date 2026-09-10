import assert from 'node:assert/strict';
import test from 'node:test';
import { connectOverride, isClusterInternal } from '../src/minecraft/connect.ts';

test('cluster-internal names are recognised, public ones are left alone', () => {
  for (const host of [
    'proxy.games.svc',
    'proxy.games.svc.cluster.local',
    'proxy.games.svc.',
    'lobby-1.lobby.games.svc.cluster.local.',
  ]) {
    assert.equal(isClusterInternal(host), true, `${host} should be treated as in-cluster`);
  }

  for (const host of ['mc.hypixel.net', 'localhost', '127.0.0.1', 'play.example.com', 'svc.example.com']) {
    assert.equal(isClusterInternal(host), false, `${host} should keep the SRV lookup`);
  }
});

test('only in-cluster hosts get a connect override, so SRV still works elsewhere', () => {
  assert.equal(typeof connectOverride('proxy.games.svc', 25565).connect, 'function');
  assert.deepEqual(connectOverride('mc.hypixel.net', 25565), {});
});
