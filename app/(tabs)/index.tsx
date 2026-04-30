import { router, useFocusEffect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth, db } from '@/constants/firebase';

export default function HomeScreen() {
  // This runs EVERY time you tap the Home tab
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            if (profileDoc.exists()) {
              router.replace('/(tabs)/dashboard');
            } else {
              router.replace('/(tabs)/profile-setup');
            }
          } catch (e) {
            console.error('Profile check failed', e);
            router.replace('/(tabs)/auth?mode=signin');
          }
        } else {
          // Only show landing if truly logged out
          router.replace('/(tabs)/auth?mode=signin');
        }
      });

      return () => unsubscribe();
    }, [])
  );

  // Show loading while deciding where to go
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00ff87" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0a0a0a', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
});
