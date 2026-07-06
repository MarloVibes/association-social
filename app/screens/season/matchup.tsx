import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import { buildCoachingSnapshot, type CoachingPreset } from '@/domain/nba/coaching';
import { buildPostgameStory } from '@/domain/nba/gameStory';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { displayScheduleAbbr, displayScheduleEventText, displayScheduleName, gameMatchesMyTeam, normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';
import { defaultPresetsForSport } from '@/domain/sports/coachingPresets';
import { scorePeriodsForSport } from '@/domain/sports/gamePeriods';
import { isMissingCallable } from '@/utils/createNbaSchedule';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
  defaultSecondHalfCoachingPresetId?: string;
};

type ScheduleDoc = {
  games?: MatchupGame[];
  nbaCup?: {
    name?: string;
    games?: MatchupGame[];
  } | null;
  playoffs?: {
    rounds?: {
      series?: {
        games?: MatchupGame[];
      }[];
    }[];
  } | null;
};

type MatchupGame = Omit<NbaScheduleGame, 'status'> & {
  status: NbaScheduleGame['status'] | 'requested' | 'preparing' | 'expired' | 'simulating';
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  round?: string;
  seriesId?: string;
  playoffGame?: number;
  requestedByUid?: string;
  preparationDeadlineMs?: number;
  resetByUid?: string;
  resetAtMs?: number;
  finalScoreSubmittedByUid?: string;
  liveTimeline?: unknown;
  sport?: string;
  boxScore?: {
    home?: { points?: number; players?: BoxScorePlayer[] };
    away?: { points?: number; players?: BoxScorePlayer[] };
  };
  quarters?: { quarter: number; home: number; away: number }[];
  innings?: { inning: number; period?: number; label?: string; home: number; away: number }[];
  periods?: { period: number; label?: string; home: number; away: number }[];
  story?: string;
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
  passingYards?: number;
  passingTouchdowns?: number;
  interceptions?: number;
  rushingYards?: number;
  rushingTouchdowns?: number;
  receivingYards?: number;
  receivingTouchdowns?: number;
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
};

function prepPhaseLabels(sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'mlb') return ['Early', 'Late'];
  if (sport === 'nba') return ['OFF', 'DEF'];
  return ['1H', '2H'];
}

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function playerImpactScore(player: BoxScorePlayer, sport: 'nba' | 'madden' | 'mlb' = 'nba') {
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
  return Number(player.points || 0) * 2
    + Number(player.rebounds || 0) * 1.15
    + Number(player.assists || 0) * 1.35
    + Number(player.steals || 0) * 2
    + Number(player.blocks || 0) * 2
    - Number(player.turnovers || 0) * 0.8;
}

function playerStatLine(player: BoxScorePlayer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    const lines = [];
    if (Number(player.passingYards || 0) > 0) lines.push(`${Number(player.passingYards || 0)} PASS YDS`, `${Number(player.passingTouchdowns || 0)} TD`);
    if (Number(player.rushingYards || 0) > 0) lines.push(`${Number(player.rushingYards || 0)} RUSH YDS`);
    if (Number(player.receivingYards || 0) > 0) lines.push(`${Number(player.receivingYards || 0)} REC YDS`);
    if (Number(player.sacks || 0) > 0) lines.push(`${Number(player.sacks || 0)} SACK`);
    if (Number(player.interceptions || 0) > 0) lines.push(`${Number(player.interceptions || 0)} INT`);
    return lines.slice(0, 3).join(' · ') || `${player.position || 'NFL'} impact`;
  }
  if (sport === 'mlb') {
    if (Number(player.inningsPitched || 0) > 0 || Number(player.strikeouts || 0) > 0) {
      return `${Number(player.inningsPitched || 0)} IP · ${Number(player.strikeouts || 0)} K · ${Number(player.earnedRuns || 0)} ER`;
    }
    return `${Number(player.hits || 0)} H · ${Number(player.rbi || 0)} RBI · ${Number(player.homeRuns || 0)} HR`;
  }
  return `${Number(player.points || 0)} PTS · ${Number(player.rebounds || 0)} REB · ${Number(player.assists || 0)} AST`;
}

function callableErrorMessage(error: any) {
  const message = String(error?.message || '').trim();
  const details = typeof error?.details === 'string'
    ? error.details.trim()
    : error?.details && typeof error.details === 'object'
      ? JSON.stringify(error.details)
      : '';
  const code = String(error?.code || '').replace('functions/', '').trim();
  return [message, details].filter(Boolean).join('\n') || code || 'Please try again.';
}

