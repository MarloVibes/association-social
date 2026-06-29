import { displayScheduleAbbr, displayScheduleName, scheduleKeyAliases } from './scheduleView';

export type NbaAwardKind = 'championship' | 'player' | 'coach' | 'team';

export type NbaAwardCategory = {
  key: string;
  title: string;
  shortTitle: string;
  kind: NbaAwardKind;
  description: string;
  symbol: string;
};

export type NbaAwardRecord = {
  season?: string | number | null;
  winnerName?: string | null;
  teamName?: string | null;
  teamAbbr?: string | null;
  note?: string | null;
};

type AwardParticipant = {
  id?: string | null;
  scheduleTeamId?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  name?: string | null;
  full_name?: string | null;
};

type AwardContext = {
  currentYear?: string | number | null;
  includeProjected?: boolean;
  teams?: Array<AwardParticipant & {
    players?: any[];
  }>;
  standings?: Array<{
    teamId?: string | null;
    abbreviation?: string | null;
    wins?: number;
    losses?: number;
  }>;
  schedule?: {
    participants?: AwardParticipant[];
    playoffs?: {
      rounds?: Array<{
        name?: string | null;
        series?: Array<{
          homeTeamId?: string | null;
          awayTeamId?: string | null;
          homeTeamName?: string | null;
          awayTeamName?: string | null;
          winnerTeamId?: string | null;
        }>;
      }>;
    } | null;
    nbaCup?: {
      championTeamId?: string | null;
      winnerTeamId?: string | null;
      championTeamName?: string | null;
      championTeamAbbr?: string | null;
      seasonYear?: string | number | null;
    } | null;
  } | null;
};

export const NBA_AWARD_CATEGORIES: readonly NbaAwardCategory[] = Object.freeze([
  {
    key: 'championship_rings',
    title: 'NBA Championship Rings',
    shortTitle: 'Rings',
    kind: 'championship',
    description: 'League champions and title rings by season.',
    symbol: 'RING',
  },
  {
    key: 'nba_cup',
    title: 'NBA Cup / Mid-Season Tournament',
    shortTitle: 'NBA Cup',
    kind: 'championship',
    description: 'In-season tournament champions and cup winners.',
    symbol: 'CUP',
  },
  {
    key: 'finals_mvp',
    title: 'NBA Finals MVP',
    shortTitle: 'Finals MVP',
    kind: 'player',
    description: 'Best player of the championship series.',
    symbol: 'FMVP',
  },
  {
    key: 'mvp',
    title: 'Most Valuable Player',
    shortTitle: 'MVP',
    kind: 'player',
    description: 'Regular season most valuable player.',
    symbol: 'MVP',
  },
  {
    key: 'defensive_player',
    title: 'Defensive Player of the Year',
    shortTitle: 'DPOY',
    kind: 'player',
    description: 'Top defensive player in the league.',
    symbol: 'DPOY',
  },
  {
    key: 'rookie',
    title: 'Rookie of the Year',
    shortTitle: 'ROY',
    kind: 'player',
    description: 'Top first-year player.',
    symbol: 'ROY',
  },
  {
    key: 'sixth_man',
    title: 'Sixth Man of the Year',
    shortTitle: '6MOY',
    kind: 'player',
    description: 'Best player coming primarily off the bench.',
    symbol: '6MOY',
  },
  {
    key: 'most_improved',
    title: 'Most Improved Player',
    shortTitle: 'MIP',
    kind: 'player',
    description: 'Player with the biggest season-to-season leap.',
    symbol: 'MIP',
  },
  {
    key: 'coach',
    title: 'Coach of the Year',
    shortTitle: 'COY',
    kind: 'coach',
    description: 'Top coaching season.',
    symbol: 'COY',
  },
  {
    key: 'all_nba',
    title: 'All-NBA Teams',
    shortTitle: 'All-NBA',
    kind: 'team',
    description: 'First, Second, and Third Team selections.',
    symbol: 'ALL',
  },
  {
    key: 'all_defense',
    title: 'All-Defensive Teams',
    shortTitle: 'All-Defense',
    kind: 'team',
    description: 'Top defensive team selections.',
    symbol: 'DEF',
  },
  {
    key: 'all_star',
    title: 'NBA All-Star',
    shortTitle: 'All-Star',
    kind: 'player',
    description: 'All-Star selections by season.',
    symbol: 'STAR',
  },
]);

