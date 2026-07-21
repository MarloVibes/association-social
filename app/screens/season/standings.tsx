import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import SportTeamLogo from '@/components/SportTeamLogo';
import { getSportTeamName } from '@/constants/sportTeams';
import { auth, db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { displayScheduleAbbr, scheduleKeyAliases } from '@/domain/nba/scheduleView';
import { buildNbaCupGroupStandings, buildNbaStandings, type StandingsRow } from '@/domain/nba/standings';
import {
  buildSportPlayerLeaderboard,
  playerLeaderboardTabsForSport,
  teamsFromBoxScoreGames,
  type SportPlayerLeaderboardRow,
  type SportPlayerLeaderboardStat,
} from '@/domain/sports/playerLeaderboards';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  players?: any[];
};

type StandingsViewMode = 'regular' | 'cup';
type StandingsContentMode = 'standings' | 'teamPlayers' | 'leaguePlayers';
type CombinedPlayerStatColumn = {
  key: string;
  label: string;
  width: number;
};
type CombinedPlayerStatRow = SportPlayerLeaderboardRow & {
  columns: (CombinedPlayerStatColumn & { value: string })[];
};

type ScheduleDoc = {
  games?: NbaScheduleGame[];
  nbaCup?: {
    enabled?: boolean;
    games?: NbaScheduleGame[];
    groups?: {
      id: string;
      teamIds: string[];
    }[];
  } | null;
  participants?: {
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }[];
};

function poolKeyForLeague(league: any, sport: 'nba' | 'madden' | 'mlb') {
  return sport === 'nba' ? String(league?.era || 'current') : sport;
}

function teamAliasSet(team?: Partial<Team> | null) {
  return new Set([
    team?.id,
    team?.teamId,
    team?.abbreviation,
    (team as any)?.abbr,
  ].flatMap(value => scheduleKeyAliases(value as string | null | undefined)));
}

function poolPlayerAliases(player: Record<string, unknown>) {
  return scheduleKeyAliases(String(player.team || player.abbreviation || player.teamId || ''));
}

function poolPlayersForParticipant(poolPlayers: any[], participant: NonNullable<ScheduleDoc['participants']>[number]) {
  const wanted = teamAliasSet({
    id: participant.sourceTeamDocId || participant.scheduleTeamId,
    teamId: participant.scheduleTeamId,
    abbreviation: participant.abbreviation,
  });
  return poolPlayers.filter((player: Record<string, unknown>) => (
    poolPlayerAliases(player).some(alias => wanted.has(alias))
  ));
}

function participantName(participant: NonNullable<ScheduleDoc['participants']>[number], sport: 'nba' | 'madden' | 'mlb') {
  if (participant.name) return participant.name;
  const abbr = displayScheduleAbbr(participant.abbreviation || participant.scheduleTeamId);
  if (sport !== 'nba') {
    const sportName = getSportTeamName(sport, abbr);
    if (sportName && sportName !== abbr) return sportName;
  }
  return abbr || 'CPU Team';
}

function mergeLeagueStatTeams({
  teams,
  participants,
  games,
  poolPlayers,
  sport,
}: {
  teams: Team[];
  participants: NonNullable<ScheduleDoc['participants']>;
  games: NbaScheduleGame[];
  poolPlayers: any[];
  sport: 'nba' | 'madden' | 'mlb';
}) {
  const merged = [...teams];
  const replacements = new Map<string, Team>();
  const teamEntries = merged.map((team, index) => ({ team, index, aliases: teamAliasSet(team) }));
  const participantAliases = new Set(
    participants.flatMap(participant => [...teamAliasSet({
      id: participant.sourceTeamDocId || participant.scheduleTeamId,
      teamId: participant.scheduleTeamId,
      abbreviation: participant.abbreviation,
    })]),
  );
  const participantRows = [...participants];
  (games || []).forEach((game) => {
    [game.homeTeamId, game.awayTeamId].forEach((teamId) => {
      const aliases = scheduleKeyAliases(teamId);
      if (aliases.length === 0 || aliases.some(alias => participantAliases.has(alias))) return;
      aliases.forEach(alias => participantAliases.add(alias));
      participantRows.push({
        scheduleTeamId: teamId,
        abbreviation: displayScheduleAbbr(teamId),
        name: participantName({ scheduleTeamId: teamId, abbreviation: displayScheduleAbbr(teamId) }, sport),
      });
    });
  });

  participantRows.forEach((participant) => {
    const participantAliases = teamAliasSet({
      id: participant.sourceTeamDocId || participant.scheduleTeamId,
      teamId: participant.scheduleTeamId,
      abbreviation: participant.abbreviation,
    });
    const existing = teamEntries.find(entry => [...participantAliases].some(alias => entry.aliases.has(alias)));
    const fallbackPlayers = poolPlayersForParticipant(poolPlayers, participant);

    if (existing) {
      if (!Array.isArray(existing.team.players) || existing.team.players.length === 0) {
        replacements.set(String(existing.index), { ...existing.team, players: fallbackPlayers });
      }
      return;
    }

    merged.push({
      id: participant.sourceTeamDocId || participant.scheduleTeamId || participant.abbreviation || `cpu-${merged.length}`,
      teamId: participant.scheduleTeamId,
      abbreviation: displayScheduleAbbr(participant.abbreviation || participant.scheduleTeamId),
      name: participantName(participant, sport),
      gmId: participant.gmId || undefined,
      players: fallbackPlayers,
    });
  });

  return merged.map((team, index) => replacements.get(String(index)) || team);
}

