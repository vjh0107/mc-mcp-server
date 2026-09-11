import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { Vec3 } from 'vec3';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, coordinateArgs, floorCoordinates, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { DEFAULT_WALK_TIMEOUT_MS, walkTo } from '../minecraft/navigate.ts';

const FLIGHT_TIMEOUT_MS = 20_000;
const JUMP_HOLD_MS = 250;

export function registerMovementTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'get-position',
    'Report the block position the bot currently stands on.',
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const { x, y, z } = bot.entity.position;
      return `Position: (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})`;
    },
  );

  registerTool(
    server,
    'move-to-position',
    'Walk the bot to a position using pathfinding.',
    {
      ...botArg,
      ...coordinateArgs,
      range: z.coerce.number().finite().min(0).optional().describe('How close to get (default: 1)'),
      timeoutMs: z.coerce.number().int().min(50).optional()
        .describe(`Give up after this long (default: ${DEFAULT_WALK_TIMEOUT_MS})`),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);
      const range = args.range ?? 1;
      const timeoutMs = args.timeoutMs ?? DEFAULT_WALK_TIMEOUT_MS;

      await walkTo(bot, target, range, timeoutMs);

      return `Moved to within ${range} block(s) of (${target.x}, ${target.y}, ${target.z}).`;
    },
  );

  registerTool(
    server,
    'look-at',
    'Turn the bot to face a position.',
    { ...botArg, ...coordinateArgs },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);
      await bot.lookAt(new Vec3(target.x, target.y, target.z), true);
      return `Looking at (${target.x}, ${target.y}, ${target.z}).`;
    },
  );

  registerTool(
    server,
    'jump',
    'Make the bot jump once.',
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), JUMP_HOLD_MS);
      return 'Jumped.';
    },
  );

  registerTool(
    server,
    'move-in-direction',
    'Hold a movement key for a while. Use this when pathfinding is not wanted.',
    {
      ...botArg,
      direction: z.enum(['forward', 'back', 'left', 'right']).describe('Direction to move'),
      durationMs: z.coerce.number().int().min(1).max(30_000).optional()
        .describe('How long to hold the key (default: 1000)'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const durationMs = args.durationMs ?? 1000;

      bot.setControlState(args.direction, true);
      try {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
      } finally {
        bot.setControlState(args.direction, false);
      }

      return `Moved ${args.direction} for ${durationMs}ms.`;
    },
  );

  registerTool(
    server,
    'fly-to',
    'Fly straight to a position. Requires creative mode.',
    { ...botArg, ...coordinateArgs },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);

      if (bot.game.gameMode !== 'creative') {
        throw new Error(`fly-to needs creative mode, but the bot is in ${bot.game.gameMode}`);
      }

      const flight = bot.creative.flyTo(new Vec3(target.x, target.y, target.z));
      let timer: ReturnType<typeof setTimeout> | undefined;

      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`flight timed out after ${FLIGHT_TIMEOUT_MS}ms, the destination may be unreachable`)),
          FLIGHT_TIMEOUT_MS,
        );
      });

      try {
        await Promise.race([flight, timeout]);
        return `Flew to (${target.x}, ${target.y}, ${target.z}).`;
      } finally {
        clearTimeout(timer);
        bot.creative.stopFlying();
        flight.catch(() => undefined);
      }
    },
  );

  registerTool(
    server,
    'set-stance',
    'Hold the bot crouching or sprinting. Both stay on until turned off, so a plugin that only ' +
    'reacts to a crouching player can be reached. Nothing else here changes the stance.',
    {
      ...botArg,
      sneak: z.boolean().optional().describe('Crouch, or stand up again'),
      sprint: z.boolean().optional().describe('Sprint, or stop sprinting'),
    },
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();

      if (args.sneak === undefined && args.sprint === undefined) {
        return `sneaking: ${bot.getControlState('sneak')}, sprinting: ${bot.getControlState('sprint')}`;
      }

      if (args.sneak !== undefined) {
        bot.setControlState('sneak', args.sneak);
      }

      if (args.sprint !== undefined) {
        bot.setControlState('sprint', args.sprint);
      }

      return `sneaking: ${bot.getControlState('sneak')}, sprinting: ${bot.getControlState('sprint')}`;
    },
  );
}
