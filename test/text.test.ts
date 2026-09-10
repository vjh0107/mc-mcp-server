import assert from 'node:assert/strict';
import test from 'node:test';
import { stripFormatting, toPlainText } from '../src/minecraft/text.ts';

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