function gamesBehindText(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  if (value === 'nfl' || value === 'madden') return 'madden';
  if (value === 'mlb') return 'mlb';
  return 'nba';
}

function teamName(team?: Team) {
  return team?.name || team?.abbreviation || 'Team';
}

function numberFrom(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function playerStats(player: Record<string, unknown>) {
  return (player.seasonStats && typeof player.seasonStats === 'object'
    ? player.seasonStats
    : player.stats && typeof player.stats === 'object'
      ? player.stats
      : player) as Record<string, unknown>;
}

function playerKey(player: Record<string, unknown>, fallback: string) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || player.name || fallback);
}

function perGame(stats: Record<string, unknown>, totalKey: string, averageKeys: string[] = []) {
  for (const key of averageKeys) {
    const explicit = Number(stats[key]);
    if (Number.isFinite(explicit)) return explicit;
  }
  const games = Math.max(0, numberFrom(stats.games || stats.gp || stats.gamesPlayed));
  if (games <= 0) return 0;
  return numberFrom(stats[totalKey]) / games;
}

function formatDecimal(value: number, decimals = 1) {
  return value > 0 ? value.toFixed(decimals) : '0.0';
}

function combinedStatColumnsForSport(sport: 'nba' | 'madden' | 'mlb'): CombinedPlayerStatColumn[] {
  if (sport === 'madden') {
    return [
      { key: 'gp', label: 'GP', width: 30 },
      { key: 'passYds', label: 'PYD', width: 38 },
      { key: 'passTd', label: 'PTD', width: 34 },
      { key: 'rushYds', label: 'RYD', width: 38 },
      { key: 'recYds', label: 'REC', width: 38 },
      { key: 'sacks', label: 'SK', width: 30 },
    ];
  }
  if (sport === 'mlb') {
    return [
      { key: 'gp', label: 'GP', width: 30 },
      { key: 'avg', label: 'AVG', width: 38 },
      { key: 'hr', label: 'HR', width: 30 },
      { key: 'rbi', label: 'RBI', width: 34 },
      { key: 'era', label: 'ERA', width: 38 },
      { key: 'so', label: 'SO', width: 30 },
    ];
  }
  return [
    { key: 'gp', label: 'GP', width: 30 },
    { key: 'pts', label: 'PTS', width: 34 },
    { key: 'reb', label: 'REB', width: 34 },
    { key: 'ast', label: 'AST', width: 34 },
    { key: 'stl', label: 'STL', width: 30 },
    { key: 'blk', label: 'BLK', width: 30 },
  ];
}

