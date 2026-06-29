import { Stack } from 'expo-router';

export default function OffseasonLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="draft-class" />
      <Stack.Screen name="live-draft" />
      <Stack.Screen name="re-signing" />
      <Stack.Screen name="free-agency" />
      <Stack.Screen name="roster-cuts" />
      <Stack.Screen name="expansion" />
    </Stack>
  );
}
