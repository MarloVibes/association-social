import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { repairScheduleOwnership, type NbaScheduleRepairParticipant, type NbaScheduleRepairTeam } from '@/domain/nba/scheduleRepair';

export type RepairableNbaSchedule = {
  games?: NbaScheduleGame[];
  participants?: NbaScheduleRepairParticipant[];
};

export function previewNbaScheduleOwnershipRepair({
  schedule,
  teams,
}: {
  schedule: RepairableNbaSchedule;
  teams: NbaScheduleRepairTeam[];
}) {
  return repairScheduleOwnership({
    games: schedule.games || [],
    participants: schedule.participants || [],
    teams,
  });
}

export async function repairNbaScheduleOwnershipLocally({
  leagueId,
  scheduleId,
  schedule,
  teams,
}: {
  leagueId: string;
  scheduleId: string;
  schedule: RepairableNbaSchedule;
  teams: NbaScheduleRepairTeam[];
}) {
  const repair = previewNbaScheduleOwnershipRepair({ schedule, teams });
  if (!repair.changed) return repair;
  await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
    games: repair.games,
    participants: repair.participants,
    ownershipRepairedAt: serverTimestamp(),
  });
  return repair;
}
