import { describe, expect, it } from 'vitest';
import { compareSportRosterPlayersByValue, sportRosterPlayerValue } from '@/domain/sports/rosterValue';

describe('sport roster value', () => {
  it('sorts NFL players by football production instead of basketball defaults', () => {
    const depthReceiver = { full_name: 'Depth WR', position: 'WR', receiving_yards: 180 };
    const franchiseQuarterback = { full_name: 'QB1', position: 'QB', passing_yards: 4300, passing_tds: 35, rushing_yards: 420 };
    const edge = { full_name: 'Edge Star', position: 'EDGE', sacks: 14, tackles: 58 };

    const sorted = [depthReceiver, edge, franchiseQuarterback]
      .sort(compareSportRosterPlayersByValue('madden'));

    expect(sorted[0]).toBe(franchiseQuarterback);
    expect(sportRosterPlayerValue(franchiseQuarterback, 'madden')).toBeGreaterThan(sportRosterPlayerValue(depthReceiver, 'madden'));
    expect(sportRosterPlayerValue(edge, 'madden')).toBeGreaterThan(sportRosterPlayerValue(depthReceiver, 'madden'));
  });

  it('sorts MLB players by baseball production instead of basketball defaults', () => {
    const bench = { full_name: 'Bench IF', position: 'IF', avg: '.210', hr: 2 };
    const slugger = { full_name: 'Middle Order Bat', position: '1B', avg: '.286', hr: 38, rbi: 112, obp: '.370', slg: '.545' };
    const ace = { full_name: 'Rotation Ace', position: 'SP', era: '2.62', whip: '1.01', so: 218 };

    const sorted = [bench, ace, slugger]
      .sort(compareSportRosterPlayersByValue('mlb'));

    expect(sorted[0]).toBe(slugger);
    expect(sportRosterPlayerValue(slugger, 'mlb')).toBeGreaterThan(sportRosterPlayerValue(bench, 'mlb'));
    expect(sportRosterPlayerValue(ace, 'mlb')).toBeGreaterThan(sportRosterPlayerValue(bench, 'mlb'));
  });
});