function combinedValuesForSport(sport: 'nba' | 'madden' | 'mlb', stats: Record<string, unknown>) {
  const games = Math.max(0, numberFrom(stats.games || stats.gp || stats.gamesPlayed));
  if (sport === 'madden') {
    return {
      gp: String(games),
      passYds: String(Math.round(numberFrom(stats.passingYards || stats.passYards))),
      passTd: String(Math.round(numberFrom(stats.passingTouchdowns || stats.passTds))),
      rushYds: String(Math.round(numberFrom(stats.rushingYards || stats.rushYards))),
      recYds: String(Math.round(numberFrom(stats.receivingYards || stats.recYards))),
      sacks: String(Math.round(numberFrom(stats.sacks))),
    };
  }
  if (sport === 'mlb') {
    const atBats = numberFrom(stats.atBats || stats.ab);
    const avg = Number.isFinite(Number(stats.avg || stats.battingAverage))
      ? Number(stats.avg || stats.battingAverage)
      : atBats > 0
        ? numberFrom(stats.hits) / atBats
        : 0;
    const innings = numberFrom(stats.inningsPitched || stats.ip);
    const era = Number.isFinite(Number(stats.era))
      ? Number(stats.era)
      : innings > 0
        ? (numberFrom(stats.earnedRuns) * 9) / innings
        : 0;
    return {
      gp: String(games),
      avg: avg > 0 ? avg.toFixed(3).replace(/^0/, '') : '.000',
      hr: String(Math.round(numberFrom(stats.homeRuns || stats.hr))),
      rbi: String(Math.round(numberFrom(stats.rbi))),
      era: era > 0 ? era.toFixed(2) : '0.00',
      so: String(Math.round(numberFrom(stats.strikeouts || stats.so))),
    };
  }
  return {
    gp: String(games),
    pts: formatDecimal(perGame(stats, 'points', ['ppg', 'pointsPerGame'])),
    reb: formatDecimal(perGame(stats, 'rebounds', ['rpg', 'reboundsPerGame'])),
    ast: formatDecimal(perGame(stats, 'assists', ['apg', 'assistsPerGame'])),
    stl: formatDecimal(perGame(stats, 'steals', ['spg', 'stealsPerGame'])),
    blk: formatDecimal(perGame(stats, 'blocks', ['bpg', 'blocksPerGame'])),
  };
}

function statSortValue(sport: 'nba' | 'madden' | 'mlb', stat: SportPlayerLeaderboardStat, stats: Record<string, unknown>) {
  if (stat === 'ppg') return perGame(stats, 'points', ['ppg', 'pointsPerGame']);
  if (stat === 'rpg') return perGame(stats, 'rebounds', ['rpg', 'reboundsPerGame']);
  if (stat === 'apg') return perGame(stats, 'assists', ['apg', 'assistsPerGame']);
  if (stat === 'spg') return perGame(stats, 'steals', ['spg', 'stealsPerGame']);
  if (stat === 'bpg') return perGame(stats, 'blocks', ['bpg', 'blocksPerGame']);
  if (stat === 'passYds') return numberFrom(stats.passingYards || stats.passYards);
  if (stat === 'passTd') return numberFrom(stats.passingTouchdowns || stats.passTds);
  if (stat === 'rushYds') return numberFrom(stats.rushingYards || stats.rushYards);
  if (stat === 'recYds') return numberFrom(stats.receivingYards || stats.recYards);
  if (stat === 'sacks') return numberFrom(stats.sacks);
  if (stat === 'ints') return numberFrom(stats.interceptions || stats.ints);
  if (stat === 'avg') return Number(combinedValuesForSport(sport, stats).avg || 0);
  if (stat === 'hr') return numberFrom(stats.homeRuns || stats.hr);
  if (stat === 'rbi') return numberFrom(stats.rbi);
  if (stat === 'era') return -numberFrom(combinedValuesForSport(sport, stats).era);
  if (stat === 'whip') return -numberFrom(stats.whip);
  if (stat === 'so') return numberFrom(stats.strikeouts || stats.so);
  return 0;
}

function buildCombinedPlayerStatRows({
  sport,
  teams,
  sortStat,
  includeZeroGamePlayers,
}: {
  sport: 'nba' | 'madden' | 'mlb';
  teams: Team[];
  sortStat: SportPlayerLeaderboardStat;
  includeZeroGamePlayers: boolean;
}): CombinedPlayerStatRow[] {
  const columns = combinedStatColumnsForSport(sport);
  const rows: CombinedPlayerStatRow[] = [];
  teams.forEach((team, teamIndex) => {
    (team.players || []).forEach((player: Record<string, unknown>, playerIndex: number) => {
      const stats = playerStats(player);
      const games = Math.max(0, numberFrom(stats.games || stats.gp || stats.gamesPlayed));
      if (!includeZeroGamePlayers && games <= 0) return;
      const values = combinedValuesForSport(sport, stats);
      const value = statSortValue(sport, sortStat, stats);
      rows.push({
        playerId: playerKey(player, `${teamIndex}-${playerIndex}`),
        name: String(player.full_name || player.name || 'Unknown Player'),
        position: String(player.position || '?'),
        teamId: String(team.id || team.teamId || team.abbreviation || ''),
        teamName: teamName(team),
        teamAbbreviation: String(team.abbreviation || team.teamId || team.id || 'TEAM').toUpperCase(),
        games,
        value,
        valueText: value > 0 ? value.toFixed(1) : '0.0',
        player,
        columns: columns.map(column => ({ ...column, value: String(values[column.key as keyof typeof values] || '0') })),
      });
    });
  });
  return rows.sort((left, right) => (
    right.value - left.value
    || right.games - left.games
    || left.teamAbbreviation.localeCompare(right.teamAbbreviation)
    || left.name.localeCompare(right.name)
  ));
}

