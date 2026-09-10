import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/server';
import type { BotRegistry } from '../bot/registry.ts';
import { registerBlockTools } from '../tools/block-tools.ts';
import { registerChatTools } from '../tools/chat-tools.ts';
import { registerCraftingTools } from '../tools/crafting-tools.ts';
import { registerEntityTools } from '../tools/entity-tools.ts';
import { registerFurnaceTools } from '../tools/furnace-tools.ts';
import { registerHudTools } from '../tools/hud-tools.ts';
import { registerInteractTools } from '../tools/interact-tools.ts';
import { registerInventoryTools } from '../tools/inventory-tools.ts';
import { registerMovementTools } from '../tools/movement-tools.ts';
import { registerProbeTools } from '../tools/probe-tools.ts';
import { registerServerTools } from '../tools/server-tools.ts';
import { registerSessionTools } from '../tools/session-tools.ts';
import { registerSlotTools } from '../tools/slot-tools.ts';
import { registerWindowTools } from '../tools/window-tools.ts';

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

export function buildMcpServer(registry: BotRegistry, caller?: string): McpServer {
  const server = new McpServer({ name: 'mc-mcp-server', version: pkg.version });

  registerProbeTools(server);
  registerSessionTools(server, registry, caller);
  registerServerTools(server, registry);
  registerMovementTools(server, registry);
  registerInventoryTools(server, registry);
  registerBlockTools(server, registry);
  registerEntityTools(server, registry);
  registerChatTools(server, registry);
  registerCraftingTools(server, registry);
  registerFurnaceTools(server, registry);
  registerHudTools(server, registry);
  registerInteractTools(server, registry);
  registerWindowTools(server, registry);
  registerSlotTools(server, registry);

  return server;
}