function normalizeRecord(value: any): NbaAwardRecord | null {
  if (!value) return null;
  if (typeof value === 'string') return { winnerName: value };
  if (typeof value !== 'object') return null;
  return {
    season: value.season || value.year || value.currentYear || null,
    winnerName: value.winnerName || value.playerName || value.name || value.gmName || null,
    teamName: value.teamName || value.team || null,
    teamAbbr: value.teamAbbr || value.abbreviation || null,
    note: value.note || value.result || value.round || null,
  };
}

function recordsFromSource(source: any, key: string): NbaAwardRecord[] {
  const raw = source?.[key];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeRecord).filter(Boolean) as NbaAwardRecord[];
  if (typeof raw === 'object') return Object.values(raw).map(normalizeRecord).filter(Boolean) as NbaAwardRecord[];
  const record = normalizeRecord(raw);
  return record ? [record] : [];
}

function normalizeTeamKey(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function awardTeamAliases(value?: string | null) {
  return scheduleKeyAliases(value).map(normalizeTeamKey).filter(Boolean);
}

function sameAwardTeam(left?: string | null, right?: string | null) {
  const leftKeys = awardTeamAliases(left);
  const rightKeys = new Set(awardTeamAliases(right));
  return leftKeys.some(key => rightKeys.has(key));
}

function participantForTeam(team: AwardParticipant, context?: AwardContext) {
  const teamKeys = [team.scheduleTeamId, team.teamId, team.abbreviation, team.abbr, team.id]
    .flatMap(awardTeamAliases);
  return (context?.schedule?.participants || []).find(participant => (
    [participant.scheduleTeamId, participant.teamId, participant.abbreviation, participant.abbr, participant.id]
      .some(value => teamKeys.some(key => sameAwardTeam(key, value)))
  ));
}

function cleanTeamAbbr(team?: AwardParticipant | null) {
  if (!team) return null;
  return displayScheduleAbbr(team.abbreviation || team.abbr || team.teamId || team.scheduleTeamId || team.id);
}

function cleanTeamName(team?: AwardParticipant | null) {
  if (!team) return null;
  return displayScheduleName(team);
}

function cleanStoredTeamName(rawName?: string | null, rawAbbr?: string | null) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  if (sameAwardTeam(name, rawAbbr) || /^([A-Z]{2,3})_\d{4}$/i.test(name)) {
    return displayScheduleAbbr(name);
  }
  return name;
}

function resolveAwardTeam(team: AwardParticipant, context?: AwardContext) {
  const participant = participantForTeam(team, context);
  const source = participant || team;
  return {
    name: cleanTeamName(source),
    abbr: cleanTeamAbbr(source),
  };
}

function resolveRecordTeam(record: NbaAwardRecord, context?: AwardContext): NbaAwardRecord {
  const lookup = record.teamAbbr || record.teamName || record.winnerName;
  const participant = [...(context?.schedule?.participants || []), ...(context?.teams || [])].find(team => (
    [team.scheduleTeamId, team.teamId, team.abbreviation, team.abbr, team.id]
      .some(value => sameAwardTeam(value, lookup))
  ));
  const abbr = participant ? cleanTeamAbbr(participant) : displayScheduleAbbr(record.teamAbbr || record.teamName || '');
  const name = participant ? cleanTeamName(participant) : cleanStoredTeamName(record.teamName, record.teamAbbr);
  const winnerName = record.winnerName && sameAwardTeam(record.winnerName, lookup) ? (name || abbr) : record.winnerName;
  return {
    ...record,
    winnerName: winnerName || record.winnerName,
    teamName: name || null,
    teamAbbr: abbr || record.teamAbbr || null,
  };
}

