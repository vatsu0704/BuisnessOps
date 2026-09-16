import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PhaseNotice from '@/components/PhaseNotice';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, spacing } from '@/theme';
import { step } from '@/theme/motion';

export default function AlertsScreen() {
  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.title}>Alerts</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <PhaseNotice
              icon="notifications-outline"
              badge="Planned"
              title="Told before you ask"
              body="Scheduled checks watch your data for sustained sales decline, wastage outliers and unusual cash-versus-digital mix, then raise an alert with the one or two metrics most likely behind it."
              examples={[
                'A branch whose sales have slipped for several days running',
                'Wastage rates drifting above the company norm',
                'What needs my attention today?',
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
