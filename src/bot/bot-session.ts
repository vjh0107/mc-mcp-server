import mineflayer from 'mineflayer';
import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { describeError, log } from '../logger.ts';
import { botKicks } from '../metrics.ts';
import { connectOverride } from '../minecraft/connect.ts';
import { ScoreTracker } from '../minecraft/scoreboard.ts';
import { describeSegments, toSegments } from '../minecraft/text.ts';
import type { PacketSource } from '../minecraft/scoreboard.ts';
import { MessageStore } from './message-store.ts';
import { applyProtocolPatches } from './patches.ts';

const { pathfinder, Movements } = pathfinderPkg;

export type BotState = 'connecting' | 'ready' | 'disconnected';

export interface BotSpec {
  name: string;
  host: string;
  port: number;
  username: string;
  version: string | undefined;
  owner: string | undefined;
}

export interface BotStatus {
  name: string;
  state: BotState;
  username: string;
  address: string;
  version: string | null;
  owner: string | null;
  position: { x: number; y: number; z: number } | null;
  health: number | null;
  food: number | null;
  gameMode: string | null;
  dimension: string | null;
  joinedAt: string;
  lastUsedAt: string;
  lastError: string | null;
}

export class BotSession {
  readonly spec: BotSpec;
  readonly messages = new MessageStore();
  readonly scores = new ScoreTracker();
  readonly actionBar = new MessageStore();
  readonly joinedAt = Date.now();

  lastUsedAt = Date.now();

  private bot: Bot | null = null;
  private state: BotState = 'connecting';
  private lastError: string | null = null;

  private constructor(spec: BotSpec) {
    this.spec = spec;
  }

  static async connect(spec: BotSpec, spawnTimeoutMs: number): Promise<BotSession> {
    const session = new BotSession(spec);
    await session.start(spawnTimeoutMs);
    return session;
  }

  get name(): string {
    return this.spec.name;
  }

  get currentState(): BotState {
    return this.state;
  }

  requireBot(): Bot {
    if (this.state !== 'ready' || !this.bot) {
      throw new Error(
        `Bot "${this.spec.name}" is ${this.state}${this.lastError ? ` (${this.lastError})` : ''}. ` +
        'Use list-bots to inspect it, or leave-server and join-server again.',
      );
    }
    this.lastUsedAt = Date.now();
    return this.bot;
  }

  status(): BotStatus {
    const bot = this.bot;
    const position = bot?.entity?.position ?? null;

    return {
      name: this.spec.name,
      state: this.state,
      username: this.spec.username,
      address: `${this.spec.host}:${this.spec.port}`,
      version: bot?.version ?? null,
      owner: this.spec.owner ?? null,
      position: position
        ? { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) }
        : null,
      health: bot?.health ?? null,
      food: bot?.food ?? null,
      gameMode: bot?.game?.gameMode ?? null,
      dimension: bot?.game?.dimension ?? null,
      joinedAt: new Date(this.joinedAt).toISOString(),
      lastUsedAt: new Date(this.lastUsedAt).toISOString(),
      lastError: this.lastError,
    };
  }

  private abandonAllWaiters(): void {
    this.messages.abandonWaiters();
    this.actionBar.abandonWaiters();
  }

  quit(reason: string): void {
    this.state = 'disconnected';
    this.abandonAllWaiters();

    const bot = this.bot;
    this.bot = null;

    if (!bot) {
      return;
    }

    try {
      bot.quit(reason);
    } catch (error) {
      log('warn', 'error while quitting bot', { bot: this.spec.name, error: describeError(error) });
    }
    bot.removeAllListeners();
  }

  private async start(spawnTimeoutMs: number): Promise<void> {
    const bot = mineflayer.createBot({
      host: this.spec.host,
      port: this.spec.port,
      username: this.spec.username,
      auth: 'offline',
      logErrors: false,
      hideErrors: true,
      ...connectOverride(this.spec.host, this.spec.port),
      ...(this.spec.version === undefined ? {} : { version: this.spec.version }),
      plugins: { pathfinder },
    });

    this.bot = bot;
    this.scores.attach(bot._client as unknown as PacketSource);
    applyProtocolPatches(bot, this.spec.name);
    this.registerHandlers(bot);

    await this.awaitSpawn(bot, spawnTimeoutMs);
  }

  private awaitSpawn(bot: Bot, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const settle = (error?: Error) => {
        clearTimeout(timer);
        bot.removeListener('spawn', onSpawn);
        bot.removeListener('error', onFailure);
        bot.removeListener('kicked', onKicked);
        bot.removeListener('end', onEnd);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onSpawn = () => {
        settle();
      };
      const onFailure = (error: Error) => {
        settle(new Error(`connection failed: ${describeError(error)}`));
      };
      const onKicked = (reason: string) => {
        settle(new Error(`kicked before spawn: ${describeError(reason)}`));
      };
      const onEnd = (reason: string) => {
        settle(new Error(`disconnected before spawn: ${describeError(reason)}`));
      };

      const timer = setTimeout(() => {
        settle(new Error(`did not spawn within ${timeoutMs}ms`));
      }, timeoutMs);

      bot.once('spawn', onSpawn);
      bot.once('error', onFailure);
      bot.once('kicked', onKicked);
      bot.once('end', onEnd);
    });
  }

  private registerHandlers(bot: Bot): void {
    bot.once('spawn', () => {
      this.state = 'ready';
      this.lastError = null;
      bot.pathfinder.setMovements(new Movements(bot));
      log('info', 'bot spawned', {
        bot: this.spec.name,
        username: this.spec.username,
        address: `${this.spec.host}:${this.spec.port}`,
        version: bot.version,
      });
    });

    bot.on('messagestr', (message, position) => {
      this.messages.add(position, message);
    });

    const recordActionBar = (value: unknown) => {
      const text = describeSegments(toSegments(value));
      if (text !== '') {
        this.actionBar.addDistinct('actionbar', text);
      }
    };

    bot.on('actionBar', recordActionBar);
    bot._client.on('action_bar' as never, ((packet: { text?: unknown }) => {
      recordActionBar(packet.text);
    }) as never);

    bot.on('kicked', (reason) => {
      botKicks.inc();
      this.lastError = `kicked: ${describeError(reason)}`;
      this.state = 'disconnected';
      this.abandonAllWaiters();
      log('warn', 'bot kicked', { bot: this.spec.name, reason: describeError(reason) });
    });

    bot.on('error', (error) => {
      this.lastError = describeError(error);
      log('warn', 'bot error', { bot: this.spec.name, error: this.lastError });
    });

    bot.on('end', (reason) => {
      if (this.state !== 'disconnected') {
        this.state = 'disconnected';
        this.lastError ??= `disconnected: ${describeError(reason)}`;
      }
      this.abandonAllWaiters();
      log('info', 'bot disconnected', { bot: this.spec.name, reason: describeError(reason) });
    });
  }
}
