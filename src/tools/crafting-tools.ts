import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Recipe } from 'prismarine-recipe';
import minecraftData from 'minecraft-data';
import type { IndexedData } from 'minecraft-data';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { walkTo } from '../minecraft/navigate.ts';

const TABLE_SEARCH_RADIUS = 16;
const TABLE_REACH = 3;
const MAX_LISTED_RECIPES = 100;

interface Ingredient {
  name: string;
  count: number;
}

function itemName(mcData: IndexedData, id: number): string {
  return mcData.items[id]?.name ?? `item#${id}`;
}

function resolveItem(mcData: IndexedData, query: string): { id: number; name: string } {
  const needle = query.trim().toLowerCase();
  const exact = mcData.itemsByName[needle];

  if (exact) {
    return { id: exact.id, name: exact.name };
  }

  const partial = Object.values(mcData.itemsByName).find((item) => item.name.includes(needle));

  if (!partial) {
    throw new Error(`No item name matches "${query}"`);
  }

  return { id: partial.id, name: partial.name };
}

function ingredientsOf(mcData: IndexedData, recipe: Recipe): Ingredient[] {
  const counts = new Map<number, number>();

  for (const entry of recipe.delta) {
    if (entry.count >= 0) {
      continue;
    }
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + Math.abs(entry.count));
  }

  return [...counts].map(([id, count]) => ({ name: itemName(mcData, id), count }));
}

function missingFor(bot: Bot, mcData: IndexedData, recipe: Recipe): Ingredient[] {
  const held = new Map<string, number>();
  for (const item of bot.inventory.items()) {
    held.set(item.name, (held.get(item.name) ?? 0) + item.count);
  }

  return ingredientsOf(mcData, recipe)
    .map(({ name, count }) => ({ name, count: count - (held.get(name) ?? 0) }))
    .filter(({ count }) => count > 0);
}

function describeRecipe(mcData: IndexedData, recipe: Recipe, missing: Ingredient[]): string {
  const ingredients = ingredientsOf(mcData, recipe)
    .map(({ name, count }) => `${name} x${count}`)
    .join(', ');

  const status = missing.length === 0
    ? 'craftable'
    : `missing ${missing.map(({ name, count }) => `${name} x${count}`).join(', ')}`;

  const table = recipe.requiresTable ? ', needs a crafting table' : '';

  return `${itemName(mcData, recipe.result.id)} x${recipe.result.count} <- ${ingredients} [${status}${table}]`;
}

async function reachableCraftingTable(bot: Bot, mcData: IndexedData): Promise<Block | null> {
  const tableId = mcData.blocksByName.crafting_table?.id;

  if (tableId === undefined) {
    return null;
  }

  const table = bot.findBlock({ matching: tableId, maxDistance: TABLE_SEARCH_RADIUS });

  if (!table) {
    return null;
  }

  if (bot.entity.position.distanceTo(table.position) > TABLE_REACH) {
    await walkTo(bot, table.position, 2);
  }

  return table;
}

