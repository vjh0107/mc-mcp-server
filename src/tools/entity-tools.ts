import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Entity } from 'prismarine-entity';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';

function describeEntity(entity: Entity): string {
  const label = entity.username ?? entity.name ?? entity.type;
  const { x, y, z } = entity.position;
  return `${label} (${entity.type}) at (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})`;
}

export function registerEntityTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'find-entity',
    'Find nearby entities, optionally filtered by type or name.',
    {
      ...botArg,
      type: z.string().optional()
        .describe('"player", "mob", or part of an entity name. Omit to match anything.'),
      maxDistance: z.coerce.number().finite().min(1).optional().describe('Search radius (default: 16)'),
      count: z.coerce.number().int().min(1).max(50).optional().describe('How many to return (default: 1)'),
    },
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const maxDistance = args.maxDistance ?? 16;
      const count = args.count ?? 1;
      const filter = args.type?.trim().toLowerCase() ?? '';

      const matches = Object.values(bot.entities)
        .filter((entity) => entity !== bot.entity)
        .filter((entity) => {
          if (filter === '') {
            return true;
          }
          if (filter === 'player' || filter === 'mob') {
            return entity.type === filter;
          }
          return (entity.name ?? '').includes(filter) || (entity.username ?? '').toLowerCase().includes(filter);
        })
        .map((entity) => ({ entity, distance: bot.entity.position.distanceTo(entity.position) }))
        .filter(({ distance }) => distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);

      if (matches.length === 0) {
        return `No ${args.type ?? 'entity'} within ${maxDistance} blocks.`;
      }

      const lines = matches.map(
        ({ entity, distance }) => `- ${describeEntity(entity)}, ${distance.toFixed(1)} blocks away`,
      );
      return `Found ${matches.length} entity/entities:\n${lines.join('\n')}`;
    },
  );
}