export default function StandingsScreen() {
  const { leagueId, mode } = useLocalSearchParams<{ leagueId: string; mode?: StandingsContentMode }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [poolPlayers, setPoolPlayers] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [resultGames, setResultGames] = useState<NbaScheduleGame[]>([]);
  const [directResultGames, setDirectResultGames] = useState<NbaScheduleGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<StandingsViewMode>('regular');
  const initialContentMode: StandingsContentMode = mode === 'teamPlayers' || mode === 'leaguePlayers' ? mode : 'standings';
  const [contentMode, setContentMode] = useState<StandingsContentMode>(initialContentMode);
  const [playerStat, setPlayerStat] = useState<SportPlayerLeaderboardStat>('ppg');
  const [selectedPlayerRow, setSelectedPlayerRow] = useState<SportPlayerLeaderboardRow | null>(null);

  useEffect(() => {
    setContentMode(initialContentMode);
    setSelectedPlayerRow(null);
  }, [initialContentMode]);

  useEffect(() => {
    if (!leagueId) return;
    let unsubscribeSchedule: (() => void) | undefined;
    let unsubscribeResults: (() => void) | undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      if (unsubscribeSchedule) unsubscribeSchedule();
      if (unsubscribeResults) unsubscribeResults();
      unsubscribeSchedule = onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId), scheduleSnapshot => {
        const nextSchedule = scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null;
        setSchedule(nextSchedule);
        if (unsubscribeResults) unsubscribeResults();
        if (nextSchedule) {
          unsubscribeResults = onSnapshot(collection(db, 'leagues', leagueId, 'schedules', scheduleId, 'gameResults'), resultSnapshot => {
            setResultGames(resultSnapshot.docs
              .map(item => item.data() as any)
              .map(data => (data?.game && typeof data.game === 'object' ? data.game : data) as NbaScheduleGame));
          }, () => setResultGames([]));
        } else {
          setResultGames([]);
          setDirectResultGames([]);
        }
        setLoading(false);
      }, () => {
        setSchedule(null);
        setResultGames([]);
        setDirectResultGames([]);
        setLoading(false);
      });
    }, () => setLoading(false));
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      if (unsubscribeResults) unsubscribeResults();
      unsubscribeTeams();
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId || !league || !schedule) {
      setDirectResultGames([]);
      return;
    }
    let cancelled = false;
    const scheduleId = league.scheduleId || String(league.currentYear || 2025);
    const finalGamesById = new Map<string, NbaScheduleGame>();
    [...(schedule.games || []), ...(schedule.nbaCup?.games || [])].forEach((game) => {
      if (
        game?.id
        && game.status === 'final'
      ) {
        finalGamesById.set(String(game.id), game);
      }
    });
    const finalGames = Array.from(finalGamesById.values());
    if (finalGames.length === 0) {
      setDirectResultGames([]);
      return;
    }
    Promise.all(finalGames.map(async (game) => {
      try {
        const snapshot = await getDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId, 'gameResults', String(game.id)));
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as any;
        const resultGame = data?.game && typeof data.game === 'object' ? data.game : data;
        return resultGame as NbaScheduleGame;
      } catch {
        return null;
      }
    })).then((games) => {
      if (cancelled) return;
      setDirectResultGames(games.filter(Boolean) as NbaScheduleGame[]);
    });
    return () => {
      cancelled = true;
    };
  }, [league, leagueId, schedule]);

  useEffect(() => {
    if (!league) {
      setPoolPlayers([]);
      return;
    }
    let cancelled = false;
    const sportKey = normalizeSport(league.sport);
    const poolKey = poolKeyForLeague(league, sportKey);
    getDoc(doc(db, 'era_player_pools', poolKey))
      .then(snapshot => {
        if (cancelled) return;
        const players = snapshot.exists() ? ((snapshot.data() as any).players || []) : [];
        setPoolPlayers(Array.isArray(players) ? players : []);
      })
      .catch(() => {
        if (!cancelled) setPoolPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [league]);

  const regularGames = useMemo(() => (
    (schedule?.games || []).filter(game => game.status === 'final')
  ), [schedule?.games]);
  const sport = normalizeSport(league?.sport);
  const leagueStatTeams = useMemo(() => mergeLeagueStatTeams({
    teams,
    participants: schedule?.participants || [],
    games: schedule?.games || [],
    poolPlayers,
    sport,
  }), [poolPlayers, schedule?.games, schedule?.participants, sport, teams]);
  const supportsCup = sport === 'nba';
  const playerStatTabs = useMemo(() => playerLeaderboardTabsForSport(sport), [sport]);
  const activePlayerStat = playerStatTabs.some(tab => tab.key === playerStat) ? playerStat : playerStatTabs[0].key;
  const activeContentMode: StandingsContentMode = contentMode;
  const cupGames = useMemo(() => (
    supportsCup ? (schedule?.nbaCup?.games || []).filter(game => game.status === 'final') : []
  ), [schedule?.nbaCup?.games, supportsCup]);
  const boxScoreStatTeams = useMemo(() => (
    teamsFromBoxScoreGames({
      sport,
      games: directResultGames.length > 0 ? directResultGames : resultGames.length > 0 ? resultGames : [...regularGames, ...cupGames],
    }) as Team[]
  ), [cupGames, directResultGames, regularGames, resultGames, sport]);
  const playerStatTeams = boxScoreStatTeams.length > 0 ? boxScoreStatTeams : leagueStatTeams;
  const hasNbaCup = supportsCup && cupGames.length > 0 && schedule?.nbaCup?.enabled !== false;
  const selectedViewMode: StandingsViewMode = viewMode === 'cup' && hasNbaCup ? 'cup' : 'regular';
  const standingsGames = selectedViewMode === 'cup' ? cupGames : regularGames;
  const standings = useMemo<StandingsRow[]>(() => buildNbaStandings({
    games: standingsGames,
    participants: schedule?.participants || [],
    teams,
  }), [standingsGames, schedule?.participants, teams]);
  const cupSections = useMemo(() => buildNbaCupGroupStandings({
    games: cupGames,
    groups: schedule?.nbaCup?.groups || [],
    participants: schedule?.participants || [],
    teams,
  }).map(group => ({
    id: group.id,
    title: group.id,
    data: group.rows,
  })), [cupGames, schedule?.nbaCup?.groups, schedule?.participants, teams]);
  const sections = selectedViewMode === 'cup' && cupSections.length > 0
    ? cupSections
    : [{ id: 'regular', title: 'League', data: standings }];
  const myTeam = useMemo(() => teams.find(team => team.gmId === auth.currentUser?.uid) || teams[0], [teams]);
  const myStatTeams = useMemo(() => {
    if (boxScoreStatTeams.length === 0) return myTeam ? [myTeam] : [];
    const aliases = teamAliasSet(myTeam);
    const matching = boxScoreStatTeams.filter(team => [...teamAliasSet(team)].some(alias => aliases.has(alias)));
    return matching.length > 0 ? matching : myTeam ? [myTeam] : [];
  }, [boxScoreStatTeams, myTeam]);
  const teamScopedPlayerLeaders = useMemo(() => (
    buildSportPlayerLeaderboard({
      sport,
      teams: myStatTeams,
      stat: activePlayerStat,
      limit: 75,
    })
  ), [activePlayerStat, myStatTeams, sport]);
  const leaguePlayerLeaders = useMemo(() => (
    buildSportPlayerLeaderboard({
      sport,
      teams: playerStatTeams,
      stat: activePlayerStat,
      limit: 75,
    })
  ), [activePlayerStat, playerStatTeams, sport]);
  const combinedPlayerRows = useMemo(() => (
    buildCombinedPlayerStatRows({
      sport,
      teams: activeContentMode === 'teamPlayers' ? myStatTeams : playerStatTeams,
      sortStat: activePlayerStat,
      includeZeroGamePlayers: activeContentMode === 'leaguePlayers' && boxScoreStatTeams.length === 0,
    })
  ), [activeContentMode, activePlayerStat, boxScoreStatTeams.length, myStatTeams, playerStatTeams, sport]);
  const combinedColumns = useMemo(() => combinedStatColumnsForSport(sport), [sport]);
  const visibleSections = activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers'
    ? [{ id: `players-${activePlayerStat}`, title: `${activePlayerStat.toUpperCase()} Leaders`, data: combinedPlayerRows }]
    : sections;
  const completedGames = useMemo(() => standingsGames.filter(game => game.status === 'final').length, [standingsGames]);
  const leagueDate = useMemo(() => leagueDateFromRecord(league || {}), [league]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <SectionList<any, any>
        contentContainerStyle={styles.content}
        sections={visibleSections}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item: any, index) => activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers' ? `${item.playerId}-${index}` : `${item.teamId}-${index}`}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>
                  {activeContentMode === 'teamPlayers' ? 'Player Stats' : activeContentMode === 'leaguePlayers' ? 'League Stats' : 'Standings'}
                </Text>
              </View>
            </View>
            <View style={styles.summary}>
                <Text style={styles.summaryText}>{activeContentMode === 'teamPlayers' ? `${teamName(myTeam)} player stats` : activeContentMode === 'leaguePlayers' ? 'League-wide player stat leaders' : selectedViewMode === 'cup' ? 'NBA Cup standings' : 'Regular season standings'}</Text>
                <Text style={styles.summaryMeta}>
                  {activeContentMode === 'teamPlayers'
                  ? `Team roster table sorted by ${activePlayerStat.toUpperCase()}`
                  : activeContentMode === 'leaguePlayers'
                  ? `All league players sorted by ${activePlayerStat.toUpperCase()} · Tap any player for their card`
                  : `${completedGames} final games recorded · GB tracks the leader`}
                </Text>
            </View>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'standings' && styles.segmentButtonActive]}
                onPress={() => setContentMode('standings')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'standings' && styles.segmentTextActive]}>Standings</Text>
                <Text style={styles.segmentCount}>{standings.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'teamPlayers' && styles.segmentButtonActive]}
                onPress={() => setContentMode('teamPlayers')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'teamPlayers' && styles.segmentTextActive]}>Player Stats</Text>
                <Text style={styles.segmentCount}>{activeContentMode === 'teamPlayers' ? combinedPlayerRows.length : teamScopedPlayerLeaders.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'leaguePlayers' && styles.segmentButtonActive]}
                onPress={() => setContentMode('leaguePlayers')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'leaguePlayers' && styles.segmentTextActive]}>League Stats</Text>
                <Text style={styles.segmentCount}>{activeContentMode === 'leaguePlayers' ? combinedPlayerRows.length : leaguePlayerLeaders.length}</Text>
              </TouchableOpacity>
            </View>
            {activeContentMode === 'standings' ? (
              <View style={styles.segment}>
                <TouchableOpacity
                  style={[styles.segmentButton, selectedViewMode === 'regular' && styles.segmentButtonActive]}
                  onPress={() => setViewMode('regular')}
                >
                  <Text style={[styles.segmentText, selectedViewMode === 'regular' && styles.segmentTextActive]}>Season</Text>
                  <Text style={styles.segmentCount}>{regularGames.filter(game => game.status === 'final').length}</Text>
                </TouchableOpacity>
                {hasNbaCup ? (
                  <TouchableOpacity
                    style={[styles.segmentButton, selectedViewMode === 'cup' && styles.segmentButtonActive]}
                    onPress={() => setViewMode('cup')}
                  >
                    <Text style={[styles.segmentText, selectedViewMode === 'cup' && styles.segmentTextActive]}>NBA Cup</Text>
                    <Text style={styles.segmentCount}>{cupGames.filter(game => game.status === 'final').length}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerStatScroll}>
                <View style={styles.playerStatTabs}>
                  {playerStatTabs.map(tab => (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.playerStatTab, activePlayerStat === tab.key && styles.playerStatTabActive]}
                      onPress={() => setPlayerStat(tab.key)}
                    >
                      <Text style={[styles.playerStatTabText, activePlayerStat === tab.key && styles.playerStatTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {activeContentMode === 'standings' ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { flex: 1 }]}>Team</Text>
                <Text style={styles.headerCell}>W</Text>
                <Text style={styles.headerCell}>L</Text>
                <Text style={styles.headerCell}>GB</Text>
              </View>
            ) : (
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { flex: 1 }]}>Player</Text>
                {combinedColumns.map(column => (
                  <Text key={column.key} style={[styles.headerCell, { width: column.width }]}>{column.label}</Text>
                ))}
              </View>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          activeContentMode === 'standings' && selectedViewMode === 'cup' && cupSections.length > 0 ? (
            <Text style={styles.groupHeader}>{section.title}</Text>
          ) : null
        )}
        renderItem={({ item, index }) => (
          activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers' ? (
            <TouchableOpacity style={styles.playerStatRow} onPress={() => setSelectedPlayerRow(item as unknown as CombinedPlayerStatRow)} activeOpacity={0.78}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.playerStatCopy}>
                <Text style={styles.teamName} numberOfLines={1}>{(item as unknown as CombinedPlayerStatRow).name}</Text>
                <Text style={styles.teamMeta} numberOfLines={1}>
                  {(item as unknown as CombinedPlayerStatRow).teamAbbreviation} · {(item as unknown as CombinedPlayerStatRow).position}
                </Text>
              </View>
              <View style={styles.playerStatValues}>
                {(item as unknown as CombinedPlayerStatRow).columns.map(column => (
                  <Text key={column.key} style={[styles.playerStatValue, { width: column.width }]}>
                    {column.value}
                  </Text>
                ))}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.logoDisc}>
                <SportTeamLogo sport={sport} abbr={(item as StandingsRow).abbreviation} era={league?.currentYear} style={styles.logo} fontSize={9} />
              </View>
              <View style={styles.teamCopy}>
                <Text style={styles.teamName} numberOfLines={1}>{(item as StandingsRow).name}</Text>
                <Text style={styles.teamMeta}>{(item as StandingsRow).abbreviation} · {((item as StandingsRow).pct * 100).toFixed(0)}%</Text>
              </View>
              <Text style={styles.value}>{(item as StandingsRow).wins}</Text>
              <Text style={styles.value}>{(item as StandingsRow).losses}</Text>
              <Text style={styles.value}>{gamesBehindText((item as StandingsRow).gamesBehind || 0)}</Text>
            </View>
          )
        )}
        ListEmptyComponent={<Text style={styles.empty}>{activeContentMode === 'teamPlayers' ? 'No team player stats yet. Sim games with this team to populate player stats.' : activeContentMode === 'leaguePlayers' ? 'No league player stats yet. Sim games to populate league leaders.' : selectedViewMode === 'cup' ? 'No NBA Cup standings yet. Complete or simulate Cup games to start the table.' : 'No standings yet. Complete or simulate games to start the table.'}</Text>}
      />
      {selectedPlayerRow ? (
        <PlayerCard
          player={selectedPlayerRow.player}
          era={league?.era || 'current'}
          sport={sport}
          leagueId={String(leagueId || '')}
          teamId={selectedPlayerRow.teamId}
          leagueDate={leagueDate}
          visible={!!selectedPlayerRow}
          onClose={() => setSelectedPlayerRow(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 14, gap: 4 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  segmentCount: { color: '#555', fontSize: 10, fontWeight: '800', marginTop: 2 },
  playerStatScroll: { marginBottom: 14 },
  playerStatTabs: { flexDirection: 'row', gap: 8 },
  playerStatTab: { minWidth: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#121212', borderWidth: 1, borderColor: '#252525' },
  playerStatTabActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b' },
  playerStatTabText: { color: '#777', fontSize: 11, fontWeight: '900' },
  playerStatTabTextActive: { color: '#00e58b' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, gap: 8 },
  headerCell: { width: 42, color: '#777', fontSize: 10, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  groupHeader: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 8, marginBottom: 8, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  playerStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  rank: { width: 22, color: '#777', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  logoDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 29, height: 29 },
  playerLeaderBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  playerLeaderInitial: { color: '#00e58b', fontSize: 15, fontWeight: '900' },
  playerStatCopy: { flex: 1, minWidth: 86 },
  playerStatValues: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  playerStatValue: { color: '#fff', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  teamCopy: { flex: 1, minWidth: 0 },
  teamName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 3 },
  value: { width: 42, color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  statValue: { color: '#00e58b' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
