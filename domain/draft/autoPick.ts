type AutoPickProspect = {
  id?: string;
  player_id?: string;
  position: string;
  talent?: number;
  projectedRound?: number;
  potential?: number;
  ratings?: Record<string, number>;
};

type AutoPickInput<T extends AutoPickProspect> = {
  sport?: string | null;
  needs: Record<string, number>;
  prospects: T[];
  selectedIds?: string[];
};

function prospectId(prospect: AutoPickProspect): string {
  return String(prospect.id || prospect.player_id || '');
}

export function prospectTalent(prospect: AutoPickProspect): number {
  if (Number.isFinite(prospect.talent)) return Number(prospect.talent);
  const ratings = Object.values(prospect.ratings || {}).filter(Number.isFinite);
  const ratingAverage = ratings.length > 0
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
    : 60;
  const potential = Number.isFinite(prospect.potential) ? Number(prospect.potential) : ratingAverage;
  const roundBonus = Number.isFinite(prospect.projectedRound)
    ? Math.max(0, 8 - Number(prospect.projectedRound)) * 0.75
    : 0;
  return ratingAverage * 0.65 + potential * 0.35 + roundBonus;
}

export function chooseAutoPick<T extends AutoPickProspect>(input: AutoPickInput<T>): T {
  const selected = new Set((input.selectedIds || []).map(String));
  const remaining = input.prospects.filter(prospect => {
    const id = prospectId(prospect);
    return id && !selected.has(id);
  });
  if (remaining.length === 0) throw new Error('No draft prospects remain');

  return [...remaining].sort((left, right) => {
    const leftNeed = Math.max(0, Math.min(1, input.needs[left.position] || 0));
    const rightNeed = Math.max(0, Math.min(1, input.needs[right.position] || 0));
    const leftScore = prospectTalent(left) + leftNeed * 8;
    const rightScore = prospectTalent(right) + rightNeed * 8;
    return rightScore - leftScore
      || prospectTalent(right) - prospectTalent(left)
      || prospectId(left).localeCompare(prospectId(right));
  })[0];
}
