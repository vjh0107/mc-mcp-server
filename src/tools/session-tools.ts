import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BotRegistry } from '../bot/registry.ts';
import type { BotStatus } from '../bot/bot-session.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';

function formatStatus(status: BotStatus): string {
  const position = status.position
    ? `(${status.position.x}, ${status.position.y}, ${status.position.z})`
    : 'unknown';

  const lines = [
    `bot: ${status.name}`,
    `state: ${status.state}`,
    `username: ${status.username}`,
    `address: ${status.address}`,
    `version: ${status.version ?? 'unknown'}`,
    `position: ${position}`,
    `health: ${status.health ?? 'unknown'} / food: ${status.food ?? 'unknown'}`,
    `gameMode: ${status.gameMode ?? 'unknown'} / dimension: ${status.dimension ?? 'unknown'}`,
    `joinedAt: ${status.joinedAt}`,
    `lastUsedAt: ${status.lastUsedAt}`,
  ];

  if (status.owner) {
    lines.push(`owner: ${status.owner}`);
  }
  if (status.lastError) {
    lines.push(`lastError: ${status.lastError}`);
  }

  return lines.join('\n');
}

export function registerSessionTools(server: McpServer, registry: BotRegistry, caller?: string): void {
  registerTool(
    server,
    'join-server',
    'Connect a new bot to a Minecraft server and keep it online until leave-server is called. ' +
    'The bot survives MCP session restarts, so reuse it instead of joining again.',
    {
      name: z.string().describe('Name used to address this bot in other tools'),
      host: z.string().min(1).describe('Server host or Kubernetes service name to connect to'),
      port: z.coerce.number().int().min(1).max(65535).optional()
        .describe('Server port (default: 25565)'),
      username: z.string().optional().describe('In-game username (default: derived from name)'),
      version: z.string().optional().describe('Force a protocol version instead of auto-detecting'),
      owner: z.string().optional()
        .describe('Free-form label recording who asked for this bot. Defaults to the authenticated caller.'),
    },
    async (args) => {
      const session = await registry.join({ ...args, owner: args.owner ?? caller });
      return `Joined as "${session.spec.username}".\n\n${formatStatus(session.status())}`;
    },
  );

  registerTool(
    server,
    'leave-server',
    'Disconnect a bot and forget it.',
    botArg,
    (args) => {
      const session = resolveSession(registry, args.bot);
      registry.leave(session.name);
      return `Bot "${session.name}" left the server.`;
    },
  );

  registerTool(
    server,
    'list-bots',
    'List every bot this server currently holds, including bots joined by other agents.',
    {},
    () => {
      const sessions = registry.list();

      if (sessions.length === 0) {
        return 'No bots are connected. Call join-server to add one.';
      }

      return sessions
        .map((session) => formatStatus(session.status()))
        .join('\n\n');
    },
  );

  registerTool(
    server,
    'get-bot-status',
    'Report connection state, position and health for one bot.',
    botArg,
    (args) => formatStatus(resolveSession(registry, args.bot).status()),
  );
}
