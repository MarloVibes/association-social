import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadLocalEraData,
  readDemoServiceAccount,
} from '../../scripts/seed-pitch-demo-league.mjs';

function serviceAccountFile(projectId: string) {
  const directory = mkdtempSync(join(tmpdir(), 'pitch-demo-service-account-'));
  const path = join(directory, 'service-account.json');
  writeFileSync(path, JSON.stringify({ project_id: projectId }));
  return path;
}

describe('pitch demo seed isolation', () => {
  it('builds all 30 current teams from the checked-in local snapshot', () => {
    const { teams, sourceFile } = loadLocalEraData('current');

    expect(sourceFile).toBe('data/nba/current-player-pool.json');
    expect(teams).toHaveLength(30);
    expect(teams.every(team => team.players.length > 0)).toBe(true);
  });

  it('refuses a production service account', () => {
    const path = serviceAccountFile('association-social');

    expect(() => readDemoServiceAccount(path)).toThrow(
      'Refusing to seed Firebase project association-social',
    );
  });

  it('accepts only the isolated demo project service account', () => {
    const path = serviceAccountFile('association-social-demo');

    expect(readDemoServiceAccount(path).project_id).toBe('association-social-demo');
  });

  it('refuses eras without a reviewed local snapshot', () => {
    expect(() => loadLocalEraData('jordan')).toThrow('currently supports: current');
  });
});
