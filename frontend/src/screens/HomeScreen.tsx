import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const logout = useAuthStore((s) => s.logout);

  const primaryMembership = user?.memberships?.[0];

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hi {user?.name ?? user?.email}</Text>
        {business ? <Text style={styles.business}>{business.name}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Account</Text>
          <Text style={styles.cardValue}>{user?.email}</Text>
        </View>

        {primaryMembership ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Role</Text>
            <Text style={styles.cardValue}>{primaryMembership.role}</Text>
            <Text style={styles.cardLabel}>Business ID</Text>
            <Text style={styles.cardValueMono}>{primaryMembership.businessId}</Text>
          </View>
        ) : null}

        <Pressable testID="home-logout" style={styles.logoutButton} onPress={() => logout()}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  greeting: { fontSize: 24, fontWeight: '700' },
  business: { fontSize: 16, color: '#666', marginTop: 4, marginBottom: 20 },
  card: {
    backgroundColor: '#f7f7f8',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  cardLabel: { fontSize: 12, color: '#888', marginTop: 8 },
  cardValue: { fontSize: 16, marginTop: 2 },
  cardValueMono: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  logoutButton: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
