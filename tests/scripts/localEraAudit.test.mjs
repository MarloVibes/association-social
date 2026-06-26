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

  it('parses escaped apostrophes in seeded roster names', () => {
    const rosters = parseEraRosters(`
      const ERA_STEPH = {
        era: 'steph',
        season: '2016-17',
        teams: [
          { id: 'nop_2017', abbreviation: 'NOP', full_name: 'New Orleans Pelicans', city: 'New Orleans', name: 'Pelicans',
            players: [
              p('s_nop_5', 'E\\'Twaun', 'Moore', 'SG', '55', 'NOP'),
            ]
          },
        ]
      };
    `);

    expect(rosters.steph[0].players[0]).toMatchObject({
      first_name: "E'Twaun",
      full_name: "E'Twaun Moore",
    });
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

  it('matches Magic/Bird era profile aliases used by local player history', () => {
    const rosterSource = `
      const ERA_MAGIC_BIRD = {
        era: 'magic_bird',
        season: '1983-84',
        teams: [
          { id: 'chi_1984', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
            players: [
              p('h_chi_5', 'David', 'Greenwood', 'PF', '32', 'CHI'),
            ]
          },
        ]
      };
    `;
    const playersCsv = [
      'index,_id,career_AST,career_PER,career_PTS,career_TRB,career_WS,name,position',
      '1,greenda01,2.0,13.6,10.2,7.9,46.4,Dave Greenwood,Power Forward',
    ].join('\n');
    const salariesCsv = [
      'player_id,salary,season,season_end,team',
      'greenda01,425000,1983-84,1984,CHI',
    ].join('\n');

    const players = buildLocalEraAuditPlayers({
      era: 'magic_bird',
      seasonStartYear: 1983,
      rosters: parseEraRosters(rosterSource),
      playersCsv,
      salariesCsv,
    });

    expect(players).toEqual([
      expect.objectContaining({ full_name: 'David Greenwood', matchedProfile: true, salary: 425000, career_WS: 46.4 }),
    ]);
  });

  it('matches Jordan era profile aliases used by local player history', () => {
    const rosterSource = `
      const ERA_JORDAN = {
        era: 'jordan',
        season: '1991-92',
        teams: [
          { id: 'den_1992', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
            players: [
              p('j_den_3', 'Chris', 'Jackson', 'PG', '7', 'DEN'),
            ]
          },
          { id: 'phi_1992', abbreviation: 'PHI', full_name: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers',
            players: [
              p('j_phi_5', 'Armon', 'Gilliam', 'PF', '35', 'PHI'),
            ]
          },
        ]
      };
    `;
    const playersCsv = [
      'index,_id,career_AST,career_PER,career_PTS,career_TRB,career_WS,name,position',
      '1,abdulma02,3.5,15.4,14.6,1.9,25.2,Mahmoud Abdul-Rauf,Point Guard',
      '2,gilliar01,1.2,16.4,13.7,6.9,58.1,Armen Gilliam,Power Forward and Small Forward',
    ].join('\n');
    const salariesCsv = [
      'player_id,salary,season,season_end,team',
      'abdulma02,1660000,1991-92,1992,DEN',
      'gilliar01,1995000,1991-92,1992,PHI',
    ].join('\n');

    const players = buildLocalEraAuditPlayers({
      era: 'jordan',
      seasonStartYear: 1991,
      rosters: parseEraRosters(rosterSource),
      playersCsv,
      salariesCsv,
    });

    expect(players).toEqual([
      expect.objectContaining({ full_name: 'Chris Jackson', matchedProfile: true, salary: 1660000, career_WS: 25.2 }),
      expect.objectContaining({ full_name: 'Armon Gilliam', matchedProfile: true, salary: 1995000, career_WS: 58.1 }),
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

  it('keeps the real Steph era seed roster free of duplicate players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const rosters = parseEraRosters(source);
    const teamsByPlayer = new Map();
    for (const team of rosters.steph || []) {
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

  it('keeps every real Steph era seed team at six players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const rosters = parseEraRosters(source);
    const shortTeams = (rosters.steph || [])
      .filter(team => (team.players || []).length !== 6)
      .map(team => `${team.abbreviation}: ${(team.players || []).length}`);

    expect(shortTeams).toEqual([]);
  });

  it('keeps the real Magic/Bird era seed roster free of true duplicate players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const playersCsv = readFileSync('players.csv', 'utf8');
    const salariesCsv = readFileSync('salaries_1985to2018.csv', 'utf8');
    const players = buildLocalEraAuditPlayers({
      era: 'magic_bird',
      seasonStartYear: 1983,
      rosters: parseEraRosters(source),
      playersCsv,
      salariesCsv,
    });
    const teamsByPlayer = new Map();
    for (const player of players) {
      const key = player.matchedProfileId || normalizeName(player.full_name);
      const value = teamsByPlayer.get(key) || { name: player.full_name, teams: new Set() };
      value.teams.add(player.team);
      teamsByPlayer.set(key, value);
    }
    const duplicates = [...teamsByPlayer.values()]
      .filter(value => value.teams.size > 1)
      .map(value => `${value.name}: ${[...value.teams].sort().join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('keeps the real Jordan era seed roster free of true duplicate players', () => {
    const source = readFileSync('scripts/seed-era-rosters.mjs', 'utf8');
    const playersCsv = readFileSync('players.csv', 'utf8');
    const salariesCsv = readFileSync('salaries_1985to2018.csv', 'utf8');
    const players = buildLocalEraAuditPlayers({
      era: 'jordan',
      seasonStartYear: 1991,
      rosters: parseEraRosters(source),
      playersCsv,
      salariesCsv,
    });
    const teamsByPlayer = new Map();
    for (const player of players) {
      const key = player.matchedProfileId || normalizeName(player.full_name);
      const value = teamsByPlayer.get(key) || { name: player.full_name, teams: new Set() };
      value.teams.add(player.team);
      teamsByPlayer.set(key, value);
    }
    const duplicates = [...teamsByPlayer.values()]
      .filter(value => value.teams.size > 1)
      .map(value => `${value.name}: ${[...value.teams].sort().join(', ')}`);

    expect(duplicates).toEqual([]);
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
