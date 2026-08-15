/**
 * Deterministic gate on translation catalogs.
 *
 * Weblate enforces the same checks when a translation is saved, but that is a
 * setting on someone else's server. This runs in our repo on the PR itself, so
 * a broken placeholder cannot reach the app even if that setting is changed.
 *
 * Translators are untrusted input. Beyond placeholder parity this rejects:
 * - the Trojan Source bidi set and invisible characters, which can visually
 *   reorder or hide text (direction marks U+200E/U+200F and joiners
 *   U+200C/U+200D stay allowed - RTL and complex scripts need them);
 * - Zalgo combining runs and oversized entries, which overflow adjacent UI;
 * - a translation that introduces a URL marker the source does not carry
 *   (phishing via translated copy);
 * - any URL marker in a source message at all - URLs live in code and reach
 *   messages only as named placeholders, so a translation can never display
 *   a link target;
 * - any translated msgstr altered or added outside Weblate.
 *
 * Translations come from Weblate, so a pull request that is not a Weblate sync
 * must never hand-edit or add one. This is checked by default against the
 * merge-base with the base branch (GITHUB_BASE_REF in CI, else development), so
 * only what the branch itself changed is compared and a branch merely behind on
 * translations is not flagged. The source locale is exempt (its msgstr mirrors
 * the msgid). `--base <ref>` overrides the comparison point; `--no-base`
 * disables it, which CI does for Weblate syncs. If no base can be resolved (no
 * git, ref not fetched) the check is skipped rather than flag every string.
 *
 * Usage: node tools/i18n/validate-catalogs.mjs [catalogDir] [--base <ref>] [--no-base]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { icuArguments, parsePo, readPo } from './po.mjs';

const args = process.argv.slice(2);
const noBase = args.includes('--no-base');
const baseIndex = args.indexOf('--base');
const explicitBase = baseIndex === -1 ? null : args[baseIndex + 1];
const catalogDir =
  args.find(
    (arg, index) =>
      !arg.startsWith('--') && (baseIndex === -1 || index !== baseIndex + 1),
  ) ?? 'apps/ui/src/locales';
const SOURCE_LOCALE = 'en';

const resolveBaseRef = () => {
  if (noBase) return null;
  if (explicitBase) return explicitBase;
  const branch = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/development';
  try {
    return (
      execFileSync('git', ['merge-base', 'HEAD', branch], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    );
  } catch {
    return null;
  }
};
const baseRef = resolveBaseRef();

// The full Trojan Source (CVE-2021-42574) reordering set - overrides,
// embeddings AND isolates - plus invisible characters that hide or fake
// content. The plain direction marks U+200E/U+200F and the joiners
// U+200C/U+200D stay allowed: they are how RTL and many scripts render
// correctly, and neither can reorder surrounding text.
const FORBIDDEN_CHARS = [
  ['\u202A', 'U+202A LEFT-TO-RIGHT EMBEDDING'],
  ['\u202B', 'U+202B RIGHT-TO-LEFT EMBEDDING'],
  ['\u202C', 'U+202C POP DIRECTIONAL FORMATTING'],
  ['\u202D', 'U+202D LEFT-TO-RIGHT OVERRIDE'],
  ['\u202E', 'U+202E RIGHT-TO-LEFT OVERRIDE'],
  ['\u2066', 'U+2066 LEFT-TO-RIGHT ISOLATE'],
  ['\u2067', 'U+2067 RIGHT-TO-LEFT ISOLATE'],
  ['\u2068', 'U+2068 FIRST STRONG ISOLATE'],
  ['\u2069', 'U+2069 POP DIRECTIONAL ISOLATE'],
  ['\u200B', 'U+200B ZERO WIDTH SPACE'],
  ['\u2060', 'U+2060 WORD JOINER'],
  ['\u00AD', 'U+00AD SOFT HYPHEN'],
  ['\u2800', 'U+2800 BRAILLE PATTERN BLANK'],
  ['\uFEFF', 'U+FEFF ZERO WIDTH NO-BREAK SPACE'],
];

// Interlinear annotation (U+FFF9-FFFB) and the invisible Tags block
// (U+E0000-E007F, which can carry a hidden payload) are ranges, not points.
const forbiddenRange = (codePoint) =>
  (codePoint >= 0xfff9 && codePoint <= 0xfffb) ||
  (codePoint >= 0xe0000 && codePoint <= 0xe007f);

// Catch every remaining default-ignorable code point (U+180E, U+034F,
// variation selectors, ...): invisible by design and a spoofing surface. Only
// the join/direction controls a translation legitimately needs are allowed.
const ALLOWED_FORMAT = new Set(['\u200C', '\u200D', '\u200E', '\u200F']);
const isDefaultIgnorable = (char) =>
  /\p{Default_Ignorable_Code_Point}/u.test(char);

// A msgid is a paragraph at most; anything far longer is layout-breaking
// bloat rather than a translation.
const MAX_MSGSTR_LENGTH = 1000;
// A run of combining marks past this is Zalgo, used to overflow onto
// adjacent UI rather than to spell a word.
const MAX_COMBINING_RUN = 8;

// `://` and `www.` catch the common forms; `mailto:`/`tel:` are unambiguous
// action schemes; the fullwidth colon is a homoglyph that dodges `://`.
const URL_MARKERS = ['://', '\uFF1A//', 'www.', 'mailto:', 'tel:'];

const isCombiningMark = (codePoint) =>
  /\p{M}/u.test(String.fromCodePoint(codePoint));

const forbiddenCharIn = (text) => {
  if (text.length > MAX_MSGSTR_LENGTH) {
    return `over ${MAX_MSGSTR_LENGTH} characters - layout-breaking bloat, not a translation`;
  }

  let combiningRun = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    for (const [forbidden, name] of FORBIDDEN_CHARS) {
      if (char === forbidden)
        return `${name} - it can visually reorder or hide text`;
    }
    if (forbiddenRange(codePoint)) {
      return `U+${codePoint.toString(16).toUpperCase()} - an invisible character that can hide content`;
    }
    if (!ALLOWED_FORMAT.has(char) && isDefaultIgnorable(char)) {
      return `U+${codePoint.toString(16).toUpperCase()} - a default-ignorable (invisible) character`;
    }
    combiningRun = isCombiningMark(codePoint) ? combiningRun + 1 : 0;
    if (combiningRun > MAX_COMBINING_RUN) {
      return `a run of over ${MAX_COMBINING_RUN} combining marks - it overflows onto adjacent UI`;
    }
  }
  return null;
};

const errors = [];
const notes = [];

const files = readdirSync(catalogDir)
  .filter((name) => name.endsWith('.po'))
  .sort();

if (files.length === 0) {
  console.error(`No catalogs found in ${catalogDir}`);
  process.exit(1);
}

// The source catalog is the reference for every placeholder comparison, and
// its messages must not carry URL markers: a URL in a msgid would hand the
// link text to every translator.
const sourceLocation = path.join(catalogDir, `${SOURCE_LOCALE}.po`);
const sourceEntries = readPo(sourceLocation);
// Keyed by context and id: a msgctxt makes two identical msgids distinct
// entries, exactly as Lingui compiles them.
const entryKey = (entry) => `${entry.msgctxt ?? ''}\u0000${entry.msgid}`;
const sourceArguments = new Map(
  sourceEntries.map((entry) => [entryKey(entry), icuArguments(entry.msgid)]),
);

// Translations as they stood at --base, keyed the same way, so a hand-edited
// or added msgstr in a non-Weblate PR can be caught. Null when no ref given;
// an empty map when the catalog is new at this ref (nothing existed to alter).
const baseTranslations = (file) => {
  if (!baseRef) return null;
  try {
    const text = execFileSync(
      'git',
      ['show', `${baseRef}:${path.join(catalogDir, file)}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return new Map(parsePo(text).map((entry) => [entryKey(entry), entry.msgstr]));
  } catch {
    return new Map();
  }
};

// Lingui compiles ICU plurals inside a single msgstr, never as PO plural
// forms, so any indexed/plural entry is both unexpected and unverifiable.
const rejectPlural = (entry, location) => {
  if (!entry.hasPlural) return false;
  errors.push(
    `${location}:${entry.line}\n` +
      `    ${entry.msgid}\n` +
      `    uses msgid_plural / msgstr[n] - indexed plural PO forms are not supported (Lingui renders only msgstr[0])`,
  );
  return true;
};

for (const entry of sourceEntries) {
  if (rejectPlural(entry, sourceLocation)) continue;
  for (const marker of URL_MARKERS) {
    if (entry.msgid.includes(marker)) {
      errors.push(
        `${sourceLocation}:${entry.line}\n` +
          `    source: ${entry.msgid}\n` +
          `    contains "${marker}" - URLs stay in code or arrive as named placeholders, never as message text`,
      );
    }
  }
  const forbidden = forbiddenCharIn(entry.msgid);
  if (forbidden) {
    errors.push(
      `${sourceLocation}:${entry.line}\n` +
        `    source: ${entry.msgid}\n` +
        `    contains ${forbidden}`,
    );
  }
}

for (const file of files) {
  const locale = path.basename(file, '.po');
  if (locale === SOURCE_LOCALE) continue;

  const location = path.join(catalogDir, file);
  const base = baseTranslations(file);
  for (const entry of readPo(location)) {
    if (rejectPlural(entry, location)) continue;

    // Translation integrity runs before the empty-msgstr skip, so emptying an
    // existing translation is caught too. Only meaningful with --base.
    if (base) {
      const prior = base.get(entryKey(entry));
      if (prior !== undefined && prior !== entry.msgstr) {
        errors.push(
          `${location}:${entry.line}\n` +
            `    source:      ${entry.msgid}\n` +
            `    translation: ${entry.msgstr}\n` +
            `    was changed from the base branch - translations come from Weblate, do not hand-edit`,
        );
      } else if (prior === undefined && entry.msgstr !== '') {
        errors.push(
          `${location}:${entry.line}\n` +
            `    source:      ${entry.msgid}\n` +
            `    translation: ${entry.msgstr}\n` +
            `    was added outside Weblate - a non-Weblate pull request must not add translations`,
        );
      }
    }

    if (entry.msgstr === '') continue;

    const forbidden = forbiddenCharIn(entry.msgstr);
    if (forbidden) {
      errors.push(
        `${location}:${entry.line}\n` +
          `    translation: ${entry.msgstr}\n` +
          `    contains ${forbidden}`,
      );
      continue;
    }

    const introducedMarker = URL_MARKERS.find(
      (marker) =>
        entry.msgstr.includes(marker) && !entry.msgid.includes(marker),
    );
    if (introducedMarker) {
      errors.push(
        `${location}:${entry.line}\n` +
          `    source:      ${entry.msgid}\n` +
          `    translation: ${entry.msgstr}\n` +
          `    introduces "${introducedMarker}" - a translation must never add a URL`,
      );
      continue;
    }

    const expected =
      sourceArguments.get(entryKey(entry)) ?? icuArguments(entry.msgid);
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
  console.error(`Catalog errors (${errors.length}):\n`);
  for (const error of errors) console.error(`  ${error}\n`);
  console.error(
    'A broken placeholder crashes the render; an introduced URL or bidi ' +
      'override is a spoofing vector. Translations are untrusted input.',
  );
  process.exit(1);
}

console.log(
  `Catalogs valid: ${files.length} files - placeholders, URL policy and ` +
    'character policy consistent with ' +
    `${SOURCE_LOCALE}.po`,
);
