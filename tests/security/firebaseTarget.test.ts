import { describe, expect, it } from 'vitest';

import {
  firebaseConfigFor,
  resolveFirebaseTarget,
} from '../../constants/firebaseProjects';

describe('Firebase project selection', () => {
  it('keeps production as the safe default', () => {
    expect(resolveFirebaseTarget()).toBe('production');
    expect(resolveFirebaseTarget('production')).toBe('production');
    expect(resolveFirebaseTarget('unexpected')).toBe('production');
    expect(firebaseConfigFor('production').projectId).toBe('association-social');
  });

  it('uses the isolated project only when demo is explicit', () => {
    expect(resolveFirebaseTarget('demo')).toBe('demo');
    expect(firebaseConfigFor('demo').projectId).toBe('association-social-demo');
    expect(firebaseConfigFor('demo').appId).not.toBe(firebaseConfigFor('production').appId);
  });
});
