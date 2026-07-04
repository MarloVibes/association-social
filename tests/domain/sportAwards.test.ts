import { describe, expect, it } from 'vitest';
import { awardCategoriesForSport, recordsForSportAward } from '@/domain/sports/awards';

describe('sport award trophy cases', () => {
  it('uses NFL award categories instead of NBA categories for Madden leagues', () => {
    const categories = awardCategoriesForSport('madden');
    const keys = categories.map(category => category.key);

    expect(keys).toEqual(expect.arrayContaining(['championship', 'mvp', 'opoy', 'dpoy', 'roy', 'all_pro', 'pro_bowl']));
    expect(keys).not.toContain('nba_cup');
    expect(categories.find(category => category.key === 'championship')?.title).toBe('Super Bowl Championships');
  });

  it('uses MLB award categories instead of NBA categories for baseball leagues', () => {
    const categories = awardCategoriesForSport('mlb');
    const keys = categories.map(category => category.key);

    expect(keys).toEqual(expect.arrayContaining(['championship', 'mvp', 'cy_young', 'roy', 'gold_glove', 'silver_slugger', 'all_star']));
    expect(keys).not.toContain('all_nba');
    expect(categories.find(category => category.key === 'championship')?.title).toBe('World Series Championships');
  });

  it('projects NFL awards from football production', () => {
    const teams = [
      {
        id: 'kc',
        abbreviation: 'KC',
        name: 'Kansas City',
        players: [
          { id: 'qb', full_name: 'Pocket Star', seasonStats: { games: 17, passing_yards: 4800, passing_tds: 42 } },
          { id: 'edge', full_name: 'Edge Star', seasonStats: { games: 17, tackles: 70, sacks: 18, interceptions: 1 } },
        ],
      },
    ];

    expect(recordsForSportAward('madden', {}, 'mvp', { currentYear: 2026, teams })[0]).toMatchObject({
      winnerName: 'Pocket Star',
      note: 'Projected NFL MVP',
    });
    expect(recordsForSportAward('madden', {}, 'dpoy', { currentYear: 2026, teams })[0]).toMatchObject({
      winnerName: 'Edge Star',
      note: 'Projected DPOY',
    });
  });

  it('projects MLB awards from baseball production', () => {
    const teams = [
      {
        id: 'lad',
        abbreviation: 'LAD',
        name: 'Los Angeles',
        players: [
          { id: 'bat', full_name: 'Power Bat', seasonStats: { games: 155, avg: 0.311, hr: 44, rbi: 118 } },
          { id: 'ace', full_name: 'Staff Ace', seasonStats: { games: 32, wins: 19, era: 2.12, whip: 0.94, so: 242 } },
        ],
      },
    ];

    expect(recordsForSportAward('mlb', {}, 'mvp', { currentYear: 2026, teams })[0]).toMatchObject({
      winnerName: 'Power Bat',
      note: 'Projected MVP',
    });
    expect(recordsForSportAward('mlb', {}, 'cy_young', { currentYear: 2026, teams })[0]).toMatchObject({
      winnerName: 'Staff Ace',
      note: 'Projected Cy Young',
    });
  });
});
