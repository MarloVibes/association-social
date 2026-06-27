const OFFENSES = new Set(['balanced', 'pace_and_space', 'post_heavy', 'pick_and_roll', 'isolation']);
const DEFENSES = new Set(['drop', 'switch_heavy', 'zone', 'pressure', 'protect_paint']);
const MODIFIERS = ['pace', 'threePointRate', 'rimPressure', 'midrangeRate', 'turnovers', 'fouls', 'rebounding', 'fatigue'];

function callableError(HttpsError, code, message, details) {
  return new HttpsError(code, message, details);
}

function cleanText(value, fallback = '') {
  return String(value || fallback).trim();
}

function activeSlot(slot) {
  return (slot.status || 'active') === 'active';
}

function sanitizeRotation(rotation) {
  if (!Array.isArray(rotation)) return { valid: false, errors: ['rotation_required'], rotation: [] };
  const cleaned = rotation.slice(0, 15).map(slot => {
    const next = {
      playerId: cleanText(slot && slot.playerId),
      minutes: Number(slot && slot.minutes),
      status: ['active', 'inactive', 'rest'].includes(slot && slot.status) ? slot.status : 'active',
    };
    if (slot && typeof slot.starter === 'boolean') next.starter = slot.starter;
    if (slot && typeof slot.closing === 'boolean') next.closing = slot.closing;
    if (Number.isFinite(Number(slot && slot.benchOrder))) next.benchOrder = Number(slot.benchOrder);
    const role = cleanText(slot && slot.role);
    if (role) next.role = role;
    return next;
  });
  const errors = [];
  const seen = new Set();
  for (const slot of cleaned) {
    if (!slot.playerId && !errors.includes('player_required')) errors.push('player_required');
    if (seen.has(slot.playerId) && !errors.includes('duplicate_player')) errors.push('duplicate_player');
    seen.add(slot.playerId);
    if (!Number.isFinite(slot.minutes) || slot.minutes < 0 || slot.minutes > 48) {
      if (!errors.includes('invalid_minutes')) errors.push('invalid_minutes');
    }
    if (!activeSlot(slot) && Number(slot.minutes || 0) > 0 && !errors.includes('inactive_minutes')) {
      errors.push('inactive_minutes');
    }
  }
  const active = cleaned.filter(activeSlot);
  const totalMinutes = active.reduce((total, slot) => total + Number(slot.minutes || 0), 0);
  if (totalMinutes !== 240 && !errors.includes('inactive_minutes')) errors.push('minutes_total');
  if (cleaned.some(slot => slot.starter !== undefined) && active.filter(slot => slot.starter).length !== 5) {
    errors.push('starters_required');
  }
  if (cleaned.some(slot => slot.closing !== undefined) && active.filter(slot => slot.closing).length !== 5) {
    errors.push('closing_lineup_required');
  }
  return { valid: errors.length === 0, errors, rotation: cleaned };
}

function clampModifier(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-10, Math.min(10, Math.round(number)));
}

function sanitizeCoachingPreset(preset) {
  if (!preset || typeof preset !== 'object') return { valid: false, errors: ['preset_required'], preset: null };
  const id = cleanText(preset.id);
  const name = cleanText(preset.name);
  const offense = cleanText(preset.offense);
  const defense = cleanText(preset.defense);
  const errors = [];
  if (!id) errors.push('id_required');
  if (!name) errors.push('name_required');
  if (!OFFENSES.has(offense)) errors.push('invalid_offense');
  if (!DEFENSES.has(defense)) errors.push('invalid_defense');
  const modifiers = {};
  MODIFIERS.forEach(key => {
    modifiers[key] = clampModifier(preset.modifiers && preset.modifiers[key]);
  });
  const sanitized = {
    id,
    name,
    description: cleanText(preset.description, `${name} game plan.`),
    boostSummary: cleanText(preset.boostSummary, 'Uses your selected coaching style modifiers.'),
    offense,
    defense,
    modifiers,
    counters: Array.isArray(preset.counters)
      ? preset.counters.map(cleanText).filter(item => DEFENSES.has(item)).slice(0, 3)
      : [],
  };
  if (sanitized.counters.length === 0) sanitized.counters = [defense].filter(item => DEFENSES.has(item));
  return { valid: errors.length === 0, errors, preset: sanitized };
}

async function controlledTeamRef({ db, leagueRef, uid }) {
  const teamsSnap = await leagueRef.collection('teams').where('gmId', '==', uid).limit(1).get();
  if (teamsSnap.empty) return null;
  const doc = teamsSnap.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() || {} };
}

function requireAuth(request, HttpsError) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw callableError(HttpsError, 'unauthenticated', 'You must be signed in.');
  return uid;
}

async function requireLeagueAndTeam({ getFirestore, HttpsError, request }) {
  const uid = requireAuth(request, HttpsError);
  const leagueId = cleanText(request.data && request.data.leagueId);
  if (!leagueId) throw callableError(HttpsError, 'invalid-argument', 'Provide leagueId.');
  const db = getFirestore();
  const leagueRef = db.collection('leagues').doc(leagueId);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw callableError(HttpsError, 'not-found', 'League not found.');
  const league = leagueSnap.data() || {};
  if ((league.sport || 'nba') !== 'nba') {
    throw callableError(HttpsError, 'failed-precondition', 'These settings are only available for NBA leagues.');
  }
  const team = await controlledTeamRef({ db, leagueRef, uid });
  if (!team) throw callableError(HttpsError, 'permission-denied', 'You must control a team in this league.');
  return { team };
}

function createSaveTeamRotationHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async (request) => {
    const { team } = await requireLeagueAndTeam({ getFirestore, HttpsError, request });
    const result = sanitizeRotation(request.data && request.data.rotation);
    if (!result.valid) {
      throw callableError(HttpsError, 'invalid-argument', 'Rotation needs work before saving.', { errors: result.errors });
    }
    await team.ref.update({
      rotation: result.rotation,
      rotationUpdatedAt: serverTimestamp(),
    });
    return { saved: true, teamId: team.id };
  };
}

function createSaveTeamCoachingPresetHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async (request) => {
    const { team } = await requireLeagueAndTeam({ getFirestore, HttpsError, request });
    const result = sanitizeCoachingPreset(request.data && request.data.preset);
    if (!result.valid) {
      throw callableError(HttpsError, 'invalid-argument', 'Coaching preset needs work before saving.', { errors: result.errors });
    }
    const presets = Array.isArray(team.data.coachingPresets) ? team.data.coachingPresets : [];
    await team.ref.update({
      coachingPresets: [
        ...presets.filter(preset => preset && preset.id !== result.preset.id),
        result.preset,
      ],
      defaultCoachingPresetId: result.preset.id,
      coachingUpdatedAt: serverTimestamp(),
    });
    return { saved: true, teamId: team.id, presetId: result.preset.id };
  };
}

module.exports = {
  createSaveTeamCoachingPresetHandler,
  createSaveTeamRotationHandler,
  sanitizeCoachingPreset,
  sanitizeRotation,
};
