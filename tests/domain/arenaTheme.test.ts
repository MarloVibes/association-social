import { describe, expect, it } from 'vitest';
import { buildArenaTheme } from '@/domain/nba/arenaTheme';

describe('NBA arena theme', () => {
  it('uses the current Lakers home identity and colors around 2026', () => {
    const theme = buildArenaTheme({ homeAbbr: 'lal', currentYear: 2026 });

    expect(theme.homeAbbr).toBe('LAL');
    expect(theme.primary).toBe('#552583');
    expect(theme.secondary).toBe('#FDB927');
    expect(theme.centerText).toBe('LAL');
    expect(theme.laneColor).toBe('#552583');
    expect(theme.scoreboardTint).toBe('#FDB927');
  });

  it('uses provided colors for custom expansion teams', () => {
    const theme = buildArenaTheme({
      homeAbbr: 'VEG',
      primaryColor: '#111111',
      secondaryColor: '#d4af37',
    });

    expect(theme.homeAbbr).toBe('VEG');
    expect(theme.primary).toBe('#111111');
    expect(theme.secondary).toBe('#d4af37');
    expect(theme.centerText).toBe('VEG');
    expect(theme.laneColor).toBe('#111111');
    expect(theme.scoreboardTint).toBe('#d4af37');
  });

  it('returns a usable fallback for blank or unknown input', () => {
    const blankTheme = buildArenaTheme({ homeAbbr: '   ' });
    const unknownTheme = buildArenaTheme({ homeAbbr: '???' });

    expect(blankTheme.homeAbbr).toBe('NBA');
    expect(blankTheme.centerText).toBe('NBA');
    expect(blankTheme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(blankTheme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(blankTheme.text).toMatch(/^#[0-9a-f]{6}$/i);
    expect(blankTheme.laneColor).toBe(blankTheme.primary);
    expect(blankTheme.sidelineColor).toBe(blankTheme.secondary);
    expect(blankTheme.crowdGlow).toBe(blankTheme.primary);
    expect(blankTheme.scoreboardTint).toBe(blankTheme.secondary);

    expect(unknownTheme.homeAbbr).toBe('NBA');
    expect(unknownTheme.centerText).toBe('NBA');
    expect(unknownTheme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(unknownTheme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
