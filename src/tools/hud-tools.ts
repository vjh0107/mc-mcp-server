import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BossBar, Bot, ScoreBoard } from 'mineflayer';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { registerFeed } from '../mcp/feed.ts';
import { describeSegments, toPlainText, toSegments } from '../minecraft/text.ts';

const DISPLAY_SLOTS = ['sidebar', 'list', 'belowName'] as const;

const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;

type BossBarHost = Bot & { bossBars?: readonly BossBar[] };

interface ScoreboardItemLike {
  name: string;
  value: number;
  displayName?: unknown;
}

interface ScoreboardLike {
  title?: unknown;
  items: readonly ScoreboardItemLike[];
}

interface BossBarLike {
  title?: unknown;
  health?: number;
  color?: string;
  dividers?: number;
}

interface PlayerLike {
  username: string;
  gamemode?: number;
  ping?: number;
}

export interface ScoreboardEntry {
  name: string;
  score: number;
}

export interface ScoreboardView {
  title: string;
  entries: ScoreboardEntry[];
}

export interface BossBarView {
  title: string;
  progress: number;
  color: string;
  dividers: number;
}

export interface PlayerView {
  name: string;
  gameMode: string;
  ping: number | null;
  self: boolean;
}

export function viewScoreboard(board: ScoreboardLike): ScoreboardView {
  const entries = board.items
    .map((item) => ({
      name: toPlainText(item.displayName) || toPlainText(item.name),
      score: item.value,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return { title: toPlainText(board.title), entries };
}

export function viewBossBar(bar: BossBarLike): BossBarView {
  return {
    title: describeSegments(toSegments(bar.title)),
    progress: bar.health ?? 0,
    color: bar.color ?? 'unknown',
    dividers: bar.dividers ?? 0,
  };
}

export function viewPlayerList(players: Record<string, PlayerLike>, selfUsername: string): PlayerView[] {
  return Object.values(players)
    .map((player) => ({
      name: player.username,
      gameMode: GAME_MODES[player.gamemode ?? -1] ?? 'unknown',
      ping: player.ping ?? null,
      self: player.username === selfUsername,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatScoreboard(view: ScoreboardView, slot: string): string {
  const title = view.title === '' ? '(untitled)' : view.title;
  const header = `scoreboard "${title}" (${slot}, ${view.entries.length} entries)`;

  if (view.entries.length === 0) {
    return `${header}\nno entries are on it`;
  }

  const lines = view.entries.map((entry) => `  ${entry.name}: ${entry.score}`);

  return `${header}\n${lines.join('\n')}`;
}

function formatBossBar(view: BossBarView): string {
  const title = view.title === '' ? '(untitled)' : view.title;
  const percent = Math.round(view.progress * 100);

  return `boss bar "${title}" (${percent}%, ${view.color}, ${view.dividers} segments)`;
}

function formatPlayer(view: PlayerView): string {
  const ping = view.ping === null ? 'unknown' : `${view.ping}ms`;
  const marker = view.self ? ' (this bot)' : '';

  return `  ${view.name}${marker}: ${view.gameMode}, ${ping}`;
}

export function registerHudTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'read-scoreboard',
    'Read the scoreboard the server draws on screen, which most servers use for stats and quest progress.',
    {
      ...botArg,
      slot: z.enum(DISPLAY_SLOTS).optional()
        .describe("Which display slot to read (default: 'sidebar')"),
    },
    (args) => {
      const session = resolveSession(registry, args.bot);
      const bot = session.requireBot();
      const slot = args.slot ?? 'sidebar';
      const board: ScoreBoard | undefined = bot.scoreboard[slot];

      if (!board) {
        return `No scoreboard is displayed in the ${slot} slot.`;
      }

      const view = viewScoreboard(board);
      const tracked = session.scores.entriesFor(board.name);

      return formatScoreboard(
        { ...view, entries: view.entries.length === 0 ? tracked : view.entries },
        slot,
      );
    },
  );

  registerTool(
    server,
    'read-boss-bars',
    'Read every boss bar the server is showing above the hotbar.',
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot() as BossBarHost;
      const bars = bot.bossBars ?? [];

      if (bars.length === 0) {
        return 'No boss bars are showing.';
      }

      return bars.map((bar) => formatBossBar(viewBossBar(bar))).join('\n');
    },
  );

  registerTool(
    server,
    'read-player-list',
    'List the players on the tab list, with their game mode and ping.',
    botArg,
    (args) => {
      const session = resolveSession(registry, args.bot);
      const bot = session.requireBot();
      const players = viewPlayerList(bot.players, bot.username);

      if (players.length === 0) {
        return 'The tab list is empty.';
      }

      return `${players.length} players online\n${players.map(formatPlayer).join('\n')}`;
    },
  );

  registerFeed(server, registry, {
    tool: 'read-action-bar',
    waitTool: 'wait-for-action-bar',
    noun: 'action bar',
    feed: (session) => session.actionBar,
    describe: 'Read the action bar text above the hotbar, which servers use for live status.',
    describeWait: 'Wait until the action bar shows text matching a regular expression.',
  });

  registerFeed(server, registry, {
    tool: 'read-title',
    waitTool: 'wait-for-title',
    noun: 'title',
    feed: (session) => session.titles,
    describe: 'Read the titles and subtitles the server has thrown across the screen, which is where ' +
      'servers put things the player must not miss.',
    describeWait: 'Wait until a title or subtitle matching a regular expression is shown.',
  });

  registerFeed(server, registry, {
    tool: 'read-dialog',
    waitTool: 'wait-for-dialog',
    noun: 'dialog',
    feed: (session) => session.dialogs,
    describe: 'Read the dialogs the server has opened on screen, with their title, body and the ' +
      'buttons they offer, and the point at which each was closed again. The bot cannot press ' +
      'those buttons: the packet that answers a dialog is serialised from a definition that does ' +
      'not match 26.1, and a server drops the connection rather than read it.',
    describeWait: 'Wait until a dialog whose text matches a regular expression is opened.',
  });

  registerTool(
    server,
    'get-player-state',
    'Report the health, hunger, experience and position the bot sees for itself.',
    botArg,
    (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const position = bot.entity?.position;
      const experience = bot.experience;

      return [
        `health: ${bot.health} / 20`,
        `food: ${bot.food} / 20 (saturation ${bot.foodSaturation})`,
        `health bar: ${Math.round((bot.health / 20) * 100)}%`,
        `experience: level ${experience.level}, ${Math.round(experience.progress * 100)}% to the next level, ` +
        `${experience.points} points`,
        `gameMode: ${bot.game.gameMode} / dimension: ${bot.game.dimension}`,
        `position: ${position ? `(${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)})` : 'unknown'}`,
        `oxygen: ${bot.oxygenLevel ?? 'full'} / 20`,
      ].join('\n');
    },
  );
}
