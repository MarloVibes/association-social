// Football archetype engine — the playstyle.ts equivalent for NFL.
// Returns the same { label, color } shape basketball uses, so PlayerCard can
// render it unchanged. Uses stats when present; falls back to position role.

export interface Archetype { label: string; color: string; }

const C = {
  elite: '#FFD700',    // gold
  star: '#FFA500',     // orange
  skill: '#00ccff',    // cyan
  power: '#ff6644',    // red-orange
  defense: '#ff4444',  // red
  trench: '#aa88ff',   // purple
  special: '#44ffaa',  // mint
  role: '#888888',     // grey
};

export function getFootballArchetype(player: any): Archetype {
  const pos = (player?.position || '').toUpperCase();
  // Stat-driven upgrades (only fire when the pool has been enriched with stats).
  const passYds = parseFloat(player?.passing_yards) || 0;
  const passTds = parseFloat(player?.passing_tds) || 0;
  const rushYds = parseFloat(player?.rushing_yards) || 0;
  const recYds = parseFloat(player?.receiving_yards) || 0;
  const sacks = parseFloat(player?.sacks) || 0;

  // Quarterbacks
  if (pos === 'QB') {
    if (rushYds >= 500) return { label: 'DUAL-THREAT QB', color: C.elite };
    if (passYds >= 4000 || passTds >= 30) return { label: 'GUNSLINGER', color: C.elite };
    if (passYds > 0) return { label: 'POCKET PASSER', color: C.star };
    return { label: 'QUARTERBACK', color: C.star };
  }
  // Backs
  if (pos === 'RB' || pos === 'HB') {
    if (rushYds >= 1200) return { label: 'BELL COW', color: C.elite };
    if (recYds >= 400) return { label: 'RECEIVING BACK', color: C.skill };
    if (rushYds > 0) return { label: 'WORKHORSE', color: C.star };
    return { label: 'RUNNING BACK', color: C.skill };
  }
  if (pos === 'FB') return { label: 'FULLBACK', color: C.trench };
  // Receivers
  if (pos === 'WR') {
    if (recYds >= 1200) return { label: 'WR1', color: C.elite };
    if (recYds >= 700) return { label: 'DEEP THREAT', color: C.skill };
    return { label: 'WIDE RECEIVER', color: C.skill };
  }
  if (pos === 'TE') {
    if (recYds >= 700) return { label: 'RED ZONE THREAT', color: C.star };
    return { label: 'TIGHT END', color: C.skill };
  }
  // Offensive line
  if (['T', 'G', 'C', 'OT', 'OG', 'OL', 'LT', 'RT', 'LG', 'RG'].includes(pos)) {
    return { label: 'TRENCH ANCHOR', color: C.trench };
  }
  // Defensive line / edge
  if (['DE', 'EDGE'].includes(pos)) {
    if (sacks >= 10) return { label: 'ELITE PASS RUSHER', color: C.elite };
    return { label: 'EDGE RUSHER', color: C.power };
  }
  if (['DT', 'NT', 'DL'].includes(pos)) return { label: 'RUN STUFFER', color: C.power };
  // Linebackers
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(pos)) {
    if (sacks >= 8) return { label: 'BLITZER', color: C.power };
    return { label: 'TACKLING MACHINE', color: C.defense };
  }
  // Secondary
  if (pos === 'CB') return { label: 'SHUTDOWN CORNER', color: C.defense };
  if (['S', 'FS', 'SS', 'DB'].includes(pos)) return { label: 'BALL HAWK', color: C.defense };
  // Special teams
  if (pos === 'K') return { label: 'KICKER', color: C.special };
  if (pos === 'P') return { label: 'PUNTER', color: C.special };
  if (pos === 'LS') return { label: 'LONG SNAPPER', color: C.role };
  return { label: 'ROLE PLAYER', color: C.role };
}
