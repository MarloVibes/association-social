export type StoryQuarter = {
  quarter?: number;
  home?: number;
  away?: number;
};

export type StoryPlayer = {
  playerId?: string;
  name?: string;
  side?: string;
  sideAbbr?: string;
  starter?: boolean;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
};

export function genericStoredStory(story?: string) {
  const text = String(story || '').toLowerCase();
  return text.includes('controlled the decisive stretches')
    || text.includes('balanced rotation production')
    || text.includes('roster strength and rotation production');
}

function stat(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function playerImpactScore(player: StoryPlayer) {
  return stat(player.points) * 2
    + stat(player.rebounds) * 1.15
    + stat(player.assists) * 1.35
    + stat(player.steals) * 2
    + stat(player.blocks) * 2
    - stat(player.turnovers) * 0.8;
}

function periodLabel(period: unknown) {
  const value = Number(period || 0);
  if (value === 1) return 'first quarter';
  if (value === 2) return 'second quarter';
  if (value === 3) return 'third quarter';
  if (value === 4) return 'fourth quarter';
  if (value === 5) return 'overtime';
  if (value > 5) return `${value - 4}OT`;
  return 'closing stretch';
}

function playerStoryLine(player: StoryPlayer) {
  const points = stat(player.points);
  const rebounds = stat(player.rebounds);
  const assists = stat(player.assists);
  const extras = [];
  if (points >= 10 && rebounds >= 10) extras.push('a double-double');
  if (points >= 10 && assists >= 10) extras.push(extras.length > 0 ? '10-plus assists' : 'a points-assists double-double');
  const core = `${points} points, ${rebounds} rebounds, and ${assists} assists`;
  return extras.length > 0 ? `${core} including ${extras.join(' and ')}` : core;
}

function teamKey(player: StoryPlayer) {
  return String(player.sideAbbr || player.side || '').toUpperCase();
}

export function buildPostgameStory({
  storedStory,
  homeLabel,
  awayLabel,
  homeAbbr,
  awayAbbr,
  homeScore,
  awayScore,
  quarters = [],
  performers = [],
}: {
  storedStory?: string;
  homeLabel: string;
  awayLabel: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  quarters?: StoryQuarter[];
  performers?: StoryPlayer[];
}) {
  if (storedStory && !genericStoredStory(storedStory)) return storedStory;

  const homeWon = Number(homeScore || 0) > Number(awayScore || 0);
  const winner = homeWon ? homeLabel : awayLabel;
  const loser = homeWon ? awayLabel : homeLabel;
  const winnerAbbr = String(homeWon ? homeAbbr : awayAbbr).toUpperCase();
  const loserAbbr = String(homeWon ? awayAbbr : homeAbbr).toUpperCase();
  const winnerScore = homeWon ? Number(homeScore || 0) : Number(awayScore || 0);
  const loserScore = homeWon ? Number(awayScore || 0) : Number(homeScore || 0);
  const margin = Math.abs(Number(homeScore || 0) - Number(awayScore || 0));
  const opener = quarters.some(quarter => Number(quarter.quarter) > 4)
    ? `${winner} outlasted ${loser} in overtime, ${winnerScore}-${loserScore}.`
    : margin <= 3
      ? `${winner} survived a one-possession finish against ${loser}, ${winnerScore}-${loserScore}.`
      : margin <= 9
        ? `${winner} closed a tight game over ${loser}, ${winnerScore}-${loserScore}.`
        : margin >= 20
          ? `${winner} ran away from ${loser}, ${winnerScore}-${loserScore}.`
          : `${winner} handled the key stretches against ${loser}, ${winnerScore}-${loserScore}.`;

  const sorted = [...performers].sort((left, right) => playerImpactScore(right) - playerImpactScore(left));
  const winnerPlayers = sorted.filter(player => teamKey(player) === winnerAbbr);
  const loserPlayers = sorted.filter(player => teamKey(player) === loserAbbr);
  const leader = winnerPlayers[0] || sorted[0];
  const opponentLeader = loserPlayers[0] || sorted.find(player => player !== leader && teamKey(player) !== teamKey(leader || {}));
  const benchSpark = winnerPlayers
    .filter(player => !player.starter && stat(player.points) >= 12)
    .sort((left, right) => stat(right.points) - stat(left.points) || playerImpactScore(right) - playerImpactScore(left))[0];
  const leaderLine = leader
    ? `${leader.name || 'The top performer'} powered the win with ${playerStoryLine(leader)}.`
    : '';
  const responseLine = opponentLeader
    ? `${opponentLeader.name || `${loserAbbr}'s top option`} answered with ${stat(opponentLeader.points)} points for ${loserAbbr}.`
    : '';
  const benchLine = benchSpark
    ? `${benchSpark.name || 'A reserve'} gave ${winnerAbbr} a bench spark with ${stat(benchSpark.points)} points.`
    : '';
  const swing = quarters
    .map(quarter => {
      const diff = stat(quarter.home) - stat(quarter.away);
      return { quarter, winnerDiff: homeWon ? diff : -diff };
    })
    .filter(item => item.winnerDiff > 0)
    .sort((left, right) => right.winnerDiff - left.winnerDiff)[0];
  const swingLine = swing
    ? `${winnerAbbr}'s best stretch came in the ${periodLabel(swing.quarter.quarter)}, winning that period by ${swing.winnerDiff}.`
    : '';

  return [opener, leaderLine, responseLine, benchLine, swingLine].filter(Boolean).join(' ');
}
