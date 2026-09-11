import mineflayer from 'mineflayer';
import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { describeError, log } from '../logger.ts';
import { botKicks } from '../metrics.ts';
import { connectOverride } from '../minecraft/connect.ts';
import { ScoreTracker } from '../minecraft/scoreboard.ts';
import { describeSegments, toSegments } from '../minecraft/text.ts';
import { describeDialog, soundName } from '../minecraft/screen.ts';
import type { SoundPacket } from '../minecraft/screen.ts';
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
  serverBrand: string | null;
  joinedAt: string;
  lastUsedAt: string;
  lastError: string | null;
}

export class BotSession {
  readonly spec: BotSpec;
  readonly messages = new MessageStore();
  readonly scores = new ScoreTracker();
  readonly actionBar = new MessageStore();
  readonly titles = new MessageStore();
  readonly dialogs = new MessageStore();
  readonly effects = new MessageStore();
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
      serverBrand: bot?.game?.serverBrand ?? null,
      joinedAt: new Date(this.joinedAt).toISOString(),
      lastUsedAt: new Date(this.lastUsedAt).toISOString(),
      lastError: this.lastError,
    };
  }

  private abandonAllWaiters(): void {
    this.messages.abandonWaiters();
    this.actionBar.abandonWaiters();
    this.titles.abandonWaiters();
    this.dialogs.abandonWaiters();
    this.effects.abandonWaiters();
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

    /*
    mineflayer emits its own 'title' event, but parseTitle there reaches for parsed.text and
    drops extra, so a title built from several pieces arrives as the first one or as raw JSON.
    Reading the packet keeps every piece, the same reason the action bar is read this way.
    */
    const recordTitle = (kind: string) => (packet: { text?: unknown }) => {
      const text = describeSegments(toSegments(packet.text));
      if (text !== '') {
        this.titles.addDistinct(kind, text);
      }
    };

    bot._client.on('set_title_text' as never, recordTitle('title') as never);
    bot._client.on('set_title_subtitle' as never, recordTitle('subtitle') as never);

    /*
    show_dialog is new in 26.1 and mineflayer does not know it. Reading it is all that is on
    offer: custom_click_action, the packet that answers a dialog, is listed in the protocol
    mappings but carries no field definition, so it cannot be serialised to press a button.
    */
    bot._client.on('show_dialog' as never, ((packet: { dialog?: unknown }) => {
      const text = describeDialog(packet.dialog);
      if (text !== '') {
        this.dialogs.addDistinct('dialog', text);
      }
    }) as never);

    /*
    Without this the last dialog read as though it were still up long after the server took it
    away, which is the wrong answer to the only question worth asking of this feed.
    */
    bot._client.on('clear_dialog' as never, (() => {
      this.dialogs.add('closed', 'the dialog was closed');
    }) as never);

    const recordSound = (packet: SoundPacket) => {
      const name = soundName(bot, packet.sound);
      if (name !== '') {
        this.effects.addDistinct('sound', name);
      }
    };

    bot._client.on('sound_effect' as never, recordSound as never);
    bot._client.on('entity_sound_effect' as never, recordSound as never);

    bot._client.on('world_particles' as never, ((packet: { particle?: { type?: unknown } }) => {
      const type = packet.particle?.type;
      if (typeof type === 'string') {
        this.effects.addDistinct('particle', type);
      }
    }) as never);

    bot.on('death', () => {
      this.messages.add('system', 'The bot died.');
      log('warn', 'bot died', { bot: this.spec.name });
    });

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
