import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BranchRow from '@/components/BranchRow';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SearchInput from '@/components/SearchInput';
import { useBranches } from '@/hooks/useBranches';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { can } from '@/utils/permissions';
import { useMembership } from '@/hooks/useBusinessId';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@/utils/optionSearch';
import { colors, radius, shadow, spacing, typography } from '@/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Branches'>;

/**
 * Every branch and warehouse, on the way to one's settings.
 *
 * Home previews five and used to end with a plain "+N more" that led nowhere, so
 * a business with two hundred branches could open the settings of exactly five
 * of them. This is where that text now goes.
 *
 * A list with a filter, not a `Picker`: this is navigation, not a choice. It
 * borrows the same matcher so that typing "sg" finds the same branch here as it
 * does in every chooser.
 */
export default function BranchesScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const edges = useScreenEdges();
  const membership = useMembership();
  const { branches } = useBranches();
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () =>
      filterByQuery(branches, query, (branch) => ({
        primary: branch.name,
        secondary: [branch.code, branch.city, branch.region],
      })),
    [branches, query]
  );

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('branches.title')}</Text>
          <PressableScale testID="branches-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <View style={styles.body}>
          <Text style={styles.subtitle}>{t('branches.subtitle', { count: branches.length })}</Text>

          {can.addBranches(membership) ? (
            <PressableScale
              testID="branches-add"
              style={styles.add}
              onPress={() => navigation.navigate('AddBranch')}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addText}>{t('home.addBranch')}</Text>
            </PressableScale>
          ) : null}

          {/* Only once scanning has stopped working — the same threshold every
              chooser uses. */}
          {isSearchable(branches.length, SEARCH_FROM) ? (
            <SearchInput
              testID="branches-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t('branches.search')}
            />
          ) : null}

          <FlatList
            data={shown}
            keyExtractor={(branch) => branch.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <BranchRow
                testID={`branches-row-${item.id}`}
                branch={item}
                divided={index > 0}
                onPress={() => navigation.navigate('BranchSettings', { branchId: item.id })}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {branches.length === 0 ? t('branches.none') : t('picker.noMatches', { query })}
              </Text>
            }
          />
        </View>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.text, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.sm },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  addText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xl,
    ...shadow.md,
  },
  empty: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingVertical: spacing.lg },
});
