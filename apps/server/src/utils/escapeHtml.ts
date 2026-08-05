const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape text for interpolation into an HTML document. Char-by-char rather than
 * a chained replace so `&` can never be double-escaped.
 */
export function escapeHtml(value: string): string {
  let escaped = '';

  for (const char of value) {
    escaped += HTML_ESCAPES[char] ?? char;
  }

  return escaped;
}
