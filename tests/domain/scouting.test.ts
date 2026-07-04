import { describe, expect, it } from 'vitest';
import { buildNbaScoutingReport } from '@/domain/nba/scouting';

describe('NBA scouting', () => {
  it('shows only historical final games and coaching history', () => {
    const report = buildNbaScoutingReport({
      teamId: 'BOS',
      games: [
        {
          id: 'final-1',
          week: 1,
          sequence: 1,
          homeTeamId: 'BOS',
          awayTeamId: 'LAL',
          homeScore: 110,
          awayScore: 104,
          status: 'final',
          homeCoachingStyle: 'pace_and_space',
          awayCoachingStyle: 'drop',
          boxScore: {
            home: {
              players: [
                { playerId: 'tatum', name: 'Jayson Tatum', minutes: 38, points: 35, rebounds: 9, assists: 5 },
                { playerId: 'brown', name: 'Jaylen Brown', minutes: 36, points: 26, rebounds: 6, assists: 3 },
              ],
            },
            away: {
              players: [
                { playerId: 'lebron', name: 'LeBron James', minutes: 34, points: 28, rebounds: 7, assists: 8 },
              ],
            },
          },
          activePresetId: 'secret-active',
        } as any,
        {
          id: 'scheduled-1',
          week: 2,
          sequence: 2,
          homeTeamId: 'NYK',
          awayTeamId: 'BOS',
          status: 'scheduled',
          homeCoachingStyle: 'zone',
          awayCoachingStyle: 'isolation',
        } as any,
      ],
    });

    expect(report.games).toHaveLength(1);
    expect(report.games[0]).toMatchObject({
      gameId: 'final-1',
      opponentTeamId: 'LAL',
      teamScore: 110,
      opponentScore: 104,
      result: 'W',
      coachingStyle: 'pace_and_space',
    });
    expect(report.games[0].topPerformers).toEqual([
      { playerId: 'tatum', name: 'Jayson Tatum', teamSide: 'team', minutes: 38, points: 35, rebounds: 9, assists: 5 },
      { playerId: 'lebron', name: 'LeBron James', teamSide: 'opponent', minutes: 34, points: 28, rebounds: 7, assists: 8 },
      { playerId: 'brown', name: 'Jaylen Brown', teamSide: 'team', minutes: 36, points: 26, rebounds: 6, assists: 3 },
    ]);
    expect(report.games[0].minuteLeaders).toEqual([
      { playerId: 'tatum', name: 'Jayson Tatum', teamSide: 'team', minutes: 38 },
      { playerId: 'brown', name: 'Jaylen Brown', teamSide: 'team', minutes: 36 },
      { playerId: 'lebron', name: 'LeBron James', teamSide: 'opponent', minutes: 34 },
    ]);
    expect(JSON.stringify(report)).not.toContain('secret-active');
  });

  it('surfaces football and baseball performers with sport stats', () => {
    const football = buildNbaScoutingReport({
      sport: 'madden',
      teamId: 'KC',
      games: [
        {
          id: 'nfl-final',
          week: 1,
          sequence: 1,
          homeTeamId: 'KC',
          awayTeamId: 'LV',
          homeScore: 31,
          awayScore: 20,
          status: 'final',
          boxScore: {
            home: {
              players: [
                { playerId: 'qb', name: 'QB One', passingYards: 318, passingTouchdowns: 3 },
                { playerId: 'edge', name: 'Edge One', sacks: 2, tackles: 6 },
              ],
            },
            away: {
              players: [
                { playerId: 'wr', name: 'WR Two', receivingYards: 112, receivingTouchdowns: 1 },
              ],
            },
          },
        } as any,
      ],
    });

    expect(football.games[0].topPerformers[0]).toMatchObject({
      playerId: 'qb',
      passingYards: 318,
      passingTouchdowns: 3,
    });
    expect(football.games[0].topPerformers.some(player => player.sacks === 2)).toBe(true);

    const baseball = buildNbaScoutingReport({
      sport: 'mlb',
      teamId: 'LAD',
      games: [
        {
          id: 'mlb-final',
          week: 1,
          sequence: 1,
          homeTeamId: 'LAD',
          awayTeamId: 'SF',
          homeScore: 6,
          awayScore: 3,
          status: 'final',
          boxScore: {
            home: {
              players: [
                { playerId: 'bat', name: 'Bat One', hits: 3, rbi: 4, homeRuns: 1 },
                { playerId: 'sp', name: 'Pitcher One', inningsPitched: 6, strikeouts: 8, earnedRuns: 2 },
              ],
            },
          },
        } as any,
      ],
    });

    expect(baseball.games[0].topPerformers.find(player => player.playerId === 'sp')).toMatchObject({
      playerId: 'sp',
      inningsPitched: 6,
      strikeouts: 8,
    });
    expect(baseball.games[0].topPerformers.some(player => player.homeRuns === 1 && player.rbi === 4)).toBe(true);
  });
});
