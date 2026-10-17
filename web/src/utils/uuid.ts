/**
 * A random UUID for a sale's `clientRef` (requirement 30) — what makes sending a
 * sale twice safe.
 *
 * `crypto.randomUUID` exists only on a secure page (https, or localhost). On a
 * plain-http address in the shop's own network the same version-4 UUID is built
 * from `getRandomValues`, which every browser has everywhere.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
