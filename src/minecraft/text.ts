export function stripFormatting(value: string): string {
  return value.replace(/§[0-9a-fk-or]/gi, '').replace(/\s+/g, ' ').trim();
}

interface ChatLike {
  text?: unknown;
  extra?: unknown;
  translate?: unknown;
}

interface NbtLike {
  type?: unknown;
  value?: unknown;
}

function isNbt(value: object): value is NbtLike {
  const nbt = value as NbtLike;
  return typeof nbt.type === 'string' && 'value' in nbt;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function walk(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    if (!value.startsWith('{') && !value.startsWith('[')) {
      return value;
    }
    const parsed = parseJson(value);
    return typeof parsed === 'string' ? parsed : walk(parsed);
  }

  if (Array.isArray(value)) {
    return value.map(walk).join('');
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (isNbt(value)) {
    return walk(value.value);
  }

  const chat = value as ChatLike;
  const own = `${walk(chat.text)}${walk(chat.extra)}`;

  return own === '' ? walk(chat.translate) : own;
}

export function toPlainText(value: unknown): string {
  return stripFormatting(walk(value));
}
