/**
 * Machine-translates each submitted translation back to English and reports
 * the ones that drift far from the source string.
 *
 * This is a smell detector, not a gate. Correct translations routinely come
 * back with different wording, so it runs advisory by default and only fails
 * the build with --strict. The deterministic guarantees live in
 * validate-catalogs.mjs; this catches the semantic nonsense that one cannot.
 *
 * Provider comes from the environment, whichever is set:
 *   LIBRETRANSLATE_URL   (+ optional LIBRETRANSLATE_API_KEY)
 *   DEEPL_API_KEY        (+ optional DEEPL_API_HOST)
 *
 * With neither set it exits 0 without doing anything, so the job is inert
 * until a secret is configured.
 *
 * Usage: node tools/i18n/back-translate.mjs [catalogDir] [--strict]
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { icuArguments, readPo } from './po.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const catalogDir = args.find((value) => !value.startsWith('--')) ?? 'apps/ui/src/locales';

const SOURCE_LOCALE = 'en';
// Below this token overlap a translation is worth a human glance. Tuned low on
// purpose: this should surface nonsense, not quibble about word choice.
const SIMILARITY_FLOOR = 0.25;
// Very short strings are noise - "Save" round-trips to "Store" all the time.
const MIN_TOKENS = 3;

const libreUrl = process.env.LIBRETRANSLATE_URL;
const deeplKey = process.env.DEEPL_API_KEY;

if (!libreUrl && !deeplKey) {
  console.log(
    'No machine-translation provider configured; skipping back-translation.',
  );
  console.log('Set LIBRETRANSLATE_URL or DEEPL_API_KEY to enable it.');
  process.exit(0);
}

const translate = async (text, sourceLocale) => {
  if (libreUrl) {
    const response = await fetch(new URL('/translate', libreUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceLocale,
        target: SOURCE_LOCALE,
        format: 'text',
        ...(process.env.LIBRETRANSLATE_API_KEY
          ? { api_key: process.env.LIBRETRANSLATE_API_KEY }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(`LibreTranslate ${response.status}`);
    const body = await response.json();
    return body.translatedText;
  }

  const host = process.env.DEEPL_API_HOST ?? 'https://api-free.deepl.com';
  const response = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${deeplKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text], target_lang: 'EN-GB' }),
  });
  if (!response.ok) throw new Error(`DeepL ${response.status}`);
  const body = await response.json();
  return body.translations[0].text;
};

/** Strip ICU arguments and punctuation, then split into comparable tokens. */
const tokenize = (text) => {
  let stripped = '';
  let depth = 0;
  for (const char of text) {
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) stripped += char;
  }

  const tokens = [];
  let word = '';
  for (const char of stripped.toLowerCase()) {
    const isWordChar =
      (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
    if (isWordChar) word += char;
    else if (word !== '') {
      tokens.push(word);
      word = '';
    }
  }
  if (word !== '') tokens.push(word);
  return tokens;
};

/** Dice coefficient over token sets: 1 identical, 0 nothing in common. */
const similarity = (left, right) => {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
};

const files = readdirSync(catalogDir)
  .filter((name) => name.endsWith('.po') && name !== `${SOURCE_LOCALE}.po`)
  .sort();

const flagged = [];
const failures = [];
let checked = 0;

for (const file of files) {
  const locale = path.basename(file, '.po');
  const cache = new Map();

  for (const entry of readPo(path.join(catalogDir, file))) {
    if (entry.msgstr === '') continue;
    // Placeholder-only or very short strings carry no signal.
    if (tokenize(entry.msgid).length < MIN_TOKENS) continue;
    // Anything the deterministic check would already reject is skipped here.
    if (icuArguments(entry.msgid).size !== icuArguments(entry.msgstr).size) {
      continue;
    }

    let english = cache.get(entry.msgstr);
    if (english === undefined) {
      try {
        english = await translate(entry.msgstr, locale);
        cache.set(entry.msgstr, english);
      } catch (error) {
        failures.push(`${locale}: ${error.message}`);
        continue;
      }
    }

    checked += 1;
    const score = similarity(entry.msgid, english);
    if (score < SIMILARITY_FLOOR) {
      flagged.push({
        file: path.join(catalogDir, file),
        line: entry.line,
        source: entry.msgid,
        translation: entry.msgstr,
        english,
        score,
      });
    }
  }
}

if (failures.length > 0) {
  console.log(`Provider errors (${failures.length}), those strings were skipped:`);
  for (const failure of failures.slice(0, 10)) console.log(`  ${failure}`);
  console.log('');
}

console.log(`Back-translated ${checked} strings across ${files.length} catalogs.`);

if (flagged.length === 0) {
  console.log('Nothing looks semantically off.');
  process.exit(0);
}

console.log(`\nWorth a human glance (${flagged.length}):\n`);
for (const item of flagged) {
  console.log(`  ${item.file}:${item.line}  similarity ${item.score.toFixed(2)}`);
  console.log(`    source:          ${item.source}`);
  console.log(`    translation:     ${item.translation}`);
  console.log(`    back-translated: ${item.english}\n`);
}
console.log(
  'Low similarity is a hint, not a verdict - idiomatic translations score low too.',
);

process.exit(strict ? 1 : 0);
