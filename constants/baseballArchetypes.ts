// Baseball (MLB The Show) archetype engine — the playstyle.ts equivalent for MLB.
// Returns the same { label, color } shape. Uses stats when present; otherwise
// falls back to a position role. Pitchers branch first, then hitters by stat,
// then position role.

import type { Archetype } from './footballArchetypes';

const C = {
  elite: '#FFD700',
  star: '#FFA500',
  contact: '#00ccff',
  power: '#ff6644',
  speed: '#00ff87',
  reliever: '#44ffaa',
  closer: '#ff4444',
  field: '#aa88ff',
  role: '#888888',
};

export function getBaseballArchetype(player: any): Archetype {
  const pos = (player?.position || '').toUpperCase();
  const hr = parseFloat(player?.home_runs ?? player?.hr) || 0;
  const avg = parseFloat(player?.avg ?? player?.batting_avg) || 0;
  const sb = parseFloat(player?.sb ?? player?.stolen_bases) || 0;
  const era = parseFloat(player?.era) || 0;
  const saves = parseFloat(player?.saves ?? player?.sv) || 0;
  const so = parseFloat(player?.so ?? player?.strikeouts) || 0;

  // Pitchers
  if (pos === 'P' || pos === 'SP' || pos === 'RP' || pos === 'LHP' || pos === 'RHP') {
    if (saves >= 20) return { label: 'CLOSER', color: C.closer };
    if (era > 0 && era <= 3.0) return { label: 'ACE', color: C.elite };
    if (so >= 180) return { label: 'STRIKEOUT ARTIST', color: C.contact };
    if (pos === 'RP') return { label: 'RELIEVER', color: C.reliever };
    return { label: 'PITCHER', color: C.star };
  }

  // Hitters — stat-driven upgrades first
  if (hr >= 35) return { label: 'POWER HITTER', color: C.elite };
  if (avg >= 0.300) return { label: 'CONTACT HITTER', color: C.star };
  if (sb >= 25) return { label: 'SPEEDSTER', color: C.speed };

  // Position roles (fallback when no stats yet)
  if (pos === 'C') return { label: 'BACKSTOP', color: C.field };
  if (pos === '1B') return { label: 'FIRST BASEMAN', color: C.power };
  if (pos === '2B') return { label: 'SECOND BASEMAN', color: C.contact };
  if (pos === '3B') return { label: 'HOT CORNER', color: C.power };
  if (pos === 'SS') return { label: 'SHORTSTOP', color: C.contact };
  if (['LF', 'CF', 'RF', 'OF'].includes(pos)) return { label: 'OUTFIELDER', color: C.reliever };
  if (pos === 'DH') return { label: 'DESIGNATED HITTER', color: C.star };
  if (pos === 'IF') return { label: 'INFIELDER', color: C.contact };
  if (['UT', 'UTIL'].includes(pos)) return { label: 'UTILITY', color: C.role };
  if (pos === 'TWP') return { label: 'TWO-WAY PLAYER', color: C.elite };
  return { label: 'ROLE PLAYER', color: C.role };
}
