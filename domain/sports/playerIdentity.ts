import { getSportArchetypeForYear } from '@/constants/sportArchetype';
import type { NbaGrade } from '@/domain/nba/identity';
import { gradeFromNumeric, gradeRank } from '@/domain/nba/gradeScale';

type FranchiseSport = 'madden' | 'mlb';

export type SportScoutingItem = {
  key: string;
  label: string;
  grade: NbaGrade;
};

export type SportScoutingSection = {
  title: string;
  items: SportScoutingItem[];
};

export type SportPlayerIdentity = {
  primaryRole: string;
  secondaryRole: string;
  reputation: string;
  strengths: string[];
  weaknesses: string[];
};

function normalizeSport(sport?: string | null): FranchiseSport | null {
  if (sport === 'madden' || sport === 'nfl') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return null;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function valueFrom(player: any, keys: string[]): number | null {
  for (const key of keys) {
    const direct = numberFrom(player?.[key]);
    if (direct !== null) return direct;
    const rating = numberFrom(player?.ratings?.[key]);
    if (rating !== null) return rating;
    const hidden = numberFrom(player?.hidden?.[key]);
    if (hidden !== null) return hidden;
    const model = numberFrom(player?.attribute_model?.[key]);
    if (model !== null) return model;
  }
  return null;
}

function clamp(value: number, min = 40, max = 99) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function average(values: Array<number | null>, fallback: number) {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (usable.length === 0) return fallback;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function gradeItem(key: string, label: string, score: number): SportScoutingItem {
  return { key, label, grade: gradeFromNumeric(score) };
}

function scoreFromCount(value: number | null, scale: number, base = 58) {
  return value === null ? null : clamp(base + value / scale);
}

function inverseRate(value: number | null, elite: number, poor: number) {
  if (value === null || value <= 0) return null;
  const range = poor - elite;
  return clamp(96 - ((value - elite) / range) * 36);
}

function titleCase(value: string) {
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part
      .split('-')
      .map(piece => piece === 'qb' ? 'QB' : piece[0].toUpperCase() + piece.slice(1))
      .join('-'))
    .join(' ');
}

function pos(player: any) {
  return String(player?.position || '').toUpperCase();
}

function nflSections(player: any): SportScoutingSection[] {
  const position = pos(player);
  const passYards = valueFrom(player, ['passing_yards', 'passingYards']);
  const passTds = valueFrom(player, ['passing_tds', 'passingTds']);
  const interceptions = valueFrom(player, ['interceptions_thrown', 'interceptionsThrown']);
  const rushYards = valueFrom(player, ['rushing_yards', 'rushingYards']);
  const rushTds = valueFrom(player, ['rushing_tds', 'rushingTds']);
  const recYards = valueFrom(player, ['receiving_yards', 'receivingYards']);
  const receptions = valueFrom(player, ['receptions']);
  const recTds = valueFrom(player, ['receiving_tds', 'receivingTds']);
  const tackles = valueFrom(player, ['tackles']);
  const sacks = valueFrom(player, ['sacks']);
  const picks = valueFrom(player, ['interceptions']);
  const ff = valueFrom(player, ['forced_fumbles', 'forcedFumbles']);
  const potential = valueFrom(player, ['potential']);
  const speed = valueFrom(player, ['speed']);
  const strength = valueFrom(player, ['strength']);
  const technique = valueFrom(player, ['technique']);
  const awareness = valueFrom(player, ['awareness', 'decision', 'vision']);

  if (position === 'QB') {
    return [
      {
        title: 'Quarterback',
        items: [
          gradeItem('arm', 'Arm Talent', average([valueFrom(player, ['arm', 'throwPower']), scoreFromCount(passYards, 52, 56), scoreFromCount(passTds, 0.55, 56)], 70)),
          gradeItem('decision', 'Decision Making', average([awareness, interceptions === null ? null : clamp(88 - interceptions * 1.4)], 68)),
          gradeItem('mobility', 'Mobility', average([speed, scoreFromCount(rushYards, 14, 55), scoreFromCount(rushTds, 0.16, 55)], 64)),
        ],
      },
      {
        title: 'Tools',
        items: [
          gradeItem('athleticism', 'Athleticism', average([speed, scoreFromCount(rushYards, 18, 55)], 64)),
          gradeItem('poise', 'Poise', average([awareness, technique], 68)),
          gradeItem('potential', 'Potential', potential ?? average([awareness, speed], 68)),
        ],
      },
    ];
  }

  if (['HB', 'RB', 'FB'].includes(position)) {
    return [
      {
        title: 'Backfield',
        items: [
          gradeItem('rushing', 'Rushing', average([scoreFromCount(rushYards, 18, 58), strength, speed], 67)),
          gradeItem('receiving', 'Receiving', average([scoreFromCount(recYards, 12, 56), receptions === null ? null : clamp(58 + receptions / 1.6)], 62)),
          gradeItem('burst', 'Burst', average([speed, scoreFromCount(rushTds, 0.18, 56)], 65)),
        ],
      },
      { title: 'Profile', items: [gradeItem('power', 'Power', strength ?? 66), gradeItem('potential', 'Potential', potential ?? 66)] },
    ];
  }

  if (['WR', 'TE'].includes(position)) {
    return [
      {
        title: 'Receiving',
        items: [
          gradeItem('production', 'Production', average([scoreFromCount(recYards, 17, 58), scoreFromCount(recTds, 0.2, 56)], 65)),
          gradeItem('hands', 'Hands', average([valueFrom(player, ['hands', 'catching']), receptions === null ? null : clamp(58 + receptions / 1.5)], 65)),
          gradeItem('separation', 'Separation', average([speed, technique], 65)),
        ],
      },
      { title: 'Profile', items: [gradeItem('redZone', 'Red Zone', scoreFromCount(recTds, 0.18, 58) ?? 64), gradeItem('potential', 'Potential', potential ?? 66)] },
    ];
  }

  if (['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(position)) {
    return [
      {
        title: 'Blocking',
        items: [
          gradeItem('passBlock', 'Pass Block', average([valueFrom(player, ['pass_block', 'passBlock']), technique, strength], 68)),
          gradeItem('runBlock', 'Run Block', average([valueFrom(player, ['run_block', 'runBlock']), strength, technique], 68)),
          gradeItem('anchor', 'Anchor', average([strength, awareness], 67)),
        ],
      },
      { title: 'Profile', items: [gradeItem('technique', 'Technique', technique ?? 66), gradeItem('potential', 'Potential', potential ?? 66)] },
    ];
  }

  if (['DE', 'EDGE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'LOLB', 'ROLB'].includes(position)) {
    return [
      {
        title: 'Front Seven',
        items: [
          gradeItem('rush', 'Pass Rush', average([scoreFromCount(sacks, 0.22, 58), speed, strength], 66)),
          gradeItem('tackle', 'Tackling', average([scoreFromCount(tackles, 1.6, 57), strength, awareness], 66)),
          gradeItem('playmaking', 'Playmaking', average([scoreFromCount(ff, 0.09, 56), scoreFromCount(picks, 0.12, 56)], 62)),
        ],
      },
      { title: 'Profile', items: [gradeItem('motor', 'Motor', average([awareness, speed], 65)), gradeItem('potential', 'Potential', potential ?? 66)] },
    ];
  }

  return [
    {
      title: ['CB', 'FS', 'SS', 'S', 'DB'].includes(position) ? 'Coverage' : 'Special Teams',
      items: [
        gradeItem('coverage', 'Coverage', average([valueFrom(player, ['coverage', 'manCoverage', 'zoneCoverage']), picks === null ? null : clamp(58 + picks * 6), speed], 65)),
        gradeItem('tackling', 'Tackling', average([scoreFromCount(tackles, 1.8, 56), strength], 63)),
        gradeItem('playmaking', 'Playmaking', average([scoreFromCount(picks, 0.13, 56), scoreFromCount(ff, 0.09, 56)], 62)),
      ],
    },
    { title: 'Profile', items: [gradeItem('speed', 'Speed', speed ?? 64), gradeItem('potential', 'Potential', potential ?? 65)] },
  ];
}

function mlbSections(player: any): SportScoutingSection[] {
  const position = pos(player);
  const isPitcher = ['P', 'SP', 'RP', 'CP', 'LHP', 'RHP'].includes(position);
  const avgStat = valueFrom(player, ['avg', 'batting_avg']);
  const obp = valueFrom(player, ['obp']);
  const slg = valueFrom(player, ['slg']);
  const hr = valueFrom(player, ['hr', 'home_runs']);
  const rbi = valueFrom(player, ['rbi']);
  const sb = valueFrom(player, ['sb', 'stolen_bases']);
  const era = valueFrom(player, ['era']);
  const whip = valueFrom(player, ['whip']);
  const so = valueFrom(player, ['so', 'strikeouts']);
  const saves = valueFrom(player, ['saves', 'sv']);
  const wins = valueFrom(player, ['wins']);
  const potential = valueFrom(player, ['potential']);

  if (isPitcher) {
    return [
      {
        title: 'Pitching',
        items: [
          gradeItem('runPrevention', 'Run Prevention', average([inverseRate(era, 2.2, 5.4), valueFrom(player, ['pitching'])], 68)),
          gradeItem('strikeouts', 'Strikeouts', average([scoreFromCount(so, 6, 56), valueFrom(player, ['stuff'])], 65)),
          gradeItem('command', 'Command', average([inverseRate(whip, 0.95, 1.55), valueFrom(player, ['command'])], 66)),
        ],
      },
      {
        title: 'Profile',
        items: [
          gradeItem('leverage', 'Leverage', average([scoreFromCount(saves, 0.7, 58), scoreFromCount(wins, 1, 56)], 62)),
          gradeItem('stamina', 'Stamina', valueFrom(player, ['stamina']) ?? (position === 'SP' ? 72 : 60)),
          gradeItem('potential', 'Potential', potential ?? 66),
        ],
      },
    ];
  }

  return [
    {
      title: 'Hitting',
      items: [
        gradeItem('contact', 'Contact', average([avgStat === null ? null : clamp(avgStat * 300), valueFrom(player, ['contact'])], 65)),
        gradeItem('power', 'Power', average([scoreFromCount(hr, 0.45, 56), slg === null ? null : clamp(slg * 180), valueFrom(player, ['power'])], 64)),
        gradeItem('plate', 'Plate Discipline', average([obp === null ? null : clamp(obp * 240), valueFrom(player, ['discipline'])], 64)),
      ],
    },
    {
      title: 'Profile',
      items: [
        gradeItem('speed', 'Speed', average([scoreFromCount(sb, 0.5, 56), valueFrom(player, ['speed'])], 62)),
        gradeItem('defense', 'Defense', average([valueFrom(player, ['fielding']), valueFrom(player, ['arm'])], 64)),
        gradeItem('production', 'Run Production', average([scoreFromCount(rbi, 1.45, 56), scoreFromCount(hr, 0.5, 56)], 62)),
        gradeItem('potential', 'Potential', potential ?? 66),
      ],
    },
  ];
}

export function buildSportScoutingSections(player: any, sport?: string | null): SportScoutingSection[] {
  const normalized = normalizeSport(sport);
  if (normalized === 'madden') return nflSections(player);
  if (normalized === 'mlb') return mlbSections(player);
  return [];
}

function allItems(sections: SportScoutingSection[]) {
  return sections.flatMap(section => section.items);
}

function topLabels(items: SportScoutingItem[], count: number) {
  return [...items]
    .sort((left, right) => gradeRank(right.grade) - gradeRank(left.grade) || left.label.localeCompare(right.label))
    .slice(0, count)
    .map(item => item.label);
}

function bottomLabels(items: SportScoutingItem[], count: number) {
  return [...items]
    .sort((left, right) => gradeRank(left.grade) - gradeRank(right.grade) || left.label.localeCompare(right.label))
    .slice(0, count)
    .map(item => item.label);
}

function reputationFrom(items: SportScoutingItem[]) {
  const ordered = [...items].sort((left, right) => gradeRank(right.grade) - gradeRank(left.grade));
  const top = ordered[0]?.grade || 'C';
  if (gradeRank(top) >= gradeRank('A+')) return 'Franchise Cornerstone';
  if (gradeRank(top) >= gradeRank('A-')) return 'Star-Level Contributor';
  if (gradeRank(top) >= gradeRank('B')) return 'High-impact Starter';
  if (gradeRank(top) >= gradeRank('C')) return 'Rotation Contributor';
  return 'Depth Piece';
}

export function buildSportPlayerIdentity(player: any, sport?: string | null): SportPlayerIdentity | null {
  const normalized = normalizeSport(sport);
  if (!normalized) return null;
  const sections = buildSportScoutingSections(player, normalized);
  const items = allItems(sections);
  const archetype = getSportArchetypeForYear(player, null, undefined, normalized);
  const primaryRole = titleCase(archetype.label);
  const position = pos(player);
  const secondaryRole = normalized === 'madden'
    ? `NFL ${position || 'Player'}`
    : `MLB ${position || 'Player'}`;
  return {
    primaryRole,
    secondaryRole,
    reputation: reputationFrom(items),
    strengths: topLabels(items, 3),
    weaknesses: bottomLabels(items, 2),
  };
}

export function buildSportGradePreview(player: any, sport?: string | null, count = 3): SportScoutingItem[] {
  return allItems(buildSportScoutingSections(player, sport))
    .sort((left, right) => gradeRank(right.grade) - gradeRank(left.grade) || left.label.localeCompare(right.label))
    .slice(0, count);
}
