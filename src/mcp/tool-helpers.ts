import * as z from 'zod';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { BotRegistry } from '../bot/registry.ts';
import type { BotSession } from '../bot/bot-session.ts';
import { describeError, log } from '../logger.ts';
import { toolCalls, toolDuration } from '../metrics.ts';

export const botArg = {
  bot: z
    .string()
    .optional()
    .describe('Bot name given to join-server. Optional while exactly one bot is connected.'),
};

export const coordinateArgs = {
  x: z.coerce.number().describe('X coordinate'),
  y: z.coerce.number().describe('Y coordinate'),
  z: z.coerce.number().describe('Z coordinate'),
};

export function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

export function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
}

export function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Shape,
  run: (args: z.infer<z.ZodObject<Shape>>) => Promise<string> | string,
): void {
  server.registerTool(
    name,
    { description, inputSchema: z.object(shape) },
    async (args): Promise<CallToolResult> => {
      const stop = toolDuration.startTimer({ tool: name });

      try {
        const result = text(await run(args as z.infer<z.ZodObject<Shape>>));
        toolCalls.inc({ tool: name, outcome: 'ok' });
        return result;
      } catch (error) {
        toolCalls.inc({ tool: name, outcome: 'error' });
        log('debug', 'tool failed', {
          tool: name,
          stack: error instanceof Error ? error.stack : describeError(error),
        });
        return failure(describeError(error));
      } finally {
        stop();
      }
    },
  );
}

export function resolveSession(registry: BotRegistry, name: string | undefined): BotSession {
  return registry.resolve(name);
}

export function floorCoordinates(x: number, y: number, z: number): { x: number; y: number; z: number } {
  for (const [label, value] of [['x', x], ['y', y], ['z', z]] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Coordinate ${label} must be a finite number, got ${value}`);
    }
  }
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}
