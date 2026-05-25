import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

// Normalize a name for matching: lowercase, strip accents, remove punctuation except hyphens
function normalize(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .replace(/[.']/g, '')              // remove periods, apostrophes
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim();
}

async function run() {
  // Accept season from CLI: node scripts/seed-salaries.mjs 2026-27
  // Defaults to 2025-26 if no arg given
  const season = process.argv[2] || '2025-26';
  const filename = `./data/salaries-${season}.json`;
  console.log('Seeding salaries from:', filename);

  let salariesData;
  try {
    salariesData = JSON.parse(readFileSync(filename, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${filename}`);
    console.error('Expected file at:', filename);
    console.error('Run with: node scripts/seed-salaries.mjs <season>');
    console.error('Example: node scripts/seed-salaries.mjs 2026-27');
    process.exit(1);
  }
  const salaryMap = salariesData.players;
  const defaultSalary = salariesData.default_for_unmatched || 2500000;

  console.log('Loaded', Object.keys(salaryMap).length, 'salaries from JSON');
  console.log('Default for unmatched:', defaultSalary);
  console.log('');

  const poolRef = doc(db, 'era_player_pools', 'current');
  const poolSnap = await getDoc(poolRef);
  if (!poolSnap.exists()) {
    console.error('era_player_pools/current does not exist');
    process.exit(1);
  }

  const poolData = poolSnap.data();
  const players = poolData.players || [];
  console.log('Pool has', players.length, 'players');

  let matched = 0;
  let unmatched = [];

  const updated = players.map(p => {
    const normName = normalize(p.full_name);
    if (salaryMap[normName] !== undefined) {
      matched++;
      return { ...p, salary: salaryMap[normName] };
    }
    unmatched.push(p.full_name);
    return { ...p, salary: defaultSalary };
  });

  await setDoc(poolRef, { ...poolData, players: updated, salaries_last_updated: new Date().toISOString() });

  console.log('');
  console.log('=== SEED COMPLETE ===');
  console.log('Matched:', matched);
  console.log('Used default:', unmatched.length);
  console.log('');
  if (unmatched.length > 0) {
    console.log('Players using default $' + (defaultSalary / 1000000).toFixed(1) + 'M:');
    unmatched.forEach(n => console.log('  - ' + n));
  }
  console.log('');
  console.log('All players now have a salary field in era_player_pools/current');
}

run().catch(e => { console.error(e); process.exit(1); });
