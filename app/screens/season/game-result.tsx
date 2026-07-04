import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import { buildPostgameStory } from '@/domain/nba/gameStory';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { displayScheduleAbbr, displayScheduleEventText, displayScheduleName, isLiveResultRevealed, normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';
import { scorePeriodsForSport } from '@/domain/sports/gamePeriods';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  players?: any[];
};

type BoxScorePlayer = {
  playerId?: string;
  name?: string;
  position?: string;
  minutes?: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fieldGoalsMade?: number;
  fieldGoalsAttempted?: number;
  threePointersMade?: number;
  threePointersAttempted?: number;
  freeThrowsMade?: number;
  freeThrowsAttempted?: number;
  plusMinus?: number;
  starter?: boolean;
  passingYards?: number;
  passingTouchdowns?: number;
  interceptions?: number;
  rushingYards?: number;
  rushingTouchdowns?: number;
  receivingYards?: number;
  receivingTouchdowns?: number;
  receptions?: number;
  sacks?: number;
  tackles?: number;
  atBats?: number;
  hits?: number;
  runs?: number;
  rbi?: number;
  homeRuns?: number;
  stolenBases?: number;
  inningsPitched?: number;
  strikeouts?: number;
  earnedRuns?: number;
  walks?: number;
};

type ResultGame = NbaScheduleGame & {
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  round?: string;
  seriesId?: string;
  playoffGame?: number;
  liveTimeline?: unknown;
  liveMode?: {
    simulationEndsAtMs?: number | null;
  } | null;
  boxScore?: {
    home?: { points?: number; players?: BoxScorePlayer[] };
    away?: { points?: number; players?: BoxScorePlayer[] };
  };
  quarters?: { quarter: number; home: number; away: number }[];
  innings?: { inning: number; period?: number; label?: string; home: number; away: number }[];
  periods?: { period: number; label?: string; home: number; away: number }[];
  story?: string;
  postgameStory?: {
    headline?: string;
    summary?: string;
    turningPoint?: string;
    topPerformers?: string[];
    coachingImpact?: string;
  };
  sport?: string;
};

type ScheduleDoc = {
  games?: ResultGame[];
  nbaCup?: {
    games?: ResultGame[];
  } | null;
  playoffs?: {
    rounds?: {
      series?: {
        games?: ResultGame[];
      }[];
    }[];
  } | null;
};

function stat(value: unknown) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function scoreText(game: ResultGame | null) {
  if (!game || typeof game.awayScore !== 'number' || typeof game.homeScore !== 'number') return 'Final Score';
  return `${game.awayScore} - ${game.homeScore}`;
}

function periodTableTitle(sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'mlb') return 'Inning Scores';
  return 'Quarter Scores';
}

function playerScore(player: BoxScorePlayer) {
  return Number(player.points || 0) * 2
    + Number(player.rebounds || 0) * 1.15
    + Number(player.assists || 0) * 1.35
    + Number(player.steals || 0) * 2
    + Number(player.blocks || 0) * 2
    - Number(player.turnovers || 0) * 0.8;
}

function sportPlayerScore(player: BoxScorePlayer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    return Number(player.passingYards || 0)
      + Number(player.rushingYards || 0) * 1.15
      + Number(player.receivingYards || 0) * 1.15
      + Number(player.passingTouchdowns || 0) * 45
      + Number(player.rushingTouchdowns || 0) * 45
      + Number(player.receivingTouchdowns || 0) * 45
      + Number(player.sacks || 0) * 35
      + Number(player.interceptions || 0) * 35;
  }
  if (sport === 'mlb') {
    return Number(player.hits || 0) * 12
      + Number(player.rbi || 0) * 10
      + Number(player.homeRuns || 0) * 25
      + Number(player.stolenBases || 0) * 8
      + Number(player.inningsPitched || 0) * 8
      + Number(player.strikeouts || 0) * 5
      - Number(player.earnedRuns || 0) * 5;
  }
  return playerScore(player);
}

