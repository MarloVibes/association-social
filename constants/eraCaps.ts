// Per-era NBA salary caps, anchored to each era's representative season.
// These mirror how NBA 2K's MyNBA Eras scales the cap economy per era, so
// salaries and trade-matching stay proportional within the era you're playing.
// Figures are the real league salary cap for the era's anchor season (approx).
export const ERA_CAPS: Record<string, number> = {
  magic_bird: 3_600_000,    // 1984-85
  jordan: 12_500_000,       // 1991-92
  kobe: 40_271_000,         // 2002-03
  lebron: 58_044_000,       // 2010-11
  steph: 94_143_000,        // 2016-17
  current: 154_647_000,     // 2025-26
};

// Era-appropriate minimum salary (rough), used as a floor when scaling.
export const ERA_MIN_SALARY: Record<string, number> = {
  magic_bird: 75_000,
  jordan: 150_000,
  kobe: 366_000,
  lebron: 473_000,
  steph: 543_000,
  current: 1_272_870,
};

export function getEraCap(era?: string | null): number {
  return (era && ERA_CAPS[era]) || ERA_CAPS.current;
}

export function getEraMin(era?: string | null): number {
  return (era && ERA_MIN_SALARY[era]) || ERA_MIN_SALARY.current;
}
