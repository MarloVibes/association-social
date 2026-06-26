import { describe, expect, it } from 'vitest';
import { getPlaystyle } from '@/constants/playstyle';

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
});
