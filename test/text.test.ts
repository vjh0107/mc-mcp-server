import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSegments, stripFormatting, toPlainText, toSegments } from '../src/minecraft/text.ts';

test('plain strings come back trimmed and without colour codes', () => {
  assert.equal(toPlainText('Village Shop'), 'Village Shop');
  assert.equal(toPlainText('§6Shop  §lButton '), 'Shop Button');
  assert.equal(toPlainText(''), '');
  assert.equal(toPlainText(null), '');
  assert.equal(toPlainText(undefined), '');
});

test('the NBT shape the server actually sends is unwrapped', () => {
  assert.equal(
    toPlainText({
      type: 'compound',
      value: {
        color: { type: 'string', value: 'gold' },
        text: { type: 'string', value: 'Shop Button' },
      },
    }),
    'Shop Button',
  );
  assert.equal(toPlainText({ type: 'string', value: 'Click to buy' }), 'Click to buy');
});

test('a vanilla title arrives as a translate key rather than text', () => {
  assert.equal(
    toPlainText({ type: 'compound', value: { translate: { type: 'string', value: 'container.chest' } } }),
    'container.chest',
  );
});

test('plain chat components and their extra parts are joined', () => {
  assert.equal(toPlainText({ text: 'Test', extra: [{ text: 'Server' }, { text: ' dev' }] }), 'TestServer dev');
  assert.equal(toPlainText([{ text: 'a' }, { text: 'b' }]), 'ab');
});

test('a JSON string is parsed before being walked', () => {
  assert.equal(toPlainText('{"text":"Auction House"}'), 'Auction House');
  assert.equal(toPlainText('{not json'), '{not json');
});

test('stripFormatting collapses whitespace so lore lines stay one line', () => {
  assert.equal(stripFormatting('  Costs   10   coins '), 'Costs 10 coins');
});

function nbtString(value: string): unknown {
  return { type: 'string', value };
}

function nbtList(values: unknown[]): unknown {
  return { type: 'list', value: { type: 'compound', value: values } };
}

const HUD_ACTION_BAR = {
  type: 'compound',
  value: {
    extra: nbtList([
      { font: nbtString('server:space'), text: nbtString('') },
      {
        extra: nbtList([
          { font: nbtString('server:hud/bars'), text: nbtString('') },
          { font: nbtString('server:hud/bars_text'), text: nbtString('20/20') },
        ]),
        text: nbtString(''),
      },
      { font: nbtString('server:hud/bars_text'), text: nbtString('18/20') },
      { font: nbtString('server:hud/money_text'), color: nbtString('#F04A46'), text: nbtString('1,250') },
    ]),
    text: nbtString(''),
  },
};

test('a HUD drawn in custom fonts keeps its labels apart instead of running them together', () => {
  const segments = toSegments(HUD_ACTION_BAR);

  assert.deepEqual(segments.map((segment) => segment.text), ['20/20', '18/20', '1,250']);
  assert.deepEqual(segments.map((segment) => segment.font), [
    'server:hud/bars_text',
    'server:hud/bars_text',
    'server:hud/money_text',
  ]);
  assert.equal(segments[2]?.color, '#F04A46');
});

test('the flattened form is exactly the ambiguity this replaces', () => {
  assert.match(toPlainText(HUD_ACTION_BAR), /20\/2018\/20/);
  assert.equal(
    describeSegments(toSegments(HUD_ACTION_BAR)),
    '[hud/bars_text] 20/20 | [hud/bars_text] 18/20 | [hud/money_text] 1,250',
  );
});

test('a piece that is nothing but glyphs carries no text and is dropped', () => {
  assert.deepEqual(toSegments({ text: '', font: 'server:space' }), []);
  assert.deepEqual(toSegments({ text: '󰀀' }), []);
});

test('a child keeps the font its parent set until it sets its own', () => {
  const segments = toSegments({
    font: 'server:panel',
    extra: [{ text: 'inherited' }, { font: 'server:other', text: 'own' }],
  });

  assert.deepEqual(segments.map((segment) => [segment.text, segment.font]), [
    ['inherited', 'server:panel'],
    ['own', 'server:other'],
  ]);
});

test('plain chat with no styling stays a single unadorned segment', () => {
  assert.deepEqual(toSegments('hello'), [{ text: 'hello', font: undefined, color: undefined }]);
  assert.equal(describeSegments(toSegments('hello')), 'hello');
});
