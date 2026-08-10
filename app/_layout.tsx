import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { TamaguiProvider } from '@tamagui/core';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AppQueryProvider } from '@/providers/QueryProvider';
import { SyncProvider } from '@/providers/SyncProvider';
import { OutboxProvider } from '@/providers/OutboxProvider';
import { SyncGate } from '@/components/ui/SyncGate';
import { registerBackgroundSync } from '@/lib/offline/backgroundSync';
import { AppFonts, applyAppFont } from '@/lib/typography';
import config from '../tamagui.config';

// Patch Text/TextInput once, before any screen renders.
applyAppFont();

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGate() {
  const { isAuthenticated, isHydrated } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!isHydrated || !navigationState?.key) {
      return;
    }

    const inLoginRoute = segments[0] === 'login';

    if (!isAuthenticated && !inLoginRoute) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated && inLoginRoute) {
      router.replace('/(tabs)/analytics');
    }
  }, [isAuthenticated, isHydrated, navigationState?.key, router, segments]);

  if (!isHydrated) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SyncGate>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* A call in progress is locked — no header back, no swipe-back gesture.
            The hardware back button is blocked in the screen itself. */}
        <Stack.Screen
          name="call/[id]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack>
    </SyncGate>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts(AppFonts);

  // Register the unattended overnight sync (best-effort; OS-scheduled).
  useEffect(() => {
    void registerBackgroundSync();
  }, []);

  // Hold the first paint until Inter is ready, so text doesn't reflow from the
  // system font a frame later.
  if (!fontsLoaded) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    // Required for react-native-gesture-handler: without it, the carousel's
    // swipe gestures (call slides and Content Viewing) do nothing on Android.
    <GestureHandlerRootView style={styles.root}>
      <AppQueryProvider>
        <AuthProvider>
          <OutboxProvider>
            <SyncProvider>
              <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
                <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                  <AuthGate />
                  <StatusBar style="auto" />
                </ThemeProvider>
              </TamaguiProvider>
            </SyncProvider>
          </OutboxProvider>
        </AuthProvider>
      </AppQueryProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
