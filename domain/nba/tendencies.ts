import type { PublicStatLine } from './attributeModel';

export type PlayerTendencies = {
  paintAttack: number;
  rimFinishFrequency: number;
  dunkFrequency: number;
  drawFoulPressure: number;
  midRangeFrequency: number;
  threePointFrequency: number;
  catchAndShootFrequency: number;
  pullUpFrequency: number;
  postTouchFrequency: number;
  transitionFrequency: number;
  passFirst: number;
  isolationFrequency: number;
  pickAndRollBallHandler: number;
  pickAndRollRollMan: number;
  defensivePlaymaking: number;
  foulRisk: number;
  reboundCrash: number;
};

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min = 25, max = 99): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function rate(value: unknown, fallback = 0): number {
  const numeric = numberFrom(value, fallback);
  return numeric > 1 ? numeric / 100 : numeric;
}

function position(source: Pick<Partial<PublicStatLine>, 'position'>): string {
  return String(source.position || '').toUpperCase();
}

function isGuard(source: Pick<Partial<PublicStatLine>, 'position'>): boolean {
  return ['PG', 'SG', 'G'].some(value => position(source).includes(value));
}

function isBig(source: Pick<Partial<PublicStatLine>, 'position'>): boolean {
  return ['PF', 'C'].some(value => position(source).includes(value));
}

function hasTag(source: Partial<PublicStatLine>, tag: string): boolean {
  return (source.scoutingTags || []).some(value => String(value).toLowerCase() === tag.toLowerCase());
}

function tag(source: Partial<PublicStatLine>, name: string, value: number): number {
  return hasTag(source, name) ? value : 0;
}

export function buildPlayerTendencies(source: Partial<PublicStatLine>): PlayerTendencies {
  const guard = isGuard(source);
  const big = isBig(source);
  const usage = numberFrom(source.usagePct, 18);
  const apg = numberFrom(source.assistsPerGame);
  const rpg = numberFrom(source.reboundsPerGame);
  const spg = numberFrom(source.stealsPerGame);
  const bpg = numberFrom(source.blocksPerGame);
  const fta = numberFrom(source.freeThrowAttemptsPerGame);
  const threeAttempts = numberFrom(source.threePointAttemptsPerGame);
  const assistPct = numberFrom(source.assistPct, apg * 6);
  const turnoverPct = numberFrom(source.turnoverPct, 12);
  const rimRate = rate(source.rimAttemptRate, big ? 0.38 : guard ? 0.24 : 0.2);
  const dunkRate = rate(source.dunkRate, big ? 0.12 : 0.04);
  const driveRate = rate(source.driveRate, guard ? 0.22 : 0.12);
  const transitionRate = rate(source.transitionRate, guard ? 0.14 : 0.1);
  const threeRate = rate(source.threePointAttemptRate, threeAttempts >= 5 ? 0.48 : 0.22);
  const catchShoot = rate(source.catchAndShootRate, threeAttempts >= 5 ? 0.44 : 0.2);
  const pullUp = rate(source.pullUpRate, guard && usage >= 24 ? 0.34 : 0.16);
  const postRate = rate(source.postTouchRate, big ? 0.24 : 0.05);
  const orebPct = numberFrom(source.offensiveReboundPct, big ? 9 : 3);
  const drebPct = numberFrom(source.defensiveReboundPct, big ? 18 : 9);

  return {
    paintAttack: clamp(38 + rimRate * 64 + driveRate * 58 + fta * 2.4 + usage * 0.28 + tag(source, 'elite_rim_pressure', 10)),
    rimFinishFrequency: clamp(45 + rimRate * 76 + fta * 2 + dunkRate * 35 + tag(source, 'elite_rim_pressure', 7)),
    dunkFrequency: clamp(35 + dunkRate * 220 + (big ? 8 : 0) + tag(source, 'elite_burst', 6)),
    drawFoulPressure: clamp(42 + fta * 5.2 + rimRate * 42 + driveRate * 36),
    midRangeFrequency: clamp(42 + numberFrom(source.midRangeAttemptRate, 0.16) * 80 + usage * 0.5 + pullUp * 20),
    threePointFrequency: clamp(38 + threeRate * 66 + threeAttempts * 4.4 + tag(source, 'spot_up_shooter', 7)),
    catchAndShootFrequency: clamp(36 + catchShoot * 76 + threeAttempts * 3.6 + tag(source, 'spot_up_shooter', 8)),
    pullUpFrequency: clamp(38 + pullUp * 82 + usage * 0.75 + (guard ? 5 : 0)),
    postTouchFrequency: clamp(32 + postRate * 105 + (big ? 16 : -4) + tag(source, 'interior_anchor', 5)),
    transitionFrequency: clamp(40 + transitionRate * 95 + driveRate * 30 + (guard ? 5 : 0) + tag(source, 'elite_burst', 8)),
    passFirst: clamp(36 + apg * 5.2 + assistPct * 0.75 - usage * 0.45),
    isolationFrequency: clamp(36 + usage * 1.4 + pullUp * 35 + driveRate * 28 - apg * 0.6 + tag(source, 'high_usage_creator', 6)),
    pickAndRollBallHandler: clamp(40 + (guard ? 12 : 0) + apg * 4.2 + usage * 0.8 + driveRate * 36 + tag(source, 'high_usage_creator', 5)),
    pickAndRollRollMan: clamp(36 + (big ? 16 : 0) + rimRate * 54 + dunkRate * 70 + orebPct * 0.8),
    defensivePlaymaking: clamp(42 + spg * 11 + bpg * 11 + tag(source, 'interior_anchor', 9)),
    foulRisk: clamp(38 + bpg * 6 + spg * 2.5 + Math.max(0, turnoverPct - 12) * 1.4 + (big ? 6 : 0)),
    reboundCrash: clamp(36 + rpg * 3.8 + orebPct * 1.6 + drebPct * 1.2 + (big ? 8 : 0)),
  };
}
