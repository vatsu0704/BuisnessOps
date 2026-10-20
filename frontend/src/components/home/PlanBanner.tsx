import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import { planBanner, planBannerText, type PlanBannerKind } from '@/constants/plans';
import type { Membership } from '@/types/user';
import { can } from '@/utils/permissions';
import { colors, radius, spacing } from '@/theme';
import { step } from '@/theme/motion';

/**
 * Requirement 28 — the plan, on Home, only when there is something to say.
 *
 * Read-only is shown to everyone, because it is why their next save will be
 * refused. A trial in its last days and a lapsed plan's grace period are shown
 * to the owner alone, the only person who can do anything about either; see
 * `planBanner` in constants/plans.ts.
 *
 * The sentence and the link are stacked, never side by side: every Indic
 * translation of the sentence is longer than the English, and a row of two
 * growing things is the row that breaks in Gujarati.
 */

const TONES: Record<PlanBannerKind, { tint: string; background: string; icon: keyof typeof Ionicons.glyphMap }> = {
  trialEnding: { tint: colors.primary, background: colors.primaryLight, icon: 'time-outline' },
  // The same warning wash Pill uses, so a warning reads the same everywhere.
  grace: { tint: colors.warning, background: colors.warningBg, icon: 'alert-circle-outline' },
  readOnly: { tint: colors.error, background: colors.errorBg, icon: 'lock-closed-outline' },
};

type Props = {
  membership: Membership | undefined;
  onOpenPlan: () => void;
};

export default function PlanBanner({ membership, onOpenPlan }: Props) {
  const { t } = useTranslation();
  const isOwner = can.manageBilling(membership);
  const banner = planBanner(membership?.business.subscription, isOwner);
  if (!banner) return null;

  const tone = TONES[banner.kind];
  return (
    <AnimatedEntrance delay={step(1)} style={styles.block}>
      <View testID={`plan-banner-${banner.kind}`} style={[styles.card, { backgroundColor: tone.background }]}>
        <View style={styles.message}>
          <Ionicons name={tone.icon} size={18} color={tone.tint} style={styles.icon} />
          <Text style={styles.text}>{planBannerText(banner, t)}</Text>
        </View>
        {isOwner ? (
          <PressableScale testID="plan-banner-open" style={styles.link} onPress={onOpenPlan}>
            <Text style={[styles.linkText, { color: tone.tint }]}>{t('plans.banner.seePlan')}</Text>
            <Ionicons name="chevron-forward" size={14} color={tone.tint} />
          </PressableScale>
        ) : null}
      </View>
    </AnimatedEntrance>
  );
}

const styles = StyleSheet.create({
  // Matches Home's own blocks, which space themselves from the one above.
  block: { marginTop: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text },
  link: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, paddingLeft: 26 },
  linkText: { fontSize: 13.5, fontWeight: '700' },
});
