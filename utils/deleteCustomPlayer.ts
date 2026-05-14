import { collection, getDocs, doc, deleteDoc, updateDoc, arrayRemove, query, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import { db } from '@/constants/firebase';

export type DeleteScanResult = {
  player_id: string;
  full_name: string;
  references: {
    teamId: string;
    teamName: string;
    onRoster: boolean;
    onBlock: boolean;
    untouchable: boolean;
    onTargetList: boolean;
  }[];
  activeTradeRooms: number;
};

// Scan all teams + trade_rooms in a league for references to this custom player.
export async function scanCustomPlayerReferences(
  leagueId: string,
  player: { player_id: string; full_name: string }
): Promise<DeleteScanResult> {
  const pid = player.player_id;
  const result: DeleteScanResult = {
    player_id: pid,
    full_name: player.full_name,
    references: [],
    activeTradeRooms: 0,
  };
  // Scan teams
  const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
  for (const t of teamsSnap.docs) {
    const td = t.data() as any;
    const playerIds = (td.players || []).map((p: any) => p.player_id || p);
    const onRoster = playerIds.includes(pid);
    const onBlock = (td.tradeBlock || []).includes(pid);
    const untouchable = (td.untouchables || []).includes(pid);
    const onTargetList = (td.targetList || []).includes(pid);
    if (onRoster || onBlock || untouchable || onTargetList) {
      result.references.push({
        teamId: t.id,
        teamName: td.name || td.abbr || 'Team',
        onRoster, onBlock, untouchable, onTargetList,
      });
    }
  }
  // Scan active trade rooms
  const ACTIVE = ['open', 'live', 'countered', 'pushed', 'confirmed'];
  const roomsSnap = await getDocs(collection(db, 'leagues', leagueId, 'trade_rooms'));
  for (const r of roomsSnap.docs) {
    const rd = r.data() as any;
    if (!ACTIVE.includes(rd.status)) continue;
    const offered = [...(rd.aPlayers || []), ...(rd.bPlayers || [])];
    if (offered.some((p: any) => (p.player_id || p) === pid)) {
      result.activeTradeRooms++;
    }
  }
  return result;
}

// Execute the delete: remove from all team arrays, cancel active trade rooms, delete doc + photo.
export async function executeCustomPlayerDelete(
  leagueId: string,
  player: { player_id: string; full_name: string; photo_url?: string }
): Promise<void> {
  const pid = player.player_id;
  // 1. Remove from all team arrays
  const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
  for (const t of teamsSnap.docs) {
    const td = t.data() as any;
    const newPlayers = (td.players || []).filter((p: any) => (p.player_id || p) !== pid);
    const updates: any = {};
    if (newPlayers.length !== (td.players || []).length) updates.players = newPlayers;
    if ((td.tradeBlock || []).includes(pid)) updates.tradeBlock = arrayRemove(pid);
    if ((td.untouchables || []).includes(pid)) updates.untouchables = arrayRemove(pid);
    if ((td.targetList || []).includes(pid)) updates.targetList = arrayRemove(pid);
    if (Object.keys(updates).length > 0) {
      // arrayRemove needs separate updateDoc calls
      if (updates.players) await updateDoc(t.ref, { players: updates.players });
      if (updates.tradeBlock) await updateDoc(t.ref, { tradeBlock: updates.tradeBlock });
      if (updates.untouchables) await updateDoc(t.ref, { untouchables: updates.untouchables });
      if (updates.targetList) await updateDoc(t.ref, { targetList: updates.targetList });
    }
  }
  // 2. Cancel any active trade rooms referencing this player
  const ACTIVE = ['open', 'live', 'countered', 'pushed', 'confirmed'];
  const roomsSnap = await getDocs(collection(db, 'leagues', leagueId, 'trade_rooms'));
  for (const r of roomsSnap.docs) {
    const rd = r.data() as any;
    if (!ACTIVE.includes(rd.status)) continue;
    const offered = [...(rd.aPlayers || []), ...(rd.bPlayers || [])];
    if (offered.some((p: any) => (p.player_id || p) === pid)) {
      await updateDoc(r.ref, { status: 'cancelled', cancelReason: 'player_deleted' });
    }
  }
  // 3. Delete the custom_players doc
  await deleteDoc(doc(db, 'leagues', leagueId, 'custom_players', pid));
  // 4. Delete the photo if present
  if (player.photo_url) {
    try {
      const storage = getStorage();
      const fileRef = storageRef(storage, 'custom_players/' + leagueId + '/' + pid + '.jpg');
      await deleteObject(fileRef);
    } catch (e) {
      // ignore — photo may not exist or already deleted
    }
  }
}
