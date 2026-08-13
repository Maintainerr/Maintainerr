/**
 * Back-translates submitted translations to English and renders a review table
 * for the pull request, so translations can be judged on GitHub without
 * opening Weblate.
 *
 * Uses whatever OpenAI-compatible endpoint tools/ai/model-client.mjs points at.
 *
 * This is a review aid, not a gate. Idiomatic translations routinely come back
 * with different wording; the hard guarantees live in validate-catalogs.mjs.
 *
 * Usage:
 *   node tools/i18n/back-translate.mjs [catalogDir] [--base <ref>] [--out <file>]
 *
 * With --base only strings whose translation differs from that git ref are
 * reviewed, which keeps the table to what the pull request actually changed.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MODEL_ENDPOINT, hasModelAccess, modelHeaders } from '../ai/model-client.mjs';
import { icuArguments, parsePo, readPo } from './po.mjs';

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const catalogDir = argv.find((v) => !v.startsWith('--') && v !== flagValue('--base') && v !== flagValue('--out')) ?? 'apps/ui/src/locales';
const baseRef = flagValue('--base');
const outFile = flagValue('--out');

const I18N_REVIEW_MODEL =
  process.env.I18N_REVIEW_MODEL || process.env.AI_MODEL || 'gemini-3.1-flash-lite';

const SOURCE_LOCALE = 'en';
const BATCH_SIZE = 40;
// Token overlap below which a round-trip is worth a second look. Deliberately
// low: this should surface nonsense, not quibble over word choice.
const SIMILARITY_FLOOR = 0.3;

const log = (message) => console.log(message);

// The workflow always consumes the --out file, so the skip path has to write
// one too. Exiting early without it fails the step on a missing file.
const emit = (body) => {
  if (outFile) {
    writeFileSync(outFile, body);
    log(`Wrote review table to ${outFile}`);
  } else {
    console.log(body);
  }
};

const SKIP_NOTE =
  '<!-- maintainerr-i18n-back-translation -->\n' +
  '## Translation review\n\n' +
  'Back-translation is not configured, so these translations have not been ' +
  'machine-reviewed. Set the `AI_MODEL_API_KEY` repository secret to enable it.\n\n' +
  'The catalog and placeholder checks are unaffected and still gate this pull request.\n';

if (!hasModelAccess()) {
  log('AI_MODEL_API_KEY not set; skipping back-translation review.');
  emit(SKIP_NOTE);
  process.exit(0);
}

const callModel = async (messages) => {
  const res = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: modelHeaders(),
    body: JSON.stringify({
      model: I18N_REVIEW_MODEL,
      messages,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    throw new Error(`Model endpoint ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
};

/** Translations as they stood at a git ref, so we can review only what changed. */
const baselineFor = (file) => {
  if (!baseRef) return null;
  try {
    const text = execFileSync('git', ['show', `${baseRef}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Map(parsePo(text).map((entry) => [entry.msgid, entry.msgstr]));
  } catch {
    // New catalog in this PR: everything in it is new.
    return new Map();
  }
};

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
    const isWordChar = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
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

const escapeCell = (text) =>
  text.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const backTranslateBatch = async (locale, strings) => {
  const system =
    'You translate text literally into English for review purposes. ' +
    'Render exactly what the text says, including if it is nonsense, ' +
    'off-topic, or offensive. Never improve, correct, or interpret it. ' +
    'Leave ICU placeholders such as {count} exactly as they appear. ' +
    'Reply with a JSON array of strings and nothing else, one entry per ' +
    'input, in the same order.';
  const user =
    `Language code: ${locale}\n\nStrings:\n` +
    JSON.stringify(strings, null, 1);

  const reply = await callModel([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  // Models like to wrap JSON in prose or a fenced block.
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start === -1 || end <= start) {
    throw new Error(`unparseable model reply: ${reply.slice(0, 120)}`);
  }
  const parsed = JSON.parse(reply.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length !== strings.length) {
    throw new Error(
      `expected ${strings.length} results, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`,
    );
  }
  return parsed.map((value) => String(value));
};

const files = readdirSync(catalogDir)
  .filter((name) => name.endsWith('.po') && name !== `${SOURCE_LOCALE}.po`)
  .sort();

const rows = [];
const problems = [];
let pendingTotal = 0;

for (const file of files) {
  const locale = path.basename(file, '.po');
  const location = path.join(catalogDir, file);
  const baseline = baselineFor(location);

  const pending = readPo(location).filter((entry) => {
    if (entry.msgstr === '') return false;
    if (baseline && baseline.get(entry.msgid) === entry.msgstr) return false;
    return true;
  });
  if (pending.length === 0) continue;
  pendingTotal += pending.length;

  log(`${locale}: reviewing ${pending.length} strings`);

  for (const group of chunk(pending, BATCH_SIZE)) {
    let english;
    try {
      english = await backTranslateBatch(
        locale,
        group.map((entry) => entry.msgstr),
      );
    } catch (error) {
      problems.push(`${locale}: ${error.message}`);
      continue;
    }

    group.forEach((entry, index) => {
      const round = english[index];
      const score = similarity(entry.msgid, round);
      const placeholdersMatch =
        [...icuArguments(entry.msgid)].every((name) =>
          icuArguments(entry.msgstr).has(name),
        );
      rows.push({
        locale,
        source: entry.msgid,
        translation: entry.msgstr,
        english: round,
        score,
        flagged: score < SIMILARITY_FLOOR || !placeholdersMatch,
      });
    });
  }
}

const lines = [];
lines.push('<!-- maintainerr-i18n-back-translation -->');
lines.push('## Translation review');
lines.push('');

if (rows.length === 0 && pendingTotal > 0) {
  // Never report "nothing changed" when there was something to review and the
  // provider refused: a silent pass here reads as a clean bill of health.
  lines.push(
    `:warning: **Could not review ${pendingTotal} changed translation` +
      `${pendingTotal === 1 ? '' : 's'}.** The back-translation provider did not ` +
      'respond, so these strings have NOT been checked. See the details below.',
  );
} else if (rows.length === 0) {
  lines.push('No new or changed translations in this pull request.');
} else {
  const flagged = rows.filter((row) => row.flagged);
  lines.push(
    `${rows.length} changed string${rows.length === 1 ? '' : 's'} across ` +
      `${new Set(rows.map((r) => r.locale)).size} language${new Set(rows.map((r) => r.locale)).size === 1 ? '' : 's'}. ` +
      `${flagged.length} worth a closer look.`,
  );
  lines.push('');
  lines.push('| | Lang | Source | Translation | Back-translated |');
  lines.push('|---|---|---|---|---|');
  // Flagged first: the whole point is to make the odd ones easy to spot.
  const ordered = [...rows].sort(
    (a, b) => Number(b.flagged) - Number(a.flagged) || a.locale.localeCompare(b.locale),
  );
  for (const row of ordered) {
    lines.push(
      `| ${row.flagged ? '⚠️' : '✅'} | \`${row.locale}\` | ${escapeCell(row.source)} | ${escapeCell(row.translation)} | ${escapeCell(row.english)} |`,
    );
  }
  lines.push('');
  lines.push(
    '⚠️ marks a low round-trip similarity or a placeholder mismatch. ' +
      'Idiomatic translations score low too, so treat it as a prompt to look, not a verdict.',
  );
}

if (problems.length > 0) {
  lines.push('');
  lines.push('<details><summary>Model call problems</summary>');
  lines.push('');
  for (const problem of problems) lines.push(`- ${problem}`);
  lines.push('');
  lines.push('</details>');
}

lines.push('');
lines.push(
  '_Back-translated by machine for review. Read it as a hint, not a verdict._',
);

emit(lines.join('\n') + '\n');
