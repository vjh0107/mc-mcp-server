import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import type { BotState } from './bot/bot-session.ts';

const BOT_STATES: readonly BotState[] = ['connecting', 'ready', 'disconnected'];

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const toolCalls = new Counter({
  name: 'mcmcp_tool_calls_total',
  help: 'MCP tool calls, split by how they ended',
  labelNames: ['tool', 'outcome'],
  registers: [registry],
});

export const toolDuration = new Histogram({
  name: 'mcmcp_tool_call_duration_seconds',
  help: 'How long MCP tool calls take',
  labelNames: ['tool'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300],
  registers: [registry],
});

export const botJoins = new Counter({
  name: 'mcmcp_bot_joins_total',
  help: 'join-server attempts, split by whether the bot reached spawn',
  labelNames: ['outcome'],
  registers: [registry],
});

export const botDisconnects = new Counter({
  name: 'mcmcp_bot_disconnects_total',
  help: 'Bots removed from the registry, split by why',
  labelNames: ['reason'],
  registers: [registry],
});

export const botKicks = new Counter({
  name: 'mcmcp_bot_kicks_total',
  help: 'Times the server kicked one of our bots',
  registers: [registry],
});

let countBots: ((state: BotState) => number) | null = null;

new Gauge({
  name: 'mcmcp_bots',
  help: 'Bots this process holds, split by connection state',
  labelNames: ['state'],
  registers: [registry],
  collect() {
    if (!countBots) {
      return;
    }
    for (const state of BOT_STATES) {
      this.set({ state }, countBots(state));
    }
  },
});

const buildInfo = new Gauge({
  name: 'mcmcp_build_info',
  help: 'Always 1, labelled with the running version and instance',
  labelNames: ['version', 'instance'],
  registers: [registry],
});

export function trackBots(count: (state: BotState) => number): void {
  countBots = count;
}

export function setBuildInfo(version: string, instance: string): void {
  buildInfo.reset();
  buildInfo.set({ version, instance }, 1);
}
