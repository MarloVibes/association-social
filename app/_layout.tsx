import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="screens/league" />
          <Stack.Screen name="screens/roster" />
          <Stack.Screen name="screens/channels" />
          <Stack.Screen name="screens/channel" />
          <Stack.Screen name="screens/friends" />
          <Stack.Screen name="screens/search-users" />
          <Stack.Screen name="screens/dm" />
          <Stack.Screen name="screens/invite-members" />
          <Stack.Screen name="screens/create-league" />
          <Stack.Screen name="screens/join-league" />
          <Stack.Screen name="screens/notifications" />
          <Stack.Screen name="screens/profile" />
          <Stack.Screen name="screens/trade-channel" />
          <Stack.Screen name="screens/trade-room" />
          <Stack.Screen name="screens/league-members" />
          <Stack.Screen name="screens/league-settings" />
          <Stack.Screen name="screens/advance-season" />
          <Stack.Screen name="screens/team-select" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
