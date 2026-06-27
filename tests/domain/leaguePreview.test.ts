import { describe, expect, it } from 'vitest';
import { playerJerseyDisplay } from '@/domain/sports/playerDisplay';

describe('league team preview', () => {
  it('shows jersey numbers only when real jersey data exists', () => {
    expect(playerJerseyDisplay({ jersey_number: 3 })).toBe('#3');
    expect(playerJerseyDisplay({ jerseyNumber: '23' })).toBe('#23');
    expect(playerJerseyDisplay({ number: 11 })).toBe('#11');
    expect(playerJerseyDisplay({ full_name: 'No Number' })).toBe('');
    expect(playerJerseyDisplay({ jersey_number: '' })).toBe('');
  });
});
