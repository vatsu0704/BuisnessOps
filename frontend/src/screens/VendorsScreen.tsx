import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useVendors } from '@/hooks/useVendors';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import type { Vendor } from '@/types/supply';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

/**
 * Third-party vendors — requirement 25. The warehouse desk's list.
 *
 * Who supplies what outside the warehouse: the water, the ice. The desk adds
 * them, names them and keeps a phone number to send orders to; withdrawn ones
 * stay listed, dimmed, so they can be brought back.
 *
 * Each row says whether accounts has set up where a payment to them goes,
 * because a franchise branch cannot pay a vendor "now" until it has — and the
 * desk is who notices a missing one first, but is deliberately not who can set
 * it (`paymentAccount:manage`).
 */
export default function VendorsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { vendors, isLoading, error, refresh } = useVendors();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const renderVendor = ({ item }: { item: Vendor }) => (
    <PressableScale
      testID={`vendor-row-${item.id}`}
      style={[styles.row, !item.isActive && styles.rowWithdrawn]}
      scaleTo={0.99}
      onPress={() => navigation.navigate('VendorForm', { vendorId: item.id })}
    >
      <View style={styles.iconTile}>
        <Ionicons name="storefront-outline" size={18} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{item.name}</Text>
        {item.phone ? <Text style={styles.rowMeta}>{item.phone}</Text> : null}
        <View style={styles.pills}>
          <Pill
            label={item.upiId ? t('paymentAccounts.qrSet') : t('paymentAccounts.qrNotSet')}
            tone={item.upiId ? 'success' : 'warning'}
            icon={item.upiId ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          />
          {!item.isActive ? <Pill label={t('supply.withdrawn')} tone="muted" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </PressableScale>
  );

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('vendors.title')}</Text>
            <Text style={styles.subtitle}>{t('vendors.subtitle')}</Text>
          </View>
          <PressableScale testID="vendors-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <FlatList
          data={vendors}
          keyExtractor={(vendor) => vendor.id}
          renderItem={renderVendor}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void refresh()} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {/* Full width under the title rather than beside it: the title
                  and a button sharing one row is the row that breaks in Gujarati. */}
              <PressableScale
                testID="vendors-add"
                style={styles.addButton}
                scaleTo={0.98}
                onPress={() => navigation.navigate('VendorForm', {})}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.addText}>{t('vendors.add')}</Text>
              </PressableScale>
            </View>
          }
          ListEmptyComponent={
            isLoading ? null : (
              <AnimatedEntrance delay={step(0)}>
                <View style={styles.emptyCard}>
                  <Ionicons name="storefront-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>{t('vendors.empty')}</Text>
                  <Text style={styles.emptyBody}>{t('vendors.emptyBody')}</Text>
                </View>
              </AnimatedEntrance>
            )
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  listHeader: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  addText: { color: colors.white, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowWithdrawn: { opacity: 0.6 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  separator: { height: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
