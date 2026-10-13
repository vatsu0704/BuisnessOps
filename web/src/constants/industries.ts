import type { IconType } from 'react-icons';
import { IoBusinessOutline, IoConstructOutline, IoRestaurantOutline, IoStorefrontOutline } from 'react-icons/io5';
import type { Industry } from '@/types/business';

/**
 * The industry picker's options, in the app's order (its `constants/industries.ts`,
 * which carries Ionicons names the web cannot use). Labels and captions come from
 * the shared translations, keyed by `value`.
 */
export const INDUSTRY_OPTIONS: { value: Industry; icon: IconType }[] = [
  { value: 'RETAIL', icon: IoStorefrontOutline },
  { value: 'FOOD_BEVERAGE', icon: IoRestaurantOutline },
  { value: 'SERVICES', icon: IoConstructOutline },
  { value: 'FRANCHISE_OTHER', icon: IoBusinessOutline },
];
