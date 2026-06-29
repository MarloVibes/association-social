import { expect, it } from 'vitest';
import { getChannelTheme } from '@/domain/sports/rules';

it('maps each sport to its field presentation', () => {
  expect(getChannelTheme('nba')).toBe('court');
  expect(getChannelTheme('madden')).toBe('field');
  expect(getChannelTheme('nfl')).toBe('field');
  expect(getChannelTheme('mlb')).toBe('diamond');
});

it('falls back to the court presentation for unknown sports', () => {
  expect(getChannelTheme('soccer')).toBe('court');
  expect(getChannelTheme(null)).toBe('court');
});
