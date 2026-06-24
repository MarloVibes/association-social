import { describe, expect, it } from 'vitest';
import { chooseAutoPick, prospectTalent } from '@/domain/draft/autoPick';

describe('draft auto-pick', () => {
  it('balances talent and positional need', () => {
    const pick = chooseAutoPick({
      sport: 'madden',
      needs: { QB: 1, WR: 0.2 },
      prospects: [
        { id: 'qb', position: 'QB', talent: 82 },
        { id: 'wr', position: 'WR', talent: 84 },
      ],
    });
    expect(pick.id).toBe('qb');
  });

  it('uses ratings, potential, and projected round when talent is not stored', () => {
    expect(prospectTalent({
      id: 'mlb',
      position: 'SS',
      projectedRound: 2,
      potential: 90,
      ratings: { contact: 75, fielding: 80, speed: 70 },
    })).toBeGreaterThan(70);
  });

  it('is deterministic and ignores already selected prospects', () => {
    const input = {
      sport: 'mlb',
      needs: { SS: 0.8, SP: 0.8 },
      selectedIds: ['ss'],
      prospects: [
        { id: 'ss', position: 'SS', talent: 90 },
        { id: 'sp', position: 'SP', talent: 85 },
        { id: 'sp-2', position: 'SP', talent: 85 },
      ],
    };
    expect(chooseAutoPick(input)).toEqual(chooseAutoPick(input));
    expect(chooseAutoPick(input).id).toBe('sp');
  });

  it('fails when no prospect remains', () => {
    expect(() => chooseAutoPick({
      sport: 'madden',
      needs: {},
      selectedIds: ['only'],
      prospects: [{ id: 'only', position: 'QB', talent: 99 }],
    })).toThrow('No draft prospects remain');
  });
});
