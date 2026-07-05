import type { NbaGrade } from './identity';

export const DEVELOPMENT_ASSIGNMENT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const NBA_MINIMUM_CONTRACT_CUTOFF = 1_300_000;

const GRADE_LADDER: NbaGrade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const GRADE_NUMERIC_FLOOR: Record<NbaGrade, number> = {
  F: 0,
  'D-': 50,
  D: 53,
  'D+': 57,
  'C-': 60,
  C: 65,
  'C+': 70,
  'B-': 75,
  B: 80,
  'B+': 85,
  'A-': 89,
  A: 92,
  'A+': 95,
  S: 99,
};

export type DevelopmentAssignmentStatus = 'active' | 'completed' | 'cancelled';

export type DevelopmentAssignment = {
  playerId: string;
  playerName?: string;
  gradeKey: string;
  gradeLabel?: string;
  fromGrade?: NbaGrade;
  toGrade?: NbaGrade;
  status: DevelopmentAssignmentStatus;
  startedAtMs: number;
  completesAtMs: number;
  completedAtMs?: number;
};

export type DevelopmentPlayer = {
  id?: string;
  player_id?: string;
  playerId?: string;
  full_name?: string;
  name?: string;
  salary?: number;
  contractType?: string;
  contract_type?: string;
  rosterSlot?: string;
  roster_slot?: string;
  status?: string;
  grades?: Record<string, NbaGrade>;
  abilityGrades?: Record<string, NbaGrade>;
  skill_grades?: Record<string, unknown>;
  category_skill_grades?: Record<string, unknown>;
  attribute_model?: Record<string, unknown>;
  era_adjusted_profiles?: Record<string, unknown>;
  hidden?: Record<string, unknown>;
  visible?: { grades?: Record<string, NbaGrade>; [key: string]: unknown };
};

