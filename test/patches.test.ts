import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptResourcePacks } from '../src/bot/patches.ts';
import type { ResourcePackClient } from '../src/bot/patches.ts';

function fakeClient(): {
  client: ResourcePackClient;
  writes: [string, unknown][];
  emit: (data: { uuid: string }) => void;
} {
  const writes: [string, unknown][] = [];
  let listener: ((data: { uuid: string }) => void) | undefined;

  const client: ResourcePackClient = {
    on: (_event, handler) => {
      listener = handler;
      return client;
    },
    write: (name, params) => {
      writes.push([name, params]);
    },
  };

  return {
    client,
    writes,
    emit: (data) => {
      assert.ok(listener, 'no add_resource_pack listener was registered');
      listener(data);
    },
  };
}

test('a resource pack offer is answered as accepted then loaded', () => {
  const { client, writes, emit } = fakeClient();

  acceptResourcePacks(client, 'probe');
  emit({ uuid: 'f34a0914-0988-37e0-9077-ba0b67ac3cf2' });

  assert.deepEqual(writes, [
    ['resource_pack_receive', { uuid: 'f34a0914-0988-37e0-9077-ba0b67ac3cf2', result: 3 }],
    ['resource_pack_receive', { uuid: 'f34a0914-0988-37e0-9077-ba0b67ac3cf2', result: 0 }],
  ]);
});

test('the uuid is echoed as the string the server sent, not re-encoded', () => {
  const { client, writes, emit } = fakeClient();

  acceptResourcePacks(client, 'probe');
  emit({ uuid: '00000000-0000-0000-0000-000000000001' });

  for (const [, params] of writes) {
    const { uuid } = params as { uuid: unknown };
    assert.equal(typeof uuid, 'string');
    assert.equal(uuid, '00000000-0000-0000-0000-000000000001');
  }
});

test('every offer is answered, so a second pack does not stall configuration', () => {
  const { client, writes, emit } = fakeClient();

  acceptResourcePacks(client, 'probe');
  emit({ uuid: 'pack-one' });
  emit({ uuid: 'pack-two' });

  assert.deepEqual(writes.map(([, params]) => (params as { uuid: string }).uuid), [
    'pack-one',
    'pack-one',
    'pack-two',
    'pack-two',
  ]);
});
