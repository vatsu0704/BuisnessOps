/** "Rajesh Patel" → "RP"; a single name or an email → its first two letters. For avatars. */
export function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
