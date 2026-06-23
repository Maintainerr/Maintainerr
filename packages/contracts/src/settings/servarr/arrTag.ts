/**
 * Radarr and Sonarr restrict tag labels to `^[a-z0-9-]+$` — lowercase letters,
 * digits and hyphens only. `POST /api/v3/tag` returns HTTP 400
 * ("Allowed characters a-z, 0-9 and -") for anything else.
 *
 * This is the single source of truth for that rule, shared by the server (which
 * normalizes a rule group's name into a membership tag and applies the exclusion
 * tag) and the UI (which validates the user's exclusion-tag label and explains
 * the format). Manual char checks, not regex (repo convention).
 */

/** Human-readable hint shown next to tag-label inputs. */
export const ARR_TAG_LABEL_HINT =
  'Lowercase letters, numbers and hyphens only (a-z, 0-9, -)'

// a-z (97-122), 0-9 (48-57), '-' (45)
const isAllowedArrTagChar = (code: number): boolean =>
  (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 45

/**
 * True when `label` is a valid *arr tag label that the server would apply
 * verbatim: non-empty, only allowed characters, AND already in normalized form
 * (no leading/trailing/doubled hyphens). The last check rejects inputs like
 * `-dnd`, `dnd-`, `my--tag` and `--` that `normalizeArrTagLabel` would alter or
 * empty out — so the label the user saves is exactly the tag the instance gets.
 */
export function isValidArrTagLabel(label: string): boolean {
  if (label.length === 0) {
    return false
  }
  for (let i = 0; i < label.length; i++) {
    if (!isAllowedArrTagChar(label.charCodeAt(i))) {
      return false
    }
  }
  return normalizeArrTagLabel(label) === label
}

/**
 * Convert any string into a valid *arr tag label: lowercase, with every run of
 * disallowed characters collapsed to a single hyphen and the ends trimmed
 * ("Stale Movies (2020)" → "stale-movies-2020"). Returns '' when no usable
 * character remains, so callers can skip rather than send an invalid label.
 */
export function normalizeArrTagLabel(label: string): string {
  const lower = label.toLowerCase()
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i)
    const isAlnum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57)
    if (isAlnum) {
      current += lower.charAt(i)
    } else if (current) {
      // Any non-alnum run (space, hyphen, symbol) is a single separator.
      parts.push(current)
      current = ''
    }
  }
  if (current) {
    parts.push(current)
  }
  return parts.join('-')
}
