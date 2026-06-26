import { buildEvaluationLayers } from './evaluation';

export type EraAuditPlayer = Record<string, any>;

export type EraAuditResult = {
  playerName: string;
  team: string;
  position: string;
  coreRole: boolean;
  suggestedArchetype: string;
  reviewReasons: string[];
  visibleSummary: {
    overallTalent: string;
    currentForm: string;
    potential: string;
  };
};

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stat(player: EraAuditPlayer, keys: string[]) {
  for (const key of keys) {
    const value = player?.[key] ?? player?.seasonStats?.[key];
    if (value !== undefined && value !== null && value !== '') return numberFrom(value);
  }
  return 0;
}

function hidden(player: EraAuditPlayer, key: string) {
  return numberFrom(player?.hidden?.[key] ?? player?.[key]);
}

function archetypeFor(player: EraAuditPlayer) {
  const defense = hidden(player, 'defense');
  const iq = hidden(player, 'basketballIq');
  const stamina = hidden(player, 'stamina');
  const shooting = hidden(player, 'shooting') || hidden(player, 'threePoint');
  const playmaking = hidden(player, 'playmaking') || hidden(player, 'passing');
  const rebounding = hidden(player, 'rebounding');
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  if ((defense >= 82 || iq >= 84) && ppg >= 12) return 'Two-Way Core Wing';
  if (shooting >= 86 && ppg >= 14) return 'Primary Scorer';
  if (playmaking >= 86) return 'Lead Creator';
  if (defense >= 84 && rebounding >= 80) return 'Defensive Anchor';
  if (stamina >= 88 && defense >= 78) return 'High-Minute Connector';
  return 'Rotation Player';
}

export function auditEraPlayer(player: EraAuditPlayer): EraAuditResult {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const defense = hidden(player, 'defense');
  const iq = hidden(player, 'basketballIq');
  const stamina = hidden(player, 'stamina');
  const coreRole = minutes >= 32 || (minutes >= 28 && ppg + rpg + apg >= 20) || (defense >= 84 && stamina >= 86);
  const reviewReasons: string[] = [];
  if (minutes >= 32) reviewReasons.push(`${minutes} MPG workload`);
  if (defense >= 84) reviewReasons.push('high defensive grade signal');
  if (iq >= 82) reviewReasons.push('strong basketball IQ signal');
  if (stamina >= 88) reviewReasons.push('high stamina/core-minute signal');
  if (ppg >= 14 && defense >= 80) reviewReasons.push('two-way production profile');
  if (coreRole && reviewReasons.length === 0) reviewReasons.push('core rotation profile');
  const layers = buildEvaluationLayers(player);

  return {
    playerName: String(player.full_name || player.name || 'Unknown Player'),
    team: String(player.team || player.teamAbbr || ''),
    position: String(player.position || ''),
    coreRole,
    suggestedArchetype: archetypeFor(player),
    reviewReasons,
    visibleSummary: {
      overallTalent: `${layers.overallTalent.grade} ${layers.overallTalent.tier}`,
      currentForm: `${layers.currentForm.grade} ${layers.currentForm.tier}`,
      potential: `${layers.potential.grade} ${layers.potential.tier}`,
    },
  };
}

export function buildEraAuditReport(era: string, players: EraAuditPlayer[]) {
  const results = players
    .map(auditEraPlayer)
    .sort((left, right) => Number(right.coreRole) - Number(left.coreRole) || left.playerName.localeCompare(right.playerName));
  const rows = results.map(result => [
    result.playerName,
    result.team || '-',
    result.position || '-',
    result.coreRole ? 'Yes' : 'No',
    result.suggestedArchetype,
    result.visibleSummary.overallTalent,
    result.visibleSummary.currentForm,
    result.visibleSummary.potential,
    result.reviewReasons.join('; ') || '-',
  ]);
  return [
    '# NBA Era Grade Audit',
    '',
    `Era: ${era}`,
    '',
    'This report is read-only. Review suggested player roles before applying any vault updates.',
    '',
    '| Player | Team | Pos | Core Role | Suggested Archetype | Talent | Form | Potential | Reasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}
