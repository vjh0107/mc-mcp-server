import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Furnace } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, coordinateArgs, floorCoordinates, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { walkTo } from '../minecraft/navigate.ts';

const FURNACE_BLOCKS = new Set(['furnace', 'blast_furnace', 'smoker']);
const FURNACE_REACH = 3;
const DEFAULT_SMELT_TIMEOUT_MS = 60_000;

function waitForOutput(furnace: Furnace, timeoutMs: number): Promise<Item | null> {
  const existing = furnace.outputItem();

  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const finish = (item: Item | null) => {
      clearTimeout(timer);
      furnace.removeListener('update', onUpdate);
      resolve(item);
    };

    const onUpdate = () => {
      const output = furnace.outputItem();
      if (output) {
        finish(output);
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    furnace.on('update', onUpdate);
  });
}

export function registerFurnaceTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'smelt-item',
    'Load a furnace, blast furnace or smoker with fuel and input, then optionally wait for the output.',
    {
      ...botArg,
      ...coordinateArgs,
      inputItem: z.string().min(1).describe('Item to smelt'),
      inputCount: z.coerce.number().int().min(1).optional().describe('How much input to load (default: 1)'),
      fuelItem: z.string().min(1).describe('Item to burn as fuel'),
      fuelCount: z.coerce.number().int().min(1).optional().describe('How much fuel to load (default: 1)'),
      takeOutput: z.boolean().optional().describe('Wait for the result and collect it (default: true)'),
      timeoutMs: z.coerce.number().int().min(1_000).max(600_000).optional()
        .describe(`How long to wait for the result (default: ${DEFAULT_SMELT_TIMEOUT_MS})`),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);
      const position = new Vec3(target.x, target.y, target.z);
      const block = bot.blockAt(position);

      if (!block || !FURNACE_BLOCKS.has(block.name)) {
        throw new Error(
          `(${target.x}, ${target.y}, ${target.z}) holds ${block?.name ?? 'nothing loaded'}, not a furnace`,
        );
      }

      if (bot.entity.position.distanceTo(position) > FURNACE_REACH) {
        await walkTo(bot, target, 2);
      }

      const items = bot.inventory.items();
      const input = items.find((item) => item.name.includes(args.inputItem.trim().toLowerCase()));
      const fuel = items.find((item) => item.name.includes(args.fuelItem.trim().toLowerCase()));

      if (!input) {
        throw new Error(`No inventory item matches input "${args.inputItem}"`);
      }
      if (!fuel) {
        throw new Error(`No inventory item matches fuel "${args.fuelItem}"`);
      }

      const inputCount = Math.min(args.inputCount ?? 1, input.count);
      const fuelCount = Math.min(args.fuelCount ?? 1, fuel.count);
      const furnace = await bot.openFurnace(block);

      try {
        const loadedInput = furnace.inputItem();
        if (loadedInput && loadedInput.name !== input.name) {
          throw new Error(`The input slot already holds ${loadedInput.name}`);
        }

        const loadedFuel = furnace.fuelItem();
        if (loadedFuel && loadedFuel.name !== fuel.name) {
          throw new Error(`The fuel slot already holds ${loadedFuel.name}`);
        }

        await furnace.putFuel(fuel.type, fuel.metadata ?? null, fuelCount);
        await furnace.putInput(input.type, input.metadata ?? null, inputCount);

        if (args.takeOutput === false) {
          return `Loaded ${inputCount} ${input.name} and ${fuelCount} ${fuel.name}, left it burning.`;
        }

        const timeoutMs = args.timeoutMs ?? DEFAULT_SMELT_TIMEOUT_MS;
        const output = await waitForOutput(furnace, timeoutMs);

        if (!output) {
          return `Loaded ${inputCount} ${input.name} and ${fuelCount} ${fuel.name}, ` +
            `but nothing came out within ${timeoutMs}ms.`;
        }

        const taken = await furnace.takeOutput();
        return `Smelted ${taken.count} ${taken.name}.`;
      } finally {
        furnace.close();
      }
    },
  );
}
