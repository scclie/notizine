import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function cleanPublicOutput(root) {
  const publicDir = join(resolve(root), 'public');
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  return publicDir;
}
