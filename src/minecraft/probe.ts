import mc from 'minecraft-protocol';
import { describeError } from '../logger.ts';
import { connectOverride } from './connect.ts';

const DEFAULT_TIMEOUT_MS = 3_000;

export interface ProbeResult {
  reachable: boolean;
  version: string | null;
  protocol: number | null;
  playersOnline: number | null;
  playersMax: number | null;
  motd: string | null;
  latencyMs: number | null;
  error: string | null;
}

interface ChatComponent {
  text?: string;
  extra?: ChatComponent[];
}

interface PingResponse {
  version?: { name?: string; protocol?: number };
  players?: { online?: number; max?: number };
  description?: string | ChatComponent;
  latency?: number;
}

function rawText(description: string | ChatComponent): string {
  if (typeof description === 'string') {
    return description;
  }
  return [description.text ?? '', ...(description.extra ?? []).map(rawText)].join('');
}

export function flattenMotd(description: string | ChatComponent | undefined): string | null {
  if (description === undefined) {
    return null;
  }

  const cleaned = rawText(description)
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned === '' ? null : cleaned;
}

export function looksLikeProxy(version: string | null): boolean {
  return version !== null && /velocity|bungee|waterfall|gate/i.test(version);
}

export async function probeServer(
  host: string,
  port: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult> {
  const empty: ProbeResult = {
    reachable: false,
    version: null,
    protocol: null,
    playersOnline: null,
    playersMax: null,
    motd: null,
    latencyMs: null,
    error: null,
  };

  try {
    const response = await mc.ping({
      host,
      port,
      closeTimeout: timeoutMs,
      noPongTimeout: Math.min(timeoutMs, 1_000),
      ...connectOverride(host, port),
    }) as PingResponse;

    return {
      reachable: true,
      version: response.version?.name ?? null,
      protocol: response.version?.protocol ?? null,
      playersOnline: response.players?.online ?? null,
      playersMax: response.players?.max ?? null,
      motd: flattenMotd(response.description),
      latencyMs: response.latency ?? null,
      error: null,
    };
  } catch (error) {
    return { ...empty, error: describeError(error) };
  }
}
