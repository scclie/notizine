export const GRID_CELL_NAMES = Object.freeze([
  'top_left', 'top_center', 'top_right',
  'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right',
]);

export const LEGACY_ZONE_NAMES = Object.freeze([
  'header', 'before_main', 'left', 'center', 'right', 'after_main', 'footer',
]);

const LEGACY_GRID_CELLS = Object.freeze({
  header: 'top_center',
  before_main: 'top_center',
  left: 'middle_left',
  center: 'middle_center',
  right: 'middle_right',
  after_main: 'middle_center',
  footer: 'bottom_center',
});

const ALIGNMENTS = new Set(['left', 'center', 'right']);

export function normalizeLayoutConfig(config, { warn = console.warn } = {}) {
  const state = { contentDropped: false, legacyMigrationWarned: false, warn };
  return {
    ...config,
    layout: validateGridLayout(config.layout, 'config.layout'),
    slots: normalizeSlotMap(config.slots, { path: 'config.slots', warn, state }),
    slots_overrides: normalizeOverrides(config.slots_overrides ?? {}, warn, state),
  };
}

export function normalizeSlotMap(slotMap, { path, warn = console.warn, state = { contentDropped: false } } = {}) {
  state.warn ??= warn;
  const schema = detectSlotSchema(slotMap, path);
  return schema === 'legacy'
    ? migrateLegacySlots(slotMap ?? {}, path, warn, state)
    : normalizeGridSlots(slotMap, path, state);
}

function validateGridLayout(layout, path) {
  if (!isRecord(layout)) throw new Error(`${path}: expected an object`);
  return {
    ...layout,
    columns: validateTracks(layout.columns, `${path}.columns`),
    rows: validateTracks(layout.rows, `${path}.rows`),
  };
}

function validateTracks(tracks, path) {
  if (!Array.isArray(tracks) || tracks.length !== 3) {
    throw new Error(`${path}: expected exactly 3 tracks`);
  }
  return tracks.map((track, index) => {
    if (typeof track !== 'string') throw new Error(`${path}[${index}]: expected a string`);
    return track;
  });
}

function detectSlotSchema(slotMap, path) {
  if (slotMap === undefined || slotMap === null) return 'legacy';
  if (!isRecord(slotMap)) throw new Error(`${path}: expected an object`);

  const keys = Object.keys(slotMap);
  const legacyKeys = keys.filter(key => LEGACY_ZONE_NAMES.includes(key));
  const gridKeys = keys.filter(key => GRID_CELL_NAMES.includes(key));
  const unknownKeys = keys.filter(key => !LEGACY_ZONE_NAMES.includes(key) && !GRID_CELL_NAMES.includes(key));

  if (legacyKeys.length && gridKeys.length) {
    throw new Error(`${path}: cannot mix legacy and 3×3 cell names`);
  }
  if (unknownKeys.length) throw new Error(`${path}: unknown cell "${unknownKeys[0]}"`);
  return gridKeys.length ? 'grid' : 'legacy';
}

function migrateLegacySlots(slotMap, path, warn, state) {
  if (!state.legacyMigrationWarned) {
    state.legacyMigrationWarned = true;
    warn('[config] legacy seven-zone slots were migrated to the 3×3 grid');
  }
  const out = emptyGrid();
  for (const legacyZone of LEGACY_ZONE_NAMES) {
    const rows = slotMap[legacyZone] ?? [];
    const normalized = normalizeRows(rows, `${path}.${legacyZone}`, state, legacyZone);
    out[LEGACY_GRID_CELLS[legacyZone]].push(...normalized);
  }
  return out;
}

function normalizeGridSlots(slotMap, path, state) {
  const out = {};
  for (const cell of GRID_CELL_NAMES) {
    if (!(cell in slotMap)) throw new Error(`${path}: missing required grid cell "${cell}"`);
    out[cell] = normalizeRows(slotMap[cell], `${path}.${cell}`, state);
  }
  return out;
}

function normalizeOverrides(overrides, warn, state) {
  if (!isRecord(overrides)) throw new Error('config.slots_overrides: expected an object');
  return Object.fromEntries(Object.entries(overrides).map(([prefix, slotMap]) => [
    prefix,
    normalizeSlotMap(slotMap, { path: `config.slots_overrides[${JSON.stringify(prefix)}]`, warn, state }),
  ]));
}

function normalizeRows(rows, path, state, legacyZone) {
  if (!Array.isArray(rows)) throw new Error(`${path}: expected an array of rows`);
  return rows.map((row, rowIndex) => {
    const rowPath = `${path}[${rowIndex}]`;
    if (!Array.isArray(row)) throw new Error(`${rowPath}: expected a row array`);
    return row
      .map((entry, entryIndex) => normalizeEntry(entry, `${rowPath}[${entryIndex}]`, legacyZone))
      .filter(entry => {
        if (entry.module !== '_content') return true;
        if (!state.contentDropped) {
          warnContentDropped(state);
        }
        return false;
      });
  });
}

function normalizeEntry(entry, path, legacyZone) {
  const candidate = typeof entry === 'string' ? { module: entry } : entry;
  if (!isRecord(candidate) || typeof candidate.module !== 'string' || candidate.module.length === 0) {
    throw new Error(`${path}: module must be a non-empty string`);
  }
  if (candidate.align !== undefined && !ALIGNMENTS.has(candidate.align)) {
    throw new Error(`${path}.align: expected "left", "center", or "right"`);
  }
  const { legacyZone: ignoredLegacyZone, ...normalized } = candidate;
  return legacyZone === undefined ? normalized : { ...normalized, legacyZone };
}

function warnContentDropped(state) {
  state.contentDropped = true;
  state.warn('[config] _content is implicit and was removed from slots');
}

function emptyGrid() {
  return Object.fromEntries(GRID_CELL_NAMES.map(cell => [cell, []]));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
