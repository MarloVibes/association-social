import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lastLeagueId';

// Remember the league the user most recently opened.
export async function setLastLeagueId(leagueId?: string | null) {
  try {
    if (leagueId) await AsyncStorage.setItem(KEY, leagueId);
  } catch (e) {
    // non-fatal
  }
}

// Read the last-opened league id (or null if none / unavailable).
export async function getLastLeagueId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
}
