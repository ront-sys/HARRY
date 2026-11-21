import { Fraunces_400Regular_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { pollInbox, refreshGroups, useStore } from '@/lib/store';
import { C } from '@/lib/theme';
import { LockGate } from '@/ui/LockGate';

SplashScreen.preventAutoHideAsync();

function CirclePoller() {
  const hasProfile = useStore((s) => !!s.profile);
  useEffect(() => {
    if (!hasProfile) return;
    refreshGroups().catch(() => {});
    void pollInbox();
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void pollInbox();
    }, 10_000);
    return () => clearInterval(t);
  }, [hasProfile]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;

  return (
    <LockGate>
      <StatusBar style="light" />
      <CirclePoller />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bgBottom },
          headerTintColor: C.text,
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="conversation" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="history" options={{ presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" />
      </Stack>
    </LockGate>
  );
}
