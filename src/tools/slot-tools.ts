import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { Vec3 } from 'vec3';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, coordinateArgs, floorCoordinates, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { walkTo } from '../minecraft/navigate.ts';
import { formatWindow, readLabel, requireWindow, viewWindow } from '../minecraft/window.ts';

const CLICK_BUTTONS = ['left', 'right'] as const;

const CONTAINER_BLOCKS = new Set([
  'chest',
  'trapped_chest',
  'ender_chest',
  'barrel',
  'hopper',
  'dispenser',
  'dropper',
  'shulker_box',
]);

const CONTAINER_REACH = 3;
const CURSOR_SLOT = -999;

export type ClickButton = (typeof CLICK_BUTTONS)[number];

export interface ClickPlan {
  mouseButton: number;
  mode: number;
}

export function planClick(button: ClickButton, shift: boolean): ClickPlan {
  return { mouseButton: button === 'right' ? 1 : 0, mode: shift ? 1 : 0 };
}

export function assertSlotInWindow(slot: number, slotCount: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount) {
    throw new Error(`Slot ${slot} is outside the window, whose slots run 0-${slotCount - 1}`);
  }
}

export function isContainerBlock(name: string): boolean {
  return CONTAINER_BLOCKS.has(name) || name.endsWith('_shulker_box');
}

export function registerSlotTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'click-slot',
    'Click one slot of the window that is currently open.',
    {
      ...botArg,
      slot: z.coerce.number().int().describe('Slot number as listed by the window contents'),
      button: z.enum(CLICK_BUTTONS).optional().describe("Which mouse button to press (default: 'left')"),
      shift: z.boolean().optional()
        .describe('Shift-click, which moves the whole stack across the window (default: false)'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const window = requireWindow(bot);

      assertSlotInWindow(args.slot, window.slots.length);

      const button = args.button ?? 'left';
      const shift = args.shift ?? false;
      const before = window.slots[args.slot];
      const { mouseButton, mode } = planClick(button, shift);

      await bot.clickWindow(args.slot, mouseButton, mode);

      const held = before
        ? `held ${readLabel(before) ?? before.name} x${before.count}`
        : 'was empty';

      return `${shift ? 'Shift-' : ''}${button}-clicked slot ${args.slot}, which ${held}.`;
    },
  );

  registerTool(
    server,
    'open-container',
    'Open the chest-like block at a position, walking to it first when out of reach, and list what it holds.',
    { ...botArg, ...coordinateArgs },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);
      const position = new Vec3(target.x, target.y, target.z);
      const block = bot.blockAt(position);

      if (!block || !isContainerBlock(block.name)) {
        throw new Error(
          `(${target.x}, ${target.y}, ${target.z}) holds ${block?.name ?? 'nothing loaded'}, not a container`,
        );
      }

      if (bot.entity.position.distanceTo(position) > CONTAINER_REACH) {
        await walkTo(bot, target, 2);
      }

      await bot.openContainer(block);

      return formatWindow(viewWindow(requireWindow(bot)));
    },
  );

  registerTool(
    server,
    'drop-held-item',
    'Drop whatever the cursor is holding, or the stack in a given slot. The window stays open.',
    {
      ...botArg,
      slot: z.coerce.number().int().optional()
        .describe('Slot to empty onto the ground. Omit it to drop what the cursor holds.'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const window = bot.currentWindow ?? bot.inventory;

      if (args.slot === undefined) {
        const cursor = window.selectedItem;

        if (!cursor) {
          return 'The cursor is empty, so there was nothing to drop.';
        }

        await bot.clickWindow(CURSOR_SLOT, 0, 0);
        return `Dropped ${cursor.name} x${cursor.count} from the cursor.`;
      }

      assertSlotInWindow(args.slot, window.slots.length);

      const item = window.slots[args.slot];

      if (!item) {
        return `Slot ${args.slot} is empty, so there was nothing to drop.`;
      }

      await bot.clickWindow(args.slot, 0, 0);
      await bot.clickWindow(CURSOR_SLOT, 0, 0);

      return `Dropped ${readLabel(item) ?? item.name} x${item.count} from slot ${args.slot}.`;
    },
  );
}
