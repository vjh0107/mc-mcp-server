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

const GLYPHS = /[\uE000-\uF8FF]|[\uDB80-\uDBBF][\uDC00-\uDFFF]/g;

export interface TextSegment {
  text: string;
  font: string | undefined;
  color: string | undefined;
}

interface StyledLike extends ChatLike {
  font?: unknown;
  color?: unknown;
}

function nbtString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value !== null && typeof value === 'object' && isNbt(value)) {
    return typeof value.value === 'string' ? value.value : undefined;
  }
  return undefined;
}

function collect(value: unknown, inherited: TextSegment, into: TextSegment[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    if (!value.startsWith('{') && !value.startsWith('[')) {
      into.push({ ...inherited, text: value });
      return;
    }
    const parsed = parseJson(value);
    if (typeof parsed === 'string') {
      into.push({ ...inherited, text: parsed });
      return;
    }
    collect(parsed, inherited, into);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, inherited, into);
    }
    return;
  }

  if (typeof value !== 'object') {
    into.push({ ...inherited, text: String(value) });
    return;
  }

  if (isNbt(value)) {
    collect(value.value, inherited, into);
    return;
  }

  const node = value as StyledLike;
  const style: TextSegment = {
    text: '',
    font: nbtString(node.font) ?? inherited.font,
    color: nbtString(node.color) ?? inherited.color,
  };

  const own = walk(node.text);
  if (own !== '') {
    into.push({ ...style, text: own });
  }

  collect(node.extra, style, into);

  if (own === '' && into.length === 0) {
    const translated = walk(node.translate);
    if (translated !== '') {
      into.push({ ...style, text: translated });
    }
  }
}

/*
Servers draw HUDs by stacking pieces in custom fonts: a bar glyph, a negative-space glyph that
moves the cursor, then a label. Flattening that to one string runs the labels together -- two
"20/20" and two "0" arrive as "20/2020/2000" -- so the pieces are kept apart here.

Glyph characters live in the Unicode private use area and mean nothing as text, so a piece that
holds only those is dropped.
*/
export function toSegments(value: unknown): TextSegment[] {
  const collected: TextSegment[] = [];
  collect(value, { text: '', font: undefined, color: undefined }, collected);

  return collected
    .map((segment) => ({ ...segment, text: stripFormatting(segment.text.replace(GLYPHS, '')) }))
    .filter((segment) => segment.text !== '');
}

function shortFont(font: string): string {
  const [, path] = font.split(':', 2);
  return path ?? font;
}

/*
The font name is usually the only thing that says which number is which, so it rides along
whenever the server bothered to set one.
*/
export function describeSegments(segments: TextSegment[]): string {
  return segments
    .map((segment) => (segment.font === undefined ? segment.text : `[${shortFont(segment.font)}] ${segment.text}`))
    .join(' | ');
}
