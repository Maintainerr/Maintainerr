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

const FIELDS = ['msgid', 'msgid_plural', 'msgstr'];

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

    const next = fieldOf(line);
    if (next) {
      if (next === 'msgid' && current && field === 'msgstr') flush();
      if (!current) current = { msgid: '', msgstr: '', line: index + 1 };
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

const isIdentifierChar = (char) =>
  (char >= 'a' && char <= 'z') ||
  (char >= 'A' && char <= 'Z') ||
  (char >= '0' && char <= '9') ||
  char === '_';

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
