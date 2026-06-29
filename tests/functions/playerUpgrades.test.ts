import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applySeasonUpgradeGrants,
  createUpgradePointNotifications,
  prepareSeasonGrantUpdates,
  spendTeamUpgradePoint,
} = require('../../functions/franchise/playerUpgrades.js');

describe('player upgrade callable helpers', () => {
  it('spends one point and moves one visible grade step', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 3 },
      player: {
        id: 'p1',
        playerLabel: 'ROLE PLAYER',
        grades: { shooting: 'B' },
        upgradeUsage: { '2026': 1 },
      },
      ability: 'shooting',
      seasonYear: 2026,
    });

    expect(result.team.upgradePoints).toBe(2);
    expect(result.player.grades.shooting).toBe('B+');
    expect(result.player.upgradeUsage['2026']).toBe(2);
  });

  it('updates hidden simulation values and visible grades when spending a point', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 2 },
      player: {
        id: 'p1',
        playerLabel: 'ROLE PLAYER',
        hidden: { shooting: 75, playmaking: 70 },
        visible: { grades: { shooting: 'B', playmaking: 'B-' }, reputation: 'Role Player' },
        grades: { shooting: 'B', playmaking: 'B-' },
      },
      ability: 'shooting',
      seasonYear: 2026,
    });

    expect(result.player.grades.shooting).toBe('B+');
    expect(result.player.visible.grades.shooting).toBe('B+');
    expect(result.player.hidden.shooting).toBeGreaterThanOrEqual(80);
  });

  it('blocks second same-season upgrades for star and above players', () => {
    expect(() => spendTeamUpgradePoint({
      team: { upgradePoints: 3 },
      player: {
        id: 'p1',
        playerLabel: 'STAR',
        grades: { shooting: 'B' },
        upgradeUsage: { '2026': 1 },
      },
      ability: 'shooting',
      seasonYear: 2026,
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('allows only superstar and legend labels to reach S', () => {
    expect(() => spendTeamUpgradePoint({
      team: { upgradePoints: 1 },
      player: { id: 'star', playerLabel: 'STAR', grades: { shooting: 'A+' } },
      ability: 'shooting',
      seasonYear: 2026,
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));

    expect(spendTeamUpgradePoint({
      team: { upgradePoints: 1 },
      player: { id: 'superstar', playerLabel: 'SUPERSTAR', grades: { shooting: 'A+' } },
      ability: 'shooting',
      seasonYear: 2026,
    }).player.grades.shooting).toBe('S');
  });

  it('derives superstar eligibility from production when no label is saved', () => {
    expect(spendTeamUpgradePoint({
      team: { upgradePoints: 1 },
      player: { id: 'scorer', ppg: 28, grades: { shooting: 'A+' } },
      ability: 'shooting',
      seasonYear: 2026,
    }).player.grades.shooting).toBe('S');
  });

  it('applies season grants once per team and season', () => {
    const teams = [
      { id: 'E5', upgradePoints: 1, upgradePointGrants: {} },
      { id: 'W5', upgradePoints: 2, upgradePointGrants: { '2026': { totalPoints: 4 } } },
    ];
    const result = applySeasonUpgradeGrants({
      teams,
      seasonYear: 2026,
      grants: [
        { teamId: 'E5', awardPoints: 6, lotteryBoostPoints: 3, totalPoints: 9 },
        { teamId: 'W5', awardPoints: 3, lotteryBoostPoints: 3, totalPoints: 6 },
      ],
    });

    expect(result.find((team: any) => team.id === 'E5').upgradePoints).toBe(10);
    expect(result.find((team: any) => team.id === 'E5').upgradePointGrants['2026'].totalPoints).toBe(9);
    expect(result.find((team: any) => team.id === 'W5').upgradePoints).toBe(2);
  });

  it('prepares only changed team updates for season grant writes', () => {
    const teams = [
      { id: 'E5', ref: 'ref-e5', upgradePoints: 1, upgradePointGrants: {} },
      { id: 'W5', ref: 'ref-w5', upgradePoints: 2, upgradePointGrants: { '2026': { totalPoints: 4 } } },
    ];
    const updates = prepareSeasonGrantUpdates({
      teams,
      seasonYear: 2026,
      grants: [
        { teamId: 'E5', awardPoints: 6, lotteryBoostPoints: 3, totalPoints: 9 },
        { teamId: 'W5', awardPoints: 3, lotteryBoostPoints: 3, totalPoints: 6 },
      ],
    });

    expect(updates).toEqual([{
      ref: 'ref-e5',
      teamId: 'E5',
      upgradePoints: 10,
      upgradePointGrants: { '2026': { awardPoints: 6, lotteryBoostPoints: 3, totalPoints: 9 } },
    }]);
  });

  it('builds upgrade point notifications for updated team GMs', () => {
    const notifications = createUpgradePointNotifications({
      teams: [
        { id: 'E5', gmId: 'gm-east', name: 'East Five' },
        { id: 'W5', gmId: 'gm-west', name: 'West Five' },
      ],
      updates: [
        { teamId: 'E5', upgradePointGrants: { '2026': { totalPoints: 9 } } },
      ],
      leagueId: 'league-1',
      leagueName: 'NBA',
      seasonYear: 2026,
      createdAt: 'now',
    });

    expect(notifications).toEqual([{
      uid: 'gm-east',
      notification: expect.objectContaining({
        type: 'upgrade_points',
        leagueId: 'league-1',
        leagueName: 'NBA',
        message: 'East Five received 9 upgrade points for 2026.',
        createdAt: 'now',
      }),
    }]);
  });
});
