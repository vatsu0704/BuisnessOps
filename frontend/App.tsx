import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AnimatedSplash from '@/components/AnimatedSplash';
import RootNavigator from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';

// keep the native splash up until the animated one has mounted over it
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style={splashDone ? 'auto' : 'light'} />
      </NavigationContainer>
      {splashDone ? null : <AnimatedSplash ready={!isBootstrapping} onFinish={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