function playerSummaryStats(player: BoxScorePlayer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    if (Number(player.passingYards || 0) > 0) return [`${stat(player.passingYards)} PASS YDS`, `${stat(player.passingTouchdowns)} TD`, `${stat(player.interceptions)} INT`];
    if (Number(player.rushingYards || 0) > 0) return [`${stat(player.rushingYards)} RUSH YDS`, `${stat(player.rushingTouchdowns)} TD`, `${stat(player.receivingYards)} REC`];
    if (Number(player.receivingYards || 0) > 0) return [`${stat(player.receivingYards)} REC YDS`, `${stat(player.receivingTouchdowns)} TD`, `${stat(player.receptions)} REC`];
    return [`${stat(player.tackles)} TKL`, `${stat(player.sacks)} SACK`, `${stat(player.interceptions)} INT`];
  }
  if (sport === 'mlb') {
    if (Number(player.inningsPitched || 0) > 0 || Number(player.strikeouts || 0) > 0) return [`${stat(player.inningsPitched)} IP`, `${stat(player.strikeouts)} K`, `${stat(player.earnedRuns)} ER`];
    return [`${stat(player.hits)} H`, `${stat(player.rbi)} RBI`, `${stat(player.homeRuns)} HR`];
  }
  return [`${stat(player.points)} PTS`, `${stat(player.rebounds)} REB`, `${stat(player.assists)} AST`];
}

function boxScoreStats(player: BoxScorePlayer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    return [
      `${stat(player.passingYards)} PASS`,
      `${stat(player.rushingYards)} RUSH`,
      `${stat(player.receivingYards)} REC`,
      `${stat(player.passingTouchdowns || player.rushingTouchdowns || player.receivingTouchdowns)} TD`,
      `${stat(player.sacks)} SACK`,
      `${stat(player.interceptions)} INT`,
    ];
  }
  if (sport === 'mlb') {
    if (Number(player.inningsPitched || 0) > 0 || Number(player.strikeouts || 0) > 0) {
      return [`${stat(player.inningsPitched)} IP`, `${stat(player.strikeouts)} K`, `${stat(player.earnedRuns)} ER`, `${stat(player.walks)} BB`];
    }
    return [`${stat(player.atBats)} AB`, `${stat(player.hits)} H`, `${stat(player.runs)} R`, `${stat(player.rbi)} RBI`, `${stat(player.homeRuns)} HR`, `${stat(player.stolenBases)} SB`];
  }
  return [
    `${stat(player.points)} PTS`,
    `${stat(player.rebounds)} REB`,
    `${stat(player.assists)} AST`,
    `${stat(player.steals)} STL`,
    `${stat(player.blocks)} BLK`,
    `FG ${formatShot(player.fieldGoalsMade, player.fieldGoalsAttempted)}`,
    `3PT ${formatShot(player.threePointersMade, player.threePointersAttempted)}`,
    `FT ${formatShot(player.freeThrowsMade, player.freeThrowsAttempted)}`,
    `TO ${stat(player.turnovers)}`,
    `+/- ${plusMinusText(player.plusMinus)}`,
  ];
}

function formatShot(made?: number, attempted?: number) {
  return `${stat(made)}/${stat(attempted)}`;
}

function plusMinusText(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed === 0) return '0';
  return parsed > 0 ? `+${parsed}` : String(parsed);
}

function playerKey(player: any) {
  return String(player?.player_id || player?.playerId || player?.id || player?.bref_id || player?.full_name || player?.name || '').trim();
}

function playerForCard(player: BoxScorePlayer, team: Team | undefined) {
  const key = playerKey({ player_id: player.playerId, full_name: player.name });
  const found = (team?.players || []).find(candidate => playerKey(candidate) === key);
  return found || {
    ...player,
    player_id: player.playerId,
    full_name: player.name,
    team: team?.abbreviation || team?.teamId || team?.name,
  };
}

