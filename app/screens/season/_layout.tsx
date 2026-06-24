import { Stack } from 'expo-router';

export default function SeasonLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="calendar" />
      <Stack.Screen name="matchup" />
      <Stack.Screen name="rotation" />
      <Stack.Screen name="coaching-presets" />
    </Stack>
  );
}
