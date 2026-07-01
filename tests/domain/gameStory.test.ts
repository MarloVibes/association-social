import { describe, expect, it } from 'vitest';
import { buildPostgameStory, genericStoredStory } from '../../domain/nba/gameStory';

describe('postgame story builder', () => {
  it('keeps a specific stored story but replaces generic legacy summaries', () => {
    expect(genericStoredStory('CHI controlled the decisive stretches behind roster strength and rotation production.')).toBe(true);
    expect(genericStoredStory('MIA survived a one-possession finish behind a late bench spark.')).toBe(false);
  });

  it('summarizes close games with leader, double-double, opponent answer, bench spark, and swing quarter', () => {
    const story = buildPostgameStory({
      homeLabel: 'Miami Heat',
      awayLabel: 'Chicago Bulls',
      homeAbbr: 'MIA',
      awayAbbr: 'CHI',
      homeScore: 104,
      awayScore: 102,
      quarters: [
        { quarter: 1, home: 24, away: 31 },
        { quarter: 2, home: 25, away: 22 },
        { quarter: 3, home: 29, away: 24 },
        { quarter: 4, home: 26, away: 25 },
      ],
      performers: [
        { sideAbbr: 'MIA', name: 'LeBron James', starter: true, points: 38, rebounds: 12, assists: 9, steals: 2, blocks: 1, turnovers: 3 },
        { sideAbbr: 'MIA', name: 'Shane Battier', starter: false, points: 17, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 0 },
        { sideAbbr: 'CHI', name: 'Derrick Rose', starter: true, points: 34, rebounds: 4, assists: 8, steals: 1, blocks: 0, turnovers: 3 },
      ],
    });

    expect(story).toContain('Miami Heat survived a one-possession finish');
    expect(story).toContain('LeBron James powered the win');
    expect(story).toContain('double-double');
    expect(story).toContain('Shane Battier gave MIA a bench spark');
    expect(story).toContain('Derrick Rose answered');
    expect(story).toContain('third quarter');
  });
});
