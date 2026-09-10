import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { Window } from 'prismarine-windows';
import { toPlainText } from './text.ts';

export interface SlotView {
  slot: number;
  name: string;
  count: number;
  label: string | null;
  lore: string[];
}

export interface WindowView {
  title: string;
  type: number | string;
  slotCount: number;
  containerSlots: [number, number];
  inventorySlots: [number, number];
  filled: SlotView[];
}

export function readLabel(item: Item): string | null {
  const text = toPlainText(item.customName);
  return text === '' ? null : text;
}

export function readLore(item: Item): string[] {
  const raw = item.customLore;

  if (raw === null || raw === undefined) {
    return [];
  }

  return (Array.isArray(raw) ? raw : [raw])
    .map((line) => toPlainText(line))
    .filter((line) => line !== '');
}

export function viewSlot(item: Item): SlotView {
  return {
    slot: item.slot,
    name: item.name,
    count: item.count,
    label: readLabel(item),
    lore: readLore(item),
  };
}

export function viewWindow(window: Window): WindowView {
  const filled = (window.slots as (Item | null)[])
    .filter((item): item is Item => item !== null && item !== undefined)
    .map(viewSlot);

  return {
    title: toPlainText(window.title),
    type: window.type,
    slotCount: window.slots.length,
    containerSlots: [0, Math.max(window.inventoryStart - 1, 0)],
    inventorySlots: [window.inventoryStart, window.inventoryEnd],
    filled,
  };
}

export function requireWindow(bot: Bot): Window {
  const window = bot.currentWindow;

  if (!window) {
    throw new Error(
      'No window is open. Run the command that opens the menu first, ' +
      'then use wait-for-window before reading or clicking it.',
    );
  }

  return window;
}

export function formatWindow(view: WindowView): string {
  const header = `window "${view.title}" (type ${view.type}, ${view.slotCount} slots, ` +
    `container ${view.containerSlots[0]}-${view.containerSlots[1]}, ` +
    `player inventory ${view.inventorySlots[0]}-${view.inventorySlots[1]})`;

  if (view.filled.length === 0) {
    return `${header}\nevery slot is empty`;
  }

  const lines = view.filled.map((slot) => {
    const label = slot.label === null ? slot.name : `${slot.label} [${slot.name}]`;
    const lore = slot.lore.length === 0 ? '' : `\n    ${slot.lore.join('\n    ')}`;
    return `  ${slot.slot}: ${label} x${slot.count}${lore}`;
  });

  return `${header}\n${lines.join('\n')}`;
}
