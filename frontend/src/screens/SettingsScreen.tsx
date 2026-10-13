import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import BusinessSwitcher from '@/components/BusinessSwitcher';
import DangerButton from '@/components/DangerButton';
import InfoCard from '@/components/InfoCard';
import LanguageSelector from '@/components/LanguageSelector';
import NotificationSettings from '@/components/NotificationSettings';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, gradient, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { useMembership } from '@/hooks/useBusinessId';
import { can, hasNoActiveBusiness, switchableMemberships } from '@/utils/permissions';
import { openLegalPage } from '@/utils/legalLinks';
import { subscriptionStatusLabel } from '@/constants/plans';
import { planName } from '@/permissions/explain';

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const logout = useAuthStore((s) => s.logout);
  const { stats } = useBranches();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  // The membership for the business currently switched to, not simply the
  // first one - a role can differ between businesses, and so can what this
  // screen is allowed to offer.
  const membership = useMembership();
  const canManageTeam = can.manageTeam(membership);
  const canManageWorkCalendar = can.manageWorkCalendar(membership);
  const canAddBusiness = can.createBusiness(membership);
  const canManagePaymentAccounts = can.managePaymentAccounts(membership);
  const canManageBilling = can.manageBilling(membership);
  const subscription = membership?.business.subscription;
  const noAccess = hasNoActiveBusiness(user);
  // Decided here rather than inside the switcher: AnimatedEntrance carries the
  // block's top margin, so a switcher that renders null would still leave a
  // gap on every single-business account.
  const canSwitchBusiness = switchableMemberships(user).length > 1;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.screenTitle}>{t('settings.title')}</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <LinearGradient
                  colors={gradient.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.avatarGradient]}
                />
                <Text style={styles.avatarText}>{initials(user?.name, user?.email)}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{user?.name ?? user?.email}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
              <Row label={t('settings.email')} value={user?.email ?? '—'} />
              {membership ? <Row label={t('settings.role')} value={t(`role.${membership.role}`)} /> : null}
            </View>
          </AnimatedEntrance>

          {canSwitchBusiness ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <BusinessSwitcher />
            </AnimatedEntrance>
          ) : null}

          {/* Owners only — starting a business is the owner's act, not a
              delegated one (`business:create`, excluded from ADMIN and so from
              MANAGER too). A cashier or a warehouse desk has no use for it.

              Deliberately outside the switcher's condition. BusinessSwitcher
              renders nothing until there are two businesses, so putting the
              "add" entry inside it would mean the only people who could add a
              second business are the ones who already have one.

              `noAccess` keeps it for someone whose every membership was
              revoked: there is no role left to hold a capability, and hiding it
              from them would leave an account with nothing it can do. */}
          {canAddBusiness || noAccess ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <InfoCard
                testID="settings-add-business"
                icon="add-circle-outline"
                title={t('settings.addBusiness')}
                subtitle={t('settings.addBusinessSubtitle')}
                onPress={() => navigation.navigate('AddBusiness')}
              />
            </AnimatedEntrance>
          ) : null}

          {noAccess ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <NoBusinessAccessNotice />
            </AnimatedEntrance>
          ) : null}

          {business ? (
            <AnimatedEntrance delay={step(4)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('settings.business')}</Text>
                <Row label={t('settings.name')} value={business.name} />
                <Row label={t('settings.industry')} value={t(`industry.${business.industry}`)} />
                <Row label={t('settings.branches')} value={String(stats.trading)} />
                <Row label={t('settings.country')} value={business.country} />
                <Row label={t('settings.currency')} value={business.defaultCurrency} />
                <Row label={t('settings.timezone')} value={business.timezone} />
                {/* The business id used to sit here. It is a UUID: nobody
                    reading this screen can do anything with it, and it made
                    the card end on a line of machine text. It is still on
                    every request and in every log, which is where it is
                    actually useful. */}
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* Requirement 28 — the plan, beside the business it pays for. The
              owner's alone: an admin runs the business, its bill is not theirs. */}
          {canManageBilling && subscription ? (
            <AnimatedEntrance delay={step(4)} style={styles.block}>
              <InfoCard
                testID="settings-open-plan"
                icon="ribbon-outline"
                title={t('plans.title')}
                subtitle={t('plans.settingsSubtitle', {
                  plan: planName(subscription.plan),
                  status: subscriptionStatusLabel(subscription, t),
                })}
                onPress={() => navigation.navigate('Plan')}
              />
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(5)} style={styles.block}>
            <InfoCard
              testID="settings-open-attendance"
              icon="finger-print-outline"
              title={t('settings.attendance')}
              subtitle={t('settings.attendanceSubtitle')}
              onPress={() => navigation.navigate('Attendance')}
            />
          </AnimatedEntrance>

          {/* Staff & payroll used to live here. It is now its own tab, because
              it is used daily rather than configured once. What stays in
              Settings is the thing you set up and forget: the work calendar
              that decides the payroll divisor. */}
          {canManageWorkCalendar ? (
            <AnimatedEntrance delay={step(6)} style={styles.block}>
              <InfoCard
                testID="settings-open-work-calendar"
                icon="calendar-outline"
                title={t('workCalendar.title')}
                subtitle={t('workCalendar.weeklyOffHint')}
                onPress={() => navigation.navigate('WorkCalendar')}
              />
            </AnimatedEntrance>
          ) : null}

          {canManageTeam ? (
            <AnimatedEntrance delay={step(7)} style={styles.block}>
              <InfoCard
                testID="settings-open-team"
                icon="people-circle-outline"
                title={t('settings.team')}
                subtitle={t('settings.teamSubtitle')}
                onPress={() => navigation.navigate('Team')}
              />
            </AnimatedEntrance>
          ) : null}

          {/* Requirement 26 — where branches' payments go. Set up once, like
              the work calendar, which is why it is here and not on Home. */}
          {canManagePaymentAccounts ? (
            <AnimatedEntrance delay={step(7)} style={styles.block}>
              <InfoCard
                testID="settings-open-payment-accounts"
                icon="qr-code-outline"
                title={t('paymentAccounts.title')}
                subtitle={t('paymentAccounts.settingsSubtitle')}
                onPress={() => navigation.navigate('PaymentAccounts')}
              />
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(8)} style={styles.block}>
            <LanguageSelector />
          </AnimatedEntrance>

          {/* Requirement 8. Below the language picker on purpose: what
              notifications say is decided by the language above, and the
              switches only matter once you can read them. */}
          <AnimatedEntrance delay={step(9)} style={styles.block}>
            <NotificationSettings />
          </AnimatedEntrance>

          {/* Both app stores require the privacy policy to be reachable from
              inside the app, not only from the listing. It opens the public
              page in the browser — the same one the listing links to. */}
          <AnimatedEntrance delay={step(10)} style={styles.block}>
            <InfoCard
              testID="settings-privacy-policy"
              icon="shield-checkmark-outline"
              title={t('settings.privacyPolicy')}
              subtitle={t('settings.privacyPolicySubtitle')}
              onPress={() => openLegalPage('privacy')}
            />
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(11)} style={styles.block}>
            <DangerButton
              testID="settings-logout"
              icon="log-out-outline"
              title={t('settings.logout')}
              onPress={() => logout()}
            />
          </AnimatedEntrance>

          {/* Quieter than Log out on purpose. It has to be easy to find — the
              stores check — but it should never be the thing a thumb lands on
              while reaching for the button above. The screen it opens says what
              will go and asks for the password before anything happens. */}
          <AnimatedEntrance delay={step(12)}>
            <PressableScale
              testID="settings-delete-account"
              style={styles.deleteLink}
              scaleTo={0.97}
              onPress={() => navigation.navigate('DeleteAccount')}
            >
              <Text style={styles.deleteLinkText}>{t('settings.deleteAccount')}</Text>
            </PressableScale>
          </AnimatedEntrance>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  screenTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  block: { marginTop: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGradient: { borderRadius: radius.full },
  avatarText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  profileText: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '800', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: { fontSize: 13.5, color: colors.textSecondary },
  rowValue: { fontSize: 13.5, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  deleteLink: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  deleteLinkText: { color: colors.textSecondary, fontSize: 13.5, fontWeight: '600', textDecorationLine: 'underline' },
});
