import type { Ionicons } from '@expo/vector-icons';
import type { Industry } from '@/types/business';

/**
 * The industry picker's options, in the order they are offered.
 *
 * Shared by signup (creating the first business) and Add business (creating the
 * rest, requirement 16) — the two are the same choice and must offer the same
 * options. Labels and captions come from the translation files, keyed by
 * `value`, so this carries only what cannot live in JSON.
 *
 * `Record`-free but exhaustive by construction: the array is typed against
 * `Industry`, so a value that is not an Industry fails to compile. A new
 * industry added to the enum will not fail here, though — it will simply not be
 * offered, which is the safer direction to fail in for a picker.
 */
export const INDUSTRY_OPTIONS: { value: Industry; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'RETAIL', icon: 'storefront-outline' },
  { value: 'FOOD_BEVERAGE', icon: 'restaurant-outline' },
  { value: 'SERVICES', icon: 'construct-outline' },
  { value: 'FRANCHISE_OTHER', icon: 'business-outline' },
];
