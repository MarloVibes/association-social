export type SeededRandom = () => number;

export function createSeededRandom(seed: string): SeededRandom {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(random: SeededRandom, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function randomPick<T>(random: SeededRandom, values: readonly T[]): T {
  if (values.length === 0) throw new Error('Cannot pick from an empty list');
  return values[Math.floor(random() * values.length)];
}
