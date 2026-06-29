import { describe, expect, it } from 'vitest';
import {
  MLB_POSITIONS,
  NBA_POSITIONS,
  NFL_POSITIONS,
  getPlayerEditorSchema,
  getPositionFilters,
  matchesPositionFilter,
} from '@/domain/sports/playerFields';

describe('getPositionFilters', () => {
  it('uses football positions for NFL leagues', () => {
    expect(getPositionFilters('madden')).toEqual(['ALL', ...NFL_POSITIONS]);
    expect(getPositionFilters('madden')).toContain('QB');
    expect(getPositionFilters('madden')).not.toContain('PG');
  });

  it('uses baseball positions for MLB leagues', () => {
    expect(getPositionFilters('mlb')).toEqual(['ALL', ...MLB_POSITIONS]);
    expect(getPositionFilters('mlb')).toContain('SP');
    expect(getPositionFilters('mlb')).not.toContain('PG');
  });

  it('uses basketball positions for NBA leagues', () => {
    expect(getPositionFilters('nba')).toEqual(['ALL', ...NBA_POSITIONS]);
    expect(getPositionFilters('nba')).toContain('PG');
  });

  it('supports the nfl alias and falls back to NBA for unknown sports', () => {
    expect(getPositionFilters('nfl')).toEqual(getPositionFilters('madden'));
    expect(getPositionFilters('unknown')).toEqual(getPositionFilters('nba'));
  });
});

describe('getPlayerEditorSchema', () => {
  it('uses football stats and excludes basketball scoring for NFL', () => {
    const statKeys = getPlayerEditorSchema('madden').stats.map(field => field.key);

    expect(statKeys).not.toContain('ppg');
    expect(statKeys).toEqual(expect.arrayContaining([
      'passing_yards',
      'passing_tds',
      'rushing_yards',
      'receiving_yards',
      'tackles',
      'sacks',
      'field_goal_pct',
      'punt_average',
    ]));
  });

  it('uses MLB hitting, pitching, and award fields', () => {
    const schema = getPlayerEditorSchema('mlb');
    const statKeys = schema.stats.map(field => field.key);
    const awardKeys = schema.awards.map(field => field.key);

    expect(statKeys).toEqual(expect.arrayContaining([
      'avg',
      'obp',
      'slg',
      'hr',
      'rbi',
      'wins',
      'losses',
      'era',
      'whip',
      'so',
      'saves',
    ]));
    expect(awardKeys).toContain('cy_young');
  });

  it('retains NBA scoring and All-NBA awards', () => {
    const schema = getPlayerEditorSchema('nba');

    expect(schema.stats.map(field => field.key)).toContain('ppg');
    expect(schema.awards.map(field => field.key)).toContain('all_nba_1st');
  });

  it('uses the football schema for nfl and NBA for unknown sports', () => {
    expect(getPlayerEditorSchema('nfl')).toEqual(getPlayerEditorSchema('madden'));
    expect(getPlayerEditorSchema('unknown')).toEqual(getPlayerEditorSchema('nba'));
  });
});

describe('matchesPositionFilter', () => {
  it('allows every position when the filter is ALL', () => {
    expect(matchesPositionFilter('CB', 'ALL')).toBe(true);
  });

  it('does not match NFL center to cornerback', () => {
    expect(matchesPositionFilter('CB', 'C')).toBe(false);
    expect(matchesPositionFilter('C', 'C')).toBe(true);
  });

  it('does not match guard to left or right guard', () => {
    expect(matchesPositionFilter('LG', 'G')).toBe(false);
    expect(matchesPositionFilter('RG', 'G')).toBe(false);
    expect(matchesPositionFilter('G', 'G')).toBe(true);
  });
});
