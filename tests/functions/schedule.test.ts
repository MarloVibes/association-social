import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  advanceNbaCupStage,
  buildNbaCupSchedule,
  buildNbaScheduleParticipants,
  decorateGamesWithParticipants,
  generateServerSchedule,
  supportsNbaCupSchedule,
} = require('../../functions/franchise/schedule.js');

describe('schedule callable helpers', () => {
  it('fills a new NBA league with canonical teams while preserving claimed GM ownership', () => {
    const participants = buildNbaScheduleParticipants([
      {
        id: 'league_user_1',
        data: () => ({
          teamId: 'BOS',
          abbreviation: 'BOS',
          gmId: 'commissioner',
        }),
      },
    ]);

    expect(participants).toHaveLength(30);
    expect(participants.find((team: any) => team.scheduleTeamId === 'BOS')).toMatchObject({
      gmId: 'commissioner',
      sourceTeamDocId: 'league_user_1',
    });
    expect(participants.map((team: any) => team.scheduleTeamId)).toContain('LAL');
  });

  it('stores participant GM ids on generated games so matchup actions can authorize users', () => {
    const participants = buildNbaScheduleParticipants([
      { id: 'team_a', data: () => ({ teamId: 'BOS', abbreviation: 'BOS', gmId: 'gm-bos' }) },
      { id: 'team_b', data: () => ({ teamId: 'LAL', abbreviation: 'LAL', gmId: 'gm-lal' }) },
    ]);
    const games = generateServerSchedule({
      teams: participants.map((team: any) => team.scheduleTeamId),
      gamesPerTeam: 14,
      seed: 'league:2025:14',
    });
    const decorated = decorateGamesWithParticipants(games, participants);
    const bosGame = decorated.find((game: any) => game.homeTeamId === 'BOS' || game.awayTeamId === 'BOS');

    expect(bosGame).toBeTruthy();
    expect([bosGame.homeGmId, bosGame.awayGmId]).toContain('gm-bos');
  });

  it('generates odd expansion schedules without self-matchups', () => {
    const teams = Array.from({ length: 31 }, (_, index) => `ODD${index}`);
    const games = generateServerSchedule({ teams, gamesPerTeam: 14, seed: 'odd-server' });

    expect(games).toHaveLength((31 * 14) / 2);
    expect(games.every((game: any) => game.homeTeamId !== game.awayTeamId)).toBe(true);
    for (const team of teams) {
      expect(games.filter((game: any) => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(14);
    }
  });

  it('supports NFL and MLB season lengths for shared franchise calendars', () => {
    const nflTeams = Array.from({ length: 32 }, (_, index) => `NFL${index}`);
    const mlbTeams = Array.from({ length: 30 }, (_, index) => `MLB${index}`);
    const nflGames = generateServerSchedule({ teams: nflTeams, gamesPerTeam: 17, seed: 'nfl-season' });
    const mlbGames = generateServerSchedule({ teams: mlbTeams, gamesPerTeam: 162, seed: 'mlb-season' });

    expect(nflGames).toHaveLength((32 * 17) / 2);
    expect(mlbGames).toHaveLength((30 * 162) / 2);
    for (const team of nflTeams) {
      expect(nflGames.filter((game: any) => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(17);
    }
    for (const team of mlbTeams) {
      expect(mlbGames.filter((game: any) => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(162);
    }
  });

  it('rejects impossible odd-team odd-length schedules clearly', () => {
    const teams = Array.from({ length: 31 }, (_, index) => `IMP${index}`);

    expect(() => generateServerSchedule({ teams, gamesPerTeam: 29, seed: 'impossible' })).toThrow(
      'Schedule length must create an even number of team games.',
    );
  });

  it('matches historical claimed teams to modern schedule aliases', () => {
    const participants = buildNbaScheduleParticipants([
      { id: 'team_noh', data: () => ({ teamId: 'NOH', abbreviation: 'NOH', gmId: 'gm-noh' }) },
    ], ['NOP', 'LAL', 'BOS']);

    expect(participants.find((team: any) => team.scheduleTeamId === 'NOP')).toMatchObject({
      gmId: 'gm-noh',
      sourceTeamDocId: 'team_noh',
      abbreviation: 'NOH',
    });
  });

  it('builds NBA Cup group play only for modern current-era schedules', () => {
    const teams = Array.from({ length: 30 }, (_, index) => `T${index}`);
    const cup = buildNbaCupSchedule({
      scheduleTeamIds: teams,
      currentYear: 2025,
      seed: 'server-cup',
    });

    expect(supportsNbaCupSchedule({ era: 'current', currentYear: 2025 })).toBe(true);
    expect(supportsNbaCupSchedule({ era: 'lebron', currentYear: 2010 })).toBe(false);
    expect(cup).toMatchObject({ enabled: true, name: 'NBA Cup', groupSize: 5 });
    expect(cup.games).toHaveLength(60);
    expect(cup.games[0]).toMatchObject({ competition: 'nbaCup', stage: 'group' });
    for (const team of teams) {
      expect(cup.games.filter((game: any) => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(4);
    }
  });

  it('advances NBA Cup knockout stages after completed stage finals', () => {
    const teams = Array.from({ length: 30 }, (_, index) => `T${index}`);
    const participants = buildNbaScheduleParticipants(teams.map(teamId => ({
      id: teamId,
      data: () => ({ teamId, abbreviation: teamId, gmId: `gm-${teamId}` }),
    })), teams);
    const cup = buildNbaCupSchedule({
      scheduleTeamIds: participants.map((team: any) => team.scheduleTeamId),
      currentYear: 2025,
      seed: 'server-cup-advance',
    });
    const decoratedCup = {
      ...cup,
      games: decorateGamesWithParticipants(cup.games, participants).map((game: any, index: number) => ({
        ...game,
        status: 'final',
        homeScore: index % 2 === 0 ? 120 : 110,
        awayScore: index % 2 === 0 ? 100 : 121,
        winnerTeamId: index % 2 === 0 ? game.homeTeamId : game.awayTeamId,
        loserTeamId: index % 2 === 0 ? game.awayTeamId : game.homeTeamId,
      })),
    };

    const nextCup = advanceNbaCupStage({
      nbaCup: decoratedCup,
      participants,
      seed: 'server-cup-advance',
    });

    expect(nextCup.games.filter((game: any) => game.stage === 'quarterfinal')).toHaveLength(4);
    expect(nextCup.games.find((game: any) => game.stage === 'quarterfinal').homeGmId).toBeTruthy();
  });
});
