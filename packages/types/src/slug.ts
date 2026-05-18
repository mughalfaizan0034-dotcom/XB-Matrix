/**
 * Canonical slug rules used platform-wide (organizations, workspaces, any
 * public URL identifier). Single source of truth — frontend and backend
 * import the same module so normalization, validation, and length limits
 * cannot drift between layers.
 *
 * A valid slug is:
 *   - lowercase ASCII letters and digits
 *   - hyphens allowed as internal separators (no leading, trailing, or doubled)
 *   - length 1 to 64 characters
 *
 * Regex: ^[a-z0-9]+(?:-[a-z0-9]+)*$
 */

export const MAX_SLUG_LENGTH = 64;

/**
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` — for use with RegExp and HTML <input pattern>.
 * Avoids character-class hyphen ambiguity that was rejected under the
 * `/v` (unicode-sets) regex flag in some browsers.
 */
export const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

const SLUG_REGEX = new RegExp(SLUG_PATTERN);

/** Returns true if `value` is already a canonical slug. */
export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_REGEX.test(value)
  );
}

/**
 * Normalise an arbitrary human string into a canonical slug.
 *   "Xcelerate Brands"     → "xcelerate-brands"
 *   "  ACME  "             → "acme"
 *   "Hello_World!"         → "hello-world"
 *   "—weird—chars—"        → "weird-chars"
 *
 * Steps:
 *   1. Unicode-normalise (NFKD) and strip combining marks (so "café" → "cafe").
 *   2. Lowercase.
 *   3. Replace any run of non-[a-z0-9] with a single hyphen.
 *   4. Trim leading/trailing hyphens.
 *   5. Truncate to MAX_SLUG_LENGTH (re-trim hyphens after truncation).
 *
 * Returns an empty string if the input has no alphanumeric content.
 */
export function toSlug(input: string): string {
  if (!input) return '';
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length <= MAX_SLUG_LENGTH) return normalized;
  return normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
}

/**
 * Human-readable explanation for when a slug fails validation. Useful when
 * surfacing errors to the user (e.g. duplicate after derivation).
 */
export const SLUG_RULES_DESCRIPTION =
  'lowercase letters and digits, hyphens as separators only, 1–64 characters';
