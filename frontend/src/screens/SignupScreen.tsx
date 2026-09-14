import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuthStore } from '@/store/authStore';
import type { Industry } from '@/types/business';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'FOOD_BEVERAGE', label: 'Food & Beverage' },
  { value: 'SERVICES', label: 'Services' },
  { value: 'FRANCHISE_OTHER', label: 'Franchise / Other' },
];

export default function SignupScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [industry, setIndustry] = useState<Industry>('RETAIL');
  const [country, setCountry] = useState('IN');
  const [defaultCurrency, setDefaultCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  const signup = useAuthStore((s) => s.signup);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const canSubmit =
    name.trim().length > 0 &&
    businessName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    country.trim().length > 0 &&
    defaultCurrency.trim().length > 0 &&
    timezone.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await signup({
        name: name.trim(),
        businessName: businessName.trim(),
        email: email.trim().toLowerCase(),
        password,
        industry,
        country: country.trim(),
        defaultCurrency: defaultCurrency.trim(),
        timezone: timezone.trim(),
      });
    } catch {
      // error is already captured in the store and rendered below
    }
  }

  function renderField(
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    opts?: Partial<TextInputProps>
  ) {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            if (error) clearError();
          }}
          {...opts}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create your business</Text>
          <Text style={styles.subtitle}>You'll be the owner with full access</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {renderField('Your name', name, setName, { testID: 'signup-name' })}
          {renderField('Business name', businessName, setBusinessName, { testID: 'signup-businessName' })}
          {renderField('Email', email, setEmail, {
            testID: 'signup-email',
            autoCapitalize: 'none',
            keyboardType: 'email-address',
          })}
          {renderField('Password (min 8 characters)', password, setPassword, {
            testID: 'signup-password',
            secureTextEntry: true,
          })}

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Industry</Text>
            <View style={styles.chipRow}>
              {INDUSTRIES.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, industry === opt.value && styles.chipSelected]}
                  onPress={() => setIndustry(opt.value)}
                >
                  <Text style={[styles.chipText, industry === opt.value && styles.chipTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {renderField('Country (ISO code)', country, setCountry, { autoCapitalize: 'characters' })}
          {renderField('Currency (ISO code)', defaultCurrency, setDefaultCurrency, { autoCapitalize: 'characters' })}
          {renderField('Timezone', timezone, setTimezone)}

          <Pressable
            testID="signup-submit"
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Creating...' : 'Create business'}</Text>
          </Pressable>

          <Pressable testID="signup-goto-login" onPress={() => navigation.navigate('Login')} style={styles.linkWrap}>
            <Text style={styles.link}>Already have an account? Log in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  form: { paddingHorizontal: 24, paddingVertical: 32 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  fieldWrap: { marginBottom: 14 },
  label: { fontSize: 13, color: '#444', marginBottom: 6, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextSelected: { color: '#fff' },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkWrap: { marginTop: 20, alignItems: 'center' },
  link: { color: '#2563eb', fontSize: 14 },
  error: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
  },
});
