import express from 'express';
import type { Express } from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { AppConfig } from '../config.ts';
import type { BotRegistry } from '../bot/registry.ts';
import { buildMcpServer } from '../mcp/build-server.ts';
import { describeError, log } from '../logger.ts';
import { registry as metricsRegistry } from '../metrics.ts';
import type { TokenReviewer } from '../k8s/token-review.ts';
import { callerOf, createAuthMiddleware } from './auth.ts';

const DRAIN_POLL_MS = 100;

export interface McpHttpApp {
  app: Express;
  startDraining: () => void;
  waitForIdle: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
}

export interface AppDependencies {
  reviewToken?: TokenReviewer;
}

export function createApp(
  botRegistry: BotRegistry,
  config: AppConfig,
  dependencies: AppDependencies = {},
): McpHttpApp {
  const handler = createMcpHandler(
    (ctx) => buildMcpServer(botRegistry, ctx.authInfo?.clientId),
  );
  const requireAuth = createAuthMiddleware({
    sharedToken: config.authToken,
    reviewToken: dependencies.reviewToken,
  });
  const serveMcp = toNodeHandler(handler, {
    onerror: (error) => log('error', 'mcp handler failed', { error: describeError(error) }),
  });

  const app = express();
  let draining = false;
  let inFlight = 0;

  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', (_req, res) => {
    if (draining) {
      res.status(503).json({ status: 'draining', inFlight });
      return;
    }
    res.json({ status: 'ok', bots: botRegistry.size });
  });

  app.get('/metrics', (_req, res) => {
    void metricsRegistry.metrics().then(
      (body) => res.type(metricsRegistry.contentType).send(body),
      (error) => {
        log('error', 'failed to collect metrics', { error: describeError(error) });
        res.status(500).end();
      },
    );
  });

  app.get('/debug/bots', requireAuth, (_req, res) => {
    res.json({ bots: botRegistry.list().map((session) => session.status()) });
  });

  app.all(config.mcpPath, requireAuth, async (req, res) => {
    inFlight += 1;
    try {
      await serveMcp(req, res);
    } finally {
      inFlight -= 1;
    }
  });

  app.get('/whoami', requireAuth, (req, res) => {
    res.json({ caller: callerOf(req)?.name ?? null });
  });

  return {
    app,
    startDraining: () => {
      draining = true;
    },
    waitForIdle: async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;

      while (inFlight > 0) {
        if (Date.now() >= deadline) {
          log('warn', 'gave up waiting for in-flight tool calls', { inFlight });
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
      }

      return true;
    },
    close: () => handler.close(),
  };
}
