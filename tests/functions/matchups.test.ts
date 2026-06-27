import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  acceptMatchupRequest,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  requestMatchup,
  resetScheduledGame,
  scheduleCompetition,
  simulateScheduledGame,
  simulateScheduledGameResult,
  teamPersistencePayload,
  teamFromParticipantFallback,
  teamResetPayload,
  teamStateUpdatePayload,
  updatePayloadForCompetition,
} = require('../../functions/franchise/matchups.js');

function seedAvailableGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    status: 'scheduled',
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeGmId: 'home-gm',
    awayGmId: 'away-gm',
    ...overrides,
  };
}

function seedRequestedGame(overrides: Record<string, unknown> = {}) {
  const game = seedAvailableGame({
    status: 'requested',
    requestedByUid: 'home-gm',
    requestedAtMs: 0,
    responseDeadlineMs: 3_600_000,
    ...overrides,
  });
  return { ...game, gameId: game.id };
}

function seedRoster(prefix: string, skill = 78) {
  return {
    players: Array.from({ length: 8 }, (_, index) => ({
      player_id: `${prefix}-${index}`,
      full_name: `${prefix} Player ${index + 1}`,
      position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
      minutes: index < 5 ? 30 : 18,
      hidden: {
        shooting: skill,
        playmaking: skill - 2,
        defense: skill - 4,
        rebounding: index === 4 ? skill + 8 : skill - 8,
        basketballIq: skill,
      },
    })),
  };
}

