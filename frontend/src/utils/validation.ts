const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Parses a user-typed optional numeric field.
 * - empty/whitespace input -> undefined (field left blank, not an error)
 * - non-numeric input (e.g. "abc") -> null (invalid — `Number("abc")` is NaN,
 *   and NaN serializes to `null` over JSON, so silently sending it through
 *   would look identical to "left blank" with no error ever shown)
 * - otherwise -> the parsed number
 */
export function parseOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
