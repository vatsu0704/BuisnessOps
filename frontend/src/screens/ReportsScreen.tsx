import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PhaseNotice from '@/components/PhaseNotice';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, spacing } from '@/theme';
import { step } from '@/theme/motion';

export default function ReportsScreen() {
  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.title}>Reports</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <PhaseNotice
              icon="bar-chart-outline"
              badge="Planned"
              title="Cross-branch reporting"
              body="Compare any set of branches against each other and against your company average, then browse the same numbers the chat answers are computed from — so figures can never drift between asking and browsing."
              examples={[
                'Top and bottom performing branches by any metric',
                'Company-average benchmarking per branch',
                'City and region grouping for franchise networks',
              ]}
            />
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
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  block: { marginTop: spacing.lg },
});
