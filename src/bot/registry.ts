import { log } from '../logger.ts';
import { botDisconnects, botJoins, trackBots } from '../metrics.ts';
import { BotSession } from './bot-session.ts';
import type { BotSpec } from './bot-session.ts';

const BOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const MINECRAFT_USERNAME_LIMIT = 16;
const DEFAULT_MINECRAFT_PORT = 25565;
const SPAWN_TIMEOUT_MS = 60_000;
const IDLE_SWEEP_INTERVAL_MS = 30_000;

export interface RegistryDefaults {
  version: string | undefined;
  usernamePrefix: string;
}

export interface RegistryLimits {
  max: number;
  idleTimeoutMs: number;
}

export type BotConnector = (spec: BotSpec, spawnTimeoutMs: number) => Promise<BotSession>;

export interface RegistryOptions {
  defaults: RegistryDefaults;
  limits: RegistryLimits;
  spawnTimeoutMs?: number;
  connect?: BotConnector;
}

export interface JoinRequest {
  name: string;
  host: string;
  port?: number | undefined;
  username?: string | undefined;
  version?: string | undefined;
  owner?: string | undefined;
}

export function buildUsername(prefix: string, botName: string): string {
  const sanitized = `${prefix}_${botName}`.replace(/[^A-Za-z0-9_]/g, '_');
  return sanitized.slice(0, MINECRAFT_USERNAME_LIMIT);
}

export class BotRegistry {
  private readonly sessions = new Map<string, BotSession>();
  private readonly joining = new Set<string>();
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  private readonly defaults: RegistryDefaults;
  private readonly limits: RegistryLimits;
  private readonly spawnTimeoutMs: number;
  private readonly connect: BotConnector;

  constructor(options: RegistryOptions) {
    const { defaults, limits } = options;

    this.defaults = defaults;
    this.limits = limits;
    this.spawnTimeoutMs = options.spawnTimeoutMs ?? SPAWN_TIMEOUT_MS;
    this.connect = options.connect ?? ((spec, timeoutMs) => BotSession.connect(spec, timeoutMs));
    this.sweepTimer = limits.idleTimeoutMs > 0
      ? setInterval(() => this.sweepIdle(), IDLE_SWEEP_INTERVAL_MS)
      : null;
    this.sweepTimer?.unref();

    trackBots((state) => this.list().filter((session) => session.currentState === state).length);
  }

  list(): BotSession[] {
    return [...this.sessions.values()];
  }

  get size(): number {
    return this.sessions.size;
  }

  async join(request: JoinRequest): Promise<BotSession> {
    if (!BOT_NAME_PATTERN.test(request.name)) {
      throw new Error(
        `Bot name "${request.name}" is invalid. Use 1 to 32 characters of letters, digits, "-" or "_".`,
      );
    }
    if (this.sessions.has(request.name) || this.joining.has(request.name)) {
      throw new Error(`Bot "${request.name}" already exists. Pick another name or leave-server first.`);
    }
    if (this.sessions.size + this.joining.size >= this.limits.max) {
      throw new Error(
        `Bot limit reached (${this.limits.max}). Use leave-server on a bot you no longer need.`,
      );
    }

    const spec: BotSpec = {
      name: request.name,
      host: request.host,
      port: request.port ?? DEFAULT_MINECRAFT_PORT,
      username: request.username ?? buildUsername(this.defaults.usernamePrefix, request.name),
      version: request.version ?? this.defaults.version,
      owner: request.owner,
    };

    this.joining.add(request.name);
    try {
      const session = await this.connect(spec, this.spawnTimeoutMs);
      this.sessions.set(request.name, session);
      botJoins.inc({ outcome: 'joined' });
      return session;
    } catch (error) {
      botJoins.inc({ outcome: 'failed' });
      throw error;
    } finally {
      this.joining.delete(request.name);
    }
  }

  leave(name: string, reason = 'left on request'): boolean {
    const session = this.sessions.get(name);
    if (!session) {
      return false;
    }
    this.sessions.delete(name);
    session.quit(reason);
    botDisconnects.inc({ reason: 'left' });
    return true;
  }

  resolve(name?: string): BotSession {
    if (name !== undefined) {
      const session = this.sessions.get(name);
      if (!session) {
        throw new Error(`No bot named "${name}". ${this.describeAvailable()}`);
      }
      return session;
    }

    if (this.sessions.size === 0) {
      throw new Error('No bots are connected. Call join-server first.');
    }
    if (this.sessions.size > 1) {
      throw new Error(`More than one bot is connected, so "bot" is required. ${this.describeAvailable()}`);
    }

    return this.sessions.values().next().value as BotSession;
  }

  shutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    for (const name of [...this.sessions.keys()]) {
      const session = this.sessions.get(name);
      this.sessions.delete(name);
      session?.quit('server shutting down');
      botDisconnects.inc({ reason: 'shutdown' });
    }
  }

  sweepIdle(now = Date.now()): string[] {
    if (this.limits.idleTimeoutMs <= 0) {
      return [];
    }

    const reaped: string[] = [];
    for (const [name, session] of this.sessions) {
      if (now - session.lastUsedAt >= this.limits.idleTimeoutMs) {
        this.sessions.delete(name);
        session.quit('idle timeout');
        botDisconnects.inc({ reason: 'idle' });
        reaped.push(name);
        log('info', 'bot reaped after idle timeout', { bot: name });
      }
    }
    return reaped;
  }

  private describeAvailable(): string {
    const names = [...this.sessions.keys()];
    return names.length === 0
      ? 'No bots are connected.'
      : `Connected bots: ${names.join(', ')}.`;
  }
}