describe('matchup request state helpers', () => {
  it('expires an unaccepted request after one hour', () => {
    const request = seedRequestedGame({ requestedAtMs: 0 });
    const result = expireMatchupRequest({ game: request, nowMs: 3_600_001 });

    expect(result.status).toBe('expired');
  });

  it('prevents duplicate active requests', () => {
    const game = seedAvailableGame();
    const requested = requestMatchup({ game, uid: game.homeGmId, nowMs: 1_000 });

    expect(() => requestMatchup({ game: requested, uid: game.awayGmId, nowMs: 2_000 })).toThrow(
      expect.objectContaining({ code: 'already-exists' }),
    );
  });

  it('starts five-minute preparation after acceptance', () => {
    const request = seedRequestedGame({ requestedAtMs: 1_000 });
    const result = acceptMatchupRequest({ game: request, uid: request.awayGmId, nowMs: 2_000 });

    expect(result).toMatchObject({ status: 'preparing', preparationDeadlineMs: 302_000 });
  });

  it('permits immediate simulation by either participating GM', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('Away', 72),
    });

    expect(result).toMatchObject({
      status: 'final',
      simulationStartedByUid: game.homeGmId,
      finalAtMs: 5_000,
    });
    expect(result.homeScore).not.toBe(result.awayScore);
    expect([game.homeTeamId, game.awayTeamId]).toContain(result.winnerTeamId);
  });

  it('refuses to simulate when a team roster cannot be resolved', () => {
    const game = seedAvailableGame();

    expect(() => simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: seedRoster('Away', 72),
    })).toThrow(expect.objectContaining({
      code: 'failed-precondition',
      message: expect.stringContaining('roster'),
    }));
  });

  it('stores live mode replay metadata for simulated games', () => {
    const game = seedAvailableGame({
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          full_name: `Home ${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          full_name: `Away ${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.status).toBe('final');
    expect(result.liveTimeline).toMatchObject({
      version: 1,
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveTimeline.periods).toEqual(
      result.quarters.map((quarter: { quarter: number; home: number; away: number }) => ({
        period: quarter.quarter,
        label: `Q${quarter.quarter}`,
        home: quarter.home,
        away: quarter.away,
      })),
    );
    expect(result.liveTimeline.events.length).toBeGreaterThan(0);
    expect(result.liveTimeline.events.some((event: { eventType: string }) => event.eventType === 'rebound')).toBe(true);
    expect(result.liveTimeline.events.some((event: { eventType: string }) => event.eventType === 'foul')).toBe(true);
    expect(result.liveTimeline.events.some((event: { statDelta?: { rebounds?: number } }) => event.statDelta?.rebounds === 1)).toBe(true);
    expect(result.liveTimeline.events.at(-1)).toMatchObject({
      eventType: 'final_buzzer',
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 5_000,
      simulationEndsAtMs: 5_000 + result.liveTimeline.revealDurationMs,
      arenaTheme: expect.objectContaining({
        homeAbbr: 'LAL',
        centerText: 'LAL',
      }),
    });
  });

  it('permits immediate CPU matchup simulation with live mode replay metadata', () => {
    const game = seedAvailableGame({
      awayGmId: null,
      awayTeamId: 'cpu-away',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('CPU', 74),
    });

    expect(result.status).toBe('final');
    expect(result.quarters).toHaveLength(4);
    expect(result.liveTimeline).toMatchObject({
      version: 1,
      gameId: game.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveTimeline.periods).toEqual(
      result.quarters.map((quarter: { quarter: number; home: number; away: number }) => ({
        period: quarter.quarter,
        label: `Q${quarter.quarter}`,
        home: quarter.home,
        away: quarter.away,
      })),
    );
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 5_000,
      simulationEndsAtMs: 5_000 + result.liveTimeline.revealDurationMs,
      arenaTheme: expect.objectContaining({ centerText: expect.any(String) }),
    });
  });

  it('does not invent fallback CPU box score players when era pool data is missing', () => {
    const game = seedAvailableGame({
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      awayGmId: null,
    });

    expect(() => simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: seedRoster('Chicago', 77),
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('uses roster hidden values and stores a box score for simulated games', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          full_name: `Home ${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          full_name: `Away ${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.winnerTeamId).toBe(game.homeTeamId);
    expect(result.boxScore.home.players).toHaveLength(8);
    expect(result.boxScore.home.points).toBe(result.homeScore);
    expect(result.boxScore.away.points).toBe(result.awayScore);
    expect(result.boxScore.home.players[0]).toMatchObject({
      fieldGoalsMade: expect.any(Number),
      fieldGoalsAttempted: expect.any(Number),
      threePointersMade: expect.any(Number),
      threePointersAttempted: expect.any(Number),
      freeThrowsMade: expect.any(Number),
      freeThrowsAttempted: expect.any(Number),
      offensiveRebounds: expect.any(Number),
      defensiveRebounds: expect.any(Number),
      fouls: expect.any(Number),
      plusMinus: expect.any(Number),
      starter: true,
    });
    expect(result.quarters).toHaveLength(4);
    expect(result.story).not.toContain('_2011');
  });

  it('uses grade-based player profiles without inflating assists and rebounds', () => {
    const game = seedAvailableGame({
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      awayGmId: null,
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          { player_id: 'duncan', full_name: 'Tim Duncan', position: 'PF', minutes: 34, hidden: { shooting: 84, playmaking: 62, rebounding: 94, defense: 96, basketballIq: 95 } },
          { player_id: 'parker', full_name: 'Tony Parker', position: 'PG', minutes: 34, hidden: { shooting: 88, playmaking: 91, rebounding: 45, defense: 72, basketballIq: 88 } },
          { player_id: 'ginobili', full_name: 'Manu Ginobili', position: 'SG', minutes: 30, hidden: { shooting: 89, playmaking: 86, rebounding: 58, defense: 78, basketballIq: 90 } },
          { player_id: 'leonard', full_name: 'Kawhi Leonard', position: 'SF', minutes: 24, hidden: { shooting: 74, playmaking: 58, rebounding: 73, defense: 90, basketballIq: 78 } },
          { player_id: 'splitter', full_name: 'Tiago Splitter', position: 'C', minutes: 24, hidden: { shooting: 66, playmaking: 45, rebounding: 82, defense: 80, basketballIq: 72 } },
          { player_id: 'green', full_name: 'Danny Green', position: 'SG', minutes: 22, hidden: { shooting: 80, playmaking: 52, rebounding: 55, defense: 82, basketballIq: 76 } },
          { player_id: 'neal', full_name: 'Gary Neal', position: 'G', minutes: 18, hidden: { shooting: 78, playmaking: 50, rebounding: 42, defense: 55, basketballIq: 68 } },
          { player_id: 'diaw', full_name: 'Boris Diaw', position: 'F', minutes: 20, hidden: { shooting: 72, playmaking: 78, rebounding: 66, defense: 70, basketballIq: 88 } },
        ],
      },
      awayTeam: {
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', position: 'PG', minutes: 38, hidden: { shooting: 92, playmaking: 92, rebounding: 52, defense: 70, basketballIq: 88 } },
          { player_id: 'boozer', full_name: 'Carlos Boozer', position: 'PF', minutes: 32, hidden: { shooting: 80, playmaking: 50, rebounding: 88, defense: 62, basketballIq: 75 } },
          { player_id: 'deng', full_name: 'Luol Deng', position: 'SF', minutes: 36, hidden: { shooting: 78, playmaking: 60, rebounding: 74, defense: 84, basketballIq: 80 } },
          { player_id: 'noah', full_name: 'Joakim Noah', position: 'C', minutes: 30, hidden: { shooting: 62, playmaking: 70, rebounding: 90, defense: 90, basketballIq: 82 } },
          { player_id: 'korver', full_name: 'Kyle Korver', position: 'SG', minutes: 22, hidden: { shooting: 89, playmaking: 48, rebounding: 42, defense: 55, basketballIq: 76 } },
          { player_id: 'asik', full_name: 'Omer Asik', position: 'C', minutes: 14, hidden: { shooting: 45, playmaking: 34, rebounding: 84, defense: 82, basketballIq: 62 } },
          { player_id: 'watson', full_name: 'C.J. Watson', position: 'PG', minutes: 18, hidden: { shooting: 72, playmaking: 72, rebounding: 40, defense: 58, basketballIq: 72 } },
          { player_id: 'brewer', full_name: 'Ronnie Brewer', position: 'SG', minutes: 18, hidden: { shooting: 65, playmaking: 48, rebounding: 55, defense: 80, basketballIq: 70 } },
        ],
      },
    });

    expect(result.boxScore.home.rebounds).toBeLessThanOrEqual(58);
    expect(result.boxScore.away.rebounds).toBeLessThanOrEqual(58);
    expect(result.boxScore.home.assists).toBeLessThanOrEqual(34);
    expect(result.boxScore.away.assists).toBeLessThanOrEqual(34);

    const homeLines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    const awayLines = new Map<string, any>(result.boxScore.away.players.map((player: any) => [player.name, player]));
    expect(homeLines.get('Tim Duncan').rebounds).toBeGreaterThan(homeLines.get('Tony Parker').rebounds);
    expect(homeLines.get('Tony Parker').assists).toBeGreaterThan(homeLines.get('Tim Duncan').assists);
    expect(awayLines.get('Derrick Rose').rebounds).toBeLessThanOrEqual(8);
    expect(awayLines.get('Omer Asik').assists).toBeLessThanOrEqual(2);
  });

  it('uses detailed player grades for server-side shot profiles', () => {
    const game = seedAvailableGame({ homeTeamId: 'SKILL', awayTeamId: 'CPU' });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          { player_id: 'shooter', full_name: 'Pure Shooter', position: 'SG', minutes: 38, hidden: { shooting: 82, playmaking: 70, defense: 72, threePoint: 97, midRange: 84, closeShot: 62, dunking: 42, shotIq: 91 } },
          { player_id: 'driver', full_name: 'Paint Driver', position: 'SF', minutes: 38, hidden: { shooting: 82, playmaking: 70, defense: 72, threePoint: 55, midRange: 72, closeShot: 94, dunking: 92, postOffense: 82, shotIq: 80 } },
          { player_id: 'guard', full_name: 'Table Guard', position: 'PG', minutes: 32, hidden: { shooting: 74, playmaking: 88, passing: 91, basketballIq: 86, defense: 70 } },
          { player_id: 'big', full_name: 'Glass Big', position: 'C', minutes: 30, hidden: { shooting: 62, rebounding: 94, defense: 86, postDefense: 88, blocking: 90 } },
          { player_id: 'wing', full_name: 'Wing Stopper', position: 'SF', minutes: 28, hidden: { shooting: 70, playmaking: 62, defense: 90, perimeterDefense: 94, defenseIq: 92 } },
        ],
      },
      awayTeam: {
        players: Array.from({ length: 5 }, (_, index) => ({
          player_id: `plain-${index}`,
          full_name: `Plain ${index}`,
          minutes: 30,
          hidden: { shooting: 70, playmaking: 68, defense: 68 },
        })),
      },
    });

    const lines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    expect(lines.get('Pure Shooter').threePointersAttempted).toBeGreaterThan(lines.get('Paint Driver').threePointersAttempted);
    expect(lines.get('Paint Driver').freeThrowsAttempted).toBeGreaterThanOrEqual(lines.get('Pure Shooter').freeThrowsAttempted);
  });

  it('fills vacant era schedule teams from the era player pool before using placeholders', () => {
    const team = teamFromParticipantFallback({
      teamId: 'SAS_2011',
      participant: {
        scheduleTeamId: 'SAS_2011',
        abbreviation: 'SAS_2011',
        name: 'San Antonio Spurs',
      },
      poolPlayers: [
        { player_id: 'duncan', full_name: 'Tim Duncan', team: 'SAS', hidden: { rebounding: 94 } },
        { player_id: 'parker', full_name: 'Tony Parker', team: 'SAS', hidden: { playmaking: 91 } },
        { player_id: 'rose', full_name: 'Derrick Rose', team: 'CHI', hidden: { shooting: 92 } },
      ],
    });

    expect(team).toMatchObject({
      teamId: 'SAS_2011',
      abbreviation: 'SAS_2011',
      name: 'San Antonio Spurs',
    });
    expect(team.players.map((player: any) => player.full_name)).toEqual(['Tim Duncan', 'Tony Parker']);
  });

  it('returns persistent team condition after simulated games', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        fatigue: 3,
        fatigueSequence: 4,
        minorInjuryCount: 1,
        severeInjuryCount: 0,
        injuries: [{ id: 'old-home-injury', gamesRemaining: 1 }],
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        fatigue: 7,
        fatigueSequence: 2,
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.game.status).toBe('final');
    expect(result.teamStates.home.fatigueSequence).toBe(5);
    expect(result.teamStates.away.fatigueSequence).toBe(3);
    expect(teamStateUpdatePayload(result.teamStates.home)).toMatchObject({
      fatigueSequence: 5,
      minorInjuryCount: 1,
      severeInjuryCount: 0,
    });
    expect(teamStateUpdatePayload(result.teamStates.home).injuries).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'old-home-injury' })]),
    );
  });

  it('resets matchup workflow fields while keeping teams and GM ownership', () => {
    const game = seedAvailableGame({
      status: 'simulating',
      requestedByUid: 'home-gm',
      requestedAtMs: 1_000,
      responseDeadlineMs: 2_000,
      acceptedByUid: 'away-gm',
      acceptedAtMs: 3_000,
      preparationDeadlineMs: 4_000,
      expiredAtMs: 5_000,
      simulationStartedByUid: 'home-gm',
      simulationStartedAtMs: 6_000,
      homeScore: 100,
      awayScore: 98,
      winnerTeamId: 'home',
      loserTeamId: 'away',
      finalScoreSubmittedByUid: 'home-gm',
      finalAtMs: 6_000,
      boxScore: { home: { players: [] }, away: { players: [] } },
      quarters: [{ quarter: 1, home: 25, away: 20 }],
      liveTimeline: { version: 1, events: [] },
      liveMode: { status: 'ready' },
      story: 'Old result',
    });

    const result = resetScheduledGame({ game, uid: 'commissioner', nowMs: 7_000 });

    expect(result).toMatchObject({
      id: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeGmId: game.homeGmId,
      awayGmId: game.awayGmId,
      status: 'scheduled',
      resetByUid: 'commissioner',
      resetAtMs: 7_000,
    });
    expect(result.requestedByUid).toBeUndefined();
    expect(result.preparationDeadlineMs).toBeUndefined();
    expect(result.simulationStartedAtMs).toBeUndefined();
    expect(result.homeScore).toBeUndefined();
    expect(result.finalAtMs).toBeUndefined();
    expect(result.boxScore).toBeUndefined();
    expect(result.quarters).toBeUndefined();
    expect(result.liveTimeline).toBeUndefined();
    expect(result.liveMode).toBeUndefined();
    expect(result.story).toBeUndefined();
  });

  it('submits a played final score without allowing ties', () => {
    const game = seedAvailableGame();
    const result = finalScoreGame({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
    });

    expect(result).toMatchObject({
      status: 'final',
      homeScore: 104,
      awayScore: 101,
      winnerTeamId: 'home',
      finalScoreSubmittedByUid: game.homeGmId,
    });
    expect(() => finalScoreGame({ game, uid: game.homeGmId, nowMs: 9_000, homeScore: 100, awayScore: 100 })).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('returns persistent team condition after reported final scores', () => {
    const game = seedAvailableGame();
    const result = finalScoreGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
      homeTeam: { fatigue: 4, fatigueSequence: 9, injuries: [] },
      awayTeam: { fatigue: 5, fatigueSequence: 11, injuries: [] },
    });

    expect(result.game).toMatchObject({
      status: 'final',
      winnerTeamId: 'home',
      resultSource: 'manual',
    });
    expect(teamStateUpdatePayload(result.teamStates.home)).toMatchObject({ fatigueSequence: 10 });
    expect(teamStateUpdatePayload(result.teamStates.away)).toMatchObject({ fatigueSequence: 12 });
  });

  it('adds simulated box score production to roster season stats', () => {
    const payload = teamPersistencePayload({
      state: {
        fatigue: 2,
        fatigueSequence: 4,
        minorInjuryCount: 0,
        severeInjuryCount: 0,
        injuries: [],
      },
      team: {
        players: [
          {
            player_id: 'p1',
            full_name: 'Starter One',
            seasonStats: { games: 1, minutes: 30, points: 12, rebounds: 4, assists: 3 },
          },
          {
            player_id: 'p2',
            full_name: 'Starter Two',
            seasonStats: { games: 0 },
          },
        ],
      },
      teamBoxScore: {
        players: [
          { playerId: 'p1', minutes: 34, points: 22, rebounds: 8, assists: 5, steals: 2, blocks: 1, turnovers: 3 },
          { playerId: 'p2', minutes: 20, points: 9, rebounds: 3, assists: 2, steals: 1, blocks: 0, turnovers: 1 },
        ],
      },
    });

    expect(payload.players[0].seasonStats).toMatchObject({
      games: 2,
      minutes: 64,
      points: 34,
      rebounds: 12,
      assists: 8,
      steals: 2,
      blocks: 1,
      turnovers: 3,
    });
    expect(payload.players[1].seasonStats).toMatchObject({
      games: 1,
      points: 9,
    });
  });

  it('records coaching snapshots as postgame scouting history', () => {
    const game = seedAvailableGame();
    const result = gameWithCoachingSnapshots({
      game,
      homeSnapshot: { name: 'Pace and Space', offense: 'pace_and_space', defense: 'switch_heavy' },
      awaySnapshot: { name: 'Grit and Grind', offense: 'post_heavy', defense: 'protect_paint' },
    });

    expect(result).toMatchObject({
      homeCoachingStyle: 'pace_and_space',
      awayCoachingStyle: 'post_heavy',
      homeDefensiveStyle: 'switch_heavy',
      awayDefensiveStyle: 'protect_paint',
      homeCoachingPresetName: 'Pace and Space',
      awayCoachingPresetName: 'Grit and Grind',
    });
  });

  it('builds rollback payloads when commissioners reset finalized games', () => {
    const game = seedAvailableGame({
      status: 'final',
      fatigue: { home: { before: 3, after: 7, sequence: 6 } },
      injuries: { home: [{ id: 'injury-game-1', severity: 'minor' }] },
      boxScore: {
        home: {
          players: [
            { playerId: 'p1', minutes: 34, points: 22, rebounds: 8, assists: 5, steals: 2, blocks: 1, turnovers: 3, plusMinus: 5 },
          ],
        },
      },
    });

    const payload = teamResetPayload({
      game,
      side: 'home',
      team: {
        fatigue: 7,
        fatigueSequence: 6,
        minorInjuryCount: 2,
        severeInjuryCount: 0,
        injuries: [
          { id: 'injury-game-1', severity: 'minor' },
          { id: 'old-injury', severity: 'minor' },
        ],
        players: [
          {
            player_id: 'p1',
            seasonStats: { games: 2, minutes: 64, points: 34, rebounds: 12, assists: 8, steals: 2, blocks: 1, turnovers: 3, plusMinus: -3 },
          },
        ],
      },
    });

    expect(payload).toMatchObject({
      fatigue: 3,
      fatigueSequence: 5,
      minorInjuryCount: 1,
      severeInjuryCount: 0,
    });
    expect(payload.injuries).toEqual([{ id: 'old-injury', severity: 'minor' }]);
    expect(payload.players[0].seasonStats).toMatchObject({
      games: 1,
      minutes: 30,
      points: 12,
      rebounds: 4,
      assists: 3,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      plusMinus: -8,
    });
  });

  it('selects and updates NBA Cup games separately from regular season games', () => {
    const regularGame = seedAvailableGame({ id: 'regular-1' });
    const cupGame = seedAvailableGame({ id: 'cup-1', competition: 'nbaCup', groupId: 'Group A' });
    const schedule = {
      games: [regularGame],
      nbaCup: { games: [cupGame] },
    };

    expect(scheduleCompetition({ competition: 'nbaCup' })).toBe('nbaCup');
    expect(scheduleCompetition({ competition: 'regular' })).toBe('regular');
    expect(gamesForCompetition(schedule, 'nbaCup')).toEqual([cupGame]);
    expect(gamesForCompetition(schedule, 'regular')).toEqual([regularGame]);
    expect(updatePayloadForCompetition('nbaCup', [cupGame])).toEqual({ 'nbaCup.games': [cupGame] });
    expect(updatePayloadForCompetition('regular', [regularGame])).toEqual({ games: [regularGame] });
  });

  it('selects and updates playoff games inside the playoff bracket', () => {
    const playoffGame = seedAvailableGame({ id: 'po-1' });
    const finalGame = { ...playoffGame, status: 'final', winnerTeamId: playoffGame.homeTeamId };
    const schedule = {
      games: [],
      playoffs: {
        rounds: [{
          series: [{
            id: 'series-1',
            homeTeamId: playoffGame.homeTeamId,
            awayTeamId: playoffGame.awayTeamId,
            games: [playoffGame, seedAvailableGame({ id: 'po-2' })],
          }],
        }],
      },
    };

    expect(gamesForCompetition(schedule, 'playoffs')).toHaveLength(2);
    expect(updatePayloadForCompetition('playoffs', [finalGame], schedule).playoffs.rounds[0].series[0].games[0]).toMatchObject({
      id: 'po-1',
      status: 'final',
      winnerTeamId: playoffGame.homeTeamId,
    });
  });

  it('advances playoff rounds when every series has four completed wins', () => {
    const seriesAHomeGames = Array.from({ length: 4 }, (_, index) => seedAvailableGame({
      id: `po-a-${index + 1}`,
      homeTeamId: 'team-1',
      awayTeamId: 'team-8',
      homeGmId: 'gm-1',
      awayGmId: 'gm-8',
      status: 'final',
      winnerTeamId: 'team-1',
    }));
    const seriesBHomeGames = Array.from({ length: 4 }, (_, index) => seedAvailableGame({
      id: `po-b-${index + 1}`,
      homeTeamId: 'team-4',
      awayTeamId: 'team-5',
      homeGmId: 'gm-4',
      awayGmId: 'gm-5',
      status: 'final',
      winnerTeamId: 'team-4',
    }));
    const schedule = {
      playoffs: {
        format: 'short_8',
        seasonYear: 2026,
        seed: 'league-2026',
        rounds: [{
          name: 'quarterfinal',
          label: 'Quarterfinals',
          roundIndex: 0,
          series: [
            {
              id: 'quarterfinal_1',
              round: 'quarterfinal',
              roundIndex: 0,
              seriesIndex: 0,
              homeSeed: 1,
              awaySeed: 8,
              homeTeamId: 'team-1',
              awayTeamId: 'team-8',
              homeTeamName: 'Team 1',
              awayTeamName: 'Team 8',
              games: seriesAHomeGames,
            },
            {
              id: 'quarterfinal_2',
              round: 'quarterfinal',
              roundIndex: 0,
              seriesIndex: 1,
              homeSeed: 4,
              awaySeed: 5,
              homeTeamId: 'team-4',
              awayTeamId: 'team-5',
              homeTeamName: 'Team 4',
              awayTeamName: 'Team 5',
              games: seriesBHomeGames,
            },
          ],
        }],
      },
    };

    const playoffs = updatePayloadForCompetition('playoffs', [...seriesAHomeGames, ...seriesBHomeGames], schedule).playoffs;

    expect(playoffs.rounds[0].series[0].winnerTeamId).toBe('team-1');
    expect(playoffs.rounds[0].series[1].winnerTeamId).toBe('team-4');
    expect(playoffs.rounds[1]).toMatchObject({
      name: 'semifinal',
      roundIndex: 1,
    });
    expect(playoffs.rounds[1].series[0]).toMatchObject({
      homeTeamId: 'team-1',
      awayTeamId: 'team-4',
    });
    expect(playoffs.rounds[1].series[0].games).toHaveLength(7);
    expect(playoffs.rounds[1].series[0].games[0]).toMatchObject({
      homeGmId: 'gm-1',
      awayGmId: 'gm-4',
      status: 'scheduled',
    });
  });
});
