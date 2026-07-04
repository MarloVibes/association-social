import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_ASSIGNMENT_DURATION_MS,
  completeDevelopmentAssignment,
  isDevelopmentEligiblePlayer,
  startDevelopmentAssignment,
} from '@/domain/nba/developmentLeague';

const nowMs = Date.parse('2026-07-04T12:00:00.000Z');

describe('NBA development league assignments', () => {
  it('only allows minimum or two-way eligible players to be assigned', () => {
    expect(isDevelopmentEligiblePlayer({ salary: 1_200_000 })).toBe(true);
    expect(isDevelopmentEligiblePlayer({ contractType: 'minimum_rookie', salary: 1_800_000 })).toBe(true);
    expect(isDevelopmentEligiblePlayer({ rosterSlot: 'two_way', salary: 900_000 })).toBe(true);
    expect(isDevelopmentEligiblePlayer({ salary: 4_500_000, contractType: 'standard' })).toBe(false);
  });

  it('starts one one-week assignment for one player on a team', () => {
    const team = {
      id: 'lal',
      players: [
        { id: 'min-guard', full_name: 'Minimum Guard', salary: 1_200_000, skill_grades: { threePoint: 'C+' } },
        { id: 'standard-wing', full_name: 'Standard Wing', salary: 4_500_000, skill_grades: { threePoint: 'B' } },
      ],
    };

    const result = startDevelopmentAssignment({
      team,
      playerId: 'min-guard',
      gradeKey: 'threePoint',
      nowMs,
    });

    expect(result.valid).toBe(true);
    expect(result.assignment).toMatchObject({
      playerId: 'min-guard',
      gradeKey: 'threePoint',
      status: 'active',
      startedAtMs: nowMs,
      completesAtMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS,
    });

    const blocked = startDevelopmentAssignment({
      team: { ...team, developmentAssignment: result.assignment },
      playerId: 'standard-wing',
      gradeKey: 'threePoint',
      nowMs: nowMs + 1000,
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.errors).toContain('assignment_active');
  });

  it('raises the selected grade two levels after one week and caps at S', () => {
    const started = startDevelopmentAssignment({
      team: {
        players: [
          {
            id: 'min-guard',
            full_name: 'Minimum Guard',
            salary: 1_200_000,
            skill_grades: { threePoint: 'C+' },
            category_skill_grades: { threePoint: { grade: 'C+', rating: 70 } },
            hidden: { threePoint: 70 },
            visible: { grades: { threePoint: 'C+' } },
          },
        ],
      },
      playerId: 'min-guard',
      gradeKey: 'threePoint',
      nowMs,
    });

    const early = completeDevelopmentAssignment({
      team: { players: [], developmentAssignment: started.assignment },
      nowMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS - 1,
    });
    expect(early.valid).toBe(false);
    expect(early.errors).toContain('assignment_not_ready');

    const completed = completeDevelopmentAssignment({
      team: {
        players: [
          {
            id: 'min-guard',
            full_name: 'Minimum Guard',
            salary: 1_200_000,
            skill_grades: { threePoint: 'C+' },
            category_skill_grades: { threePoint: { grade: 'C+', rating: 70 } },
            hidden: { threePoint: 70 },
            visible: { grades: { threePoint: 'C+' } },
          },
        ],
        developmentAssignment: started.assignment,
      },
      nowMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS,
    });

    expect(completed.valid).toBe(true);
    const completedPlayer = completed.players[0];
    expect(completedPlayer).toBeTruthy();
    expect(completedPlayer?.skill_grades?.threePoint).toBe('B');
    expect(completedPlayer?.category_skill_grades?.threePoint).toEqual({ grade: 'B', rating: 80 });
    expect(completedPlayer?.hidden?.threePoint).toBe(80);
    expect(completedPlayer?.visible?.grades?.threePoint).toBe('B');
    expect(completed.assignment).toMatchObject({ status: 'completed', completedAtMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS });
  });
});
