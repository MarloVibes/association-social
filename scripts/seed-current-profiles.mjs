import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
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
      path, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseProfile(html, brefId) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');

  // Height/weight
  const hwMatch = html.match(/(\d+-\d+),\s*(\d+)lb/);
  const height = hwMatch?.[1] || '';
  const weight = hwMatch?.[2] || '';

  // Birth date
  const birthMatch = html.match(/data-birth="([^"]+)"/);
  const birthDate = birthMatch?.[1] || '';

  // Position
  const posMatch = html.match(/Position:\s*<\/strong>\s*([^<\n]+)/);
  const position = posMatch?.[1]?.trim().split(' and ')[0] || '';

  // Accolades
  const accolades = [];
  const awardsSection = uncommented.match(/id="leaderboard_awards"[\s\S]*?<\/div>/);
  if (awardsSection) {
    const awardMatches = awardsSection[0].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g);
    for (const m of awardMatches) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text) accolades.push(text);
    }
  }

  // Career stats from per-game table
  const seasons = [];
  const pgIdx = uncommented.indexOf('id="per_game_stats"');
  const tbodyStart = uncommented.indexOf('<tbody>', pgIdx);
  const tbodyEnd = uncommented.indexOf('</tbody>', tbodyStart);
  if (pgIdx > -1 && tbodyStart > -1) {
    const tbody = uncommented.slice(tbodyStart, tbodyEnd);
    const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
    for (const row of rows) {
      if (row.includes('thead') || row.includes('partial_table')) continue;
      const yearMatch = row.match(/data-stat="year_id"[^>]*>[\s\S]*?>([^<]+)<\/a>/);
      const teamMatch = row.match(/data-stat="team_name_abbr"[^>]*>[\s\S]*?>([^<]+)<\/a>/);
      const gMatch = row.match(/data-stat="games"[^>]*>([^<]*)<\/td>/);
      const ppgMatch = row.match(/data-stat="pts_per_g"[^>]*>[^c][^s][^k][^>]*>?([\d.]+)/);
      const ppgMatch2 = row.match(/data-stat="pts_per_g"[^>]*csk="([\d.]+)"/);
      const rpgMatch = row.match(/data-stat="trb_per_g"[^>]*csk="([\d.]+)"/);
      const apgMatch = row.match(/data-stat="ast_per_g"[^>]*csk="([\d.]+)"/);
      const spgMatch = row.match(/data-stat="stl_per_g"[^>]*csk="([\d.]+)"/);
      const bpgMatch = row.match(/data-stat="blk_per_g"[^>]*csk="([\d.]+)"/);
      const fgMatch = row.match(/data-stat="fg_pct"[^>]*csk="([\d.]+)"/);
      const fg3Match = row.match(/data-stat="fg3_pct"[^>]*csk="([\d.]+)"/);
      const mpgMatch = row.match(/data-stat="mp_per_g"[^>]*csk="([\d.]+)"/);
      if (yearMatch) {
        seasons.push({
          year: yearMatch[1].trim(),
          team: teamMatch?.[1]?.trim() || '',
          games: gMatch?.[1]?.trim() || '',
          ppg: ppgMatch2?.[1] ? parseFloat(ppgMatch2[1]).toFixed(1) : '',
          rpg: rpgMatch?.[1] ? parseFloat(rpgMatch[1]).toFixed(1) : '',
          apg: apgMatch?.[1] ? parseFloat(apgMatch[1]).toFixed(1) : '',
          spg: spgMatch?.[1] ? parseFloat(spgMatch[1]).toFixed(1) : '',
          bpg: bpgMatch?.[1] ? parseFloat(bpgMatch[1]).toFixed(1) : '',
          fg_pct: fgMatch?.[1] ? parseFloat(fgMatch[1]).toFixed(3) : '',
          fg3_pct: fg3Match?.[1] ? parseFloat(fg3Match[1]).toFixed(3) : '',
          mpg: mpgMatch?.[1] ? parseFloat(mpgMatch[1]).toFixed(1) : '',
        });
      }
    }
  }

  return { height, weight, birthDate, position, accolades, seasons };
}

async function main() {
  // Load all current era players
  const poolSnap = await getDoc(doc(db, 'era_player_pools', 'current'));
  const players = poolSnap.data()?.players || [];
  console.log('Total players to process:', players.length);

  let done = 0, skipped = 0, errors = 0;

  for (const player of players) {
    if (!player.bref_id) { skipped++; continue; }

    // Check if profile already exists
    const existing = await getDoc(doc(db, 'player_profiles', player.bref_id));
    if (existing.exists()) { skipped++; continue; }

    process.stdout.write(`[${done+skipped+errors+1}/${players.length}] ${player.full_name}...`);
    try {
      const letter = player.bref_id[0];
      const html = await fetchPage(`/players/${letter}/${player.bref_id}.html`);
      const profile = parseProfile(html, player.bref_id);

      await setDoc(doc(db, 'player_profiles', player.bref_id), {
        bref_id: player.bref_id,
        full_name: player.full_name,
        height: profile.height,
        weight: profile.weight,
        birth_date: profile.birthDate,
        position: profile.position,
        accolades: profile.accolades,
        seasons: profile.seasons,
      });
      done++;
      console.log(` ✓ ${profile.seasons.length} seasons, ${profile.accolades.length} accolades`);
      await sleep(3500);
    } catch (e) {
      errors++;
      console.log(` ERROR: ${e.message}`);
      await sleep(4000);
    }
  }

  console.log(`\nDone! Saved: ${done}, Skipped: ${skipped}, Errors: ${errors}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
