import * as fs from 'fs';
import path from 'path';
import { dataDir } from './dataDir';

/** Where docker/start.sh stages the UI after rewriting the BASE_PATH placeholder. */
export const servedUiPath = path.join(dataDir, 'ui');

/**
 * Root that ServeStaticModule hands to Express.
 *
 * Prefers the staged copy, because that is the one whose /__PATH_PREFIX__
 * placeholder has been resolved. Falls back to the bundle shipped next to the
 * compiled server so a plain `node dist/main` - no start.sh - still serves a UI,
 * exactly as it did before staging existed.
 *
 * `bundledUiPath` is passed in rather than derived here so the caller can resolve
 * it from its own __dirname.
 */
export function resolveUiRootPath(bundledUiPath: string): string {
  return fs.existsSync(path.join(servedUiPath, 'index.html'))
    ? servedUiPath
    : bundledUiPath;
}
