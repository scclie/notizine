import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTokens } from '../../lib/tokens.mjs';

test('renderTokens spacing=2 doubles sp-4 to 2.000rem', () => {
  const css = renderTokens({ layout: { spacing: 2 } });
  assert.match(css, /--sp-4: 2\.000rem;/);
});

test('renderTokens without fonts emits no font variables', () => {
  const css = renderTokens({});
  assert.doesNotMatch(css, /--font-/);
});
