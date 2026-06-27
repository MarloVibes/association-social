import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createSaveTeamCoachingPresetHandler,
  createSaveTeamRotationHandler,
} = require('../../functions/franchise/teamSettings.js');

class TestHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function snap(data: any) {
  return { exists: Boolean(data), data: () => data };
}

function dbForTeam(team: any, league: any = { sport: 'nba' }) {
  const teamUpdate = vi.fn();
  const leagueRef = {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: !team,
            docs: team ? [{ id: team.id || 'team-1', ref: { update: teamUpdate }, data: () => team }] : [],
          })),
        })),
      })),
    })),
    get: vi.fn(async () => snap(league)),
  };
  return {
    teamUpdate,
    db: {
      collection: vi.fn(() => ({
        doc: vi.fn(() => leagueRef),
      })),
    },
  };
}

describe('team settings callables', () => {
  it('saves a legal GM rotation through the team document', async () => {
    const { db, teamUpdate } = dbForTeam({ id: 'team-1', gmId: 'gm-1' });
    const handler = createSaveTeamRotationHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'SERVER_TIME',
      HttpsError: TestHttpsError,
    });
    const rotation = Array.from({ length: 10 }, (_, i) => ({
      playerId: `p${i}`,
      minutes: 24,
      starter: i < 5,
      closing: i < 5,
      status: 'active',
    }));

    const result = await handler({
      auth: { uid: 'gm-1' },
      data: { leagueId: 'league-1', rotation },
    });

    expect(result).toEqual({ saved: true, teamId: 'team-1' });
    expect(teamUpdate).toHaveBeenCalledWith({
      rotation,
      rotationUpdatedAt: 'SERVER_TIME',
    });
  });

  it('rejects invalid rotation totals before saving', async () => {
    const { db, teamUpdate } = dbForTeam({ id: 'team-1', gmId: 'gm-1' });
    const handler = createSaveTeamRotationHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'SERVER_TIME',
      HttpsError: TestHttpsError,
    });

    await expect(handler({
      auth: { uid: 'gm-1' },
      data: { leagueId: 'league-1', rotation: [{ playerId: 'p1', minutes: 48 }] },
    })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('saves a validated coaching preset for the controlled team', async () => {
    const { db, teamUpdate } = dbForTeam({
      id: 'team-1',
      gmId: 'gm-1',
      coachingPresets: [{ id: 'old', name: 'Old Plan' }],
    });
    const handler = createSaveTeamCoachingPresetHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'SERVER_TIME',
      HttpsError: TestHttpsError,
    });
    const preset = {
      id: 'custom_gameplan',
      name: 'Custom Gameplan',
      description: 'A custom plan.',
      boostSummary: 'Balanced custom boosts.',
      offense: 'balanced',
      defense: 'drop',
      modifiers: {
        pace: 0,
        threePointRate: 0,
        rimPressure: 0,
        midrangeRate: 0,
        turnovers: 0,
        fouls: 0,
        rebounding: 0,
        fatigue: 0,
      },
      counters: ['pressure'],
    };

    const result = await handler({
      auth: { uid: 'gm-1' },
      data: { leagueId: 'league-1', preset },
    });

    expect(result).toEqual({ saved: true, teamId: 'team-1', presetId: 'custom_gameplan' });
    expect(teamUpdate).toHaveBeenCalledWith({
      coachingPresets: [
        { id: 'old', name: 'Old Plan' },
        preset,
      ],
      defaultCoachingPresetId: 'custom_gameplan',
      coachingUpdatedAt: 'SERVER_TIME',
    });
  });
});