export function registerCraftingTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'list-recipes',
    'List recipes the bot can craft right now with what it carries. ' +
    'Pass outputItem to inspect one item instead of scanning everything.',
    {
      ...botArg,
      outputItem: z.string().min(1).optional().describe('Restrict the list to this item'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const mcData = minecraftData(bot.version);
      const table = await reachableCraftingTable(bot, mcData);

      if (args.outputItem !== undefined) {
        const item = resolveItem(mcData, args.outputItem);
        const recipes = bot.recipesAll(item.id, null, table);

        if (recipes.length === 0) {
          return `No recipe produces ${item.name}.`;
        }

        const lines = recipes.map((recipe) => `- ${describeRecipe(mcData, recipe, missingFor(bot, mcData, recipe))}`);
        return `Recipes for ${item.name}:\n${lines.join('\n')}`;
      }

      const craftable: string[] = [];

      for (const item of mcData.itemsArray) {
        if (craftable.length >= MAX_LISTED_RECIPES) {
          break;
        }
        const recipes = bot.recipesFor(item.id, null, 1, table);
        if (recipes.length > 0 && recipes[0]) {
          craftable.push(`- ${describeRecipe(mcData, recipes[0], [])}`);
        }
      }

      if (craftable.length === 0) {
        return 'Nothing in the inventory is enough for any recipe.';
      }

      const suffix = craftable.length >= MAX_LISTED_RECIPES
        ? `\n(stopped at ${MAX_LISTED_RECIPES} entries)`
        : '';

      return `Craftable right now${table ? ' (a crafting table is in reach)' : ' (no crafting table in reach)'}:\n` +
        `${craftable.join('\n')}${suffix}`;
    },
  );

  registerTool(
    server,
    'get-recipe',
    'Show every recipe for an item together with what the bot still needs.',
    {
      ...botArg,
      itemName: z.string().min(1).describe('Item to look up'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const mcData = minecraftData(bot.version);
      const item = resolveItem(mcData, args.itemName);
      const table = await reachableCraftingTable(bot, mcData);
      const recipes = bot.recipesAll(item.id, null, table);

      if (recipes.length === 0) {
        return `No recipe produces ${item.name}.`;
      }

      const lines = recipes
        .map((recipe) => ({ recipe, missing: missingFor(bot, mcData, recipe) }))
        .sort((a, b) => a.missing.length - b.missing.length)
        .map(({ recipe, missing }) => `- ${describeRecipe(mcData, recipe, missing)}`);

      return `Recipes for ${item.name}:\n${lines.join('\n')}`;
    },
  );

  registerTool(
    server,
    'can-craft',
    'Check whether the bot can craft an item right now.',
    {
      ...botArg,
      itemName: z.string().min(1).describe('Item to check'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const mcData = minecraftData(bot.version);
      const item = resolveItem(mcData, args.itemName);
      const table = await reachableCraftingTable(bot, mcData);

      if (bot.recipesFor(item.id, null, 1, table).length > 0) {
        return `Yes, ${item.name} can be crafted now.`;
      }

      const recipes = bot.recipesAll(item.id, null, table);

      if (recipes.length === 0) {
        return `No recipe produces ${item.name}.`;
      }

      const closest = recipes
        .map((recipe) => ({ recipe, missing: missingFor(bot, mcData, recipe) }))
        .sort((a, b) => a.missing.length - b.missing.length)[0];

      if (!closest) {
        return `No recipe produces ${item.name}.`;
      }

      const needsTable = closest.recipe.requiresTable && !table;
      const reasons = [
        ...closest.missing.map(({ name, count }) => `${name} x${count}`),
        ...(needsTable ? ['a crafting table in reach'] : []),
      ];

      return `No. ${item.name} still needs: ${reasons.join(', ')}.`;
    },
  );

  registerTool(
    server,
    'craft-item',
    'Craft an item, walking to a nearby crafting table when the recipe needs one.',
    {
      ...botArg,
      outputItem: z.string().min(1).describe('Item to craft'),
      amount: z.coerce.number().int().min(1).max(64).optional().describe('How many times to craft (default: 1)'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const mcData = minecraftData(bot.version);
      const item = resolveItem(mcData, args.outputItem);
      const amount = args.amount ?? 1;
      const table = await reachableCraftingTable(bot, mcData);
      const recipe = bot.recipesFor(item.id, null, amount, table)[0]
        ?? bot.recipesFor(item.id, null, 1, table)[0];

      if (!recipe) {
        const known = bot.recipesAll(item.id, null, table);

        if (known.length === 0) {
          throw new Error(`No recipe produces ${item.name}`);
        }

        const closest = known
          .map((candidate) => ({ candidate, missing: missingFor(bot, mcData, candidate) }))
          .sort((a, b) => a.missing.length - b.missing.length)[0];

        const missing = closest?.missing.map(({ name, count }) => `${name} x${count}`).join(', ');
        throw new Error(
          `Cannot craft ${item.name}. Missing ${missing ?? 'ingredients'}` +
          `${closest?.candidate.requiresTable && !table ? ' and a crafting table in reach' : ''}`,
        );
      }

      await bot.craft(recipe, amount, table ?? undefined);
      return `Crafted ${item.name} x${recipe.result.count * amount}.`;
    },
  );
}
