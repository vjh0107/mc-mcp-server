#!/usr/bin/env node
import { createRequire } from 'node:module';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseConfig } from './config.ts';
import type { AppConfig } from './config.ts';
import { BotRegistry } from './bot/registry.ts';
import { createApp } from './http/app.ts';
import { buildMcpServer } from './mcp/build-server.ts';
import { describeError, log, setLogLevel } from './logger.ts';
import { setBuildInfo } from './metrics.ts';
import { createInClusterClient, inClusterBaseUrl } from './k8s/client.ts';
import type { KubernetesClient } from './k8s/client.ts';
import { createTokenReviewer } from './k8s/token-review.ts';
import type { AppDependencies } from './http/app.ts';

const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

function createRegistry(config: AppConfig): BotRegistry {
  return new BotRegistry({
    defaults: {
      version: config.minecraft.version,
      usernamePrefix: config.minecraft.usernamePrefix,
    },
    limits: config.bots,
  });
}

function createApiClient(config: AppConfig): KubernetesClient | undefined {
  if (!config.serviceAccountAuth.enabled) {
    return undefined;
  }

  const baseUrl = inClusterBaseUrl();

  if (baseUrl === null) {
    throw new Error(
      'service account auth is on, but this process is not running in a cluster ' +
      '(KUBERNETES_SERVICE_HOST is unset)',
    );
  }

  return createInClusterClient(baseUrl);
}

function createDependencies(config: AppConfig): AppDependencies {
  const client = createApiClient(config);

  if (!client) {
    return {};
  }

  const dependencies: AppDependencies = {};

  if (config.serviceAccountAuth.enabled) {
    log('info', 'service account auth enabled', {
      allowed: config.serviceAccountAuth.allowed.length === 0
        ? 'any authenticated service account'
        : config.serviceAccountAuth.allowed,
    });
    dependencies.reviewToken = createTokenReviewer(client, config.serviceAccountAuth.allowed);
  }

  return dependencies;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function serveHttp(config: AppConfig): Promise<void> {
  const registry = createRegistry(config);
  const { app, startDraining, waitForIdle, close } = createApp(registry, config, createDependencies(config));

  const server = app.listen(config.port, config.bindHost, () => {
    log('info', 'listening', {
      instance: config.instance,
      address: `${config.bindHost}:${config.port}`,
      mcpPath: config.mcpPath,
      auth: [
        config.authToken === undefined ? null : 'shared-token',
        config.serviceAccountAuth.enabled ? 'service-account' : null,
      ].filter(Boolean).join('+') || 'disabled',
      maxBots: config.bots.max,
    });
  });

  if (config.authToken === undefined && !config.serviceAccountAuth.enabled) {
    log('warn', 'no authentication configured, every caller that reaches this port can drive the bots');
  }

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    log('info', 'draining', { signal, readinessGraceMs: config.shutdown.readinessGraceMs });
    startDraining();

    await delay(config.shutdown.readinessGraceMs);
    server.close();

    const drained = await waitForIdle(config.shutdown.drainTimeoutMs);
    log('info', 'stopping bots', { drained });

    registry.shutdown();
    await close();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

function serveOverStdio(config: AppConfig): void {
  const registry = createRegistry(config);
  serveStdio(() => buildMcpServer(registry));

  process.once('SIGTERM', () => {
    registry.shutdown();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const config = parseConfig();
  setLogLevel(config.logLevel);
  setBuildInfo(pkg.version, config.instance);

  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandled rejection', { error: describeError(reason) });
  });

  if (config.transport === 'stdio') {
    serveOverStdio(config);
    return;
  }

  await serveHttp(config);
}

main().catch((error) => {
  log('error', 'failed to start', { error: describeError(error) });
  process.exit(1);
});
