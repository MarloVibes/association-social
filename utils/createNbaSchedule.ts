import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/constants/firebase';
import { buildNbaSchedulePayload } from '@/domain/nba/scheduleSetup';
import { defaultScheduleGamesPerTeam } from '@/domain/sports/rules';

const APPROVED_LENGTHS = new Set([14, 17, 29, 58, 82, 162]);

export function isMissingCallable(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code.includes('not-found') || message.includes('not-found');
}

function normalizeScheduleTeamId(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

async function loadEraScheduleTeamIds(league: any) {
  const eraKey = league?.era && league.era !== 'null' ? league.era : 'current';
  try {
    const teamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
    const ids = teamsSnap.docs
      .map(teamDoc => {
        const team = teamDoc.data() as any;
        return normalizeScheduleTeamId(team.id || team.teamId || team.abbreviation || team.abbr || teamDoc.id);
      })
      .filter(Boolean);
    const uniqueIds = [...new Set(ids)];
    return uniqueIds.length >= 30 && uniqueIds.length <= 36 ? uniqueIds : undefined;
  } catch (error) {
    console.warn('Failed to load era teams for schedule', error);
    return undefined;
  }
}

async function loadSportScheduleTeamIds(league: any, claimedTeams: any[]) {
  const sport = String(league?.sport || 'nba').toLowerCase() === 'nfl' ? 'madden' : String(league?.sport || 'nba').toLowerCase();
  if (sport === 'nba') return loadEraScheduleTeamIds(league);

  const claimedIds = claimedTeams
    .map(team => normalizeScheduleTeamId(team.teamId || team.abbreviation || team.abbr || team.id))
    .filter(Boolean);
  if (claimedIds.length >= 30 && claimedIds.length <= 36) return [...new Set(claimedIds)];

  try {
    const teamsSnap = await getDocs(collection(db, 'sport_rosters', sport, 'teams'));
    const ids = teamsSnap.docs
      .map(teamDoc => {
        const team = teamDoc.data() as any;
        return normalizeScheduleTeamId(team.id || team.teamId || team.abbreviation || team.abbr || teamDoc.id);
      })
      .filter(Boolean);
    const uniqueIds = [...new Set(ids)];
    return uniqueIds.length >= 30 && uniqueIds.length <= 36 ? uniqueIds : claimedIds;
  } catch (error) {
    console.warn('Failed to load sport teams for schedule', error);
    return claimedIds;
  }
}

export async function createNbaScheduleLocally({
  leagueId,
  gamesPerTeam,
  createdBy,
}: {
  leagueId: string;
  gamesPerTeam: number;
  createdBy?: string | null;
}) {
  if (!APPROVED_LENGTHS.has(gamesPerTeam)) {
    throw new Error('Choose an approved schedule length.');
  }

  const leagueRef = doc(db, 'leagues', leagueId);
  const leagueSnap = await getDoc(leagueRef);
  if (!leagueSnap.exists()) throw new Error('League not found.');
  const league = leagueSnap.data() as any;
  if (league.scheduleLocked === true) throw new Error('Schedule is already locked.');

  const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
  const teams = teamsSnap.docs.map(teamDoc => ({ id: teamDoc.id, ...teamDoc.data() }));
  const scheduleTeamIds = await loadSportScheduleTeamIds(league, teams);
  const scheduleGamesPerTeam = gamesPerTeam || defaultScheduleGamesPerTeam(league.sport);
  const scheduleId = String(league.currentYear || 2025);
  const payload = buildNbaSchedulePayload({
    leagueId,
    sport: league.sport || 'nba',
    currentYear: Number(league.currentYear || 2025),
    era: league.era,
    gamesPerTeam: scheduleGamesPerTeam,
    teams,
    scheduleTeamIds,
  });

  await setDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
    ...payload,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
  }, { merge: true });
  await updateDoc(leagueRef, {
    scheduleId,
    scheduleLocked: true,
    gamesPerTeam: scheduleGamesPerTeam,
    scheduleCreatedAt: serverTimestamp(),
  });

  return { scheduleId, games: payload.games.length, gamesPerTeam: scheduleGamesPerTeam };
}
