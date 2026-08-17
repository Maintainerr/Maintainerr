import { readFileSync } from 'node:fs';

/** Decode a quoted PO string literal, including its surrounding quotes. */
const unescape = (raw) => {
  let out = '';
  for (let i = 1; i < raw.length - 1; i += 1) {
    const char = raw[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    i += 1;
    const next = raw[i];
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else out += next;
  }
  return out;
};

/** The quoted section of a PO line, or null when the line carries none. */
const quoted = (line) => {
  const start = line.indexOf('"');
  const end = line.lastIndexOf('"');
  if (start === -1 || end <= start) return null;
  return line.slice(start, end + 1);
};

const FIELDS = ['msgctxt', 'msgid', 'msgid_plural', 'msgstr'];

const fieldOf = (line) => {
  for (const field of FIELDS) {
    if (!line.startsWith(field)) continue;
    // msgstr[0], msgstr[1], ... all collapse onto msgstr for our purposes.
    const rest = line.slice(field.length);
    if (rest.startsWith(' ') || rest.startsWith('"') || rest.startsWith('[')) {
      return field;
    }
  }
  return null;
};

/**
 * Parse a PO file into entries. Deliberately minimal: these catalogs are
 * machine-written by Lingui, so the exotic corners of the format never appear.
 */
export const parsePo = (text) => {
  const entries = [];
  const lines = text.split('\n');
  let current = null;
  let field = null;

  const flush = () => {
    if (current && current.msgid !== '') entries.push(current);
    current = null;
    field = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('#')) continue;

    // Flag indexed plural forms (msgid_plural, msgstr[1]...). Lingui renders
    // only msgstr[0], so a validator that reads the other variants would vouch
    // for text the app never shows; the validator rejects flagged entries.
    if (line.startsWith('msgid_plural')) {
      if (current) current.hasPlural = true;
    } else if (line.startsWith('msgstr[')) {
      const close = line.indexOf(']');
      const pluralIndex = Number(line.slice('msgstr['.length, close));
      if (current && pluralIndex > 0) current.hasPlural = true;
    }

    const next = fieldOf(line);
    if (next) {
      // A new entry begins at msgctxt or msgid; flush the previous one if a
      // blank line did not already (Lingui separates entries, but be safe).
      if (
        (next === 'msgctxt' || next === 'msgid') &&
        current &&
        field === 'msgstr'
      ) {
        flush();
      }
      if (!current) current = { msgctxt: '', msgid: '', msgstr: '', line: index + 1 };
      field = next;
      const value = quoted(line);
      if (value && field !== 'msgid_plural') current[field] += unescape(value);
      continue;
    }

    // Continuation line of whatever field we are inside.
    if (current && field && field !== 'msgid_plural') {
      const value = quoted(line);
      if (value) current[field] += unescape(value);
    }
  }

  flush();
  return entries;
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
  const opened = new Map();
  const closed = new Map();
  const slots = new Set();

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
    if (isSelfClosing || !isClosing) {
      opened.set(digits, (opened.get(digits) ?? 0) + 1);
    }
    if (isSelfClosing || isClosing) {
      closed.set(digits, (closed.get(digits) ?? 0) + 1);
    }
    i = cursor;
  }

  let balanced = true;
  for (const slot of slots) {
    if ((opened.get(slot) ?? 0) !== (closed.get(slot) ?? 0)) balanced = false;
  }
  return { slots, balanced };
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
