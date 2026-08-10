import { arrayRemove, collection, deleteDoc, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/constants/firebase';

const DIRECT_COLLECTIONS = [
  'activity',
  'cpu_trade_requests',
  'custom_players',
  'free_agents',
  'join_requests',
  'pending_players',
  'salary_overrides',
  'sent_invites',
  'spins',
  'teams',
  'waitlist',
] as const;

async function deleteRefs(refs: any[]) {
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = writeBatch(db);
    refs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteDemoLeagueLocally(leagueId: string, uid: string) {
  const leagueRef = doc(db, 'leagues', leagueId);
  const schedules = await getDocs(collection(db, 'leagues', leagueId, 'schedules'));

  for (const scheduleDoc of schedules.docs) {
    const nested = await Promise.all([
      getDocs(collection(scheduleDoc.ref, 'gameResults')),
      getDocs(collection(scheduleDoc.ref, 'liveTimelines')),
      getDocs(collection(scheduleDoc.ref, 'preparation')),
    ]);
    await deleteRefs(nested.flatMap(snapshot => snapshot.docs.map(item => item.ref)));
  }

  for (const collectionName of DIRECT_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, 'leagues', leagueId, collectionName));
    await deleteRefs(snapshot.docs.map(item => item.ref));
  }
  await deleteRefs(schedules.docs.map(item => item.ref));
  await updateDoc(doc(db, 'users', uid), { leagues: arrayRemove(leagueId) });
  await deleteDoc(leagueRef);
}
