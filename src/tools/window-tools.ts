import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Bot } from 'mineflayer';
import type { Window } from 'prismarine-windows';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { formatWindow, requireWindow, viewWindow } from '../minecraft/window.ts';

const MAX_PATTERN_LENGTH = 256;
const OPEN_TIMEOUT_MS = 10_000;

export function compileTitlePattern(source: string | undefined): RegExp | null {
  if (source === undefined) {
    return null;
  }

  try {
    return new RegExp(source);
  } catch (error) {
    throw new Error(`"${source}" is not a valid regular expression: ${(error as Error).message}`);
  }
}

export function titleMatches(title: string, pattern: RegExp | null): boolean {
  return pattern === null || pattern.test(title);
}

function nextMatchingWindow(bot: Bot, pattern: RegExp | null, timeoutMs: number): Promise<Window | null> {
  return new Promise((resolve) => {
    const done = (window: Window | null) => {
      clearTimeout(timer);
      bot.removeListener('windowOpen', onOpen);
      resolve(window);
    };

    const onOpen = (window: Window) => {
      if (titleMatches(viewWindow(window).title, pattern)) {
        done(window);
      }
    };

    const timer = setTimeout(() => done(null), timeoutMs);
    bot.on('windowOpen', onOpen);
  });
}

export function registerWindowTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'wait-for-window',
    'Wait until a GUI window opens and return its contents. Returns straight away if a matching window is already open.',
    {
      ...botArg,
      titlePattern: z.string().min(1).max(MAX_PATTERN_LENGTH).optional()
        .describe('JavaScript regular expression the window title must match (default: any window)'),
      timeoutMs: z.coerce.number().int().min(100).max(120_000).optional()
        .describe(`How long to wait (default: ${OPEN_TIMEOUT_MS})`),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const pattern = compileTitlePattern(args.titlePattern);
      const timeoutMs = args.timeoutMs ?? OPEN_TIMEOUT_MS;

      if (bot.currentWindow) {
        const open = viewWindow(bot.currentWindow);

        if (titleMatches(open.title, pattern)) {
          return formatWindow(open);
        }
      }

      const window = await nextMatchingWindow(bot, pattern, timeoutMs);

      if (!window) {
        const target = pattern === null ? 'No window' : `No window titled /${args.titlePattern}/`;
        return `${target} opened within ${timeoutMs}ms.`;
      }

      return formatWindow(viewWindow(window));
    },
  );

  registerTool(
    server,
    'read-window',
    'Read every filled slot of the GUI window the bot currently has open.',
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      return formatWindow(viewWindow(requireWindow(bot)));
    },
  );

  registerTool(
    server,
    'close-window',
    'Close the GUI window the bot currently has open.',
    botArg,
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const window = requireWindow(bot);
      const { title } = viewWindow(window);

      await bot.closeWindow(window);

      return `Closed window "${title}".`;
    },
  );
}
