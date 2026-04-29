import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a', borderTopWidth: 1 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="auth" options={{ href: null }} />
      <Tabs.Screen name="create-league" options={{ href: null }} />
      <Tabs.Screen name="join-league" options={{ href: null }} />
      <Tabs.Screen name="profile-setup" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="roster" options={{ href: null }} />
      <Tabs.Screen name="league" options={{ href: null }} />
      <Tabs.Screen name="friends" options={{ href: null }} />
      <Tabs.Screen name="search-users" options={{ href: null }} />
      <Tabs.Screen name="dm" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
