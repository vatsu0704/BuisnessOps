/** Joins the class names that are set: cx('a', isB && 'b') → 'a b' or 'a'. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
