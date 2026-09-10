import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfig } from '../src/config.ts';

const MANAGED_ENV = [
  'MCP_TRANSPORT',
  'MCP_BIND_HOST',
  'MCP_PORT',
  'MCP_PATH',
  'MCP_AUTH_TOKEN',
  'MCP_LOG_LEVEL',
  'MC_VERSION',
  'MC_USERNAME_PREFIX',
  'BOT_MAX',
  'BOT_IDLE_TIMEOUT_SECONDS',
] as const;

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const saved = new Map(MANAGED_ENV.map((name) => [name, process.env[name]]));

  for (const name of MANAGED_ENV) {
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[name] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test('the defaults are usable without any configuration', () => {
  const config = withEnv({}, () => parseConfig([]));

  assert.equal(config.transport, 'http');
  assert.equal(config.port, 3000);
  assert.equal(config.mcpPath, '/mcp');
  assert.equal(config.authToken, undefined);
  assert.equal(config.minecraft.usernamePrefix, 'mcp');
  assert.equal(config.bots.max, 8);
  assert.equal(config.bots.idleTimeoutMs, 1_800_000);
});

test('environment variables configure the server', () => {
  const config = withEnv(
    {
      MCP_PORT: '8080',
      MCP_AUTH_TOKEN: 'from-env',
      MC_VERSION: '26.1',
      MC_USERNAME_PREFIX: 'agent',
      BOT_IDLE_TIMEOUT_SECONDS: '90',
    },
    () => parseConfig([]),
  );

  assert.equal(config.port, 8080);
  assert.equal(config.authToken, 'from-env');
  assert.equal(config.minecraft.version, '26.1');
  assert.equal(config.minecraft.usernamePrefix, 'agent');
  assert.equal(config.bots.idleTimeoutMs, 90_000);
});

test('command line arguments win over the environment', () => {
  const config = withEnv(
    { MCP_PORT: '8080', MCP_AUTH_TOKEN: 'from-env', MC_VERSION: '26.1' },
    () => parseConfig(['--port', '9090', '--auth-token', 'from-cli', '--mc-version', '1.21.9']),
  );

  assert.equal(config.port, 9090);
  assert.equal(config.authToken, 'from-cli');
  assert.equal(config.minecraft.version, '1.21.9');
});

test('an empty environment variable is treated as unset', () => {
  const config = withEnv({ MCP_AUTH_TOKEN: '', MC_VERSION: '' }, () => parseConfig([]));

  assert.equal(config.authToken, undefined);
  assert.equal(config.minecraft.version, undefined);
});

test('values that would fail later are rejected at startup', () => {
  assert.throws(() => withEnv({}, () => parseConfig(['--port', '70000'])), /valid port/);
  assert.throws(() => withEnv({}, () => parseConfig(['--mcp-path', 'mcp'])), /must start with/);
  assert.throws(() => withEnv({}, () => parseConfig(['--max-bots', '0'])), /positive integer/);
  assert.throws(() => withEnv({ MCP_PORT: 'abc' }, () => parseConfig([])), /must be a number/);
  assert.throws(() => withEnv({ MCP_LOG_LEVEL: 'chatty' }, () => parseConfig([])), /must be one of/);
});

test('idle reaping can be switched off with zero', () => {
  const config = withEnv({ BOT_IDLE_TIMEOUT_SECONDS: '0' }, () => parseConfig([]));

  assert.equal(config.bots.idleTimeoutMs, 0);
});