export default function GameResultScreen() {
  const { leagueId, gameId, competition } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showFullBoxScore, setShowFullBoxScore] = useState(false);
  const [selectedPlayerCard, setSelectedPlayerCard] = useState<{ player: any; teamId: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    let unsubscribeSchedule: (() => void) | undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeSchedule = onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId), scheduleSnapshot => {
        setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
        setLoading(false);
      }, () => {
        setSchedule(null);
        setLoading(false);
      });
    }, () => setLoading(false));
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const isCupGame = competition === 'nbaCup';
  const isPlayoffGame = competition === 'playoffs';
  const competitionParam = isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular';
  const uid = auth.currentUser?.uid;
  const playoffGames = useMemo(() => (
    schedule?.playoffs?.rounds?.flatMap(round => (
      round.series?.flatMap(series => series.games || []) || []
    )) || []
  ), [schedule?.playoffs?.rounds]);
  const games = useMemo(() => (
    isCupGame ? schedule?.nbaCup?.games || [] : isPlayoffGame ? playoffGames : schedule?.games || []
  ), [isCupGame, isPlayoffGame, playoffGames, schedule?.games, schedule?.nbaCup?.games]);
  const game = useMemo(() => games.find(item => item.id === gameId) || null, [gameId, games]);
  const homeTeam = teams.find(team => game?.homeTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.homeTeamId)));
  const awayTeam = teams.find(team => game?.awayTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.awayTeamId)));
  const sport = normalizeSport(league?.sport || game?.sport);
  const awayAbbr = displayScheduleAbbr(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const homeAbbr = displayScheduleAbbr(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const awayLabel = awayTeam ? displayScheduleName(awayTeam) : displayScheduleName({ scheduleTeamId: game?.awayTeamId || 'Away' });
  const homeLabel = homeTeam ? displayScheduleName(homeTeam) : displayScheduleName({ scheduleTeamId: game?.homeTeamId || 'Home' });
  const topPerformers = useMemo(() => [
    ...(game?.boxScore?.away?.players || []).map(player => ({ ...player, side: awayLabel, sideAbbr: awayAbbr })),
    ...(game?.boxScore?.home?.players || []).map(player => ({ ...player, side: homeLabel, sideAbbr: homeAbbr })),
  ].sort((a, b) => sportPlayerScore(b, sport) - sportPlayerScore(a, sport)).slice(0, 6), [awayAbbr, awayLabel, game?.boxScore, homeAbbr, homeLabel, sport]);
  const fullBoxScore = useMemo(() => ({
    away: [...(game?.boxScore?.away?.players || [])].sort((a, b) => Number(b.starter) - Number(a.starter) || Number(b.minutes || 0) - Number(a.minutes || 0) || sportPlayerScore(b, sport) - sportPlayerScore(a, sport)),
    home: [...(game?.boxScore?.home?.players || [])].sort((a, b) => Number(b.starter) - Number(a.starter) || Number(b.minutes || 0) - Number(a.minutes || 0) || sportPlayerScore(b, sport) - sportPlayerScore(a, sport)),
  }), [game?.boxScore, sport]);
  const displayedPeriods = useMemo(() => scorePeriodsForSport(sport, game), [game, sport]);
  const resultStory = useMemo(() => {
    if (!game || typeof game.awayScore !== 'number' || typeof game.homeScore !== 'number') return displayScheduleEventText(game?.story);
    if (game.postgameStory?.summary) return displayScheduleEventText(game.postgameStory.summary);
    if (sport !== 'nba') return displayScheduleEventText(game.story);
    return displayScheduleEventText(buildPostgameStory({
      storedStory: game.story,
      awayLabel,
      homeLabel,
      awayAbbr,
      homeAbbr,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      quarters: game.quarters,
      performers: topPerformers,
    }));
  }, [awayAbbr, awayLabel, game, homeAbbr, homeLabel, sport, topPerformers]);
  const resultPostgameStory = game?.postgameStory || null;
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const showLiveReplay = Boolean(game?.liveTimeline);
  const resultVisible = isLiveResultRevealed(game, nowMs);

  const resetGame = () => {
    if (!leagueId || !gameId || !isLeagueAdmin || resetting) return;
    Alert.alert(
      'Reset Game',
      'Only commissioners can reset completed games. This will reopen the game and roll back its recorded result.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Game',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              const resetScheduledGame = httpsCallable(functions, 'resetScheduledGame');
              await resetScheduledGame({ leagueId, gameId, competition: competitionParam });
              router.replace({ pathname: '/screens/season/matchup', params: { leagueId, gameId, competition: competitionParam } });
            } catch (error: any) {
              Alert.alert('Reset failed', error.message || 'Please try again.');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons color="#ffffff" name="chevron-back" size={24} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{isCupGame ? 'NBA Cup' : isPlayoffGame ? 'Playoffs' : league?.name || 'League'}</Text>
            <Text style={styles.title}>{resultVisible ? 'Final Score' : 'Live Mode'}</Text>
          </View>
        </View>

        {!game ? (
          <Text style={styles.empty}>This result is not available yet.</Text>
        ) : !resultVisible ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Live Mode in progress</Text>
              <Text style={styles.story}>The final score unlocks when the live simulation reaches the final buzzer.</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.replace({ pathname: '/screens/season/live-mode', params: { leagueId, gameId, competition: competitionParam } })}
              style={styles.replayButton}
            >
              <Ionicons color="#06130c" name="play" size={17} />
              <Text style={styles.replayButtonText}>Watch Live Mode</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.scoreboard}>
              <View style={styles.teamBlock}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport={sport} abbr={awayAbbr} era={league?.currentYear} style={styles.logo} fontSize={10} />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{awayLabel}</Text>
                <Text style={styles.teamScore}>{stat(game.awayScore)}</Text>
              </View>
              <View style={styles.scoreCenter}>
                <Text style={styles.scoreText}>{scoreText(game)}</Text>
                <Text style={styles.status}>{game.status === 'final' ? 'Final' : game.status}</Text>
              </View>
              <View style={styles.teamBlock}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport={sport} abbr={homeAbbr} era={league?.currentYear} style={styles.logo} fontSize={10} />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{homeLabel}</Text>
                <Text style={styles.teamScore}>{stat(game.homeScore)}</Text>
              </View>
            </View>
            {showLiveReplay ? (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/screens/season/live-mode', params: { leagueId, gameId, competition: competitionParam, replayStartedAtMs: String(Date.now()) } })}
                style={styles.replayButton}
              >
                <Ionicons color="#06130c" name="play" size={17} />
                <Text style={styles.replayButtonText}>Replay Live Mode</Text>
              </TouchableOpacity>
            ) : null}
            {isLeagueAdmin && game.status === 'final' ? (
              <TouchableOpacity
                disabled={resetting}
                onPress={resetGame}
                style={[styles.resetButton, resetting && styles.resetButtonDisabled]}
              >
                {resetting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons color="#ffffff" name="refresh" size={17} />
                    <Text style={styles.resetButtonText}>Reset Game</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {resultStory ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{resultPostgameStory?.headline || 'Game Story'}</Text>
                <Text style={styles.story}>{resultStory}</Text>
                {resultPostgameStory?.turningPoint ? (
                  <View style={styles.storyDetail}>
                    <Text style={styles.storyDetailLabel}>Turning Point</Text>
                    <Text style={styles.storyDetailText}>{displayScheduleEventText(resultPostgameStory.turningPoint)}</Text>
                  </View>
                ) : null}
                {resultPostgameStory?.coachingImpact ? (
                  <View style={styles.storyDetail}>
                    <Text style={styles.storyDetailLabel}>Coaching Impact</Text>
                    <Text style={styles.storyDetailText}>{displayScheduleEventText(resultPostgameStory.coachingImpact)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {displayedPeriods.length ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{periodTableTitle(sport)}</Text>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableTeam}>Team</Text>
                  {displayedPeriods.map(period => (
                    <Text key={period.period} style={styles.tableCell}>{period.label}</Text>
                  ))}
                  <Text style={styles.tableCell}>T</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableTeam}>{awayLabel}</Text>
                  {displayedPeriods.map(period => (
                    <Text key={`away-${period.period}`} style={styles.tableCell}>{period.away}</Text>
                  ))}
                  <Text style={styles.tableCell}>{stat(game.awayScore)}</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableTeam}>{homeLabel}</Text>
                  {displayedPeriods.map(period => (
                    <Text key={`home-${period.period}`} style={styles.tableCell}>{period.home}</Text>
                  ))}
                  <Text style={styles.tableCell}>{stat(game.homeScore)}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Top Performers</Text>
              {topPerformers.length > 0 ? topPerformers.map((player, index) => (
                <TouchableOpacity
                  key={`${player.playerId || player.name || index}`}
                  onPress={() => setSelectedPlayerCard({
                    player: playerForCard(player, player.sideAbbr === awayAbbr ? awayTeam : homeTeam),
                    teamId: player.sideAbbr === awayAbbr ? awayTeam?.id || '' : homeTeam?.id || '',
                  })}
                  style={styles.performerRow}
                >
                  <View style={styles.performerCopy}>
                    <Text numberOfLines={1} style={styles.playerName}>{player.name || 'Player'}</Text>
                    <Text style={styles.playerTeam}>{player.side}</Text>
                  </View>
                  {playerSummaryStats(player, sport).map((line, statIndex) => (
                    <Text key={`${player.playerId || player.name}-${statIndex}`} style={statIndex === 0 ? styles.playerStat : styles.playerMini}>{line}</Text>
                  ))}
                </TouchableOpacity>
              )) : (
                <Text style={styles.emptySmall}>Box score details will appear after a simulated result is finalized.</Text>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.panelTitleNoMargin}>Full Box Score</Text>
                <TouchableOpacity onPress={() => setShowFullBoxScore(value => !value)} style={styles.smallOutlineButton}>
                  <Text style={styles.smallOutlineButtonText}>{showFullBoxScore ? 'Hide' : 'View All'}</Text>
                </TouchableOpacity>
              </View>
              {showFullBoxScore ? (
                <View style={styles.boxScoreWrap}>
                  {([
                    { key: 'away', label: awayLabel, abbr: awayAbbr, players: fullBoxScore.away },
                    { key: 'home', label: homeLabel, abbr: homeAbbr, players: fullBoxScore.home },
                  ] as const).map(group => (
                    <View key={group.key} style={styles.boxTeamGroup}>
                      <Text style={styles.boxTeamTitle}>{group.label}</Text>
                      {group.players.length > 0 ? group.players.map((player, index) => (
                        <TouchableOpacity
                          key={`${group.key}-${player.playerId || player.name || index}`}
                          onPress={() => setSelectedPlayerCard({
                            player: playerForCard(player, group.key === 'away' ? awayTeam : homeTeam),
                            teamId: group.key === 'away' ? awayTeam?.id || '' : homeTeam?.id || '',
                          })}
                          style={styles.boxPlayerRow}
                        >
                          <View style={styles.boxPlayerNameBlock}>
                            <Text numberOfLines={1} style={styles.boxPlayerName}>{player.name || 'Player'}</Text>
                            <Text style={styles.boxPlayerMeta}>{[player.position, player.starter ? 'Starter' : null].filter(Boolean).join(' · ') || group.abbr}</Text>
                          </View>
                          <View style={styles.boxStatsGrid}>
                            {boxScoreStats(player, sport).map((line, statIndex) => (
                              <Text key={`${player.playerId || player.name}-${statIndex}`} style={statIndex === 0 ? styles.boxStatStrong : styles.boxStat}>{line}</Text>
                            ))}
                          </View>
                        </TouchableOpacity>
                      )) : (
                        <Text style={styles.emptySmall}>No box score players stored for {group.label}.</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptySmall}>Open the full team-by-team box score for every player line.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <PlayerCard
        player={selectedPlayerCard?.player || null}
        era={league?.era || league?.currentYear || 'current'}
        sport={sport}
        leagueId={leagueId}
        teamId={selectedPlayerCard?.teamId || ''}
        leagueDate={leagueDateFromRecord(league)}
        visible={!!selectedPlayerCard}
        onClose={() => setSelectedPlayerCard(null)}
      />
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
  scoreboard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  teamBlock: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  logoDisc: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 44, height: 44 },
  teamName: { color: '#fff', fontSize: 12, fontWeight: '900', maxWidth: '100%' },
  teamScore: { color: '#00e58b', fontSize: 26, fontWeight: '900' },
  scoreCenter: { width: 96, alignItems: 'center', gap: 4 },
  scoreText: { color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  status: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  panel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 14, marginBottom: 14 },
  replayButton: { minHeight: 44, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  replayButtonText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
  resetButton: { minHeight: 44, borderRadius: 8, backgroundColor: '#2a0c0c', borderWidth: 1, borderColor: '#ff5c5c88', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  resetButtonDisabled: { opacity: 0.6 },
  resetButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  panelTitleNoMargin: { color: '#fff', fontSize: 16, fontWeight: '900' },
  smallOutlineButton: { minHeight: 32, borderRadius: 8, borderWidth: 1, borderColor: '#2c3d34', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  smallOutlineButtonText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  story: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  storyDetail: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#202020', gap: 3 },
  storyDetailLabel: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  storyDetailText: { color: '#d8d8d8', fontSize: 12, fontWeight: '800', lineHeight: 18 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#202020' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  tableTeam: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '900' },
  tableCell: { width: 34, color: '#ccc', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  performerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  performerCopy: { flex: 1, minWidth: 0 },
  playerName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  playerTeam: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 2 },
  playerStat: { width: 58, color: '#00e58b', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  playerMini: { width: 48, color: '#aaa', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  boxScoreWrap: { gap: 14 },
  boxTeamGroup: { gap: 8, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingTop: 10 },
  boxTeamTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  boxPlayerRow: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  boxPlayerNameBlock: { gap: 2 },
  boxPlayerName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  boxPlayerMeta: { color: '#777', fontSize: 10, fontWeight: '800' },
  boxStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  boxStatStrong: { minWidth: 58, color: '#00e58b', fontSize: 11, fontWeight: '900' },
  boxStat: { minWidth: 54, color: '#c8c8c8', fontSize: 11, fontWeight: '800' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20 },
  emptySmall: { color: '#777', fontSize: 13, lineHeight: 19 },
});
