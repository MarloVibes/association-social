import { describe, expect, it } from 'vitest';
import { getPlaystyle, getPlaystyleForYear } from '@/constants/playstyle';

describe('NBA player tier labels', () => {
  it('lets commissioner overrides grant top labels', () => {
    expect(getPlaystyle({ tierOverride: 'legend' }).label).toBe('LEGEND');
    expect(getPlaystyle({ tierOverride: 'superstar' }).label).toBe('SUPERSTAR');
  });

  it('classifies legend, superstar, and star from accolades', () => {
    expect(getPlaystyle({ accolades: ['MVP', 'MVP'] }).label).toBe('LEGEND');
    expect(getPlaystyle({ accolades: ['MVP'] }).label).toBe('SUPERSTAR');
    expect(getPlaystyle({ accolades: ['All-NBA 1st Team'] }).label).toBe('SUPERSTAR');
    expect(getPlaystyle({ accolades: ['All-Star'] }).label).toBe('STAR');
    expect(getPlaystyle({ accolades: ['Defensive Player of the Year'] }).label).toBe('STAR');
  });

  it('keeps elite production labels era-adjusted', () => {
    expect(getPlaystyle({ ppg: 28 }, 'current').label).toBe('SUPERSTAR');
    expect(getPlaystyle({ ppg: 23 }, 'current').label).toBe('STAR');
  });

  it('does not downgrade all-around era icons to generic role labels', () => {
    expect(getPlaystyle({
      full_name: 'LeBron James',
      pointsPerGame: 27.2,
      reboundsPerGame: 7.4,
      assistsPerGame: 7.2,
      per: 27.6,
      winShares: 226.6,
    }, 'lebron').label).toBe('SUPERSTAR');
  });

  it('uses trusted reputation separately from current team role', () => {
    expect(getPlaystyle({
      role: 'starter',
      visibleIdentity: { reputation: 'Superstar' },
    }).label).toBe('SUPERSTAR');
  });

  it('carries profile reputation into year-aware roster labels', () => {
    expect(getPlaystyleForYear(
      { full_name: 'Profile Star', role: 'bench', ppg: 4 },
      {
        visibleIdentity: { reputation: 'Superstar' },
        seasons: [{ year: '2010-11', ppg: 4, apg: 1, rpg: 1 }],
      },
      2010,
    ).label).toBe('SUPERSTAR');
  });
});
