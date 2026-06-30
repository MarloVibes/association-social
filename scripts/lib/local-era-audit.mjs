export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(values => values.some(value => value !== ''));
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'`]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExactName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PROFILE_NAME_ALIASES = {
  [normalizeName('Nene Hilario')]: normalizeName('Nene'),
  [normalizeName('Ron Artest')]: normalizeName('Metta World Peace'),
  [normalizeName('D Angelo Russell')]: normalizeName("D'Angelo Russell"),
  [normalizeName('David Greenwood')]: normalizeName('Dave Greenwood'),
  [normalizeName('Chris Jackson')]: normalizeName('Mahmoud Abdul-Rauf'),
  [normalizeName('Armon Gilliam')]: normalizeName('Armen Gilliam'),
};

const TEAM_PROFILE_ID_ALIASES = {
  [`${normalizeName('Eddie Johnson')}|ATL`]: 'johnsed02',
  [`${normalizeName('Eddie Johnson')}|SAC`]: 'johnsed03',
};

function profileKeyForName(name) {
  const normalized = normalizeName(name);
  return PROFILE_NAME_ALIASES[normalized] || normalized;
}

function profileIdForPlayer(name, team) {
  return TEAM_PROFILE_ID_ALIASES[`${normalizeName(name)}|${String(team || '').toUpperCase()}`];
}