export type DevelopmentTeam = {
  id?: string;
  players?: DevelopmentPlayer[];
  developmentAssignment?: DevelopmentAssignment | null;
};

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function numberFrom(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function developmentPlayerId(player: DevelopmentPlayer) {
  return String(player.id || player.player_id || player.playerId || player.full_name || player.name || '');
}

export function developmentPlayerName(player: DevelopmentPlayer) {
  return player.full_name || player.name || 'Player';
}

export function isDevelopmentEligiblePlayer(player: DevelopmentPlayer) {
  const labels = [
    player.contractType,
    player.contract_type,
    player.rosterSlot,
    player.roster_slot,
    player.status,
  ].map(normalized).filter(Boolean);
  if (labels.some(label => label.includes('two') && label.includes('way'))) return true;
  if (labels.some(label => label.includes('minimum') || label === 'min')) return true;
  const salary = numberFrom(player.salary);
  return salary > 0 && salary <= NBA_MINIMUM_CONTRACT_CUTOFF;
}

export function isAssignmentActive(assignment: DevelopmentAssignment | null | undefined, nowMs: number) {
  if (!assignment || assignment.status !== 'active') return false;
  return numberFrom(assignment.completesAtMs) > nowMs;
}

export function hasOpenDevelopmentAssignment(assignment: DevelopmentAssignment | null | undefined) {
  return Boolean(assignment && assignment.status === 'active');
}

function gradeFromEntry(entry: unknown): NbaGrade | null {
  if (typeof entry === 'string' && GRADE_LADDER.includes(entry as NbaGrade)) return entry as NbaGrade;
  if (entry && typeof entry === 'object') {
    const grade = (entry as { grade?: unknown; value?: unknown }).grade || (entry as { value?: unknown }).value;
    if (typeof grade === 'string' && GRADE_LADDER.includes(grade as NbaGrade)) return grade as NbaGrade;
  }
  return null;
}

function playerGrade(player: DevelopmentPlayer, gradeKey: string): NbaGrade | null {
  const sources = [
    player.skill_grades,
    player.category_skill_grades,
    player.grades,
    player.abilityGrades,
    player.visible?.grades,
  ].filter(Boolean);
  for (const source of sources) {
    const grade = gradeFromEntry((source as Record<string, unknown>)[gradeKey]);
    if (grade) return grade;
  }
  return null;
}

export function advanceDevelopmentGrade(grade: NbaGrade, levels = 2): NbaGrade {
  const index = GRADE_LADDER.indexOf(grade);
  if (index < 0) return grade;
  return GRADE_LADDER[Math.min(index + levels, GRADE_LADDER.length - 1)];
}

function syncedRatingSource(source: unknown, gradeKey: string, grade: NbaGrade, rating: number) {
  if (!source || typeof source !== 'object') return source;
  const record = source as Record<string, unknown>;
  const current = record[gradeKey];
  const nextValue = current && typeof current === 'object'
    ? { ...(current as Record<string, unknown>), grade, rating }
    : typeof current === 'number'
      ? rating
      : grade;
  return {
    ...record,
    [gradeKey]: nextValue,
  };
}

function applyGradeToPlayer(player: DevelopmentPlayer, gradeKey: string, grade: NbaGrade): DevelopmentPlayer {
  const rating = GRADE_NUMERIC_FLOOR[grade];
  const nextHidden = player.hidden && typeof player.hidden === 'object'
    ? {
      ...player.hidden,
      [gradeKey]: Math.max(numberFrom(player.hidden[gradeKey]), rating),
    }
    : player.hidden;
  const nextVisible = player.visible && typeof player.visible === 'object'
    ? {
      ...player.visible,
      grades: {
        ...(player.visible.grades || {}),
        [gradeKey]: grade,
      },
    }
    : player.visible;
  return {
    ...player,
    grades: player.grades ? { ...player.grades, [gradeKey]: grade } : player.grades,
    abilityGrades: player.abilityGrades ? { ...player.abilityGrades, [gradeKey]: grade } : player.abilityGrades,
    skill_grades: syncedRatingSource(player.skill_grades, gradeKey, grade, rating) as Record<string, unknown> | undefined,
    category_skill_grades: syncedRatingSource(player.category_skill_grades, gradeKey, grade, rating) as Record<string, unknown> | undefined,
    attribute_model: syncedRatingSource(player.attribute_model, gradeKey, grade, rating) as Record<string, unknown> | undefined,
    era_adjusted_profiles: syncedRatingSource(player.era_adjusted_profiles, gradeKey, grade, rating) as Record<string, unknown> | undefined,
    hidden: nextHidden,
    visible: nextVisible,
  };
}

export function startDevelopmentAssignment({
  team,
  playerId,
  gradeKey,
  gradeLabel,
  nowMs,
}: {
  team: DevelopmentTeam;
  playerId: string;
  gradeKey: string;
  gradeLabel?: string;
  nowMs: number;
}): { valid: boolean; errors: string[]; assignment?: DevelopmentAssignment } {
  const errors: string[] = [];
  if (hasOpenDevelopmentAssignment(team.developmentAssignment)) errors.push('assignment_active');
  const player = (team.players || []).find(item => developmentPlayerId(item) === playerId);
  if (!player) errors.push('player_missing');
  if (player && !isDevelopmentEligiblePlayer(player)) errors.push('player_not_eligible');
  const currentGrade = player ? playerGrade(player, gradeKey) : null;
  if (!gradeKey || !currentGrade) errors.push('grade_missing');
  if (errors.length > 0) return { valid: false, errors };

  const toGrade = advanceDevelopmentGrade(currentGrade as NbaGrade, 2);
  if (toGrade === currentGrade) return { valid: false, errors: ['grade_maxed'] };
  return {
    valid: true,
    errors: [],
    assignment: {
      playerId,
      playerName: developmentPlayerName(player as DevelopmentPlayer),
      gradeKey,
      gradeLabel,
      fromGrade: currentGrade as NbaGrade,
      toGrade,
      status: 'active',
      startedAtMs: nowMs,
      completesAtMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS,
    },
  };
}

export function completeDevelopmentAssignment({
  team,
  nowMs,
}: {
  team: DevelopmentTeam;
  nowMs: number;
}): { valid: boolean; errors: string[]; players: DevelopmentPlayer[]; assignment?: DevelopmentAssignment } {
  const assignment = team.developmentAssignment;
  const players = team.players || [];
  if (!assignment || assignment.status !== 'active') return { valid: false, errors: ['assignment_missing'], players };
  if (numberFrom(assignment.completesAtMs) > nowMs) return { valid: false, errors: ['assignment_not_ready'], players, assignment };
  const index = players.findIndex(player => developmentPlayerId(player) === assignment.playerId);
  if (index < 0) return { valid: false, errors: ['player_missing'], players, assignment };
  const currentGrade = playerGrade(players[index], assignment.gradeKey) || assignment.fromGrade;
  if (!currentGrade) return { valid: false, errors: ['grade_missing'], players, assignment };
  const toGrade = assignment.toGrade || advanceDevelopmentGrade(currentGrade, 2);
  const nextPlayers = [...players];
  nextPlayers[index] = applyGradeToPlayer(nextPlayers[index], assignment.gradeKey, toGrade);
  return {
    valid: true,
    errors: [],
    players: nextPlayers,
    assignment: {
      ...assignment,
      fromGrade: assignment.fromGrade || currentGrade,
      toGrade,
      status: 'completed',
      completedAtMs: nowMs,
    },
  };
}
