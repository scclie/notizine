import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_CELL_NAMES, normalizeLayoutConfig, normalizeSlotMap } from '../../lib/layout.mjs';

function validLayout() {
  return {
    columns: ['12rem', '1fr', '12rem'],
    rows: ['auto', '1fr', 'auto'],
    gap: '1rem',
  };
}

function gridSlots(entry = { module: 'main' }) {
  return Object.fromEntries(GRID_CELL_NAMES.map(name => [name, name === 'middle_center' ? [[entry]] : []]));
}

test('normalizes legacy seven zones into deterministic grid cells', () => {
  const warnings = [];
  const config = normalizeLayoutConfig({
    layout: validLayout(),
    slots: {
      header: [[{ module: '_header' }]],
      before_main: [[{ module: 'divider' }]],
      left: [[{ module: '_explorer' }]],
      center: [[{ module: '_recents' }]],
      after_main: [[{ module: 'badges' }]],
      right: [],
      footer: [[{ module: '_footer_text' }]],
    },
    slots_overrides: {},
  }, { warn: message => warnings.push(message) });

  assert.deepEqual(config.slots.top_center.map(row => row[0].module), ['_header', 'divider']);
  assert.deepEqual(config.slots.middle_center.map(row => row[0].module), ['_recents', 'badges']);
  assert.deepEqual(config.slots.bottom_center.map(row => row[0].module), ['_footer_text']);
  assert.equal(config.slots.middle_left[0][0].legacyZone, 'left');
  assert.equal(config.slots.top_left.length, 0);
  assert.equal(warnings.length, 1);
});

test('rejects slot maps that mix legacy and grid keys', () => {
  assert.throws(() => normalizeLayoutConfig({
    layout: validLayout(),
    slots: { header: [], middle_center: [] },
  }), /config\.slots: cannot mix legacy and 3×3 cell names/);
});

test('requires every grid cell and rejects unknown cells', () => {
  const missingCell = gridSlots();
  delete missingCell.bottom_right;

  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: missingCell }),
    /config\.slots: missing required grid cell "bottom_right"/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: { ...gridSlots(), outside: [] } }),
    /config\.slots: unknown cell "outside"/,
  );
});

test('validates grid tracks as three strings for columns and rows', () => {
  assert.throws(
    () => normalizeLayoutConfig({ layout: { ...validLayout(), columns: ['1fr', 2, '1fr'] }, slots: gridSlots() }),
    /config\.layout\.columns\[1\]: expected a string/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: { ...validLayout(), columns: ['1fr', '1fr'] }, slots: gridSlots() }),
    /config\.layout\.columns: expected exactly 3 tracks/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: { ...validLayout(), rows: ['auto', '1fr'] }, slots: gridSlots() }),
    /config\.layout\.rows: expected exactly 3 tracks/,
  );
});

test('rejects malformed rows, entries without module names, and invalid alignment', () => {
  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: { ...gridSlots(), middle_center: 'main' } }),
    /config\.slots\.middle_center: expected an array of rows/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: { ...gridSlots(), middle_center: ['main'] } }),
    /config\.slots\.middle_center\[0\]: expected a row array/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: gridSlots({ align: 'left' }) }),
    /config\.slots\.middle_center\[0\]\[0\]: module must be a non-empty string/,
  );
  assert.throws(
    () => normalizeLayoutConfig({ layout: validLayout(), slots: gridSlots({ module: 'main', align: 'middle' }) }),
    /config\.slots\.middle_center\[0\]\[0\]\.align: expected "left", "center", or "right"/,
  );
});

test('converts string entries, removes implicit content once, and retains legacy source zones', () => {
  const warnings = [];
  const config = normalizeLayoutConfig({
    layout: validLayout(),
    slots: { before_main: [['_content', 'divider']], footer: [['divider']] },
  }, { warn: message => warnings.push(message) });

  assert.deepEqual(config.slots.top_center, [[{ module: 'divider', legacyZone: 'before_main' }]]);
  assert.deepEqual(config.slots.bottom_center, [[{ module: 'divider', legacyZone: 'footer' }]]);
  assert.deepEqual(warnings, [
    '[config] legacy seven-zone slots were migrated to the 3×3 grid',
    '[config] _content is implicit and was removed from slots',
  ]);
});

test('normalizes every override independently and rejects mixed override schemas', () => {
  const config = normalizeLayoutConfig({
    layout: validLayout(),
    slots: gridSlots(),
    slots_overrides: {
      '/legacy/': { center: [['search']] },
      '/grid/': gridSlots({ module: 'search' }),
    },
  }, { warn: () => {} });

  assert.deepEqual(config.slots_overrides['/legacy/'].middle_center, [[{ module: 'search', legacyZone: 'center' }]]);
  assert.equal(config.slots_overrides['/grid/'].middle_center[0][0].legacyZone, undefined);
  assert.throws(
    () => normalizeSlotMap({ left: [], middle_left: [] }, { path: 'config.slots_overrides["/bad/"]' }),
    /config\.slots_overrides\["\/bad\/"\]: cannot mix legacy and 3×3 cell names/,
  );
});
