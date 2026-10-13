/**
 * Chrome still reports some zones by their pre-2000s names — India as
 * "Asia/Calcutta". Both are valid, but the rest of the app writes the current
 * name, and a business's timezone is shown back to its owner.
 */
const LEGACY_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
};

/**
 * The browser knows its own time zone, which the phone (without a dependable
 * Intl) cannot tell the app — so a new business on the web starts from it rather
 * than from Asia/Kolkata, and the owner can still change it.
 */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (zone && LEGACY_ZONES[zone]) || zone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}
