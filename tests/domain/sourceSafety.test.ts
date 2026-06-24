import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('source safety regressions', () => {
  it('uses numeric currentYear for NBA team branding', () => {
    const roster = source('app/screens/team-roster.tsx');
    const select = source('app/screens/team-select.tsx');

    expect(roster).toContain('getTeamColors(abbr, currentYear)');
    expect(roster).toContain('getTeamLogoLocal(abbr, currentYear)');
    expect(roster).toContain('getTeamLogoUrl(abbr, currentYear)');
    expect(select).toContain('currentYear={currentYear}');
  });

  it('does not dereference a nullable auth user while saving a profile', () => {
    const profile = source('app/screens/profile.tsx');

    expect(profile).toContain("if (!user?.uid || profileUid !== user.uid) return;");
    expect(profile).toContain("doc(db, 'users', profileUid)");
  });

  it('uses supported Firestore snapshot listener signatures', () => {
    for (const path of [
      'app/screens/locker-console-chat.tsx',
      'app/screens/locker-group-chat.tsx',
    ]) {
      expect(source(path)).not.toContain(
        "setLoading(false);\n    }, err => { if (err.code !== 'permission-denied') console.error(err); });",
      );
    }
  });

  it('centralizes Firebase initialization in constants/firebase', () => {
    const screens = [
      'app/screens/league-rosters.tsx',
      'app/screens/locker-console-chat.tsx',
      'app/screens/locker-group-chat.tsx',
      'app/screens/locker-group-create.tsx',
      'app/screens/locker-group-info.tsx',
      'app/screens/mvp-locker-room.tsx',
      'app/screens/mvp-player-edit.tsx',
      'app/screens/mvp-player-view.tsx',
      'app/screens/mvp-players.tsx',
      'app/screens/pending-players.tsx',
      'app/screens/salary-overrides.tsx',
      'app/screens/team-roster.tsx',
    ];

    for (const path of screens) {
      const file = source(path);
      expect(file).not.toContain('firebaseConfig');
      expect(file).not.toContain("from 'firebase/app'");
      expect(file).toContain("from '@/constants/firebase'");
    }
  });
});
