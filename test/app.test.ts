import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/http/app.ts';
import type { McpHttpApp } from '../src/http/app.ts';
import { BotRegistry } from '../src/bot/registry.ts';
import type { AppConfig } from '../src/config.ts';

const config: AppConfig = {
  transport: 'http',
  bindHost: '127.0.0.1',
  port: 0,
  mcpPath: '/mcp',
  authToken: 'secret',
  logLevel: 'error',
  instance: 'test',
  shutdown: { readinessGraceMs: 0, drainTimeoutMs: 1_000 },
  minecraft: { version: undefined, usernamePrefix: 'mcp' },
  bots: { max: 2, idleTimeoutMs: 0 },
  serviceAccountAuth: { enabled: false, allowed: [] },
};

async function withServer(
  run: (base: string, app: McpHttpApp) => Promise<void>,
): Promise<void> {
  const botRegistry = new BotRegistry({
    defaults: { version: undefined, usernamePrefix: 'mcp' },
    limits: config.bots,
    connect: async () => {
      throw new Error('the tests never connect a real bot');
    },
  });

  const app = createApp(botRegistry, config);
  const server = app.app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`, app);
  } finally {
    server.close();
    await app.close();
  }
}

test('readiness flips to 503 as soon as draining starts', async () => {
  await withServer(async (base, app) => {
    const before = await fetch(`${base}/readyz`);
    assert.equal(before.status, 200);

    app.startDraining();

    const after = await fetch(`${base}/readyz`);
    assert.equal(after.status, 503);
    assert.equal(((await after.json()) as { status: string }).status, 'draining');

    const liveness = await fetch(`${base}/healthz`);
    assert.equal(liveness.status, 200, 'liveness must stay green while draining');
  });
});

test('waitForIdle returns at once when nothing is in flight', async () => {
  await withServer(async (_base, app) => {
    const started = Date.now();
    assert.equal(await app.waitForIdle(5_000), true);
    assert.ok(Date.now() - started < 1_000);
  });
});

test('metrics are served without a token and carry our own series', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /mcmcp_bots\b/);
    assert.match(body, /mcmcp_tool_calls_total/);
    assert.match(body, /process_cpu_seconds_total/);
  });
});

test('the MCP endpoint and the bot dump stay behind the token', async () => {
  await withServer(async (base) => {
    for (const path of ['/mcp', '/debug/bots']) {
      const denied = await fetch(`${base}${path}`);
      assert.equal(denied.status, 401, `${path} must require the token`);
    }

    const allowed = await fetch(`${base}/debug/bots`, {
      headers: { authorization: 'Bearer secret' },
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { bots: [] });
  });
});
