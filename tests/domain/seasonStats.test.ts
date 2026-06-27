import { describe, expect, it } from 'vitest';
import { basketballSeasonAverageItems, basketballSeasonTotalItems } from '@/domain/nba/seasonStats';

describe('basketball season stat display', () => {
  it('shows per-game averages by default instead of raw accumulated totals', () => {
    const averages = basketballSeasonAverageItems({
      games: 4,
      minutes: 132,
      points: 84,
      rebounds: 28,
      assists: 24,
      steals: 8,
      blocks: 4,
      turnovers: 12,
      fieldGoalsMade: 34,
      fieldGoalsAttempted: 70,
      threePointersMade: 8,
      threePointersAttempted: 22,
      freeThrowsMade: 8,
      freeThrowsAttempted: 10,
    });

    expect(averages).toEqual([
      { label: 'PPG', value: '21.0', kind: 'average' },
      { label: 'RPG', value: '7.0', kind: 'average' },
      { label: 'APG', value: '6.0', kind: 'average' },
      { label: 'SPG', value: '2.0', kind: 'average' },
      { label: 'BPG', value: '1.0', kind: 'average' },
      { label: 'TOV', value: '3.0', kind: 'average' },
      { label: 'MPG', value: '33.0', kind: 'average' },
      { label: 'FG%', value: '48.6%', kind: 'percentage' },
      { label: '3P%', value: '36.4%', kind: 'percentage' },
      { label: 'FT%', value: '80.0%', kind: 'percentage' },
    ]);
  });

  it('keeps season totals available under total labels', () => {
    expect(basketballSeasonTotalItems({ games: 4, points: 84, rebounds: 28, assists: 24 })).toEqual([
      { label: 'GP', value: 4, kind: 'total' },
      { label: 'Total Points', value: 84, kind: 'total' },
      { label: 'Total Rebounds', value: 28, kind: 'total' },
      { label: 'Total Assists', value: 24, kind: 'total' },
      { label: 'Total Steals', value: 0, kind: 'total' },
      { label: 'Total Blocks', value: 0, kind: 'total' },
      { label: 'Total Turnovers', value: 0, kind: 'total' },
    ]);
  });
});
