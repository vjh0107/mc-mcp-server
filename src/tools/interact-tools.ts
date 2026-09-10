import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import type { BotRegistry } from '../bot/registry.ts';
import { botArg, coordinateArgs, floorCoordinates, registerTool, resolveSession } from '../mcp/tool-helpers.ts';
import { walkTo } from '../minecraft/navigate.ts';
import { readLabel } from '../minecraft/window.ts';

const BLOCK_REACH = 3;
const ENTITY_REACH = 3;
const DEFAULT_SEARCH_DISTANCE = 8;
const MAX_ATTACK_TIMES = 20;
const ATTACK_INTERVAL_TICKS = 10;
const MAX_HOLD_MS = 60_000;
const MAX_LISTED_CANDIDATES = 5;
const OFFHAND_SLOT = 45;

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface EntityLike {
  name?: string;
  username?: string;
  type?: string;
  position: Point;
}

export interface RankedEntity<T> {
  entity: T;
  distance: number;
}

export interface EntitySearch<T> {
  match: RankedEntity<T> | null;
  nearby: RankedEntity<T>[];
}

export interface EntitySearchOptions<T> {
  origin: Point;
  query: string;
  maxDistance: number;
  self?: T;
}

export function entityLabel(entity: EntityLike): string {
  return entity.username ?? entity.name ?? entity.type ?? 'unknown entity';
}

export function matchesEntityName(entity: EntityLike, query: string): boolean {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    return false;
  }

  return [entity.name, entity.username]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle));
}

function distanceBetween(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

export function findNearestEntity<T extends EntityLike>(
  entities: Iterable<T>,
  options: EntitySearchOptions<T>,
): EntitySearch<T> {
  const nearby = [...entities]
    .filter((entity) => entity !== options.self)
    .map((entity) => ({ entity, distance: distanceBetween(options.origin, entity.position) }))
    .filter(({ distance }) => distance <= options.maxDistance)
    .sort((a, b) => a.distance - b.distance);

  return {
    match: nearby.find(({ entity }) => matchesEntityName(entity, options.query)) ?? null,
    nearby,
  };
}

function requireEntity(bot: Bot, query: string, maxDistance: number): Entity {
  const { match, nearby } = findNearestEntity(Object.values(bot.entities), {
    origin: bot.entity.position,
    query,
    maxDistance,
    self: bot.entity,
  });

  if (match) {
    return match.entity;
  }

  const listed = nearby
    .slice(0, MAX_LISTED_CANDIDATES)
    .map(({ entity, distance }) => `${entityLabel(entity)} (${distance.toFixed(1)} blocks away)`)
    .join(', ');

  throw new Error(
    `Nothing within ${maxDistance} blocks is named like "${query}". `
    + (listed === '' ? 'Nothing else is in range either.' : `In range: ${listed}.`),
  );
}

async function approachEntity(bot: Bot, entity: Entity): Promise<void> {
  if (bot.entity.position.distanceTo(entity.position) > ENTITY_REACH) {
    await walkTo(bot, entity.position, ENTITY_REACH);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const targetArgs = {
  name: z.string().min(1).describe('Entity name or part of a player name, for example villager or Steve'),
  maxDistance: z.coerce.number().finite().min(1).optional()
    .describe(`Search radius (default: ${DEFAULT_SEARCH_DISTANCE})`),
};

export function registerInteractTools(server: McpServer, registry: BotRegistry): void {
  registerTool(
    server,
    'activate-block',
    'Right-click the block at a position, walking to it first when out of reach. '
    + 'Presses buttons and levers, opens doors, and triggers custom blocks.',
    { ...botArg, ...coordinateArgs },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const target = floorCoordinates(args.x, args.y, args.z);
      const position = new Vec3(target.x, target.y, target.z);
      const block = bot.blockAt(position);

      if (!block) {
        throw new Error(
          `(${target.x}, ${target.y}, ${target.z}) is outside the loaded chunks, so there is no block to activate`,
        );
      }

      if (bot.entity.position.distanceTo(position) > BLOCK_REACH || !bot.canSeeBlock(block)) {
        await walkTo(bot, target, BLOCK_REACH);
      }

      await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
      await bot.activateBlock(block);

      return `Right-clicked ${block.name} at (${target.x}, ${target.y}, ${target.z}).`;
    },
  );

  registerTool(
    server,
    'interact-entity',
    'Right-click the nearest entity whose name matches, walking to it first when out of reach. '
    + 'This is what opens an NPC dialogue.',
    { ...botArg, ...targetArgs },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const maxDistance = args.maxDistance ?? DEFAULT_SEARCH_DISTANCE;
      const entity = requireEntity(bot, args.name, maxDistance);

      await approachEntity(bot, entity);
      await bot.lookAt(entity.position.offset(0, entity.height, 0), true);
      await bot.activateEntity(entity);

      return `Right-clicked ${entityLabel(entity)} (${entity.type}).`;
    },
  );

  registerTool(
    server,
    'attack-entity',
    'Attack the nearest entity whose name matches, walking to it first when out of reach.',
    {
      ...botArg,
      ...targetArgs,
      times: z.coerce.number().int().min(1).max(MAX_ATTACK_TIMES).optional()
        .describe(`How many swings to land (default: 1, at most ${MAX_ATTACK_TIMES})`),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const maxDistance = args.maxDistance ?? DEFAULT_SEARCH_DISTANCE;
      const times = args.times ?? 1;
      const entity = requireEntity(bot, args.name, maxDistance);
      const label = entityLabel(entity);

      let landed = 0;

      for (let swing = 0; swing < times; swing += 1) {
        if (!entity.isValid) {
          break;
        }

        await approachEntity(bot, entity);
        await bot.lookAt(entity.position.offset(0, entity.height, 0), true);
        bot.attack(entity);
        landed += 1;

        if (swing < times - 1) {
          await bot.waitForTicks(ATTACK_INTERVAL_TICKS);
        }
      }

      if (landed < times) {
        return `Hit ${label} ${landed} time(s) out of ${times}; it left the world before the rest landed.`;
      }

      return `Hit ${label} ${landed} time(s).`;
    },
  );

  registerTool(
    server,
    'use-held-item',
    'Right-click with the item the bot is holding, optionally holding the button down for a while.',
    {
      ...botArg,
      offhand: z.boolean().optional().describe('Use the off-hand item instead of the main hand (default: false)'),
      holdMs: z.coerce.number().int().min(0).max(MAX_HOLD_MS).optional()
        .describe('How long to keep the button down before releasing, for bows and the like (default: 0)'),
    },
    async (args) => {
      const bot = resolveSession(registry, args.bot).requireBot();
      const offhand = args.offhand ?? false;
      const holdMs = args.holdMs ?? 0;
      const item = offhand ? bot.inventory.slots[OFFHAND_SLOT] : bot.heldItem;
      const hand = offhand ? 'off-hand' : 'main hand';
      const held = item ? `${readLabel(item) ?? item.name} x${item.count}` : 'an empty hand';

      bot.activateItem(offhand);

      if (holdMs > 0) {
        await delay(holdMs);
        bot.deactivateItem();
        return `Used ${held} in the ${hand}, held for ${holdMs}ms and released.`;
      }

      return `Used ${held} in the ${hand}.`;
    },
  );
}
