import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';

// Default tab after entering (tabs) is Analytics.
export const unstable_settings = {
  initialRouteName: 'analytics',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // Always the light bar: every screen above it is designed light-only,
        // and following the phone's dark mode turned just this bar black.
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="planned-calls"
        options={{
          title: 'e-Detailing',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar.badge.checkmark" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.bar.xaxis" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} />,
        }}
      />

      {/* Dashboard entry points — reached from the dashboard cards, not the tab
          bar, but kept inside (tabs) so the bottom nav stays visible. */}
      <Tabs.Screen
        name="doctor-list"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="content-library"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="my-brands"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="patients"
        options={{ href: null }}
      />

      {/* Doctor detail lives inside the tabs so the bottom nav stays visible. */}
      <Tabs.Screen
        name="doctor/[id]"
        options={{ href: null }}
      />

      {/* Call analytics lives inside the tabs so the bottom nav stays visible. */}
      <Tabs.Screen
        name="call-analytics/[id]"
        options={{ href: null }}
      />

      {/* Unplanned hidden for now — the route is kept because the call flow still
          navigates to it (new-doctor return), but it has no tab. */}
      <Tabs.Screen
        name="unplanned-calls"
        options={{ href: null }}
      />

      <Tabs.Screen
        name="faqs"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="ai-trainer"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
    </Tabs>
  );
}
