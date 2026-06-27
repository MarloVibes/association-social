import type { NbaGrade } from './identity';

export const GRADE_ORDER: NbaGrade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function gradeFromNumeric(value: unknown): NbaGrade {
  const rating = Math.round(clamp(numberFrom(value), 0, 100));
  if (rating >= 99) return 'S';
  if (rating >= 95) return 'A+';
  if (rating >= 92) return 'A';
  if (rating >= 89) return 'A-';
  if (rating >= 85) return 'B+';
  if (rating >= 80) return 'B';
  if (rating >= 75) return 'B-';
  if (rating >= 70) return 'C+';
  if (rating >= 65) return 'C';
  if (rating >= 60) return 'C-';
  if (rating >= 50) return 'D';
  return 'F';
}

export function gradeRank(grade: NbaGrade): number {
  return Math.max(0, GRADE_ORDER.indexOf(grade));
}
