// One entry point for player labels across all sports. PlayerCard / rosters call
// this with the league's sport; basketball keeps its existing era-aware playstyle
// engine, football/baseball use their archetype engines. All return { label, color }.

import { getPlaystyle, getPlaystyleForYear } from './playstyle';
import { getFootballArchetype, type Archetype } from './footballArchetypes';
import { getBaseballArchetype } from './baseballArchetypes';

export function getSportArchetype(player: any, sport?: string, eraKey?: string): Archetype {
  if (sport === 'madden') return getFootballArchetype(player);
  if (sport === 'mlb') return getBaseballArchetype(player);
  return getPlaystyle(player, eraKey); // nba default
}

// Year-aware variant for sports that have season history (NBA). Football/baseball
// have no era system, so they ignore the year args and use current archetype.
export function getSportArchetypeForYear(
  player: any, profile: any, currentYear: number | undefined, sport?: string
): Archetype {
  if (sport === 'madden') return getFootballArchetype(player);
  if (sport === 'mlb') return getBaseballArchetype(player);
  return getPlaystyleForYear(player, profile, currentYear);
}
