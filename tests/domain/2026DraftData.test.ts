import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DraftPick = {
  pick: number;
  round: number;
  draftedBy: string;
  rightsTeam: string;
  name: string;
  school: string;
};

describe('2026 NBA Draft data', () => {
  it('keeps all 60 official draft picks ready for seeding', () => {
    const raw = readFileSync(resolve(process.cwd(), 'data/nba-draft-2026.json'), 'utf8');
    const draft = JSON.parse(raw) as { year: number; source: string; players: DraftPick[] };
    const picks = draft.players.map(player => player.pick);

    expect(draft.year).toBe(2026);
    expect(draft.source).toBe('https://www.nba.com/news/2026-nba-draft-order');
    expect(draft.players).toHaveLength(60);
    expect(new Set(picks).size).toBe(60);
    expect(Math.min(...picks)).toBe(1);
    expect(Math.max(...picks)).toBe(60);
    expect(draft.players.every(player => player.name && player.draftedBy && player.rightsTeam && player.school)).toBe(true);
    expect(draft.players.filter(player => player.round === 1)).toHaveLength(30);
    expect(draft.players.filter(player => player.round === 2)).toHaveLength(30);
  });

  it('seeds the 2026 class into both draft classes and the player vault', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/seed-2026-draft-class.mjs'), 'utf8');

    expect(source).toContain("doc(db, 'draft_classes', String(draft.year))");
    expect(source).toContain("doc(db, 'players', player.player_id)");
    expect(source).toContain('vaultPlayers');
    expect(source).toContain('player.position ||');
    expect(source).toContain('player.height ||');
    expect(source).toContain('player.headshotUrl ||');
    expect(source).not.toContain("position: '',");
    expect(source).not.toContain("birth_date: '',");
  });
});
