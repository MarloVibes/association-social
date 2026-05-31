import https from 'https';

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

const html = await fetchPage('/players/j/jamesle01.html');

// Test the current selector
const oldMatch = html.match(/itemprop="name"[^>]*>([^<]+)</);
console.log('Old regex (itemprop=name):', oldMatch ? oldMatch[1] : 'NO MATCH');

// Try alternatives
const h1Match = html.match(/<h1[^>]*>\s*<span>([^<]+)<\/span>/);
console.log('H1 span:', h1Match ? h1Match[1] : 'NO MATCH');

const h1Plain = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
console.log('H1 plain:', h1Plain ? h1Plain[1].trim() : 'NO MATCH');

const titleMatch = html.match(/<title>([^|<]+)/);
console.log('Title:', titleMatch ? titleMatch[1].trim() : 'NO MATCH');

// Look for any itemprop variations
const itempropAll = [...html.matchAll(/itemprop="([^"]+)"/g)].map(m => m[1]);
console.log('All itemprop attrs found:', [...new Set(itempropAll)].slice(0, 10));

process.exit(0);
