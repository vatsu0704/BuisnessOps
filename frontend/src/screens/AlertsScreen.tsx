import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PhaseNotice from '@/components/PhaseNotice';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, spacing } from '@/theme';
import { step } from '@/theme/motion';

export default function AlertsScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.title}>{t('alerts.title')}</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <PhaseNotice
              icon="notifications-outline"
              badge={t('alerts.badge')}
              title={t('alerts.noticeTitle')}
              body={t('alerts.noticeBody')}
              examples={[t('alerts.example1'), t('alerts.example2'), t('alerts.example3')]}
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
