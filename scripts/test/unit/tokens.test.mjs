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

test('renders all grid tracks as CSS variables', () => {
  const css = renderTokens({
    layout: {
      columns: ['14rem', 'minmax(0, 1fr)', '12rem'],
      rows: ['auto', '1fr', 'auto'],
      gap: '1.5rem',
      spacing: 1,
    },
    fonts: {},
  });

  assert.match(css, /--grid-col-1: 14rem;/);
  assert.match(css, /--grid-col-3: 12rem;/);
  assert.match(css, /--grid-row-2: 1fr;/);
  assert.match(css, /--grid-gap: 1\.5rem;/);
});
