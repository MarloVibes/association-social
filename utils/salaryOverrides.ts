import { getFirestore, collection, getDocs } from 'firebase/firestore';

/**
 * Loads salary overrides for a league.
 * Returns a map of { playerId: overrideSalary }
 */
export async function loadSalaryOverrides(leagueId: string): Promise<Record<string, number>> {
  if (!leagueId) return {};
  const db = getFirestore();
  try {
    const snap = await getDocs(collection(db, 'leagues', leagueId, 'salary_overrides'));
    const map: Record<string, number> = {};
    snap.docs.forEach(d => {
      const data = d.data() as any;
      const pid = data.playerId || d.id;
      if (pid && typeof data.salary === 'number') {
        map[pid] = data.salary;
      }
    });
    return map;
  } catch (e) {
    console.warn('loadSalaryOverrides failed', e);
    return {};
  }
}

/**
 * Returns the effective salary for a player, applying override if present.
 */
export function getEffectiveSalary(player: any, overrides: Record<string, number>): number {
  if (!player) return 0;
  const pid = player.player_id || player.id;
  if (pid && overrides[pid] !== undefined) {
    return overrides[pid];
  }
  return player.salary || 0;
}
