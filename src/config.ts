import { hostname } from 'node:os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { LogLevel } from './logger.ts';

export interface AppConfig {
  transport: 'http' | 'stdio';
  bindHost: string;
  port: number;
  mcpPath: string;
  authToken: string | undefined;
  logLevel: LogLevel;
  instance: string;
  shutdown: {
    readinessGraceMs: number;
    drainTimeoutMs: number;
  };
  minecraft: {
    version: string | undefined;
    usernamePrefix: string;
  };
  bots: {
    max: number;
    idleTimeoutMs: number;
  };
  serviceAccountAuth: {
    enabled: boolean;
    allowed: string[];
  };
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envOptional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function envNumber(name: string, fallback: number): number {
  const value = envOptional(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got "${value}"`);
  }
  return parsed;
}

function envList(name: string): string[] {
  const value = envOptional(name);
  return value === undefined ? [] : value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = envOptional(name);
  if (value === undefined) {
    return fallback;
  }
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be "true" or "false", got "${value}"`);
  }
  return value === 'true';
}

function envLogLevel(name: string, fallback: LogLevel): LogLevel {
  const value = envOptional(name);
  if (value === undefined) {
    return fallback;
  }
  if (!LOG_LEVELS.includes(value as LogLevel)) {
    throw new Error(`${name} must be one of ${LOG_LEVELS.join(', ')}, got "${value}"`);
  }
  return value as LogLevel;
}

export function parseConfig(argv: readonly string[] = hideBin(process.argv)): AppConfig {
  const args = yargs(argv as string[])
    .scriptName('mc-mcp-server')
    .option('transport', {
      type: 'string',
      choices: ['http', 'stdio'] as const,
      default: envString('MCP_TRANSPORT', 'http') as 'http' | 'stdio',
      description: 'How MCP clients reach this server',
    })
    .option('bind-host', {
      type: 'string',
      default: envString('MCP_BIND_HOST', '0.0.0.0'),
      description: 'Address the HTTP server binds to',
    })
    .option('port', {
      type: 'number',
      default: envNumber('MCP_PORT', 3000),
      description: 'Port the HTTP server listens on',
    })
    .option('mcp-path', {
      type: 'string',
      default: envString('MCP_PATH', '/mcp'),
      description: 'Path the MCP endpoint is served at',
    })
    .option('auth-token', {
      type: 'string',
      default: envOptional('MCP_AUTH_TOKEN'),
      description: 'Shared secret required in the Authorization header',
    })
    .option('log-level', {
      type: 'string',
      choices: LOG_LEVELS,
      default: envLogLevel('MCP_LOG_LEVEL', 'info'),
      description: 'Lowest level written to stderr',
    })
    .option('mc-version', {
      type: 'string',
      default: envOptional('MC_VERSION'),
      description: 'Protocol version to force instead of auto-detecting',
    })
    .option('username-prefix', {
      type: 'string',
      default: envString('MC_USERNAME_PREFIX', 'mcp'),
      description: 'Prefix for generated bot usernames',
    })
    .option('instance', {
      type: 'string',
      default: envString('POD_NAME', ''),
      description: 'Name this process reports in logs and metrics (defaults to the pod name)',
    })
    .option('readiness-grace', {
      type: 'number',
      default: envNumber('SHUTDOWN_READINESS_GRACE_SECONDS', 5),
      description: 'Seconds to keep serving after SIGTERM so endpoints can drop this pod',
    })
    .option('drain-timeout', {
      type: 'number',
      default: envNumber('SHUTDOWN_DRAIN_TIMEOUT_SECONDS', 30),
      description: 'Seconds to wait for in-flight tool calls before quitting the bots anyway',
    })
    .option('sa-auth', {
      type: 'boolean',
      default: envBoolean('SA_AUTH_ENABLED', false),
      description: 'Accept Kubernetes service account tokens, checked with a TokenReview',
    })
    .option('allowed-service-accounts', {
      type: 'array',
      string: true,
      default: envList('SA_AUTH_ALLOWED'),
      description: 'Service accounts allowed in, as namespace:name. Empty means any authenticated one',
    })
    .option('max-bots', {
      type: 'number',
      default: envNumber('BOT_MAX', 8),
      description: 'How many bots may be connected at once',
    })
    .option('idle-timeout', {
      type: 'number',
      default: envNumber('BOT_IDLE_TIMEOUT_SECONDS', 1800),
      description: 'Seconds of inactivity before a bot leaves on its own (0 disables)',
    })
    .strict()
    .help()
    .alias('help', 'h')
    .parseSync();

  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    throw new Error(`--port must be a valid port number, got ${args.port}`);
  }
  if (!args.mcpPath.startsWith('/')) {
    throw new Error(`--mcp-path must start with "/", got "${args.mcpPath}"`);
  }
  if (!Number.isInteger(args.maxBots) || args.maxBots < 1) {
    throw new Error(`--max-bots must be a positive integer, got ${args.maxBots}`);
  }
  if (!Number.isFinite(args.idleTimeout) || args.idleTimeout < 0) {
    throw new Error(`--idle-timeout must be zero or a positive number, got ${args.idleTimeout}`);
  }
  for (const [flag, value] of [['--readiness-grace', args.readinessGrace], ['--drain-timeout', args.drainTimeout]] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${flag} must be zero or a positive number, got ${value}`);
    }
  }

  return {
    transport: args.transport,
    bindHost: args.bindHost,
    port: args.port,
    mcpPath: args.mcpPath,
    authToken: args.authToken,
    logLevel: args.logLevel,
    instance: args.instance === '' ? hostname() : args.instance,
    shutdown: {
      readinessGraceMs: args.readinessGrace * 1000,
      drainTimeoutMs: args.drainTimeout * 1000,
    },
    minecraft: {
      version: args.mcVersion,
      usernamePrefix: args.usernamePrefix,
    },
    bots: {
      max: args.maxBots,
      idleTimeoutMs: args.idleTimeout * 1000,
    },
    serviceAccountAuth: {
      enabled: args.saAuth,
      allowed: args.allowedServiceAccounts,
    },
  };
}
