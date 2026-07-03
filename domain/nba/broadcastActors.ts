export type BroadcastTeamUniformSource = {
  teamId?: string;
  id?: string;
  abbreviation?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type BroadcastPlayerSource = {
  playerId?: string;
  player_id?: string;
  id?: string;
  name?: string;
  full_name?: string;
  jerseyNumber?: string | number | null;
  jersey_number?: string | number | null;
  number?: string | number | null;
  position?: string | null;
  visualIdentity?: (Partial<Omit<BroadcastPlayerIdentity, 'accessories'>> & { accessories?: readonly string[] }) | null;
};

export type BroadcastPlayerIdentity = {
  skinTone: 'light' | 'medium' | 'dark' | 'deep';
  hairStyle: 'short' | 'short-fade' | 'braids' | 'headband' | 'bald';
  hairColor: 'black' | 'brown' | 'blond';
  bodyBuild: 'guard' | 'wing' | 'big';
  facialHair: 'none' | 'goatee' | 'beard';
  accessories: string[];
};

export type BroadcastUniform = {
  teamId: string;
  abbr: string;
  primary: string;
  secondary: string;
  number: string;
  numberColor: string;
};

export type BroadcastActor = {
  id: string;
  name: string;
  label: string;
  side: 'home' | 'away';
  slot: number;
  position: string;
  identity: BroadcastPlayerIdentity;
  uniform: BroadcastUniform;
};

const DEFAULT_PRIMARY = '#1f2937';
const DEFAULT_SECONDARY = '#f8fafc';
const SKIN_TONES: BroadcastPlayerIdentity['skinTone'][] = ['light', 'medium', 'dark', 'deep'];
const HAIR_STYLES: BroadcastPlayerIdentity['hairStyle'][] = ['short', 'short-fade', 'braids', 'headband', 'bald'];

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function cleanHex(value: unknown, fallback: string) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function playerId(player: BroadcastPlayerSource) {
  return String(player.playerId || player.player_id || player.id || player.full_name || player.name || 'player').trim();
}

function playerName(player: BroadcastPlayerSource) {
  return String(player.name || player.full_name || playerId(player)).trim();
}

function jerseyNumber(player: BroadcastPlayerSource) {
  const raw = player.jerseyNumber ?? player.jersey_number ?? player.number;
  const text = String(raw ?? '').trim();
  if (text) return text.replace(/[^\d]/g, '').slice(0, 2) || text.slice(0, 2).toUpperCase();
  const fromId = playerId(player).match(/\d+$/)?.[0];
  return fromId?.slice(-2) || '0';
}

function bodyBuildFor(player: BroadcastPlayerSource, hash: number): BroadcastPlayerIdentity['bodyBuild'] {
  const position = String(player.position || '').toUpperCase();
  if (position === 'C' || position === 'PF') return 'big';
  if (position === 'SF') return 'wing';
  if (position === 'PG' || position === 'SG') return 'guard';
  return (['guard', 'wing', 'big'] as const)[hash % 3];
}

export function buildBroadcastIdentity(player: BroadcastPlayerSource): BroadcastPlayerIdentity {
  const hash = stableHash(playerId(player));
  const provided = player.visualIdentity || {};
  return {
    skinTone: provided.skinTone || SKIN_TONES[hash % SKIN_TONES.length],
    hairStyle: provided.hairStyle || HAIR_STYLES[Math.floor(hash / 3) % HAIR_STYLES.length],
    hairColor: provided.hairColor || (hash % 7 === 0 ? 'brown' : 'black'),
    bodyBuild: provided.bodyBuild || bodyBuildFor(player, hash),
    facialHair: provided.facialHair || (hash % 5 === 0 ? 'beard' : hash % 3 === 0 ? 'goatee' : 'none'),
    accessories: Array.isArray(provided.accessories) ? provided.accessories : [],
  };
}

export function buildBroadcastActor({
  player,
  team,
  side,
  slot,
}: {
  player: BroadcastPlayerSource;
  team: BroadcastTeamUniformSource;
  side: 'home' | 'away';
  slot: number;
}): BroadcastActor {
  const number = jerseyNumber(player);
  const teamId = String(team.teamId || team.id || team.abbreviation || side).trim();
  return {
    id: playerId(player),
    name: playerName(player),
    label: number,
    side,
    slot,
    position: String(player.position || '').toUpperCase() || ['PG', 'SG', 'SF', 'PF', 'C'][slot] || 'G',
    identity: buildBroadcastIdentity(player),
    uniform: {
      teamId,
      abbr: String(team.abbreviation || teamId).toUpperCase(),
      primary: cleanHex(team.primaryColor, DEFAULT_PRIMARY),
      secondary: cleanHex(team.secondaryColor, DEFAULT_SECONDARY),
      number,
      numberColor: side === 'home' ? '#ffffff' : '#111111',
    },
  };
}

export function buildBroadcastActorsForLineup({
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
}: {
  homeTeam: BroadcastTeamUniformSource;
  awayTeam: BroadcastTeamUniformSource;
  homePlayers: BroadcastPlayerSource[];
  awayPlayers: BroadcastPlayerSource[];
}): BroadcastActor[] {
  const home = homePlayers.slice(0, 5).map((player, slot) => buildBroadcastActor({ player, team: homeTeam, side: 'home', slot }));
  const away = awayPlayers.slice(0, 5).map((player, slot) => buildBroadcastActor({ player, team: awayTeam, side: 'away', slot }));
  return [...away, ...home];
}
