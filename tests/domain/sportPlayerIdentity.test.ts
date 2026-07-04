import { describe, expect, it } from 'vitest';
import { buildSportPlayerIdentity, buildSportScoutingSections } from '@/domain/sports/playerIdentity';

describe('sport player identity', () => {
  it('builds NFL-specific identity and grades without numeric ratings', () => {
    const player = {
      full_name: 'Test QB',
      position: 'QB',
      passing_yards: 4300,
      passing_tds: 34,
      rushing_yards: 620,
      interceptions_thrown: 9,
      ratings: { arm: 91, awareness: 86, speed: 84, potential: 90 },
    };

    const identity = buildSportPlayerIdentity(player, 'madden');
    const sections = buildSportScoutingSections(player, 'madden');

    expect(identity?.primaryRole).toBe('Dual-Threat QB');
    expect(identity?.reputation).toMatch(/Franchise|Star/);
    expect(identity?.strengths).toContain('Mobility');
    expect(sections.map(section => section.title)).toEqual(['Quarterback', 'Tools']);
    expect(sections.flatMap(section => section.items).map(item => item.label)).toEqual(
      expect.arrayContaining(['Arm Talent', 'Decision Making', 'Mobility', 'Potential']),
    );
    expect(JSON.stringify(sections)).not.toContain('91');
  });

  it('builds MLB-specific pitcher identity and grades without falling back to role player', () => {
    const player = {
      full_name: 'Test Ace',
      position: 'SP',
      era: '2.72',
      whip: '1.04',
      so: 211,
      wins: 15,
      ratings: { command: 88, stamina: 84, potential: 87 },
    };

    const identity = buildSportPlayerIdentity(player, 'mlb');
    const sections = buildSportScoutingSections(player, 'mlb');

    expect(identity?.primaryRole).toBe('Ace');
    expect(identity?.reputation).toMatch(/Star|High-impact/);
    expect(identity?.strengths).toEqual(expect.arrayContaining(['Run Prevention', 'Strikeouts']));
    expect(sections.map(section => section.title)).toEqual(['Pitching', 'Profile']);
    expect(sections.flatMap(section => section.items).map(item => item.label)).toEqual(
      expect.arrayContaining(['Run Prevention', 'Strikeouts', 'Command', 'Potential']),
    );
    expect(JSON.stringify(sections)).not.toContain('88');
  });

  it('keeps low-data NFL and MLB players identified by position instead of blank cards', () => {
    expect(buildSportPlayerIdentity({ full_name: 'Depth Tackle', position: 'LT' }, 'madden')?.primaryRole)
      .toBe('Trench Anchor');
    expect(buildSportPlayerIdentity({ full_name: 'Bench Utility', position: 'UTIL' }, 'mlb')?.primaryRole)
      .toBe('Utility');
  });
});
