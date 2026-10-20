import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '@/screens/LoginScreen';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import SignupScreen from '@/screens/SignupScreen';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  // The link in the reset email opens the web page, not this one: the app would
  // otherwise need deep links that work before anybody is signed in, which
  // nothing here does. This screen only asks for the address.
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
