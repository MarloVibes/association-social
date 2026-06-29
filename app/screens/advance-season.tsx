import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { db } from '@/constants/firebase';

export default function AdvanceSeasonRouter() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!leagueId) {
      router.back();
      return;
    }
    getDoc(doc(db, 'leagues', leagueId))
      .then(snapshot => {
        if (!snapshot.exists()) {
          Alert.alert('League not found');
          router.back();
          return;
        }
        router.replace({
          pathname: '/screens/offseason',
          params: { leagueId },
        });
      })
      .catch(error => {
        Alert.alert('Unable to open offseason', error.message);
        router.back();
      });
  }, [leagueId, router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color="#00e58b" size="large" />
      <Text style={styles.text}>Opening offseason...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090b0a',
    gap: 12,
  },
  text: { color: '#7d857f', fontSize: 13 },
});
