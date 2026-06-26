import { Stack } from 'expo-router';

export default function SeasonLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="calendar" />
      <Stack.Screen name="standings" />
      <Stack.Screen name="playoffs" />
      <Stack.Screen name="scouting" />
      <Stack.Screen name="awards" />
      <Stack.Screen name="player-upgrades" />
      <Stack.Screen name="matchup" />
      <Stack.Screen name="game-result" />
      <Stack.Screen name="rotation" />
      <Stack.Screen name="coaching-presets" />
    </Stack>
  );
}
