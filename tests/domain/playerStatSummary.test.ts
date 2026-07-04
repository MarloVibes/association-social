import { describe, expect, it } from 'vitest';
import { playerStatSummary } from '@/domain/sports/playerStatSummary';

describe('playerStatSummary', () => {
  it('summarizes NBA players with basketball averages', () => {
    expect(playerStatSummary({ seasonStats: { ppg: 18.4, rpg: 6.2, apg: 3.1 } }, 'nba')).toBe('18.4 PPG · 6.2 RPG · 3.1 APG');
  });

  it('summarizes NFL quarterbacks with football stats', () => {
    expect(playerStatSummary({
      position: 'QB',
      stats: { passingYards: 4200, passingTouchdowns: 34, interceptionsThrown: 9 },
    }, 'madden')).toBe('4200 PASS YDS · 34 PASS TD · 9 INT');
  });

  it('summarizes NFL defenders without showing basketball stats', () => {
    expect(playerStatSummary({
      position: 'EDGE',
      seasons: [{ tackles: 62, sacks: 14, interceptions: 1 }],
    }, 'nfl')).toBe('62 TACKLES · 14 SACKS · 1 INT');
  });

  it('summarizes MLB hitters and pitchers by role', () => {
    expect(playerStatSummary({
      position: 'RF',
      seasonStats: { avg: 0.304, hr: 32, rbi: 101 },
    }, 'mlb')).toBe('.304 AVG · 32 HR · 101 RBI');

    expect(playerStatSummary({
      position: 'SP',
      seasonStats: { era: 2.71, whip: 1.04, so: 211 },
    }, 'mlb')).toBe('2.71 ERA · 1.04 WHIP · 211 SO');
  });
});
