import { readFileSync } from 'node:fs';
import { parsePo as parseLinguiPo } from 'pofile-ts';

/**
 * Start line of every PO entry block, in file order, so a validator error can
 * point at the offending entry. This only locates the first field line of each
 * block - it never interprets string contents, so it cannot reintroduce the
 * decode divergence that delegating the parse to pofile-ts exists to remove.
 */
const entryStartLines = (text) => {
  const lines = text.split('\n');
  const starts = [];
  let expectingStart = true;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '') {
      expectingStart = true;
      continue;
    }
    // Comments (including obsolete "#~" blocks) never open an entry here.
    if (line.startsWith('#')) continue;
    if (expectingStart) {
      starts.push(index + 1);
      expectingStart = false;
    }
  }
  return starts;
};

/**
 * Parse a PO catalog into entries, decoding exactly as the runtime does.
 *
 * The decode is delegated to `pofile-ts` - the parser Lingui itself compiles
 * catalogs through - so every string the validator inspects is byte-for-byte
 * the string the app renders. A hand-rolled decoder used to live here and
 * diverged: it read the octal escape "\0" as the digit "0", slipping a NUL and
 * a broken rich-text slot past every content check while Lingui produced the
 * real NUL at runtime. One parser is one source of truth, which closes that
 * class of bypass (the source-locale msgstr === msgid integrity check being the
 * gate it defeated). `poShapeProblems` still rejects the file shapes pofile-ts
 * reads more leniently than a reviewer would (obsolete "#~", stray msgstr).
 */
export const parsePo = (text) => {
  const { items } = parseLinguiPo(text);
  const starts = entryStartLines(text);
  // pofile-ts omits the header entry; when the block-start count agrees, the
  // extra leading start is the header's, so map entries past it.
  const headerOffset = starts.length === items.length + 1 ? 1 : 0;
  return items.map((item, order) => ({
    msgctxt: item.msgctxt ?? '',
    msgid: item.msgid,
    msgstr: item.msgstr[0] ?? '',
    // Lingui renders msgstr[0] only; a PO plural form (msgid_plural, msgstr[1+])
    // would vouch for text the app never shows, so flag it for rejection.
    hasPlural: item.msgid_plural != null || item.msgstr.length > 1,
    line: starts[order + headerOffset] ?? 0,
  }));
};

export const readPo = (path) => parsePo(readFileSync(path, 'utf8'));

/**
 * Structural problems that make a catalog mean different things to different
 * parsers.
 *
 * A checker is only worth what it reads, and Lingui is more forgiving than
 * this parser. Two shapes proved to slip a translation past every content
 * check while Lingui still bound it to a live message:
 *
 *   - an obsolete `#~` block. Comments are skipped here, so the live entry
 *     reads as untranslated - but Lingui restores the commented msgstr onto
 *     the live message id.
 *   - `msgstr` written above its `msgid`. This parser starts an entry at
 *     msgid and never sees the stray translation; Lingui binds it.
 *
 * Rather than chase Lingui's leniency, reject anything outside the canonical
 * form. These catalogs are machine-written, so any deviation is either a
 * corrupt file or someone shaping one by hand.
 */
export const poShapeProblems = (text) => {
  const problems = [];
  let sawMsgid = false;
  let sawMsgstr = false;
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line.startsWith('#~')) {
      problems.push({
        line: index + 1,
        reason:
          'an obsolete "#~" entry - Lingui restores its translation onto the live message, so the content checks never see it',
      });
      continue;
    }
    if (line.startsWith('#')) continue;

    if (line === '') {
      sawMsgid = false;
      sawMsgstr = false;
      continue;
    }

    if (line.startsWith('msgid') && !line.startsWith('msgid_plural')) {
      // A msgid after a msgstr opens the next entry even without a blank line.
      if (sawMsgstr) sawMsgstr = false;
      sawMsgid = true;
      continue;
    }

    if (line.startsWith('msgstr')) {
      if (!sawMsgid) {
        problems.push({
          line: index + 1,
          reason:
            'a "msgstr" before its "msgid" - parsers disagree on what it translates, and Lingui binds it to the entry that follows',
        });
      }
      sawMsgstr = true;
    }
  }

  return problems;
};

const isIdentifierChar = (char) =>
  (char >= 'a' && char <= 'z') ||
  (char >= 'A' && char <= 'Z') ||
  (char >= '0' && char <= '9') ||
  char === '_';

/**
 * Numeric rich-text slots (`<0>...</0>`, `<1/>`) appearing in a message.
 *
 * Lingui replaces these with components the caller supplies by index, so a
 * translation must use exactly the source's numbers: a renumbered slot finds
 * no component and its wrapper - a link, emphasis, a button - silently
 * disappears while the text still renders. Returns the set of slot numbers
 * and whether every `<n>` has a matching `</n>` (a self-closing `<n/>` counts
 * as both).
 */
export const richTextSlots = (text) => {
  const slots = new Set();
  // Order is as much a part of the contract as the count: `</0>x<0>` and
  // `<0>a<1>b</0>c</1>` both have one open and one close per slot, yet the
  // runtime resolves neither and prints the raw `</0>` to the user. A stack
  // rejects both; counters cannot tell them from a well-formed message.
  const open = [];
  let ordered = true;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '<') continue;

    let cursor = i + 1;
    const isClosing = text[cursor] === '/';
    if (isClosing) cursor += 1;

    let digits = '';
    while (
      cursor < text.length &&
      text[cursor] >= '0' &&
      text[cursor] <= '9'
    ) {
      digits += text[cursor];
      cursor += 1;
    }
    if (digits === '') continue;

    const isSelfClosing =
      !isClosing && text[cursor] === '/' && text[cursor + 1] === '>';
    if (isSelfClosing) cursor += 1;
    if (text[cursor] !== '>') continue;

    slots.add(digits);
    // A self-closing `<n/>` opens and closes at once, so it never nests.
    if (isClosing) {
      if (open.pop() !== digits) ordered = false;
    } else if (!isSelfClosing) {
      open.push(digits);
    }
    i = cursor;
  }

  return { slots, balanced: ordered && open.length === 0 };
};

/**
 * ICU argument names appearing anywhere in a message.
 *
 * Only records `{name}` and `{name, ...}`, so sub-messages inside a plural
 * branch (`{count, plural, one {# item} ...}`) are not mistaken for arguments.
 */
export const icuArguments = (text) => {
  const names = new Set();
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let j = i + 1;
    let name = '';
    while (j < text.length && isIdentifierChar(text[j])) {
      name += text[j];
      j += 1;
    }
    if (name === '') continue;
    // A real argument is closed or followed by its format type.
    if (text[j] === '}' || text[j] === ',') names.add(name);
  }
  return names;
};

/**
 * The format type of one ICU argument - `plural`, `select`, `selectordinal`,
 * or '' for a plain value. Callers need it to supply a value of the right
 * shape: a plural branch is chosen by a number, a select by a branch name.
 */
export const icuArgumentKind = (text, name) => {
  const marker = `{${name}`;
  let from = 0;

  for (;;) {
    const at = text.indexOf(marker, from);
    if (at === -1) return '';

    let cursor = at + marker.length;
    while (text[cursor] === ' ') cursor += 1;
    // No comma means this is a plain `{name}`, but the same name may appear
    // again later with a format type, so keep looking.
    if (text[cursor] !== ',') {
      from = at + 1;
      continue;
    }

    cursor += 1;
    while (text[cursor] === ' ') cursor += 1;

    let end = cursor;
    while (end < text.length && isIdentifierChar(text[end])) end += 1;
    return text.slice(cursor, end);
  }
};
