export function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parsePriorYearPlayers(html) {
  const uncommented = String(html || '').replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = tbodyStart >= 0 && tableEnd >= 0 ? uncommented.slice(tbodyStart, tableEnd) : uncommented;
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];

  const players = [];
  const seen = new Set();

  for (const row of rows) {
    if (row.includes('thead') || row.includes('class="over_header"')) continue;
    const idMatch = row.match(/data-append-csv="([^"]+)"/);
    const nameMatch = row.match(/data-stat="name_display"[^>]*>(?:<a[^>]*>)?([^<]+)/);
    const gamesMatch = row.match(/data-stat="games"[^>]*>([^<]+)/);

    if (!idMatch || !nameMatch) continue;
    const brefId = idMatch[1];
    if (seen.has(brefId)) continue;
    seen.add(brefId);

    const name = nameMatch[1].trim();
    const games = parseInt(gamesMatch ? gamesMatch[1] : '0', 10) || 0;
    if (games < 10) continue;

    players.push({ bref_id: brefId, full_name: name, games });
  }

  return players;
}

export function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(csv || '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

export function buildProfileLookup(profileRows) {
  const lookup = new Map();
  for (const profile of profileRows || []) {
    if (!profile) continue;
    const id = String(profile._id || profile.bref_id || '').trim();
    const name = String(profile.name || profile.full_name || '').trim();
    if (id) lookup.set(id, profile);
    if (name) lookup.set(normName(name), profile);
  }
  return lookup;
}

export function buildProfileLookupFromCsv(playersCsv) {
  const rows = parseCsvRows(playersCsv);
  const headers = rows.shift() || [];
  const profiles = rows.map(row => headers.reduce((profile, header, index) => {
    profile[header] = row[index] || '';
    return profile;
  }, {}));
  return buildProfileLookup(profiles);
}

export function buildFreeAgentVaultDoc(candidate, era, profileLookup = new Map(), now = new Date()) {
  const profile = profileLookup.get(candidate.bref_id) || profileLookup.get(normName(candidate.full_name));
  const parts = String(candidate.full_name || '').split(' ').filter(Boolean);
  const hasProfile = Boolean(profile);

  return {
    bref_id: candidate.bref_id,
    full_name: candidate.full_name,
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || '',
    position: profile?.position || '',
    height: profile?.height || '',
    weight: profile?.weight || '',
    birth_date: profile?.birthDate || profile?.birth_date || '',
    jersey_number: '',
    accolades: [],
    seasons: [],
    eras: [era],
    free_in_eras: [era],
    is_custom: false,
    no_profile: !hasProfile,
    added_as_free_agent: true,
    created_at: now.toISOString(),
  };
}
