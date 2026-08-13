/**
 * Deterministic gate on translation catalogs.
 *
 * Weblate enforces the same checks when a translation is saved, but that is a
 * setting on someone else's server. This runs in our repo on the PR itself, so
 * a broken placeholder cannot reach the app even if that setting is changed.
 *
 * Usage: node tools/i18n/validate-catalogs.mjs [catalogDir]
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { icuArguments, readPo } from './po.mjs';

const catalogDir = process.argv[2] ?? 'apps/ui/src/locales';
const SOURCE_LOCALE = 'en';

const errors = [];
const notes = [];

const files = readdirSync(catalogDir)
  .filter((name) => name.endsWith('.po'))
  .sort();

if (files.length === 0) {
  console.error(`No catalogs found in ${catalogDir}`);
  process.exit(1);
}

// The source catalog is the reference for every placeholder comparison.
const sourceEntries = readPo(path.join(catalogDir, `${SOURCE_LOCALE}.po`));
const sourceArguments = new Map(
  sourceEntries.map((entry) => [entry.msgid, icuArguments(entry.msgid)]),
);

for (const file of files) {
  const locale = path.basename(file, '.po');
  if (locale === SOURCE_LOCALE) continue;

  const location = path.join(catalogDir, file);
  for (const entry of readPo(location)) {
    if (entry.msgstr === '') continue;

    const expected = sourceArguments.get(entry.msgid) ?? icuArguments(entry.msgid);
    const actual = icuArguments(entry.msgstr);

    const missing = [...expected].filter((name) => !actual.has(name));
    const unknown = [...actual].filter((name) => !expected.has(name));

    if (missing.length > 0 || unknown.length > 0) {
      const parts = [];
      if (missing.length > 0) parts.push(`missing ${missing.join(', ')}`);
      if (unknown.length > 0) parts.push(`unexpected ${unknown.join(', ')}`);
      errors.push(
        `${location}:${entry.line}\n` +
          `    source:      ${entry.msgid}\n` +
          `    translation: ${entry.msgstr}\n` +
          `    placeholder ${parts.join(' and ')}`,
      );
      continue;
    }

    if (entry.msgstr === entry.msgid) {
      notes.push(`${location}:${entry.line} identical to source: ${entry.msgid}`);
    }
  }
}

if (notes.length > 0) {
  console.log(`Notes (${notes.length}) - identical to source, often legitimate:`);
  for (const note of notes) console.log(`  ${note}`);
  console.log('');
}

if (errors.length > 0) {
  console.error(`Placeholder errors (${errors.length}):\n`);
  for (const error of errors) console.error(`  ${error}\n`);
  console.error(
    'A translation that drops or invents a placeholder crashes the render.',
  );
  process.exit(1);
}

console.log(
  `Catalogs valid: ${files.length} files, placeholders consistent with ${SOURCE_LOCALE}.po`,
);
