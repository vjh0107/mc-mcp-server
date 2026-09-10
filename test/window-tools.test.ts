import assert from 'node:assert/strict';
import test from 'node:test';
import { compileTitlePattern, titleMatches } from '../src/tools/window-tools.ts';

test('an omitted title pattern compiles to no pattern at all', () => {
  assert.equal(compileTitlePattern(undefined), null);
});

test('a broken regular expression is rejected with the source quoted back', () => {
  assert.throws(
    () => compileTitlePattern('Shop ('),
    (error: Error) => error.message.startsWith('"Shop (" is not a valid regular expression:'),
  );
});

test('a window matches when no pattern narrows the wait', () => {
  assert.equal(titleMatches('Auction House', null), true);
  assert.equal(titleMatches('', null), true);
});

test('a pattern matches a substring of the title but not an unrelated one', () => {
  const pattern = compileTitlePattern('Shop');

  assert.equal(titleMatches('Village Shop - Page 1', pattern), true);
  assert.equal(titleMatches('Crafting Table', pattern), false);
});

test('an anchored pattern only matches the whole title', () => {
  const pattern = compileTitlePattern('^Chest$');

  assert.equal(titleMatches('Chest', pattern), true);
  assert.equal(titleMatches('Large Chest', pattern), false);
});
