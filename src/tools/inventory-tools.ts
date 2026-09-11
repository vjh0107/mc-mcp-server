import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { EquipmentDestination } from 'mineflayer';
import loadItem from 'prismarine-item';
import type { Item } from 'prismarine-item';
import type { IndexedData } from 'minecraft-data';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';

/*
prismarine-item ships an ESM declaration over a CommonJS module: the runtime export is the loader
itself, while the types read as a namespace. The cast states what the module actually is.
*/
type ItemLoader = (registry: IndexedData) => new (type: number, count: number) => Item;

const loadItemForVersion = loadItem as unknown as ItemLoader;

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

  registerTool(
    server,
    'give-item',
    'Put an item straight into the inventory. Creative mode only, which is what makes it useful: ' +
    'a test can start from the state it needs instead of gathering its way there.',
    {
      ...botArg,
      itemName: z.string().min(1).describe('Exact item name, for example diamond_pickaxe'),
      count: z.coerce.number().int().min(1).max(64).optional().describe('How many (default: 1)'),
      slot: z.coerce.number().int().min(0).max(44).optional()
        .describe('Inventory slot to fill (default: the first empty one)'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();

      if (bot.game.gameMode !== 'creative') {
        throw new Error(`The bot is in ${bot.game.gameMode} mode; give-item needs creative.`);
      }

      const kind = bot.registry.itemsByName[args.itemName];

      if (!kind) {
        throw new Error(`"${args.itemName}" is not an item in this version.`);
      }

      const slot = args.slot ?? bot.inventory.firstEmptyInventorySlot();

      if (slot === null || slot === undefined) {
        throw new Error('The inventory is full and no slot was given.');
      }

      const count = args.count ?? 1;
      const ItemForVersion = loadItemForVersion(bot.registry);
      await bot.creative.setInventorySlot(slot, new ItemForVersion(kind.id, count));

      return `Put ${count} ${args.itemName} in slot ${slot}.`;
    },
  );
}
