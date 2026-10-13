import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoRemove, IoTrendingDown, IoTrendingUp } from 'react-icons/io5';
import Pill, { type PillTone } from '@/components/ui/Pill';
import type { BranchTrend, TrendDirection } from '@/types/analytics';
import { trendPercent } from './ranking';

/**
 * Which way a branch is moving — requirement 15. `Record`s over `TrendDirection`,
 * so a direction added on the server fails `tsc` until it has a tone and an icon.
 * Colour never carries the meaning alone: the pill always has an arrow and a
 * figure, or a word.
 */
const TONES: Record<TrendDirection, PillTone> = { UP: 'success', DOWN: 'danger', FLAT: 'muted' };
const ICONS: Record<TrendDirection, IconType> = { UP: IoTrendingUp, DOWN: IoTrendingDown, FLAT: IoRemove };
const WORDS = { UP: 'reports.trendUp', DOWN: 'reports.trendDown', FLAT: 'reports.trendFlat' } as const satisfies Record<
  TrendDirection,
  string
>;

export default function TrendPill({ trend }: { trend: BranchTrend }) {
  const { t } = useTranslation();
  return (
    <Pill
      label={trendPercent(trend) ?? t(WORDS[trend.direction])}
      icon={ICONS[trend.direction]}
      tone={TONES[trend.direction]}
    />
  );
}
