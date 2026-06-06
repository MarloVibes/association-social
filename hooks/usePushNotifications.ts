import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';

// Route to the right screen when a push notification is tapped. Mirrors the
// in-app notification routing so taps land in the same place as taps inside the app.
function routeFromData(data: any) {
  if (!data || !data.type) return;
  const type: string = data.type;
  const leagueId: string = data.leagueId || '';
  try {
    if (['trade_offer', 'trade_executed', 'trade_declined', 'trade_cancelled',
         'trade_room_opened', 'trade_override_review', 'trade_override_approved',
         'trade_override_denied', 'trade_pending_veto', 'trade_pending_vote'].includes(type)) {
      router.push({
        pathname: '/screens/trade-room',
        params: {
          leagueId,
          otherUid: data.otherUid || '',
          otherTeamId: data.otherTeamId || '',
          otherTeamName: data.otherTeamName || '',
        },
      });
    } else if (type === 'tradeblock' || type === 'trade_listing') {
      router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
    } else if (leagueId) {
      router.push({ pathname: '/screens/league', params: { leagueId } });
    }
  } catch (e) {
    console.log('Push deep-link route failed:', e);
  }
}

// Show notifications even when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00ff87',
    });
  }

  if (!Device.isDevice) {
    console.log('Push notifications skipped: must use physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = tokenData.data;
  } catch (e) {
    console.error('Failed to get Expo push token:', e);
  }

  return token;
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(async (token) => {
      if (token) {
        setExpoPushToken(token);

        // Save token to user's Firestore doc
        const user = auth.currentUser;
        if (user) {
          try {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                pushToken: token,
                pushTokenUpdatedAt: serverTimestamp(),
                pushPlatform: Platform.OS,
              },
              { merge: true }
            );
            console.log('Push token saved to Firestore');
          } catch (e) {
            console.error('Failed to save push token to Firestore:', e);
          }
        }
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received (foreground):', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      routeFromData(response.notification.request.content.data);
    });

    // Cold start: app was launched by tapping a notification. Give the router a
    // moment to mount, then route.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        setTimeout(() => routeFromData(response.notification.request.content.data), 1000);
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  return { expoPushToken };
}
