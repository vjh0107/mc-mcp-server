import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { EquipmentDestination } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';

const EQUIPMENT_DESTINATIONS = ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'] as const;

function findItem(items: Item[], query: string): Item | undefined {
  const needle = query.trim().toLowerCase();
  return items.find((item) => item.name === needle)
    ?? items.find((item) => item.name.includes(needle));
}

export function registerInventoryTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'list-inventory',
    "List every item in the bot's inventory with slot numbers.",
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const items = bot.inventory.items();

      if (items.length === 0) {
        return 'Inventory is empty.';
      }

      const lines = items.map((item) => `- ${item.name} x${item.count} (slot ${item.slot})`);
      return `${items.length} item stack(s):\n${lines.join('\n')}`;
    },
  );

  registerTool(
    server,
    'find-item',
    "Look for an item in the bot's inventory by exact or partial name.",
    {
      ...botArg,
      nameOrType: z.string().min(1).describe('Item name or a fragment of it'),
    },
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const item = findItem(bot.inventory.items(), args.nameOrType);

      return item
        ? `Found ${item.name} x${item.count} in slot ${item.slot}.`
        : `No inventory item matches "${args.nameOrType}".`;
    },
  );

  registerTool(
    server,
    'equip-item',
    'Equip an item from the inventory.',
    {
      ...botArg,
      itemName: z.string().min(1).describe('Item name or a fragment of it'),
      destination: z.enum(EQUIPMENT_DESTINATIONS).optional()
        .describe("Where to equip it (default: 'hand')"),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const item = findItem(bot.inventory.items(), args.itemName);

      if (!item) {
        throw new Error(`No inventory item matches "${args.itemName}"`);
      }

      const destination = (args.destination ?? 'hand') as EquipmentDestination;
      await bot.equip(item, destination);
      return `Equipped ${item.name} to ${destination}.`;
    },
  );
}
