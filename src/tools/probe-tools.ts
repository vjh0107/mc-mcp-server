import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { looksLikeProxy, probeServer } from '../minecraft/probe.ts';
import { registerTool } from '../mcp/tool-helpers.ts';

export function describeProbe(host: string, port: number, result: Awaited<ReturnType<typeof probeServer>>): string {
  if (!result.reachable) {
    return `${host}:${port} did not answer a server list ping: ${result.error}`;
  }

  const players = result.playersOnline === null
    ? 'players unknown'
    : `${result.playersOnline}/${result.playersMax ?? '?'} players`;

  const role = looksLikeProxy(result.version) ? ', looks like a proxy' : '';

  return `${host}:${port} answered as ${result.version ?? 'unknown'} ` +
    `(protocol ${result.protocol ?? '?'}${role}), ${players}, ${result.latencyMs ?? '?'}ms` +
    `${result.motd === null ? '' : `\n  motd: ${result.motd}`}`;
}

export function registerProbeTools(server: McpServer): void {
  registerTool(
    server,
    'ping-server',
    'Send a Minecraft server list ping and report version, protocol, player count and MOTD. ' +
    'Use it to check a server is up and speaks a version we can join before spending a bot slot.',
    {
      host: z.string().min(1).describe('Server host'),
      port: z.coerce.number().int().min(1).max(65535).optional().describe('Server port (default: 25565)'),
      timeoutMs: z.coerce.number().int().min(200).max(30_000).optional()
        .describe('How long to wait for the answer (default: 3000)'),
    },
    async (args) => {
      const port = args.port ?? 25565;
      return describeProbe(args.host, port, await probeServer(args.host, port, args.timeoutMs));
    },
  );
}
