import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildLocalEraAuditReport,
  buildLocalEraAuditPlayers,
  normalizeName,
  parseCsv,
  parseEraRosters,
} from '../../scripts/lib/local-era-audit.mjs';

describe('local NBA era audit data builder', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('id,name\n1,"Smith, Jr."\n')).toEqual([
      ['id', 'name'],
      ['1', 'Smith, Jr.'],
    ]);
  });

  it('enriches seeded era players with local profile and salary evidence', () => {
    const rosterSource = `
      const ERA_LEBRON = {
        era: 'lebron',
        season: '2010-11',
        teams: [
          { id: 'chi_2011', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
            players: [
              p('l_chi_2', 'Luol', 'Deng', 'SF', '9', 'CHI'),
            ]
          },
        ]
      };
    `;
    const playersCsv = [
      'index,_id,career_AST,career_PER,career_PTS,career_TRB,career_WS,name,position',
      '1,denglu01,2.3,15.4,14.8,6.1,74.0,Luol Deng,SF',
    ].join('\n');
    const salariesCsv = [
      'player_id,salary,season,season_end,team',
      'denglu01,11345000,2010-11,2011,CHI',
    ].join('\n');

    const rosters = parseEraRosters(rosterSource);
    const players = buildLocalEraAuditPlayers({
      era: 'lebron',
      seasonStartYear: 2010,
      rosters,
      playersCsv,
      salariesCsv,
    });

    expect(players).toEqual([
      expect.objectContaining({
        full_name: 'Luol Deng',
        team: 'CHI',
        position: 'SF',
        salary: 11345000,
        career_WS: 74,
        career_PER: 15.4,
        ppg: 14.8,
        rpg: 6.1,
        apg: 2.3,
      }),
    ]);
  });

  it('matches known NBA name aliases used across era roster and profile sources', () => {
    const rosterSource = `
      const ERA_LEBRON = {
        era: 'lebron',
        season: '2010-11',
        teams: [
          { id: 'den_2011', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
            players: [
              p('l_den_2', 'Nene', 'Hilario', 'C', '31', 'DEN'),
              p('l_lal_5', 'Ron', 'Artest', 'F', '15', 'LAL'),
            ]
          },
        ]
      };
    `;
    const playersCsv = [
      'index,_id,career_AST,career_PER,career_PTS,career_TRB,career_WS,name,position',
      '1,hilarne01,1.8,17.1,11.3,6.0,73.3,Nene,Power Forward and Center',
      '2,artesro01,2.7,14.8,13.2,4.5,61.1,Metta World Peace,Small Forward',
    ].join('\n');
    const salariesCsv = [
      'player_id,salary,season,season_end,team',
      'hilarne01,11200000,2010-11,2011,DEN',
      'artesro01,6322600,2010-11,2011,LAL',
    ].join('\n');

    const players = buildLocalEraAuditPlayers({
      era: 'lebron',
      seasonStartYear: 2010,
      rosters: parseEraRosters(rosterSource),
      playersCsv,
      salariesCsv,
    });

    expect(players).toEqual([
      expect.objectContaining({ full_name: 'Nene Hilario', matchedProfile: true, salary: 11200000, career_WS: 73.3 }),
      expect.objectContaining({ full_name: 'Ron Artest', matchedProfile: true, salary: 6322600, career_WS: 61.1 }),
    ]);
  });

  it('keeps the real LeBron era seed roster free of duplicate players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const rosters = parseEraRosters(source);
    const teamsByPlayer = new Map();
    for (const team of rosters.lebron || []) {
      for (const player of team.players || []) {
        const key = normalizeName(player.full_name);
        const teams = teamsByPlayer.get(key) || new Set();
        teams.add(team.abbreviation);
        teamsByPlayer.set(key, teams);
      }
    }
    const duplicates = [...teamsByPlayer.entries()]
      .filter(([, teams]) => teams.size > 1)
      .map(([player, teams]) => `${player}: ${[...teams].sort().join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('keeps every real LeBron era seed team at six players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const rosters = parseEraRosters(source);
    const shortTeams = (rosters.lebron || [])
      .filter(team => (team.players || []).length !== 6)
      .map(team => `${team.abbreviation}: ${(team.players || []).length}`);

    expect(shortTeams).toEqual([]);
  });

  it('builds a readable markdown audit report from local evidence', () => {
    const report = buildLocalEraAuditReport('lebron', [
      {
        full_name: 'Luol Deng',
        team: 'CHI',
        position: 'SF',
        salary: 11345000,
        career_WS: 74,
        career_PER: 15.4,
        ppg: 14.8,
        rpg: 6.1,
        apg: 2.3,
      },
      {
        full_name: 'Luol Deng',
        team: 'CLE',
        position: 'SF',
        salary: 11345000,
        career_WS: 74,
        career_PER: 15.4,
        ppg: 14.8,
        rpg: 6.1,
        apg: 2.3,
      },
      {
        full_name: 'Missing Match',
        team: 'CLE',
        position: 'SF',
        matchedProfile: false,
      },
    ]);

    expect(report).toContain('# Local NBA Era Grade Audit');
    expect(report).toContain('Luol Deng');
    expect(report).toContain('11345000');
    expect(report).toContain('74');
    expect(report).toContain('Duplicate Player Warnings');
    expect(report).toContain('Luol Deng: CHI, CLE');
    expect(report).toContain('No Local Profile Match Warnings');
    expect(report).toContain('Missing Match: CLE');
  });
});