function column(headers, ...names) {
  const normalized = headers.map(header => String(header).toLowerCase().trim());
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function numberFrom(value, fallback = 0) {
  const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function birthYearFrom(value) {
  const date = new Date(String(value || ''));
  if (!Number.isNaN(date.getTime())) return date.getUTCFullYear();
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function eraAgeFromBirthDate(value, seasonStartYear) {
  const birthYear = birthYearFrom(value);
  if (!birthYear) return null;
  const age = Number(seasonStartYear) - birthYear;
  return age > 15 && age < 60 ? age : null;
}

function positionIncludes(player, values) {
  const position = String(player.position || '').toUpperCase();
  return values.some(value => position.includes(value));
}

function isWing(player) {
  return positionIncludes(player, ['SG', 'SF', 'G-F', 'F-G']);
}

export function parseEraRosters(source) {
  const eraBlocks = {};
  const eraRegex = /const\s+ERA_[A-Z_]+\s*=\s*\{[\s\S]*?era:\s*'([^']+)'[\s\S]*?teams:\s*\[([\s\S]*?)\n\s*\]\s*\};/g;
  let eraMatch;
  while ((eraMatch = eraRegex.exec(source))) {
    const [, era, teamsSource] = eraMatch;
    const teams = [];
    const teamRegex = /\{\s*id:\s*'([^']+)'\s*,\s*abbreviation:\s*'([^']+)'[\s\S]*?players:\s*\[([\s\S]*?)\]\s*\}/g;
    let teamMatch;
    while ((teamMatch = teamRegex.exec(teamsSource))) {
      const [, id, abbreviation, playersSource] = teamMatch;
      const players = [];
      const playerRegex = /p\(([^)]*)\)/g;
      let playerMatch;
      while ((playerMatch = playerRegex.exec(playersSource))) {
        const args = [];
        const argRegex = /'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g;
        let argMatch;
        while ((argMatch = argRegex.exec(playerMatch[1]))) {
          args.push((argMatch[1] ?? argMatch[2]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
        }
        if (args.length < 6) continue;
        const [player_id, first_name, last_name, position, jersey_number, team] = args;
        players.push({
          player_id,
          first_name,
          last_name,
          full_name: `${first_name} ${last_name}`,
          position,
          jersey_number,
          team,
        });
      }
      teams.push({ id, abbreviation, players });
    }
    eraBlocks[era] = teams;
  }
  return eraBlocks;
}

function buildProfileIndex(playersCsv) {
  const rows = parseCsv(playersCsv);
  const headers = rows[0] || [];
  const idIndex = column(headers, '_id', 'id', 'player_id');
  const nameIndex = column(headers, 'name', 'full_name', 'player');
  const birthDateIndex = column(headers, 'birthdate', 'birth_date', 'born');
  const positionIndex = column(headers, 'position', 'pos');
  const ppgIndex = column(headers, 'career_pts', 'ppg', 'points');
  const rpgIndex = column(headers, 'career_trb', 'rpg', 'rebounds');
  const apgIndex = column(headers, 'career_ast', 'apg', 'assists');
  const fg3PctIndex = column(headers, 'career_fg3%', 'career_3p%', 'fg3%', '3p%');
  const winSharesIndex = column(headers, 'career_ws', 'winshares', 'win_shares');
  const perIndex = column(headers, 'career_per', 'per');
  const byName = {};
  const byExactName = {};
  const byId = {};
  const idToName = {};
  for (const row of rows.slice(1)) {
    const name = row[nameIndex];
    if (!name) continue;
    const profile = {
      player_id: row[idIndex],
      full_name: name,
      birthDate: row[birthDateIndex],
      position: row[positionIndex],
      ppg: numberFrom(row[ppgIndex]),
      rpg: numberFrom(row[rpgIndex]),
      apg: numberFrom(row[apgIndex]),
      fg3Pct: numberFrom(row[fg3PctIndex]),
      career_WS: numberFrom(row[winSharesIndex]),
      career_PER: numberFrom(row[perIndex]),
    };
    byExactName[normalizeExactName(name)] = profile;
    byName[normalizeName(name)] = byName[normalizeName(name)] || profile;
    if (profile.player_id) byId[profile.player_id] = profile;
    if (profile.player_id) idToName[profile.player_id] = name;
  }
  return { byName, byExactName, byId, idToName };
}

function buildSalaryIndex(salariesCsv, idToName) {
  const rows = parseCsv(salariesCsv);
  const headers = rows[0] || [];
  const playerIdIndex = column(headers, 'player_id', 'playerid', 'id');
  const salaryIndex = column(headers, 'salary');
  const seasonIndex = column(headers, 'season_start', 'seasonstart', 'year', 'season');
  const byNameYear = {};
  const byExactNameYear = {};
  const byIdYear = {};
  for (const row of rows.slice(1)) {
    const playerId = row[playerIdIndex];
    const name = idToName[playerId];
    if (!name) continue;
    const season = parseInt(String(row[seasonIndex]).slice(0, 4), 10);
    const salary = Math.round(numberFrom(row[salaryIndex]));
    if (!season || salary <= 0) continue;
    const key = normalizeName(name);
    const exactKey = normalizeExactName(name);
    byNameYear[key] = byNameYear[key] || {};
    byExactNameYear[exactKey] = byExactNameYear[exactKey] || {};
    byIdYear[playerId] = byIdYear[playerId] || {};
    byNameYear[key][String(season)] = salary;
    byExactNameYear[exactKey][String(season)] = salary;
    byIdYear[playerId][String(season)] = salary;
  }
  return { byNameYear, byExactNameYear, byIdYear };
}

export function buildLocalEraAuditPlayers({ era, seasonStartYear, rosters, playersCsv, salariesCsv }) {
  const { byName, byExactName, byId, idToName } = buildProfileIndex(playersCsv);
  const { byNameYear, byExactNameYear, byIdYear } = buildSalaryIndex(salariesCsv, idToName);
  const teams = rosters[era] || [];
  const players = [];
  for (const team of teams) {
    for (const player of team.players || []) {
      const aliasProfileId = profileIdForPlayer(player.full_name, player.team || team.abbreviation);
      const key = profileKeyForName(player.full_name);
      const exactKey = normalizeExactName(player.full_name);
      const profile = (aliasProfileId && byId[aliasProfileId]) || byExactName[exactKey] || byName[key] || {};
      const salaryByYear =
        (profile.player_id && byIdYear[profile.player_id])
        || byExactNameYear[exactKey]
        || byNameYear[key]
        || {};
      const matchedProfile = Boolean(profile.player_id);
      players.push({
        ...player,
        ...profile,
        full_name: player.full_name,
        team: player.team || team.abbreviation,
        position: profile.position || player.position,
        salary: salaryByYear[String(seasonStartYear)] || 0,
        salaryByYear,
        eraAge: eraAgeFromBirthDate(profile.birthDate, seasonStartYear),
        matchedProfile,
        matchedProfileId: profile.player_id,
        matchedSalary: Boolean(salaryByYear[String(seasonStartYear)]),
      });
    }
  }
  return players;
}

function priorityFor(player) {
  const salary = numberFrom(player.salary);
  const winShares = numberFrom(player.career_WS);
  const per = numberFrom(player.career_PER);
  const ppg = numberFrom(player.ppg);
  const rpg = numberFrom(player.rpg);
  const apg = numberFrom(player.apg);
  if (salary >= 8_000_000 || winShares >= 50 || ppg + rpg + apg >= 20) return 'high';
  if (salary >= 4_000_000 || winShares >= 25 || per >= 14) return 'medium';
  return 'normal';
}

function evidenceFor(player) {
  const evidence = [];
  if (numberFrom(player.salary) >= 8_000_000) evidence.push('core salary');
  if (numberFrom(player.career_WS) >= 50) evidence.push('career win shares');
  if (numberFrom(player.career_PER) >= 14) evidence.push('above-average PER');
  if (numberFrom(player.ppg) >= 14) evidence.push('scoring load');
  if (numberFrom(player.rpg) >= 6) evidence.push('rebounding value');
  if (numberFrom(player.apg) >= 5) evidence.push('creator value');
  return evidence.join(', ') || '-';
}

function suggestedGradeReviewFor(player) {
  const suggestions = [];
  const salary = numberFrom(player.salary);
  const winShares = numberFrom(player.career_WS);
  const per = numberFrom(player.career_PER);
  const ppg = numberFrom(player.ppg);
  const rpg = numberFrom(player.rpg);
  const apg = numberFrom(player.apg);
  const spg = numberFrom(player.spg);
  const mpg = numberFrom(player.mpg || player.minutes || player.minutesPerGame);

  if (isWing(player) && mpg >= 32 && ppg >= 11 && rpg >= 4 && spg >= 0.7) {
    suggestions.push('Perimeter D -> B+');
    suggestions.push('Defense IQ -> B');
    suggestions.push('Help Defense -> B-');
  } else if (isWing(player) && salary >= 8_000_000 && winShares >= 40 && ppg >= 12 && rpg >= 4) {
    suggestions.push('Perimeter D -> B');
    suggestions.push('Defense IQ -> B-');
  }

  if (mpg >= 36) suggestions.push('Stamina -> A-');
  else if (mpg >= 32) suggestions.push('Stamina -> B+');

  if (ppg >= 14 && apg >= 2) suggestions.push('Offense IQ -> B-');
  if (ppg >= 15) suggestions.push('Mid Range -> B-');
  if (rpg >= 5 && isWing(player)) suggestions.push('Rebounding -> C+');
  if (spg >= 1) suggestions.push('Steals -> B-');
  if (salary >= 8_000_000 && winShares >= 40 && per >= 14) suggestions.push('Core-role review');

  return [...new Set(suggestions)].join('; ') || '-';
}

export function buildLocalEraAuditReport(era, players) {
  const teamsByPlayer = new Map();
  for (const player of players) {
    const name = String(player.full_name || 'Unknown Player');
    const key = player.matchedProfileId || name;
    const value = teamsByPlayer.get(key) || { name, teams: new Set() };
    value.teams.add(String(player.team || '-'));
    teamsByPlayer.set(key, value);
  }
  const duplicateWarnings = [...teamsByPlayer.values()]
    .filter(value => value.teams.size > 1)
    .map(value => `${value.name}: ${[...value.teams].sort().join(', ')}`)
    .sort((left, right) => left.localeCompare(right));
  const missingProfileWarnings = players
    .filter(player => player.matchedProfile === false)
    .map(player => `${player.full_name || 'Unknown Player'}: ${player.team || '-'}`)
    .sort((left, right) => left.localeCompare(right));
  const rows = [...players]
    .sort((left, right) => {
      const priorityOrder = { high: 2, medium: 1, normal: 0 };
      return priorityOrder[priorityFor(right)] - priorityOrder[priorityFor(left)]
        || numberFrom(right.salary) - numberFrom(left.salary)
        || String(left.full_name).localeCompare(String(right.full_name));
    })
    .map(player => [
      player.full_name || 'Unknown Player',
      player.team || '-',
      player.position || '-',
      priorityFor(player),
      String(player.eraAge ?? '-'),
      String(numberFrom(player.salary)),
      String(numberFrom(player.career_WS)),
      String(numberFrom(player.career_PER)),
      `${numberFrom(player.ppg)}/${numberFrom(player.rpg)}/${numberFrom(player.apg)}`,
      evidenceFor(player),
      suggestedGradeReviewFor(player),
    ]);

  return [
    '# Local NBA Era Grade Audit',
    '',
    `Era: ${era}`,
    '',
    'Read-only report built from local seeded rosters, player profiles, and salary history.',
    '',
    '| Player | Team | Pos | Priority | Era Age | Salary | Career WS | Career PER | Career P/R/A | Evidence | Suggested Grade Review |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`),
    '',
    ...(duplicateWarnings.length
      ? [
          '## Duplicate Player Warnings',
          '',
          ...duplicateWarnings.map(warning => `- ${warning}`),
          '',
        ]
      : []),
    ...(missingProfileWarnings.length
      ? [
          '## No Local Profile Match Warnings',
          '',
          ...missingProfileWarnings.map(warning => `- ${warning}`),
          '',
        ]
      : []),
  ].join('\n');
}
