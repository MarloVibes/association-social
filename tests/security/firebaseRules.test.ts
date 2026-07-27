import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Firebase security baseline', () => {
  const firebase = JSON.parse(source('firebase.json'));
  const firestoreRules = source('firestore.rules');
  const storageRules = source('storage.rules');

  it('deploys the versioned rules and indexes from the repository', () => {
    expect(firebase.firestore?.rules).toBe('firestore.rules');
    expect(firebase.firestore?.indexes).toBe('firestore.indexes.json');
    expect(firebase.storage?.rules).toBe('storage.rules');
  });

  it('never grants global public Firestore access', () => {
    expect(firestoreRules).not.toMatch(/match\s+\/\{(?:document|path)=\*\*\}[\s\S]*?allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/);
    expect(firestoreRules).not.toMatch(/allow\s+(?:write|create|update|delete)\s*:\s*if\s+true\s*;/);
  });

  it('keeps canonical player data public-read and client-write protected', () => {
    for (const collection of [
      'players',
      'player_profiles',
      'era_player_pools',
      'era_stats',
      'draft_classes',
      'rosters',
    ]) {
      const block = new RegExp(
        `match\\s+\\/${collection}\\/\\{[^}]+\\}\\s*\\{[\\s\\S]*?allow\\s+read\\s*:\\s*if\\s+true\\s*;[\\s\\S]*?allow\\s+write\\s*:\\s*if\\s+false\\s*;`,
      );
      expect(firestoreRules, `${collection} must remain read-only to clients`).toMatch(block);
    }
  });

  it('keeps schedules and stored game details server-authoritative', () => {
    expect(firestoreRules).toMatch(
      /match\s+\/schedules\/\{scheduleId\}[\s\S]*?allow\s+read\s*:\s*if\s+isLeagueMember\(leagueId\);[\s\S]*?allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isLeagueAdmin\(leagueId\);/,
    );
    expect(firestoreRules).toMatch(
      /match\s+\/gameResults\/\{gameId\}[\s\S]*?allow\s+read\s*:\s*if\s+isLeagueMember\(leagueId\);[\s\S]*?allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isLeagueAdmin\(leagueId\);/,
    );
    expect(firestoreRules).toMatch(
      /match\s+\/liveTimelines\/\{gameId\}[\s\S]*?allow\s+read\s*:\s*if\s+isLeagueMember\(leagueId\);[\s\S]*?allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isLeagueAdmin\(leagueId\);/,
    );
  });

  it('keeps private media uploads authenticated and size limited', () => {
    for (const folder of ['highlights', 'chat_photos', 'reset_proof']) {
      const block = new RegExp(
        `match\\s+\\/${folder}\\/\\{fileName\\}\\s*\\{[\\s\\S]*?allow\\s+read\\s*:\\s*if\\s+isSignedIn\\(\\);[\\s\\S]*?allow\\s+write\\s*:\\s*if\\s+ownsPrefixed\\(fileName\\)\\s*&&\\s*isImageUnder\\(15\\);`,
      );
      expect(storageRules, `${folder} uploads must remain owner-prefixed and size limited`).toMatch(block);
    }

    expect(storageRules).not.toMatch(/allow\s+(?:read|write)\s*:\s*if\s+true\s*;/);
  });
});
