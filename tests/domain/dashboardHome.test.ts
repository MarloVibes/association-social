import { describe, expect, it } from 'vitest';

import { buildDashboardHomeModel } from '@/domain/dashboard/home';

describe('dashboard home model', () => {
  it('summarizes the main menu without exposing mini-game language', () => {
    const model = buildDashboardHomeModel({
      leagues: [
        { sport: 'nba', members: ['u1', 'u2'] },
        { sport: 'mlb', members: ['u1'] },
      ],
      onlineFriendCount: 3,
      pendingInviteCount: 2,
    });

    expect(model.heroTitle).toBe('Franchise HQ');
    expect(model.heroSubtitle).toBe('Build, manage, and compete across your leagues.');
    expect(model.stats).toEqual([
      { label: 'Leagues', value: '2' },
      { label: 'Online GMs', value: '3' },
      { label: 'Alerts', value: '2' },
    ]);
    expect(model.modeCards.map((card) => card.title)).toEqual([
      'NBA Franchise',
      'NFL Franchise',
      'MLB Franchise',
    ]);
    expect(JSON.stringify(model).toLowerCase()).not.toContain('mini');
    expect(JSON.stringify(model).toLowerCase()).not.toContain('mvp');
  });

  it('keeps quick actions focused on franchise workflows', () => {
    const model = buildDashboardHomeModel({
      leagues: [],
      onlineFriendCount: 0,
      pendingInviteCount: 0,
    });

    expect(model.quickActions).toEqual([
      { label: 'Join League', route: '/screens/join-league', tone: 'secondary' },
      { label: 'Find GMs', route: '/screens/search-users', tone: 'secondary' },
      { label: 'Help / FAQ', route: '/screens/faq-help', tone: 'secondary' },
    ]);
  });
});
