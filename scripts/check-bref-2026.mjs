import https from 'https';
function fetchPage(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, length: data.length, hasTbody: data.includes('<tbody>') }));
    });
    req.on('error', reject);
    req.end();
  });
}
const r2026 = await fetchPage('/leagues/NBA_2026_per_game.html');
console.log('NBA_2026:', r2026);
const r2025 = await fetchPage('/leagues/NBA_2025_per_game.html');
console.log('NBA_2025:', r2025);
process.exit(0);
