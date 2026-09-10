import assert from 'node:assert/strict';
import test from 'node:test';
import { BotRegistry, buildUsername } from '../src/bot/registry.ts';
import type { BotConnector, RegistryOptions } from '../src/bot/registry.ts';
import type { BotSession, BotSpec } from '../src/bot/bot-session.ts';

interface FakeSession {
  spec: BotSpec;
  name: string;
  lastUsedAt: number;
  quitReasons: string[];
}

function fakeConnector(): { connect: BotConnector; sessions: FakeSession[] } {
  const sessions: FakeSession[] = [];

  const connect: BotConnector = async (spec) => {
    const session: FakeSession = {
      spec,
      name: spec.name,
      lastUsedAt: Date.now(),
      quitReasons: [],
    };
    Object.assign(session, {
      quit: (reason: string) => session.quitReasons.push(reason),
    });
    sessions.push(session);
    return session as unknown as BotSession;
  };

  return { connect, sessions };
}

function makeRegistry(overrides: Partial<RegistryOptions> = {}): {
  registry: BotRegistry;
  sessions: FakeSession[];
} {
  const { connect, sessions } = fakeConnector();
  const registry = new BotRegistry({
    defaults: { version: undefined, usernamePrefix: 'mcp' },
    limits: { max: 2, idleTimeoutMs: 60_000 },
    connect,
    ...overrides,
  });
  return { registry, sessions };
}

test('join rejects a name that is already taken', async () => {
  const { registry } = makeRegistry();

  await registry.join({ name: 'alpha', host: 'mc.test' });

  await assert.rejects(
    () => registry.join({ name: 'alpha', host: 'mc.test' }),
    /already exists/,
  );
  assert.equal(registry.size, 1);
});

test('join rejects invalid names before touching the network', async () => {
  const { registry, sessions } = makeRegistry();

  await assert.rejects(() => registry.join({ name: 'has space', host: 'mc.test' }), /invalid/);
  await assert.rejects(() => registry.join({ name: '', host: 'mc.test' }), /invalid/);
  assert.equal(sessions.length, 0);
});

test('join refuses to exceed the bot limit', async () => {
  const { registry } = makeRegistry();

  await registry.join({ name: 'alpha', host: 'mc.test' });
  await registry.join({ name: 'beta', host: 'mc.test' });

  await assert.rejects(() => registry.join({ name: 'gamma', host: 'mc.test' }), /limit reached/);
});

test('join counts in-flight connections against the limit', async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const { registry } = makeRegistry({
    limits: { max: 1, idleTimeoutMs: 0 },
    connect: async (spec) => {
      await gate;
      return { spec, name: spec.name, lastUsedAt: Date.now(), quit: () => undefined } as unknown as BotSession;
    },
  });

  const first = registry.join({ name: 'alpha', host: 'mc.test' });

  await assert.rejects(() => registry.join({ name: 'beta', host: 'mc.test' }), /limit reached/);

  release?.();
  await first;
  assert.equal(registry.size, 1);
});

test('a failed connection does not leave the name reserved', async () => {
  let attempts = 0;
  const { registry } = makeRegistry({
    connect: async (spec) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('kicked before spawn');
      }
      return { spec, name: spec.name, lastUsedAt: Date.now(), quit: () => undefined } as unknown as BotSession;
    },
  });

  await assert.rejects(() => registry.join({ name: 'alpha', host: 'mc.test' }), /kicked before spawn/);
  await registry.join({ name: 'alpha', host: 'mc.test' });

  assert.equal(registry.size, 1);
});

test('resolve reports what is available instead of guessing', async () => {
  const { registry } = makeRegistry();

  assert.throws(() => registry.resolve(), /No bots are connected/);

  await registry.join({ name: 'alpha', host: 'mc.test' });
  assert.equal(registry.resolve().name, 'alpha');
  assert.equal(registry.resolve('alpha').name, 'alpha');
  assert.throws(() => registry.resolve('beta'), /No bot named "beta".*alpha/s);

  await registry.join({ name: 'beta', host: 'mc.test' });
  assert.throws(() => registry.resolve(), /"bot" is required.*alpha, beta/s);
});

test('leave forgets the bot and tells it why', async () => {
  const { registry, sessions } = makeRegistry();

  await registry.join({ name: 'alpha', host: 'mc.test' });

  assert.equal(registry.leave('alpha'), true);
  assert.equal(registry.leave('alpha'), false);
  assert.equal(registry.size, 0);
  assert.deepEqual(sessions[0]?.quitReasons, ['left on request']);
});

test('sweepIdle only reaps bots past the idle window', async () => {
  const { registry, sessions } = makeRegistry({ limits: { max: 4, idleTimeoutMs: 1_000 } });

  await registry.join({ name: 'stale', host: 'mc.test' });
  await registry.join({ name: 'fresh', host: 'mc.test' });

  const now = Date.now();
  sessions[0]!.lastUsedAt = now - 5_000;
  sessions[1]!.lastUsedAt = now;

  assert.deepEqual(registry.sweepIdle(now), ['stale']);
  assert.deepEqual(registry.list().map((session) => session.name), ['fresh']);
  assert.deepEqual(sessions[0]?.quitReasons, ['idle timeout']);
});

test('sweepIdle does nothing when the idle timeout is disabled', async () => {
  const { registry, sessions } = makeRegistry({ limits: { max: 4, idleTimeoutMs: 0 } });

  await registry.join({ name: 'alpha', host: 'mc.test' });
  sessions[0]!.lastUsedAt = 0;

  assert.deepEqual(registry.sweepIdle(), []);
  assert.equal(registry.size, 1);
});

test('generated usernames stay inside the Minecraft limit', () => {
  assert.equal(buildUsername('mcp', 'probe'), 'mcp_probe');
  assert.equal(buildUsername('mcp', 'a-very-long-bot-name').length, 16);
  assert.equal(buildUsername('mcp', 'dash-name'), 'mcp_dash_name');
});

test('the request carries the server, and only the port has a default', async () => {
  const { registry, sessions } = makeRegistry();

  await registry.join({ name: 'alpha', host: 'mc.test' });
  await registry.join({ name: 'beta', host: 'other.test', port: 25566, username: 'Custom' });

  assert.deepEqual(
    sessions.map((session) => [session.spec.host, session.spec.port, session.spec.username]),
    [
      ['mc.test', 25565, 'mcp_alpha'],
      ['other.test', 25566, 'Custom'],
    ],
  );
});
