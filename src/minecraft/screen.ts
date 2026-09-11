import type { Bot } from 'mineflayer';
import { simplify } from 'prismarine-nbt';
import { describeSegments, toSegments } from './text.ts';

interface SoundRegistry {
  sounds?: Record<number, { name?: string } | undefined>;
}

export interface SoundPacket {
  sound?: { soundId?: number; data?: { soundName?: string } } | number;
}

interface DialogBody {
  title?: unknown;
  body?: unknown;
  actions?: unknown[];
  inputs?: unknown[];
  type?: unknown;
}

function label(value: unknown): string {
  return describeSegments(toSegments(value));
}

/*
A sound arrives either as an index into the registry or as its own name, depending on whether the
server is playing something vanilla or something a resource pack added.
*/
export function soundName(bot: Bot, sound: SoundPacket['sound']): string {
  const registry = bot.registry as unknown as SoundRegistry;
  const byId = (id: number): string => registry.sounds?.[id]?.name ?? `sound #${id}`;

  if (typeof sound === 'number') {
    return byId(sound);
  }

  if (sound?.data?.soundName !== undefined) {
    return sound.data.soundName;
  }

  if (sound?.soundId !== undefined) {
    return byId(sound.soundId);
  }

  return '';
}

/*
The dialog is an NBT blob whose shape follows whichever dialog type the server picked. The parts
worth reading back are the same in all of them: what it says, and what it offers to press.
*/
export function describeDialog(dialog: unknown): string {
  if (dialog === undefined || dialog === null) {
    return '';
  }

  const plain = simplify(dialog as never) as DialogBody;
  const parts: string[] = [];
  const title = label(plain.title);

  if (title !== '') {
    parts.push(title);
  }

  const body = Array.isArray(plain.body) ? plain.body : [];
  const lines = body
    .map((entry) => label((entry as { contents?: unknown }).contents ?? entry))
    .filter((line) => line !== '');

  if (lines.length > 0) {
    parts.push(lines.join(' / '));
  }

  const actions = Array.isArray(plain.actions) ? plain.actions : [];
  const buttons = actions
    .map((action) => label((action as { label?: unknown }).label))
    .filter((one) => one !== '');

  if (buttons.length > 0) {
    parts.push(`buttons: ${buttons.join(', ')}`);
  }

  const inputs = Array.isArray(plain.inputs) ? plain.inputs : [];

  if (inputs.length > 0) {
    parts.push(`${inputs.length} input field(s)`);
  }

  return parts.join(' | ');
}
