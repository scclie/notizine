import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPublicOutput } from '../../lib/clean-public.mjs';

test('cleanPublicOutput removes stale generated pages and recreates public root', () => {
  const root = join('/tmp/opencode', 'notizine-build-clean');
  const publicDir = join(root, 'public');
  const staleRoute = join(publicDir, 'notes', 'index.html');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(publicDir, 'notes'), { recursive: true });
  writeFileSync(staleRoute, '<p>stale wiki route</p>');

  try {
    assert.equal(cleanPublicOutput(root), publicDir);
    assert.equal(existsSync(staleRoute), false);
    assert.equal(existsSync(publicDir), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
