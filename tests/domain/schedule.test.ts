import { describe, expect, it } from 'vitest';
import { generateSchedule } from '@/domain/nba/schedule';
import { NBA_TEAM_IDS, advanceNbaCupStage, buildNbaSchedulePayload, supportsNbaCupSchedule } from '@/domain/nba/scheduleSetup';

describe('NBA schedule generation', () => {
  for (const games of [14, 29, 58, 82] as const) {
    it(`creates ${games} games per team`, () => {
      const teams = Array.from({ length: 30 }, (_, i) => `t${i}`);
      const schedule = generateSchedule({ teams, gamesPerTeam: games, seed: `s-${games}` });
      for (const team of teams) {
        expect(schedule.filter(game => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(games);
      }
    });
  }

  it('is deterministic with stable game IDs and balanced home games', () => {
    const teams = Array.from({ length: 32 }, (_, i) => `x${i}`);
    const first = generateSchedule({ teams, gamesPerTeam: 29, seed: 'stable' });
    const second = generateSchedule({ teams, gamesPerTeam: 29, seed: 'stable' });
    const ids = new Set(first.map(game => game.id));

    expect(second).toEqual(first);
    expect(ids.size).toBe(first.length);
    for (const team of teams) {
      const home = first.filter(game => game.homeTeamId === team).length;
      const away = first.filter(game => game.awayTeamId === team).length;
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
  });

  it('supports expansion leagues up to 36 teams', () => {
    const teams = Array.from({ length: 36 }, (_, i) => `e${i}`);
    const schedule = generateSchedule({ teams, gamesPerTeam: 14, seed: 'expansion' });

    expect(schedule).toHaveLength((36 * 14) / 2);
    expect(schedule.every(game => game.status === 'scheduled')).toBe(true);
  });

  it('supports odd expansion team counts without self-matchups', () => {
    const teams = Array.from({ length: 31 }, (_, i) => `o${i}`);
    const schedule = generateSchedule({ teams, gamesPerTeam: 14, seed: 'odd-expansion' });

    expect(schedule).toHaveLength((31 * 14) / 2);
    expect(schedule.every(game => game.homeTeamId !== game.awayTeamId)).toBe(true);
    for (const team of teams) {
      expect(schedule.filter(game => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(14);
    }
  });

  it('adds NBA Cup group play only to current-era 2023+ schedules', () => {
    const teams = NBA_TEAM_IDS.map((teamId, index) => ({
      id: `team-${index}`,
      teamId,
      abbreviation: teamId,
      gmId: index === 0 ? 'gm-0' : null,
    }));
    const currentPayload = buildNbaSchedulePayload({
      leagueId: 'league-cup',
      currentYear: 2025,
      era: 'current',
      gamesPerTeam: 82,
      teams,
    });
    const jordanPayload = buildNbaSchedulePayload({
      leagueId: 'league-jordan',
      currentYear: 1991,
      era: 'jordan',
      gamesPerTeam: 82,
      teams,
    });

    expect(supportsNbaCupSchedule({ era: 'current', currentYear: 2025 })).toBe(true);
    expect(supportsNbaCupSchedule({ era: 'jordan', currentYear: 1991 })).toBe(false);
    expect(currentPayload.nbaCup).toMatchObject({ enabled: true, name: 'NBA Cup', groupSize: 5 });
    expect(currentPayload.nbaCup?.games).toHaveLength(60);
    const gmCupGame = currentPayload.nbaCup?.games.find(game => game.homeTeamId === NBA_TEAM_IDS[0] || game.awayTeamId === NBA_TEAM_IDS[0]);
    expect([gmCupGame?.homeGmId, gmCupGame?.awayGmId]).toContain('gm-0');
    expect(gmCupGame).toMatchObject({ competition: 'nbaCup', stage: 'group' });
    for (const team of currentPayload.participants) {
      expect(currentPayload.nbaCup?.games.filter(game => game.homeTeamId === team.scheduleTeamId || game.awayTeamId === team.scheduleTeamId)).toHaveLength(4);
    }
    expect(jordanPayload.nbaCup).toBeNull();
  });

  it('creates default NFL and MLB schedules without NBA Cup events', () => {
    const nflTeams = Array.from({ length: 32 }, (_, index) => ({
      id: `nfl-${index}`,
      teamId: `N${index}`,
      abbreviation: `N${index}`,
      gmId: index === 0 ? 'gm-nfl' : null,
    }));
    const mlbTeams = Array.from({ length: 30 }, (_, index) => ({
      id: `mlb-${index}`,
      teamId: `M${index}`,
      abbreviation: `M${index}`,
      gmId: index === 0 ? 'gm-mlb' : null,
    }));

    const nflPayload = buildNbaSchedulePayload({
      leagueId: 'league-nfl',
      sport: 'madden',
      currentYear: 2026,
      gamesPerTeam: 17,
      teams: nflTeams,
      scheduleTeamIds: nflTeams.map(team => team.teamId),
    });
    const mlbPayload = buildNbaSchedulePayload({
      leagueId: 'league-mlb',
      sport: 'mlb',
      currentYear: 2026,
      gamesPerTeam: 162,
      teams: mlbTeams,
      scheduleTeamIds: mlbTeams.map(team => team.teamId),
    });

    expect(nflPayload.games).toHaveLength((32 * 17) / 2);
    expect(mlbPayload.games).toHaveLength((30 * 162) / 2);
    expect(nflPayload.nbaCup).toBeNull();
    expect(mlbPayload.nbaCup).toBeNull();
    expect(nflPayload.games.find(game => game.homeTeamId === 'N0' || game.awayTeamId === 'N0')).toEqual(expect.objectContaining({
      status: 'scheduled',
    }));
    expect(nflPayload.games.some(game => game.homeGmId === 'gm-nfl' || game.awayGmId === 'gm-nfl')).toBe(true);
    expect(mlbPayload.games.some(game => game.homeGmId === 'gm-mlb' || game.awayGmId === 'gm-mlb')).toBe(true);
  });

  it('advances NBA Cup from groups through the final champion', () => {
    const payload = buildNbaSchedulePayload({
      leagueId: 'league-cup-advance',
      currentYear: 2025,
      era: 'current',
      gamesPerTeam: 82,
      teams: NBA_TEAM_IDS.map((teamId, index) => ({
        id: `team-${index}`,
        teamId,
        abbreviation: teamId,
        gmId: `gm-${teamId}`,
      })),
    });
    const cupWithGroupFinals = {
      ...payload.nbaCup!,
      games: payload.nbaCup!.games.map((game, index) => ({
        ...game,
        status: 'final' as const,
        homeScore: index % 2 === 0 ? 110 : 101,
        awayScore: index % 2 === 0 ? 100 : 111,
        winnerTeamId: index % 2 === 0 ? game.homeTeamId : game.awayTeamId,
        loserTeamId: index % 2 === 0 ? game.awayTeamId : game.homeTeamId,
      })),
    };

    const quarterfinalCup = advanceNbaCupStage({
      nbaCup: cupWithGroupFinals,
      participants: payload.participants,
      seed: 'league-cup-advance:2025:82',
    });
    expect(quarterfinalCup.games.filter(game => game.stage === 'quarterfinal')).toHaveLength(4);

    const semifinalCup = advanceNbaCupStage({
      nbaCup: {
        ...quarterfinalCup,
        games: quarterfinalCup.games.map(game => game.stage === 'quarterfinal'
          ? { ...game, status: 'final' as const, homeScore: 104, awayScore: 99, winnerTeamId: game.homeTeamId, loserTeamId: game.awayTeamId }
          : game),
      },
      participants: payload.participants,
      seed: 'league-cup-advance:2025:82',
    });
    expect(semifinalCup.games.filter(game => game.stage === 'semifinal')).toHaveLength(2);

    const finalCup = advanceNbaCupStage({
      nbaCup: {
        ...semifinalCup,
        games: semifinalCup.games.map(game => game.stage === 'semifinal'
          ? { ...game, status: 'final' as const, homeScore: 108, awayScore: 102, winnerTeamId: game.homeTeamId, loserTeamId: game.awayTeamId }
          : game),
      },
      participants: payload.participants,
      seed: 'league-cup-advance:2025:82',
    });
    expect(finalCup.games.filter(game => game.stage === 'final')).toHaveLength(1);

    const championCup = advanceNbaCupStage({
      nbaCup: {
        ...finalCup,
        games: finalCup.games.map(game => game.stage === 'final'
          ? { ...game, status: 'final' as const, homeScore: 118, awayScore: 112, winnerTeamId: game.homeTeamId, loserTeamId: game.awayTeamId }
          : game),
      },
      participants: payload.participants,
      seed: 'league-cup-advance:2025:82',
    });
    const finalGame = championCup.games.find(game => game.stage === 'final');
    expect(championCup.championTeamId).toBe(finalGame?.homeTeamId);
    expect(championCup.championTeamAbbr).toBe(finalGame?.homeTeamId);
  });
});
