export type PitchAccessRole = 'founder' | 'viewer' | 'none';

type PitchProfile = {
  pitchAccessRole?: string | null;
  demoAccessRole?: string | null;
  isPitchDemoViewer?: boolean | null;
  pitchDemoViewer?: boolean | null;
};

type PitchLeague = {
  commissionerId?: string | null;
  coCommissioners?: string[] | null;
  pitchDemoLocked?: boolean | null;
  demoAccessLocked?: boolean | null;
  pitchMode?: string | null;
};

export function pitchAccessRoleFromProfile(profile?: PitchProfile | null): PitchAccessRole {
  const role = String(profile?.pitchAccessRole || profile?.demoAccessRole || '').toLowerCase();
  if (role === 'founder' || role === 'owner' || role === 'admin') return 'founder';
  if (role === 'viewer' || role === 'pitch_viewer' || role === 'demo_viewer') return 'viewer';
  if (profile?.isPitchDemoViewer === true || profile?.pitchDemoViewer === true) return 'viewer';
  return 'none';
}

export function isPitchDemoViewer(profile?: PitchProfile | null) {
  return pitchAccessRoleFromProfile(profile) === 'viewer';
}

export function isPitchDemoLocked(league?: PitchLeague | null) {
  return league?.pitchDemoLocked === true
    || league?.demoAccessLocked === true
    || String(league?.pitchMode || '').toLowerCase() === 'locked';
}

export function isLeagueFounderOrCommissioner(league?: PitchLeague | null, uid?: string | null) {
  if (!league || !uid) return false;
  return league.commissionerId === uid || (league.coCommissioners || []).includes(uid);
}

export function canUsePitchSensitiveControls(input: {
  profile?: PitchProfile | null;
  league?: PitchLeague | null;
  uid?: string | null;
}) {
  const role = pitchAccessRoleFromProfile(input.profile);
  if (role === 'viewer') return false;
  if (isPitchDemoLocked(input.league)) return false;
  return true;
}

export function pitchAccessLabel(profile?: PitchProfile | null) {
  const role = pitchAccessRoleFromProfile(profile);
  if (role === 'founder') return 'Founder Pitch Access';
  if (role === 'viewer') return 'Pitch Demo Access';
  return '';
}
