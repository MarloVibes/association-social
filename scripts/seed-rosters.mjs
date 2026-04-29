import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Known 2K/Madden/MLB legend full names — matched against Sleeper data
const NBA_LEGENDS = new Set([
  'Michael Jordan','Kobe Bryant','LeBron James','Magic Johnson','Larry Bird',
  'Shaquille O\'Neal','Tim Duncan','Kevin Garnett','Allen Iverson','Dirk Nowitzki',
  'Dwyane Wade','Charles Barkley','Hakeem Olajuwon','Patrick Ewing','John Stockton',
  'Karl Malone','Clyde Drexler','Isiah Thomas','Scottie Pippen','Dennis Rodman',
  'Gary Payton','Reggie Miller','Ray Allen','Paul Pierce','Vince Carter',
  'Steve Nash','Jason Kidd','Tracy McGrady','Dominique Wilkins','Julius Erving',
  'Kareem Abdul-Jabbar','Wilt Chamberlain','Bill Russell','Oscar Robertson','Jerry West',
  'Pete Maravich','Elgin Baylor','Bob Pettit','George Gervin','David Robinson',
  'Alonzo Mourning','Dikembe Mutombo','Anfernee Hardaway','Grant Hill','Chris Webber',
  'Pau Gasol','Manu Ginobili','Tony Parker','Yao Ming','Carmelo Anthony',
]);

const NFL_LEGENDS = new Set([
  'Jerry Rice','Joe Montana','Lawrence Taylor','Walter Payton','Barry Sanders',
  'Jim Brown','Johnny Unitas','Emmitt Smith','Joe Greene','Roger Staubach',
  'Dick Butkus','Gale Sayers','Ronnie Lott','Anthony Munoz','Mike Singletary',
  'Randy Moss','Terrell Owens','Marshall Faulk','Peyton Manning','Dan Marino',
  'Brett Favre','John Elway','Troy Aikman','Steve Young','Jim Kelly',
  'Franco Harris','Tony Dorsett','Eric Dickerson','Earl Campbell','Bo Jackson',
  'Deion Sanders','Rod Woodson','Reggie White','Bruce Smith','Derrick Thomas',
  'Mike Ditka','Shannon Sharpe','Ozzie Newsome','Jackie Slater','Forrest Gregg',
  'Ray Lewis','Ed Reed','Brian Urlacher','Ladainian Tomlinson','Adrian Peterson',
  'Calvin Johnson','Larry Fitzgerald','Marvin Harrison','Cris Carter','Steve Largent',
]);

const MLB_LEGENDS = new Set([
  'Babe Ruth','Willie Mays','Hank Aaron','Ted Williams','Lou Gehrig',
  'Mickey Mantle','Sandy Koufax','Bob Gibson','Walter Johnson','Cy Young',
  'Rogers Hornsby','Ty Cobb','Honus Wagner','Christy Mathewson','Joe DiMaggio',
  'Stan Musial','Roberto Clemente','Josh Gibson','Satchel Paige','Cool Papa Bell',
  'Ken Griffey Jr.','Greg Maddux','Tom Seaver','Nolan Ryan','Randy Johnson',
  'Roger Clemens','Pedro Martinez','Mike Schmidt','George Brett','Wade Boggs',
  'Cal Ripken Jr.','Ozzie Smith','Brooks Robinson','Johnny Bench','Yogi Berra',
  'Carlton Fisk','Rod Carew','Tony Gwynn','Rickey Henderson','Dave Winfield',
  'Frank Robinson','Harmon Killebrew','Duke Snider','Mike Piazza','Barry Bonds',
  'Derek Jeter','Mariano Rivera','David Ortiz','Albert Pujols','Ivan Rodriguez',
]);

async function seedSport(sport, positions, legendNames) {
  console.log(`\nFetching ${sport.toUpperCase()} players...`);
  const res = await fetch(`https://api.sleeper.app/v1/players/${sport}`);
  const data = await res.json();

  const allPlayers = Object.values(data);

  // Active current players
  const active = allPlayers.filter(p =>
    p.active && p.team && positions.includes(p.position)
  );

  // Retired legends matched by full name
  const legends = allPlayers.filter(p => {
    const name = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return !p.active && legendNames.has(name);
  });

  const combined = [...active, ...legends];
  console.log(`  Active players: ${active.length}`);
  console.log(`  Legends matched: ${legends.length}`);

  const players = combined.map(p => ({
    player_id: p.player_id,
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    full_name: p.full_name || `${p.first_name} ${p.last_name}`,
    position: p.position || '',
    team: p.team || (legendNames.has(p.full_name) ? 'LEGEND' : ''),
    age: p.age || null,
    height: p.height || '',
    weight: p.weight || '',
    number: p.number || null,
    injury_status: p.injury_status || null,
    is_legend: !p.active && legendNames.has(p.full_name || ''),
    photo_url: `https://sleepercdn.com/content/${sport}/players/${p.player_id}.jpg`,
  }));

  console.log(`  Saving ${players.length} total ${sport.toUpperCase()} players to Firestore...`);
  await setDoc(doc(db, 'rosters', sport), { players, updatedAt: new Date().toISOString() });
  console.log(`  ✅ ${sport.toUpperCase()} done`);
}

async function main() {
  await seedSport('nfl', [
    'QB','RB','WR','TE','K','DE','DT','LB','CB','S','OL','OT','OG','C','FB'
  ], NFL_LEGENDS);

  await seedSport('nba', [
    'PG','SG','SF','PF','C','G','F'
  ], NBA_LEGENDS);

  // MLB — Sleeper has limited MLB data so we seed what we can
  // For MLB we pull all positions since rosters are smaller
  await seedSport('nfl', [
    'P','C','1B','2B','3B','SS','LF','CF','RF','DH','SP','RP','CP'
  ], MLB_LEGENDS).catch(() => {
    console.log('  MLB via Sleeper limited — seeding legends only');
  });

  // Seed MLB legends as a manual fallback since Sleeper MLB coverage is thin
  console.log('\nSeeding MLB legends manually...');
  const mlbLegends = [...MLB_LEGENDS].map((name, i) => {
    const [first, ...rest] = name.split(' ');
    return {
      player_id: `mlb_legend_${i}`,
      first_name: first,
      last_name: rest.join(' '),
      full_name: name,
      position: 'LEGEND',
      team: 'LEGEND',
      age: null,
      height: '',
      weight: '',
      number: null,
      injury_status: null,
      is_legend: true,
      photo_url: '',
    };
  });
  await setDoc(doc(db, 'rosters', 'mlb'), {
    players: mlbLegends,
    updatedAt: new Date().toISOString()
  });
  console.log(`  ✅ MLB legends seeded (${mlbLegends.length} players)`);

  console.log('\n🏆 All rosters seeded!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
