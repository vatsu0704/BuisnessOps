import { useTranslation } from 'react-i18next';
import Pill from '@/components/Pill';
import type { BranchTrend, TrendDirection } from '@/types/analytics';
import type { PillTone } from '@/components/Pill';
import type { Ionicons } from '@expo/vector-icons';

/**
 * Which way a branch is moving — requirement 15's "know by looking where more
 * effort is needed".
 *
 * `Record`s over `TrendDirection` rather than a switch, so a direction added to
 * the backend enum fails `tsc` here until someone picks its tone and icon,
 * instead of rendering a pill with no colour.
 *
 * **Colour never carries the meaning on its own.** The pill always shows an
 * arrow and a figure (or a word, when the earlier month was zero and there is no
 * proportion to state), so it reads correctly to someone who cannot tell the
 * green from the red.
 */

const TONES: Record<TrendDirection, PillTone> = {
  UP: 'success',
  DOWN: 'danger',
  FLAT: 'muted',
};

const ICONS: Record<TrendDirection, keyof typeof Ionicons.glyphMap> = {
  UP: 'trending-up',
  DOWN: 'trending-down',
  FLAT: 'remove',
};

const WORDS: Record<TrendDirection, string> = {
  UP: 'reports.trendUp',
  DOWN: 'reports.trendDown',
  FLAT: 'reports.trendFlat',
};

export default function TrendPill({ trend }: { trend: BranchTrend }) {
  const { t } = useTranslation();

  // A percentage only when there is one to state. A month that follows a zero
  // has a direction but no proportion, and "+Infinity%" is worse than a word.
  const label = trend.comparable && trend.changePercent !== null
    ? `${Number(trend.changePercent) > 0 ? '+' : ''}${Math.round(Number(trend.changePercent))}%`
    : t(WORDS[trend.direction] as 'reports.trendFlat');

  return <Pill label={label} icon={ICONS[trend.direction]} tone={TONES[trend.direction]} />;
}