export default function MatchupScreen() {
  const { leagueId, gameId, competition } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [firstHalfPresetId, setFirstHalfPresetId] = useState('balanced');
  const [secondHalfPresetId, setSecondHalfPresetId] = useState('balanced');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

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
      }, error => {
        console.warn('Schedule matchup unavailable:', error);
        setSchedule(null);
        setLoading(false);
      });
    }, err => {
      console.warn('League matchup unavailable:', err);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    }, err => {
      console.warn('League teams unavailable for matchup:', err);
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
  const playoffGames = useMemo(() => (
    schedule?.playoffs?.rounds?.flatMap(round => (
      round.series?.flatMap(series => series.games || []) || []
    )) || []
  ), [schedule?.playoffs?.rounds]);
  const scheduledGames = useMemo(() => {
    if (isCupGame) return schedule?.nbaCup?.games || [];
    if (isPlayoffGame) return playoffGames;
    return schedule?.games || [];
  }, [isCupGame, isPlayoffGame, playoffGames, schedule?.games, schedule?.nbaCup?.games]);
  const game = useMemo<MatchupGame | null>(
    () => scheduledGames.find(item => item.id === gameId) || null,
    [gameId, scheduledGames],
  );
  const sport = normalizeSport(league?.sport || game?.sport);
  const myTeam = teams.find(team => (
    team.gmId === uid
    && game
    && gameMatchesMyTeam(game, team, uid)
  ));
  const myTeamIds = teamScheduleKeys(myTeam);
  const opponentTeamId = game && myTeam
    ? myTeamIds.has(normalizeScheduleKey(game.homeTeamId)) || game.homeGmId === uid ? game.awayTeamId : game.homeTeamId
    : '';
  const homeTeam = teams.find(team => game?.homeTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.homeTeamId)));
  const awayTeam = teams.find(team => game?.awayTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.awayTeamId)));
  const opponentTeam = teams.find(team => opponentTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(opponentTeamId)));
  const myTeamAbbr = normalizeScheduleKey(myTeam?.abbreviation || myTeam?.teamId || '');
  const opponentAbbr = normalizeScheduleKey(opponentTeam?.abbreviation || opponentTeam?.teamId || opponentTeamId);
  const myTeamLabel = myTeam ? displayScheduleName(myTeam) : 'My Team';
  const opponentLabel = opponentTeam ? displayScheduleName(opponentTeam) : displayScheduleName({ scheduleTeamId: opponentTeamId || 'CPU' });
  const gameContextLabel = game
    ? isCupGame
      ? `NBA Cup · ${game.groupId || 'Group Play'} · Game ${game.sequence} · ${game.status}`
      : isPlayoffGame
        ? `Playoffs · Game ${game.playoffGame || game.sequence} · ${game.status}`
      : `Week ${game.week} · Game ${game.sequence} · ${game.status}`
    : '';
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const leftAbbr = myTeam
    ? displayScheduleAbbr(myTeamAbbr)
    : displayScheduleAbbr(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const rightAbbr = myTeam
    ? displayScheduleAbbr(opponentAbbr)
    : displayScheduleAbbr(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const leftLabel = myTeam ? myTeamLabel : awayTeam ? displayScheduleName(awayTeam) : displayScheduleName({ scheduleTeamId: game?.awayTeamId || 'Away' });
  const rightLabel = myTeam ? opponentLabel : homeTeam ? displayScheduleName(homeTeam) : displayScheduleName({ scheduleTeamId: game?.homeTeamId || 'Home' });
  const matchupJoinLabel = myTeam ? 'VS' : 'AT';
  const awayAbbr = displayScheduleAbbr(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const homeAbbr = displayScheduleAbbr(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const awayLabel = awayTeam ? displayScheduleName(awayTeam) : displayScheduleName({ scheduleTeamId: game?.awayTeamId || 'Away' });
  const homeLabel = homeTeam ? displayScheduleName(homeTeam) : displayScheduleName({ scheduleTeamId: game?.homeTeamId || 'Home' });
  const presets = useMemo(() => {
    const byId = new Map<string, CoachingPreset>();
    [...defaultPresetsForSport(sport), ...(myTeam?.coachingPresets || [])].forEach(preset => byId.set(preset.id, preset));
    return [...byId.values()];
  }, [myTeam?.coachingPresets, sport]);

  useEffect(() => {
    if (myTeam?.defaultCoachingPresetId) {
      setFirstHalfPresetId(myTeam.defaultCoachingPresetId);
      setSecondHalfPresetId(myTeam.defaultSecondHalfCoachingPresetId || myTeam.defaultCoachingPresetId);
    }
  }, [myTeam?.defaultCoachingPresetId, myTeam?.defaultSecondHalfCoachingPresetId]);

  const call = async (name: string) => {
    if (!leagueId || !gameId) return;
    setWorking(true);
    try {
      const fn = httpsCallable(functions, name);
      const response = await fn({ leagueId, gameId, competition: competitionParam });
      const responseData = response.data as any;
      if (name === 'simulateScheduledGame') {
        router.replace({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competitionParam } });
        return;
      }
      if (name === 'requestMatchup' && responseData?.status === 'final' && responseData?.liveTimeline) {
        router.replace({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competitionParam } });
      }
    } catch (error: any) {
      if (name === 'simulateScheduledGame' && isMissingCallable(error)) {
        Alert.alert('Simulation unavailable', 'Live simulation needs the latest cloud functions. Deploy functions, then try this game again.');
        return;
      }
      if (name === 'resetScheduledGame' && isMissingCallable(error)) {
        Alert.alert('Reset unavailable', 'Reset needs the latest cloud functions so player stats roll back correctly. Deploy functions, then try again.');
        return;
      }
      Alert.alert('Matchup action failed', callableErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const submitWinnerOutcome = async (winnerTeamId: string) => {
    if (!leagueId || !gameId) return;
    if (!game || ![game.homeTeamId, game.awayTeamId].includes(winnerTeamId)) {
      Alert.alert('Winner needed', 'Choose one of the matchup teams.');
      return;
    }
    setWorking(true);
    try {
      const fn = httpsCallable(functions, 'reportGameScore');
      await fn({ leagueId, gameId, competition: isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular', winnerTeamId });
      router.replace({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competitionParam } });
    } catch (error: any) {
      if (isMissingCallable(error) && isLeagueAdmin) {
        Alert.alert('Result unavailable', 'Winner selection needs the latest cloud functions so the box score and player stats stay synced. Deploy functions, then try again.');
        return;
      }
      Alert.alert('Result failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const confirmResetGame = () => {
    if (!game) return;
    Alert.alert(
      'Reset game?',
      `This will move ${isCupGame ? `NBA Cup ${game.groupId || 'Group Play'}, Game ${game.sequence}` : isPlayoffGame ? `Playoff Game ${game.playoffGame || game.sequence}` : `Week ${game.week}, Game ${game.sequence}`} back to scheduled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Game',
          style: 'destructive',
          onPress: () => call('resetScheduledGame'),
        },
      ],
    );
  };

  const savePrivatePrep = async () => {
    if (!leagueId || !league || !game || !myTeam) return;
    const firstHalfPreset = presets.find(item => item.id === firstHalfPresetId) || presets[0];
    const secondHalfPreset = presets.find(item => item.id === secondHalfPresetId) || firstHalfPreset;
    setWorking(true);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      await setDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId, 'preparation', `${game.id}_${myTeam.id}`), {
        teamId: myTeam.id,
        gameId: game.id,
        presetSnapshot: buildCoachingSnapshot(firstHalfPreset, myTeam.id, game.id),
        firstHalfPresetSnapshot: buildCoachingSnapshot(firstHalfPreset, myTeam.id, game.id),
        secondHalfPresetSnapshot: buildCoachingSnapshot(secondHalfPreset, myTeam.id, game.id),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      Alert.alert('Saved', sport === 'mlb' ? 'Your early-game and late-game prep has been saved.' : 'Your opening plan and adjustment plan have been saved.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  const canAccept = Boolean(myTeam && game?.status === 'requested' && game?.requestedByUid !== uid);
  const canRequest = Boolean(myTeam && game?.status === 'scheduled');
  const canSimulate = Boolean(myTeam && game && ['scheduled', 'preparing'].includes(game.status));
  const canReportScore = Boolean((myTeam || isLeagueAdmin) && game && ['scheduled', 'preparing', 'simulating'].includes(game.status));
  const canReset = Boolean(isLeagueAdmin && game && game.status !== 'scheduled');
  const hasFinalScore = game?.status === 'final' && typeof game.homeScore === 'number' && typeof game.awayScore === 'number';
  const topPerformers = [
    ...(game?.boxScore?.home?.players || []).map(player => ({ ...player, side: 'home' as const, sideAbbr: homeAbbr })),
    ...(game?.boxScore?.away?.players || []).map(player => ({ ...player, side: 'away' as const, sideAbbr: awayAbbr })),
  ].sort((left, right) => playerImpactScore(right, sport) - playerImpactScore(left, sport)).slice(0, 4);
  const displayedPeriods = scorePeriodsForSport(sport, game);
  const resultStory = sport === 'nba' && game && typeof game.homeScore === 'number' && typeof game.awayScore === 'number'
    ? displayScheduleEventText(buildPostgameStory({
      storedStory: game.story,
      homeLabel,
      awayLabel,
      homeAbbr,
      awayAbbr,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      quarters: game.quarters,
      performers: topPerformers,
    }))
    : displayScheduleEventText(game?.story) || '';
  const [firstPrepLabel, secondPrepLabel] = prepPhaseLabels(sport);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={myTeam ? presets : []}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Matchup</Text>
              </View>
            </View>
            {!game || (!myTeam && !isLeagueAdmin) ? (
              <Text style={styles.empty}>This matchup is not available for your team.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <View style={styles.matchupVisual}>
                    <View style={styles.matchupTeam}>
                      <View style={styles.matchupLogoDisc}>
                        <SportTeamLogo sport={sport} abbr={leftAbbr} era={league?.currentYear} style={styles.matchupLogo} fontSize={12} />
                      </View>
                      <Text style={styles.matchupTeamLabel} numberOfLines={1}>{leftLabel}</Text>
                    </View>
                    <View style={styles.vsBadge}>
                      <Text style={styles.vsText}>{matchupJoinLabel}</Text>
                    </View>
                    <View style={styles.matchupTeam}>
                      <View style={styles.matchupLogoDisc}>
                        <SportTeamLogo sport={sport} abbr={rightAbbr} era={league?.currentYear} style={styles.matchupLogo} fontSize={12} />
                      </View>
                      <Text style={styles.matchupTeamLabel} numberOfLines={1}>{rightLabel}</Text>
                    </View>
                  </View>
                  {hasFinalScore ? (
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreText}>{game.awayScore}</Text>
                      <Text style={styles.scoreDivider}>-</Text>
                      <Text style={styles.scoreText}>{game.homeScore}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.summaryMeta}>{gameContextLabel}</Text>
                </View>
                {hasFinalScore && (resultStory || game.quarters?.length || game.boxScore) ? (
                  <View style={styles.resultCard}>
                    {resultStory ? <Text style={styles.storyText}>{resultStory}</Text> : null}
                    {displayedPeriods.length ? (
                      <View style={styles.quarterRow}>
                        {displayedPeriods.slice(0, sport === 'mlb' ? 9 : 5).map(period => (
                          <View key={period.period} style={styles.quarterCell}>
                            <Text style={styles.quarterLabel}>{period.label}</Text>
                            <Text style={styles.quarterScore}>{period.away}-{period.home}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {game.boxScore && topPerformers.length > 0 ? (
                      <View style={styles.performerList}>
                        <Text style={styles.resultSectionTitle}>Top Performers</Text>
                        {topPerformers.map(player => (
                          <Text key={player.playerId || player.name} style={styles.performerLine}>
                            {player.name || player.playerId}: {playerStatLine(player, sport)}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  {canRequest && (
                    <Pressable disabled={working} onPress={() => call('requestMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Request</Text>
                    </Pressable>
                  )}
                  {canAccept && (
                    <Pressable disabled={working} onPress={() => call('acceptMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Accept</Text>
                    </Pressable>
                  )}
                  {canSimulate && (
                    <Pressable disabled={working} onPress={() => call('simulateScheduledGame')} style={styles.actionButtonAlt}>
                      <Text style={styles.actionTextAlt}>Simulate</Text>
                    </Pressable>
                  )}
                </View>
                {canReset && (
                  <Pressable disabled={working} onPress={confirmResetGame} style={styles.resetButton}>
                    <Ionicons color="#ff6b6b" name="refresh" size={16} />
                    <Text style={styles.resetText}>
                      {isCupGame ? `Reset NBA Cup, Game ${game.sequence}` : isPlayoffGame ? `Reset Playoff Game ${game.playoffGame || game.sequence}` : `Reset Week ${game.week}, Game ${game.sequence}`}
                    </Text>
                  </Pressable>
                )}
                {canReportScore && game && (
                  <View style={styles.winnerEntry}>
                    <Text style={styles.winnerEntryTitle}>Choose Winner</Text>
                    <Text style={styles.winnerEntryHelp}>The sim engine will create the final score and box score.</Text>
                    <View style={styles.winnerButtonRow}>
                      <Pressable disabled={working} onPress={() => submitWinnerOutcome(game.awayTeamId)} style={styles.winnerButton}>
                        <Text style={styles.winnerButtonText}>{displayScheduleAbbr(game.awayTeamId)} Wins</Text>
                      </Pressable>
                      <Pressable disabled={working} onPress={() => submitWinnerOutcome(game.homeTeamId)} style={styles.winnerButton}>
                        <Text style={styles.winnerButtonText}>{displayScheduleAbbr(game.homeTeamId)} Wins</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                {myTeam && (
                  <View style={styles.prepHeader}>
                    <Text style={styles.sectionTitle}>Private Game Prep</Text>
                    <Text style={styles.prepHelp}>{sport === 'nba' ? 'Pick one offense and one defense before tipoff.' : 'Pick an opening plan and a matchup adjustment.'}</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const firstSelected = item.id === firstHalfPresetId;
          const secondSelected = item.id === secondHalfPresetId;
          return (
            <View style={[styles.presetRow, (firstSelected || secondSelected) && styles.presetRowActive]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.presetName, (firstSelected || secondSelected) && styles.presetNameActive]}>{item.name}</Text>
                <Text style={styles.presetMeta}>{item.offense.replace(/_/g, ' ')} · {item.defense.replace(/_/g, ' ')}</Text>
              </View>
              <View style={styles.halfPicker}>
                <Pressable
                  onPress={() => setFirstHalfPresetId(item.id)}
                  style={[styles.halfButton, firstSelected && styles.halfButtonActive]}
                >
                  <Text style={[styles.halfButtonText, firstSelected && styles.halfButtonTextActive]}>{firstPrepLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSecondHalfPresetId(item.id)}
                  style={[styles.halfButton, secondSelected && styles.halfButtonActive]}
                >
                  <Text style={[styles.halfButtonText, secondSelected && styles.halfButtonTextActive]}>{secondPrepLabel}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListFooterComponent={game && myTeam ? (
          <Pressable disabled={working} onPress={savePrivatePrep} style={styles.saveButton}>
            <Text style={styles.saveText}>Save Preparations</Text>
          </Pressable>
        ) : null}
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
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  matchupVisual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  matchupTeam: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  matchupLogoDisc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717', borderWidth: 1, borderColor: '#2d2d2d' },
  matchupLogo: { width: 55, height: 55 },
  matchupTeamLabel: { color: '#fff', fontSize: 13, fontWeight: '900', maxWidth: '100%' },
  vsBadge: { width: 38, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808', borderWidth: 1, borderColor: '#00e58b55' },
  vsText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 },
  scoreText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  scoreDivider: { color: '#777', fontSize: 18, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center', textTransform: 'capitalize' },
  resultCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 18 },
  storyText: { color: '#ddd', fontSize: 12, fontWeight: '800', lineHeight: 18, marginBottom: 10 },
  quarterRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  quarterCell: { flex: 1, minHeight: 44, borderRadius: 7, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  quarterLabel: { color: '#777', fontSize: 9, fontWeight: '900' },
  quarterScore: { color: '#fff', fontSize: 12, fontWeight: '900', marginTop: 2 },
  performerList: { gap: 5 },
  resultSectionTitle: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 2 },
  performerLine: { color: '#aaa', fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionButton: { flex: 1, backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  actionButtonAlt: { flex: 1, backgroundColor: '#191919', borderRadius: 8, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: '#00e58b55' },
  actionText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
  actionTextAlt: { color: '#00e58b', fontSize: 13, fontWeight: '900' },
  resetButton: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#ff6b6b55', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18, backgroundColor: '#1a0d0d' },
  resetText: { color: '#ff6b6b', fontSize: 12, fontWeight: '900' },
  winnerEntry: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 18 },
  winnerEntryTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  winnerEntryHelp: { color: '#888', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4, marginBottom: 12 },
  winnerButtonRow: { flexDirection: 'row', gap: 10 },
  winnerButton: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  winnerButtonText: { color: '#06130c', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  prepHeader: { marginBottom: 10 },
  prepHelp: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3 },
  sectionTitle: { color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  presetRowActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b' },
  presetName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  presetNameActive: { color: '#00e58b' },
  presetMeta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  halfPicker: { flexDirection: 'row', gap: 6 },
  halfButton: { minWidth: 40, minHeight: 32, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', backgroundColor: '#191919' },
  halfButtonActive: { borderColor: '#00e58b', backgroundColor: '#00e58b' },
  halfButtonText: { color: '#777', fontSize: 11, fontWeight: '900' },
  halfButtonTextActive: { color: '#06130c' },
  saveButton: { backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  saveText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
});