function numberFrom(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function playerName(player: any) {
  return player?.full_name || player?.name || player?.winnerName || 'Unnamed Player';
}

function playerStats(player: any) {
  return player?.seasonStats || player?.stats || {};
}

function isRookie(player: any) {
  return Boolean(
    player?.rookie
    || player?.isRookie
    || (player && Object.prototype.hasOwnProperty.call(player, 'yearsPro') && numberFrom(player.yearsPro) === 0)
    || (player && Object.prototype.hasOwnProperty.call(player, 'seasonsPlayed') && numberFrom(player.seasonsPlayed) === 0)
  );
}

function isBenchCandidate(player: any) {
  const stats = playerStats(player);
  if (player?.starter === false || player?.role === 'bench' || player?.role === 'sixth_man') return true;
  const games = numberFrom(stats.games || stats.gp);
  const hasStarts = Object.prototype.hasOwnProperty.call(stats, 'starts');
  const starts = hasStarts ? numberFrom(stats.starts) : 0;
  return hasStarts && games > 0 && starts < games / 2;
}

function playerMetric(player: any, key: string) {
  const stats = playerStats(player);
  if (key === 'games') return numberFrom(stats.games || stats.gp);
  if (key === 'points') return numberFrom(stats.points || stats.pts);
  if (key === 'rebounds') return numberFrom(stats.rebounds || stats.reb);
  if (key === 'assists') return numberFrom(stats.assists || stats.ast);
  if (key === 'steals') return numberFrom(stats.steals || stats.stl);
  if (key === 'blocks') return numberFrom(stats.blocks || stats.blk);
  if (key === 'minutes') return numberFrom(stats.minutes || stats.min);
  return numberFrom(stats[key]);
}

function playerAwardPool(context?: AwardContext) {
  return (context?.teams || []).flatMap(team => (team.players || []).map(player => ({
    player,
    team,
    games: playerMetric(player, 'games'),
  }))).filter(item => item.games > 0);
}

function recordForPlayer(item: { player: any; team: AwardParticipant }, note: string, context?: AwardContext): NbaAwardRecord {
  const team = resolveAwardTeam(item.team, context);
  return {
    season: context?.currentYear || null,
    winnerName: playerName(item.player),
    teamName: team.name || null,
    teamAbbr: team.abbr || null,
    note,
  };
}

function topPlayers(context: AwardContext | undefined, scorer: (item: { player: any; team: AwardParticipant; games: number }) => number, limit = 1) {
  return playerAwardPool(context)
    .sort((left, right) => (
      scorer(right) - scorer(left)
      || playerMetric(right.player, 'games') - playerMetric(left.player, 'games')
      || playerName(left.player).localeCompare(playerName(right.player))
    ))
    .slice(0, limit);
}

function projectedAwardRecords(key: string, context?: AwardContext): NbaAwardRecord[] {
  if (!context?.teams?.length) return [];
  if (key === 'mvp') {
    return topPlayers(context, item => (
      playerMetric(item.player, 'points') * 1
      + playerMetric(item.player, 'assists') * 1.45
      + playerMetric(item.player, 'rebounds') * 0.8
      + playerMetric(item.player, 'steals') * 1.8
      + playerMetric(item.player, 'blocks') * 1.5
    )).map(item => recordForPlayer(item, 'Projected MVP', context));
  }
  if (key === 'defensive_player') {
    return topPlayers(context, item => (
      playerMetric(item.player, 'steals') * 3
      + playerMetric(item.player, 'blocks') * 3
      + playerMetric(item.player, 'rebounds') * 0.6
    )).map(item => recordForPlayer(item, 'Projected DPOY', context));
  }
  if (key === 'rookie') {
    return topPlayers(
      { ...context, teams: context.teams.map(team => ({ ...team, players: (team.players || []).filter(isRookie) })) },
      item => playerMetric(item.player, 'points') + playerMetric(item.player, 'assists') + playerMetric(item.player, 'rebounds') * 0.7,
    ).map(item => recordForPlayer(item, 'Projected ROY', context));
  }
  if (key === 'sixth_man') {
    return topPlayers(
      { ...context, teams: context.teams.map(team => ({ ...team, players: (team.players || []).filter(isBenchCandidate) })) },
      item => playerMetric(item.player, 'points') + playerMetric(item.player, 'assists') * 0.8 + playerMetric(item.player, 'rebounds') * 0.6,
    ).map(item => recordForPlayer(item, 'Projected Sixth Man', context));
  }
  if (key === 'most_improved') {
    return topPlayers(context, item => (
      numberFrom(item.player?.progression?.seasonDeltaTotal)
      || numberFrom(item.player?.improvement)
      || numberFrom(item.player?.developmentPointsEarned)
      || playerMetric(item.player, 'points') * 0.25
    )).map(item => recordForPlayer(item, 'Projected MIP', context));
  }
  if (key === 'all_nba') {
    return topPlayers(context, item => (
      playerMetric(item.player, 'points') * 1
      + playerMetric(item.player, 'assists') * 1.2
      + playerMetric(item.player, 'rebounds') * 0.8
    ), 5).map((item, index) => recordForPlayer(item, `Projected All-NBA ${index + 1}`, context));
  }
  if (key === 'all_defense') {
    return topPlayers(context, item => (
      playerMetric(item.player, 'steals') * 3
      + playerMetric(item.player, 'blocks') * 3
      + playerMetric(item.player, 'rebounds') * 0.5
    ), 5).map((item, index) => recordForPlayer(item, `Projected All-Defense ${index + 1}`, context));
  }
  if (key === 'all_star') {
    return topPlayers(context, item => (
      playerMetric(item.player, 'points') * 1
      + playerMetric(item.player, 'assists')
      + playerMetric(item.player, 'rebounds')
    ), 12).map(item => recordForPlayer(item, 'Projected All-Star', context));
  }
  return [];
}

function participantMatches(participant: AwardParticipant, teamId: string) {
  return [
    participant.scheduleTeamId,
    participant.teamId,
    participant.abbreviation,
    participant.abbr,
    participant.id,
  ].some(value => sameAwardTeam(value, teamId));
}

function scheduleRecordsForAward(key: string, context?: AwardContext): NbaAwardRecord[] {
  if (key === 'championship_rings' || key === 'finals_runner_up') {
    const finalRound = [...(context?.schedule?.playoffs?.rounds || [])]
      .reverse()
      .find(round => round.name === 'final');
    const finalSeries = finalRound?.series?.find(series => series.winnerTeamId);
    const winnerTeamId = normalizeTeamKey(finalSeries?.winnerTeamId);
    if (!finalSeries || !winnerTeamId) return [];
    const homeWon = normalizeTeamKey(finalSeries.homeTeamId) === winnerTeamId;
    const championId = homeWon ? finalSeries.homeTeamId : finalSeries.awayTeamId;
    const runnerUpId = homeWon ? finalSeries.awayTeamId : finalSeries.homeTeamId;
    const championName = homeWon ? finalSeries.homeTeamName : finalSeries.awayTeamName;
    const runnerUpName = homeWon ? finalSeries.awayTeamName : finalSeries.homeTeamName;
    const wantedId = key === 'championship_rings' ? championId : runnerUpId;
    const wantedName = key === 'championship_rings' ? championName : runnerUpName;
    if (!wantedId) return [];
    return [{
      season: context?.currentYear || null,
      winnerName: wantedName || wantedId,
      teamName: wantedName || wantedId,
      teamAbbr: wantedId,
      note: key === 'championship_rings' ? 'NBA Champion' : 'Finals Runner-Up',
    }];
  }
  if (key !== 'nba_cup') return [];
  const cup = context?.schedule?.nbaCup;
  const championTeamId = cup?.championTeamId || cup?.winnerTeamId;
  if (!championTeamId) return [];
  const participant = (context?.schedule?.participants || []).find(team => participantMatches(team, championTeamId));
  const teamName = cup?.championTeamName || cleanTeamName(participant || { abbreviation: championTeamId });
  const teamAbbr = cup?.championTeamAbbr || cleanTeamAbbr(participant || { abbreviation: championTeamId });
  return [{
    season: cup?.seasonYear || context?.currentYear || null,
    winnerName: teamName,
    teamName,
    teamAbbr,
    note: 'NBA Cup Champion',
  }];
}

export function recordsForAward(league: any, key: string, context?: AwardContext): NbaAwardRecord[] {
  return [
    ...recordsFromSource(league?.awards, key),
    ...recordsFromSource(league?.awardHistory, key),
    ...recordsFromSource(league?.trophyCase, key),
    ...recordsFromSource(league?.seasonAwards, key),
    ...scheduleRecordsForAward(key, context),
    ...(context?.includeProjected === false ? [] : projectedAwardRecords(key, context)),
  ].map(record => resolveRecordTeam(record, context));
}
