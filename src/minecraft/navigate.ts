import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';

const { goals } = pathfinderPkg;

export const DEFAULT_WALK_TIMEOUT_MS = 60_000;

export async function walkTo(
  bot: Bot,
  target: { x: number; y: number; z: number },
  range: number,
  timeoutMs = DEFAULT_WALK_TIMEOUT_MS,
): Promise<void> {
  const walk = bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, range));
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(
        `could not reach (${target.x}, ${target.y}, ${target.z}) within ${timeoutMs}ms`,
      )),
      timeoutMs,
    );
  });

  try {
    await Promise.race([walk, timeout]);
  } catch (error) {
    bot.pathfinder.stop();
    walk.catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
