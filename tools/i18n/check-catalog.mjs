/**
 * Fails when a translatable string was added without re-running extraction.
 *
 * Compares the SET OF MESSAGES rather than the bytes of the file. Weblate
 * writes these catalogs too, and it folds long header lines where Lingui does
 * not, so a byte-exact diff fails on every translation pull request while
 * saying nothing about whether the catalog is actually current.
 *
 * Leaves the working tree exactly as it found it.
 *
 * Usage: node tools/i18n/check-catalog.mjs [catalogDir]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPo } from './po.mjs';

// Resolved from this file, so the script behaves the same whether it is run
// from the repo root or from inside the workspace.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const uiDir = path.join(repoRoot, 'apps/ui');
const catalogDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(uiDir, 'src/locales');

const messageIds = (dir, file) =>
  new Set(readPo(path.join(dir, file)).map((entry) => entry.msgid));

const listCatalogs = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.po'))
    .sort();

const snapshot = mkdtempSync(path.join(tmpdir(), 'lingui-catalogs-'));
cpSync(catalogDir, snapshot, { recursive: true });

let failed = false;
try {
  execFileSync('yarn', ['lingui', 'extract', '--clean'], {
    cwd: uiDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const committed = listCatalogs(snapshot);
  const extracted = listCatalogs(catalogDir);

  const onlyExtracted = extracted.filter((f) => !committed.includes(f));
  const onlyCommitted = committed.filter((f) => !extracted.includes(f));
  if (onlyExtracted.length > 0 || onlyCommitted.length > 0) {
    failed = true;
    console.error('Catalog files differ from extraction:');
    for (const f of onlyExtracted) console.error(`  extraction produced ${f}`);
    for (const f of onlyCommitted) console.error(`  committed but not produced: ${f}`);
  }

  for (const file of extracted.filter((f) => committed.includes(f))) {
    const before = messageIds(snapshot, file);
    const after = messageIds(catalogDir, file);

    const missing = [...after].filter((id) => !before.has(id));
    const obsolete = [...before].filter((id) => !after.has(id));
    if (missing.length === 0 && obsolete.length === 0) continue;

    failed = true;
    console.error(`\n${path.join(catalogDir, file)}`);
    for (const id of missing) console.error(`  + not in the catalog: ${id}`);
    for (const id of obsolete) console.error(`  - no longer in source: ${id}`);
  }
} finally {
  // Restore, so a passing check never leaves formatting churn behind.
  rmSync(catalogDir, { recursive: true, force: true });
  cpSync(snapshot, catalogDir, { recursive: true });
  rmSync(snapshot, { recursive: true, force: true });
}

if (failed) {
  console.error('\nRun `yarn workspace @maintainerr/ui i18n:extract` and commit the result.');
  process.exit(1);
}

console.log('Translation catalog is current with the source strings.');
