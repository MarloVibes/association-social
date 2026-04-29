import { addDoc, arrayUnion, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Alert } from 'react-native';
import { auth, db } from './firebase';

export const REPORT_REASONS = [
  'Harassment',
  'Spam',
  'Cheating / Exploits',
  'Inappropriate Content',
  'Hate Speech',
  'Other',
];

export async function blockUser(targetUid: string, targetName: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  return new Promise(resolve => {
    Alert.alert(
      `Block ${targetName}?`,
      'They won\'t be able to message you or find your profile. You can unblock them later in settings.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', user.uid), {
                blockedUsers: arrayUnion(targetUid),
              });
              resolve(true);
            } catch (e) {
              console.error(e);
              resolve(false);
            }
          },
        },
      ]
    );
  });
}

export async function reportUser(
  targetUid: string,
  targetName: string,
  onComplete?: () => void
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  Alert.alert(
    `Report ${targetName}`,
    'Select a reason:',
    [
      ...REPORT_REASONS.map(reason => ({
        text: reason,
        onPress: async () => {
          try {
            await addDoc(collection(db, 'reports'), {
              reportedBy: user.uid,
              reportedUser: targetUid,
              reportedUserName: targetName,
              reason,
              createdAt: serverTimestamp(),
              status: 'pending',
            });
            Alert.alert(
              'Report Submitted',
              'Thank you. We\'ll review this report and take action if needed.',
              [
                {
                  text: 'Also Block',
                  onPress: async () => {
                    await updateDoc(doc(db, 'users', user.uid), {
                      blockedUsers: arrayUnion(targetUid),
                    });
                    onComplete?.();
                  },
                },
                { text: 'Done', onPress: () => onComplete?.() },
              ]
            );
          } catch (e) {
            console.error(e);
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}

export async function blockAndReport(targetUid: string, targetName: string, onComplete?: () => void) {
  Alert.alert(
    `${targetName}`,
    'What would you like to do?',
    [
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const blocked = await blockUser(targetUid, targetName);
          if (blocked) {
            Alert.alert('Blocked', `${targetName} has been blocked.`);
            onComplete?.();
          }
        },
      },
      {
        text: 'Report',
        onPress: () => reportUser(targetUid, targetName, onComplete),
      },
      {
        text: 'Block & Report',
        style: 'destructive',
        onPress: async () => {
          await reportUser(targetUid, targetName, async () => {
            await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
              blockedUsers: arrayUnion(targetUid),
            });
            onComplete?.();
          });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}
