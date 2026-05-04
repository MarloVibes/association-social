import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseCareer(html, brefId) {
  // Parse career year-by-year stats
  const seasons = [];
  const tbodyStart = html.indexOf('<tbody>');
  const tableEnd = html.indexOf('</table>', tbodyStart);
  const tbody = html.slice(tbodyStart, tableEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    if (row.includes('thead') || row.includes('class="over_header"')) continue;
    const yearMatch = row.match(/data-stat="year_id"[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/);
    if (!yearMatch) continue;
    const year = yearMatch[1].trim();
    if (year === 'Career' || year === 'TOT') continue;

    const get = (stat) => {
      const m = row.match(new RegExp('data-stat="' + stat + '"[^>]*>(?:<[^>]+>)*([\\d.]+)'));
      return m ? m[1] : '';
    };

    const teamMatch = row.match(/data-stat="team_name_abbr"[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/);

    seasons.push({
      year,
      team: teamMatch ? teamMatch[1] : '',
      age: get('age'),
      games: get('games'),
      mpg: get('mp_per_g'),
      ppg: get('pts_per_g'),
      rpg: get('trb_per_g'),
      apg: get('ast_per_g'),
      spg: get('stl_per_g'),
      bpg: get('blk_per_g'),
      fg_pct: get('fg_pct'),
      fg3_pct: get('fg3_pct'),
      ft_pct: get('ft_pct'),
    });
  }

  // Parse awards/accolades
  const accolades = [];
  const awardMatches = html.matchAll(/<span><a href=\'[^']*\'[^>]*>([^<]+)<\/a><\/span>/g);
  for (const m of awardMatches) {
    const text = m[1].trim();
    if (text.length > 5) accolades.push(text);
  }

  // Parse height/weight/position
  const heightMatch = html.match(/itemprop="height"[^>]*>([^<]+)</);
  const weightMatch = html.match(/itemprop="weight"[^>]*>([^<]+)</);
  const nameMatch = html.match(/itemprop="name"[^>]*>([^<]+)</);
  const birthMatch = html.match(/id="necro-birth"[^>]*data-birth="([^"]+)"/);
  const posMatch = html.match(/Position:<\/strong>\s*([\w\s-]+?)(?:\s*(?:and|▪|<))/);

  return {
    bref_id: brefId,
    name: nameMatch ? nameMatch[1].trim() : '',
    height: heightMatch ? heightMatch[1].trim() : '',
    weight: weightMatch ? weightMatch[1].trim().replace('lb', '') : '',
    birth_date: birthMatch ? birthMatch[1] : '',
    position: posMatch ? posMatch[1].trim() : '',
    seasons,
    accolades: accolades.slice(0, 50),
  };
}

async function main() {
  // Get all unique bref_ids from era_stats
  const eras = ['magic_bird', 'jordan', 'kobe', 'lebron', 'steph'];
  const allPlayers = new Map();

  for (const era of eras) {
    const snap = await getDoc(doc(db, 'era_stats', era));
    const players = snap.data().players || [];
    players.forEach(p => {
      if (p.bref_id && !allPlayers.has(p.bref_id)) {
        allPlayers.set(p.bref_id, p.name);
      }
    });
  }

  const ids = [...allPlayers.entries()];
  console.log('Total players:', ids.length);

  // Load checkpoint
  const existing = new Set();
  try {
    const snap = await getDoc(doc(db, 'player_profiles', '_index'));
    if (snap.exists()) {
      (snap.data().completed || []).forEach(id => existing.add(id));
      console.log('Already done:', existing.size);
    }
  } catch(e) {}

  let done = 0;
  const completed = [...existing];

  for (const [brefId, name] of ids) {
    if (existing.has(brefId)) { done++; continue; }

    const firstLetter = brefId[0];
    const path = '/players/' + firstLetter + '/' + brefId + '.html';

    try {
      process.stdout.write('(' + (done+1) + '/' + ids.length + ') ' + name + '...');
      const html = await fetchPage(path);

      if (html.length < 5000) {
        console.log(' SKIP (too short)');
        done++;
        await sleep(2000);
        continue;
      }

      const profile = parseCareer(html, brefId);
      await setDoc(doc(db, 'player_profiles', brefId), profile);
      completed.push(brefId);

      if (completed.length % 25 === 0) {
        await setDoc(doc(db, 'player_profiles', '_index'), {
          completed,
          last_updated: new Date().toISOString(),
        });
        console.log('\n--- Checkpoint: ' + completed.length + ' ---');
      }

      console.log(' ' + profile.seasons.length + ' seasons | ' + profile.accolades.length + ' accolades | h:' + profile.height + ' w:' + profile.weight);
      done++;
      await sleep(3500);

    } catch(e) {
      console.log(' ERROR:', e.message);
      done++;
      await sleep(5000);
    }
  }

  await setDoc(doc(db, 'player_profiles', '_index'), {
    completed,
    last_updated: new Date().toISOString(),
  });

  console.log('Done! ' + completed.length + ' profiles scraped');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
