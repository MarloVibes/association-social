import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applySeasonUpgradeGrants,
  completeDevelopmentAssignment,
  createUpgradePointNotifications,
  prepareFreeAgentGrantUpdates,
  prepareSeasonGrantUpdates,
  spendTeamUpgradePoint,
  startDevelopmentAssignment,
} = require('../../functions/franchise/playerUpgrades.js');

describe('player upgrade callable helpers', () => {
  it('starts and completes a one-week minimum-contract development assignment', () => {
    const nowMs = Date.parse('2026-07-04T12:00:00.000Z');
    const started = startDevelopmentAssignment({
      team: {
        players: [
          {
            id: 'bench-wing',
            full_name: 'Bench Wing',
            contractType: 'minimum',
            salary: 1_200_000,
            skill_grades: { perimeterDefense: 'C' },
          },
        ],
      },
      playerId: 'bench-wing',
      gradeKey: 'perimeterDefense',
      nowMs,
    });

    expect(started.valid).toBe(true);
    expect(started.assignment.completesAtMs).toBe(nowMs + 7 * 24 * 60 * 60 * 1000);

    const completed = completeDevelopmentAssignment({
      team: {
        players: [
          {
            id: 'bench-wing',
            full_name: 'Bench Wing',
            contractType: 'minimum',
            salary: 1_200_000,
            skill_grades: { perimeterDefense: 'C' },
            hidden: { perimeterDefense: 65 },
          },
        ],
        developmentAssignment: started.assignment,
      },
      nowMs: started.assignment.completesAtMs,
    });

    expect(completed.valid).toBe(true);
    expect(completed.players[0].skill_grades.perimeterDefense).toBe('B-');
    expect(completed.players[0].hidden.perimeterDefense).toBe(75);
  });

  it('blocks a second active development assignment on the same team', () => {
    const result = startDevelopmentAssignment({
      team: {
        developmentAssignment: {
          playerId: 'first-player',
          gradeKey: 'threePoint',
          status: 'active',
          startedAtMs: 1000,
          completesAtMs: 1000 + 7 * 24 * 60 * 60 * 1000,
        },
        players: [
          { id: 'second-player', contractType: 'minimum', salary: 1_200_000, skill_grades: { threePoint: 'C' } },
        ],
      },
      playerId: 'second-player',
      gradeKey: 'threePoint',
      nowMs: 2000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assignment_active');
  });

  it('blocks a new development assignment while a ready assignment is unclaimed', () => {
    const nowMs = Date.parse('2026-07-04T12:00:00.000Z');
    const result = startDevelopmentAssignment({
      team: {
        developmentAssignment: {
          playerId: 'ready-player',
          gradeKey: 'threePoint',
          status: 'active',
          startedAtMs: nowMs - 7 * 24 * 60 * 60 * 1000,
          completesAtMs: nowMs - 1000,
        },
        players: [
          { id: 'next-player', full_name: 'Next Player', contractType: 'minimum', salary: 1_200_000, skill_grades: { threePoint: 'C+' } },
        ],
      },
      playerId: 'next-player',
      gradeKey: 'threePoint',
      nowMs,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assignment_active');
  });

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
    expect(result.team.starTrainingTokens).toBe(0);
    expect(result.player.grades.shooting).toBe('B+');
    expect(result.player.upgradeUsage['2026']).toBe(2);
  });

  it('spends player-bound credits and star tokens for expensive upgrades', () => {
    const credited = spendTeamUpgradePoint({
      team: { upgradePoints: 1, starTrainingTokens: 0 },
      player: {
        id: 'p1',
        playerLabel: 'ROLE PLAYER',
        grades: { threePoint: 'A-' },
        playerUpgradeCredits: {
          '2026': [{ id: 'mip-credit', label: 'Most Improved Credit', remaining: 1 }],
        },
      },
      ability: 'threePoint',
      seasonYear: 2026,
    });

    expect(credited.team.upgradePoints).toBe(0);
    expect(credited.player.playerUpgradeCredits['2026'][0].remaining).toBe(0);
    expect(credited.player.grades.threePoint).toBe('A');

    const elite = spendTeamUpgradePoint({
      team: { upgradePoints: 5, starTrainingTokens: 1 },
      player: {
        id: 'p2',
        playerLabel: 'SUPERSTAR',
        grades: { clutch: 'A+' },
      },
      ability: 'clutch',
      seasonYear: 2026,
    });

    expect(elite.team.upgradePoints).toBe(1);
    expect(elite.team.starTrainingTokens).toBe(0);
    expect(elite.player.grades.clutch).toBe('S');
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

  it('uses the full D-tier ladder when updating hidden upgrade floors', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 1 },
      player: {
        id: 'p1',
        playerLabel: 'ROLE PLAYER',
        hidden: { defense: 53 },
        grades: { defense: 'D' },
      },
      ability: 'defense',
      seasonYear: 2026,
    });

    expect(result.player.grades.defense).toBe('D+');
    expect(result.player.hidden.defense).toBe(57);
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

  it('allows any player label to reach S when the team pays the elite cost', () => {
    expect(spendTeamUpgradePoint({
      team: { upgradePoints: 4, starTrainingTokens: 1 },
      player: { id: 'role', playerLabel: 'ROLE PLAYER', grades: { shooting: 'A+' } },
      ability: 'shooting',
      seasonYear: 2026,
    }).player.grades.shooting).toBe('S');
  });

  it('derives superstar eligibility from production when no label is saved', () => {
    expect(spendTeamUpgradePoint({
      team: { upgradePoints: 4, starTrainingTokens: 1 },
      player: { id: 'scorer', ppg: 28, grades: { shooting: 'A+' } },
      ability: 'shooting',
      seasonYear: 2026,
    }).player.grades.shooting).toBe('S');
  });

  it('uses canonical skill grades before stale saved upgrade grades', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 4, starTrainingTokens: 1 },
      player: {
        id: 'gobert',
        full_name: 'Rudy Gobert',
        playerLabel: 'SUPERSTAR',
        grades: { shooting: 'A+', rebounding: 'B' },
        category_skill_grades: {
          threePoint: { grade: 'F', rating: 28 },
          midRange: { grade: 'D', rating: 54 },
          freeThrow: { grade: 'C', rating: 66 },
          finishing: { grade: 'B+', rating: 85 },
          rebounding: { grade: 'A+', rating: 96 },
          interiorDefense: { grade: 'A+', rating: 97 },
        },
      },
      ability: 'rebounding',
      seasonYear: 2026,
    });

    expect(result.player.grades.shooting).not.toBe('A+');
    expect(result.player.grades.shooting).toMatch(/D|F|C-/);
    expect(result.player.grades.rebounding).toBe('S');
  });

  it('spends a point on a detailed canonical player attribute', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 2 },
      player: {
        id: 'wing',
        playerLabel: 'ROLE PLAYER',
        category_skill_grades: {
          threePoint: { grade: 'B-', rating: 78 },
          midRange: { grade: 'B', rating: 82 },
          shotIq: { grade: 'B+', rating: 86 },
        },
        hidden: { threePoint: 78 },
        visible: { grades: { threePoint: 'B-' } },
      },
      ability: 'threePoint',
      seasonYear: 2026,
    });

    expect(result.team.upgradePoints).toBe(1);
    expect(result.player.grades.threePoint).toBe('B');
    expect(result.player.visible.grades.threePoint).toBe('B');
    expect(result.player.hidden.threePoint).toBeGreaterThanOrEqual(80);
  });

  it('keeps upgraded detailed attributes synced for future simulations', () => {
    const result = spendTeamUpgradePoint({
      team: { upgradePoints: 2 },
      player: {
        id: 'guard',
        playerLabel: 'ROLE PLAYER',
        category_skill_grades: {
          ballHandle: { grade: 'B', rating: 82 },
        },
        attribute_model: { ballHandle: 82 },
        hidden: { ballHandle: 82 },
      },
      ability: 'ballHandle',
      seasonYear: 2026,
    });

    expect(result.player.grades.ballHandle).toBe('B+');
    expect(result.player.category_skill_grades.ballHandle).toEqual({ grade: 'B+', rating: 85 });
    expect(result.player.attribute_model.ballHandle).toBe(85);
    expect(result.player.hidden.ballHandle).toBe(85);
  });

  it('applies season grants once per team and season', () => {
    const teams = [
      { id: 'E5', upgradePoints: 1, upgradePointGrants: {}, players: [{ id: 'p1', full_name: 'Award Winner' }] },
      { id: 'W5', upgradePoints: 2, upgradePointGrants: { '2026': { totalPoints: 4 } } },
    ];
    const result = applySeasonUpgradeGrants({
      teams,
      seasonYear: 2026,
      grants: [
        {
          teamId: 'E5',
          awardPoints: 5,
          lotteryBoostPoints: 2,
          rebuildPoints: 1,
          totalPoints: 8,
          starTrainingTokens: 1,
          playerCredits: [{ id: 'E5:mvp:p1', playerId: 'p1', label: 'MVP Credit', remaining: 1 }],
        },
        { teamId: 'W5', awardPoints: 2, lotteryBoostPoints: 2, rebuildPoints: 1, totalPoints: 5, starTrainingTokens: 0, playerCredits: [] },
      ],
    });

    expect(result.find((team: any) => team.id === 'E5').upgradePoints).toBe(9);
    expect(result.find((team: any) => team.id === 'E5').starTrainingTokens).toBe(1);
    expect(result.find((team: any) => team.id === 'E5').players[0].playerUpgradeCredits['2026'][0].label).toBe('MVP Credit');
    expect(result.find((team: any) => team.id === 'E5').upgradePointGrants['2026'].totalPoints).toBe(8);
    expect(result.find((team: any) => team.id === 'W5').upgradePoints).toBe(2);
  });

  it('attaches player-bound award credits to the player current team', () => {
    const teams = [
      { id: 'E5', upgradePoints: 1, upgradePointGrants: {}, players: [] },
      { id: 'W5', upgradePoints: 2, upgradePointGrants: {}, players: [{ id: 'p1', full_name: 'Award Winner' }] },
    ];
    const result = applySeasonUpgradeGrants({
      teams,
      seasonYear: 2026,
      grants: [
        {
          teamId: 'E5',
          awardPoints: 1,
          lotteryBoostPoints: 0,
          rebuildPoints: 0,
          totalPoints: 1,
          starTrainingTokens: 0,
          playerCredits: [{ id: 'E5:mip:p1', playerId: 'p1', label: 'MIP Credit', remaining: 1 }],
        },
      ],
    });

    expect(result.find((team: any) => team.id === 'E5').upgradePoints).toBe(2);
    expect(result.find((team: any) => team.id === 'E5').players).toEqual([]);
    expect(result.find((team: any) => team.id === 'W5').players[0].playerUpgradeCredits['2026'][0].label).toBe('MIP Credit');
  });

  it('prepares player-credit updates when the award winner is on another team', () => {
    const teams = [
      { id: 'E5', ref: 'ref-e5', upgradePoints: 1, upgradePointGrants: {}, players: [] },
      { id: 'W5', ref: 'ref-w5', upgradePoints: 2, upgradePointGrants: {}, players: [{ id: 'p1', full_name: 'Award Winner' }] },
    ];
    const updates = prepareSeasonGrantUpdates({
      teams,
      seasonYear: 2026,
      grants: [
        {
          teamId: 'E5',
          awardPoints: 1,
          lotteryBoostPoints: 0,
          rebuildPoints: 0,
          totalPoints: 1,
          starTrainingTokens: 0,
          playerCredits: [{ id: 'E5:mip:p1', playerId: 'p1', label: 'MIP Credit', remaining: 1 }],
        },
      ],
    });

    expect(updates.map((update: any) => update.teamId)).toEqual(['E5', 'W5']);
    expect(updates.find((update: any) => update.teamId === 'W5').players[0].playerUpgradeCredits['2026'][0].label).toBe('MIP Credit');
  });

  it('prepares free-agent updates when the award winner is unsigned', () => {
    const updates = prepareFreeAgentGrantUpdates({
      teams: [
        { id: 'E5', players: [] },
        { id: 'W5', players: [] },
      ],
      freeAgentDocs: [
        { id: 'contracts_2026', ref: 'ref-free-agents', players: [{ id: 'p1', full_name: 'Award Winner' }] },
      ],
      seasonYear: 2026,
      grants: [
        {
          teamId: 'E5',
          awardPoints: 1,
          lotteryBoostPoints: 0,
          rebuildPoints: 0,
          totalPoints: 1,
          starTrainingTokens: 0,
          playerCredits: [{ id: 'E5:mip:p1', playerId: 'p1', label: 'MIP Credit', remaining: 1 }],
        },
      ],
    });

    expect(updates).toEqual([{
      ref: 'ref-free-agents',
      id: 'contracts_2026',
      players: [{
        id: 'p1',
        full_name: 'Award Winner',
        playerUpgradeCredits: {
          '2026': [{ id: 'E5:mip:p1', playerId: 'p1', label: 'MIP Credit', remaining: 1 }],
        },
      }],
    }]);
  });

  it('prepares only changed team updates for season grant writes', () => {
    const teams = [
      { id: 'E5', ref: 'ref-e5', upgradePoints: 1, upgradePointGrants: {}, players: [] },
      { id: 'W5', ref: 'ref-w5', upgradePoints: 2, upgradePointGrants: { '2026': { totalPoints: 4 } } },
    ];
    const updates = prepareSeasonGrantUpdates({
      teams,
      seasonYear: 2026,
      grants: [
        { teamId: 'E5', awardPoints: 5, lotteryBoostPoints: 2, rebuildPoints: 1, totalPoints: 8, starTrainingTokens: 1, playerCredits: [] },
        { teamId: 'W5', awardPoints: 2, lotteryBoostPoints: 2, rebuildPoints: 1, totalPoints: 5, starTrainingTokens: 0, playerCredits: [] },
      ],
    });

    expect(updates).toEqual([{
      ref: 'ref-e5',
      teamId: 'E5',
      upgradePoints: 9,
      starTrainingTokens: 1,
      players: [],
      upgradePointGrants: { '2026': { awardPoints: 5, lotteryBoostPoints: 2, rebuildPoints: 1, totalPoints: 8, starTrainingTokens: 1, playerCredits: [] } },
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
