import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  authorizeFinalization,
  canonicalCpuTeams,
  evaluateCpuTrade,
  matchesCpuIdentity,
  validateTeamBindings,
  resolveCpuIdentity,
  swapAssets,
  tradeFingerprint,
  validationInput,
} = require('../../functions/domain/finalizeTrade.js');

describe('finalizeTrade domain', () => {
  it('allows participants only for mutually confirmed instant trades', () => {
    const league = { tradeApprovalMode: 'instant', commissionerId: 'comm' };
    const room = {
      status: 'open',
      hostUid: 'host',
      guestUid: 'guest',
      hostConfirmed: true,
      guestConfirmed: true,
    };

    expect(authorizeFinalization({ uid: 'host', league, source: room, type: 'room' })).toBe(true);
    expect(authorizeFinalization({
      uid: 'host',
      league: { ...league, tradeApprovalMode: 'veto' },
      source: room,
      type: 'room',
    })).toBe(false);
  });

  it('allows commissioners to finalize pending veto and CPU requests', () => {
    const league = { commissionerId: 'comm', coCommissioners: ['co'] };

    expect(authorizeFinalization({
      uid: 'co',
      league,
      source: { status: 'pending_veto' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'comm',
      league,
      source: { status: 'pending' },
      type: 'cpu',
    })).toBe(true);
  });

  it('allows a proposer to finalize a CPU-accepted trade when CPU trades are enabled', () => {
    const source = {
      status: 'cpu_accepted',
      proposerUid: 'gm-1',
      cpuDecision: { decision: 'accept' },
    };

    expect(authorizeFinalization({
      uid: 'gm-1',
      league: { commissionerId: 'comm', allowCpuTrades: true },
      source,
      type: 'cpu',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'gm-1',
      league: { commissionerId: 'comm', allowCpuTrades: false },
      source,
      type: 'cpu',
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'other-gm',
      league: { commissionerId: 'comm', allowCpuTrades: true },
      source,
      type: 'cpu',
    })).toBe(false);
  });

  it('allows vote-passed rooms only for league members, commissioners, or participants', () => {
    const league = { commissionerId: 'comm', members: ['member'] };

    expect(authorizeFinalization({
      uid: 'member',
      league,
      source: { status: 'vote_passed' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'host',
      league: { commissionerId: 'comm', members: [] },
      source: { status: 'vote_passed', hostUid: 'host', guestUid: 'guest' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'outsider',
      league,
      source: { status: 'vote_passed', hostUid: 'host', guestUid: 'guest' },
      type: 'room',
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'member',
      league,
      source: { status: 'pending_vote' },
      type: 'room',
    })).toBe(false);
  });

  it('allows pending veto auto-approval after the deadline only for participants or commissioners', () => {
    const league = { commissionerId: 'comm', members: ['member'] };
    const expired = {
      status: 'pending_veto',
      hostUid: 'host',
      guestUid: 'guest',
      vetoDeadline: 999,
    };
    const pending = { ...expired, vetoDeadline: 1001 };

    expect(authorizeFinalization({
      uid: 'member', league, source: expired, type: 'room', now: 1000,
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'host', league: { ...league, members: [] }, source: expired, type: 'room', now: 1000,
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'member', league, source: pending, type: 'room', now: 1000,
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'comm', league, source: pending, type: 'room', now: 1000,
    })).toBe(true);
  });

  it('rejects active finalization in paused or archived leagues', () => {
    const room = {
      status: 'open',
      hostUid: 'host',
      guestUid: 'guest',
      hostConfirmed: true,
      guestConfirmed: true,
    };

    expect(authorizeFinalization({
      uid: 'host',
      league: { commissionerId: 'comm', tradeApprovalMode: 'instant', paused: true },
      source: room,
      type: 'room',
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'comm',
      league: { commissionerId: 'comm', archived: true },
      source: { status: 'pending', proposerUid: 'host' },
      type: 'cpu',
    })).toBe(false);
  });

  it('swaps authoritative players and picks', () => {
    const teamA = {
      players: [{ player_id: 'a' }, { player_id: 'stay-a' }],
      picks: [{ id: 'pick-a' }],
      rotation: [
        { playerId: 'a', minutes: 34 },
        { playerId: 'stay-a', minutes: 28 },
      ],
    };
    const teamB = {
      players: [{ player_id: 'b' }],
      picks: [{ id: 'pick-b' }],
      rotation: [{ playerId: 'b', minutes: 30 }],
    };

    expect(swapAssets({
      teamA,
      teamB,
      offerA: [{ player_id: 'a' }],
      offerB: [{ player_id: 'b' }],
      pickOfferA: [{ id: 'pick-a' }],
      pickOfferB: [{ id: 'pick-b' }],
    })).toEqual({
      teamA: {
        players: [{ player_id: 'stay-a' }, { player_id: 'b' }],
        picks: [{ id: 'pick-b' }],
        rotation: [{ playerId: 'stay-a', minutes: 28 }],
      },
      teamB: {
        players: [{ player_id: 'a' }],
        picks: [{ id: 'pick-a' }],
        rotation: [],
      },
    });
  });

  it('requires room teams to be distinct, league-bound, and owned by participants', () => {
    const valid = {
      leagueId: 'league',
      type: 'room',
      source: { leagueId: 'league', hostUid: 'host', guestUid: 'guest' },
      teamAId: 'a',
      teamBId: 'b',
      teamA: { gmId: 'host' },
      teamB: { gmId: 'guest' },
    };

    expect(validateTeamBindings(valid)).toEqual({ valid: true });
    expect(validateTeamBindings({ ...valid, teamBId: 'a' }).valid).toBe(false);
    expect(validateTeamBindings({
      ...valid, source: { ...valid.source, leagueId: 'other' },
    }).valid).toBe(false);
    expect(validateTeamBindings({
      ...valid, teamA: { gmId: 'outsider' },
    }).valid).toBe(false);
  });

  it('requires CPU proposer ownership and trusted unclaimed CPU identity', () => {
    expect(validateTeamBindings({
      leagueId: 'league',
      type: 'cpu',
      source: { proposerUid: 'proposer' },
      teamAId: 'a',
      teamBId: 'cpu_BOS',
      teamA: { gmId: 'other' },
      teamB: {},
    }).valid).toBe(false);

    const identity = resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [{ id: 'bos', abbreviation: 'BOS', full_name: 'Boston' }],
      liveTeams: [{ teamId: 'ny', abbreviation: 'NYK', gmId: 'gm' }],
    });
    expect(identity).toEqual(expect.objectContaining({ id: 'bos', abbreviation: 'BOS' }));
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [],
      liveTeams: [],
    })).toBeNull();
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [{ id: 'bos', abbreviation: 'BOS' }],
      liveTeams: [{ teamId: 'bos', abbreviation: 'BOS', gmId: 'gm' }],
    })).toBeNull();
    expect(matchesCpuIdentity(
      { teamId: 'bos', abbreviation: 'BOS' },
      { id: 'bos', abbreviation: 'BOS' },
    )).toBe(true);
    expect(matchesCpuIdentity(
      { teamId: 'ny', abbreviation: 'NYK' },
      { id: 'bos', abbreviation: 'BOS' },
    )).toBe(false);
  });

  it('derives Madden and MLB CPU identities from trusted pool abbreviations', () => {
    const players = [{ team: 'KC' }, { team: 'kc' }, { team: 'LAD' }, { team: 'ATH' }, { team: '' }];
    expect(canonicalCpuTeams('madden', players, [])).toEqual([
      { id: 'ATH', abbreviation: 'ATH', name: 'ATH' },
      { id: 'KC', abbreviation: 'KC', name: 'Kansas City Chiefs' },
      { id: 'LAD', abbreviation: 'LAD', name: 'LAD' },
    ]);
    expect(canonicalCpuTeams('mlb', players, [])).toEqual([
      { id: 'ATH', abbreviation: 'ATH', name: 'Athletics' },
      { id: 'KC', abbreviation: 'KC', name: 'Kansas City Royals' },
      { id: 'LAD', abbreviation: 'LAD', name: 'Los Angeles Dodgers' },
    ]);
  });

  it('rejects mismatched requested CPU id and abbreviation', () => {
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'NYK',
      eraTeams: [
        { id: 'bos', abbreviation: 'BOS' },
        { id: 'nyk', abbreviation: 'NYK' },
      ],
      liveTeams: [],
    })).toBeNull();
  });

  it('honors salary override only when finalization supplies a server approval receipt', () => {
    const base = {
      league: { sport: 'nba', commissionerCanOverride: true, commissionerId: 'comm' },
      source: {
        salaryOverrideApplied: true,
        overrideApprovedBy: 'comm',
        hostOffer: [],
        guestOffer: [],
      },
      teamA: {},
      teamB: {},
      type: 'room',
    };

    expect(validationInput(base).commissionerOverride).toBe(false);
    expect(validationInput({ ...base, approvedOverride: true }).commissionerOverride).toBe(true);
  });

  it('binds override receipts to the exact teams and assets', () => {
    const source = {
      hostTeamId: 'a',
      guestTeamId: 'b',
      hostOffer: [{ player_id: 'p2' }, { player_id: 'p1' }],
      guestOffer: [{ player_id: 'p3' }],
      hostPicks: [{ id: 'pick-1' }],
      guestPicks: [],
    };
    expect(tradeFingerprint(source)).toBe(tradeFingerprint({
      ...source,
      hostOffer: [...source.hostOffer].reverse(),
    }));
    expect(tradeFingerprint(source)).not.toBe(tradeFingerprint({
      ...source,
      guestOffer: [{ player_id: 'changed' }],
    }));
  });

  it('makes CPU teams reject star-steal offers', () => {
    const decision = evaluateCpuTrade({
      league: { sport: 'nba' },
      proposerTeam: {
        players: [
          { player_id: 'bench', full_name: 'Bench Guard', position: 'PG', overall: 70, age: 28 },
        ],
      },
      cpuTeam: {
        wins: 42,
        losses: 20,
        players: [
          { player_id: 'star', full_name: 'CPU Star', position: 'SF', overall: 94, age: 27 },
          { player_id: 'starter', full_name: 'CPU Starter', position: 'C', overall: 80, age: 29 },
        ],
      },
      source: {
        give: [{ player_id: 'bench', full_name: 'Bench Guard', position: 'PG', overall: 70, age: 28 }],
        get: [{ player_id: 'star', full_name: 'CPU Star', position: 'SF', overall: 94, age: 27 }],
        givePicks: [],
        getPicks: [],
      },
    });

    expect(decision.decision).toBe('decline');
    expect(decision.reasons.join(' ')).toContain('star');
  });

  it('protects stat-rich Madden CPU stars without raw overall ratings', () => {
    const cpuQuarterback = {
      player_id: 'qb-star',
      sport: 'madden',
      full_name: 'CPU Franchise QB',
      position: 'QB',
      passing_yards: 4520,
      passing_tds: 36,
      rushing_yards: 380,
      ratings: { awareness: 91, technique: 88, speed: 82 },
      age: 27,
    };
    const decision = evaluateCpuTrade({
      league: { sport: 'madden' },
      proposerTeam: {
        players: [
          {
            player_id: 'depth-wr',
            sport: 'madden',
            full_name: 'Depth Receiver',
            position: 'WR',
            receiving_yards: 180,
            ratings: { awareness: 60, speed: 70 },
            age: 29,
          },
        ],
      },
      cpuTeam: {
        wins: 11,
        losses: 5,
        players: [
          cpuQuarterback,
          {
            player_id: 'wr-two',
            sport: 'madden',
            full_name: 'CPU WR2',
            position: 'WR',
            receiving_yards: 850,
            ratings: { awareness: 75, speed: 83 },
            age: 25,
          },
        ],
      },
      source: {
        give: [
          {
            player_id: 'depth-wr',
            sport: 'madden',
            full_name: 'Depth Receiver',
            position: 'WR',
            receiving_yards: 180,
            ratings: { awareness: 60, speed: 70 },
            age: 29,
          },
        ],
        get: [cpuQuarterback],
        givePicks: [],
        getPicks: [],
      },
    });

    expect(decision.decision).toBe('decline');
    expect(decision.reasons.join(' ')).toContain('star');
  });

  it('protects stat-rich MLB CPU stars without raw overall ratings', () => {
    const cpuAce = {
      player_id: 'ace',
      sport: 'mlb',
      full_name: 'CPU Ace',
      position: 'SP',
      era: 2.61,
      whip: 1.02,
      so: 215,
      ratings: { command: 90, stamina: 84, velocity: 88 },
      age: 28,
    };
    const decision = evaluateCpuTrade({
      league: { sport: 'mlb' },
      proposerTeam: {
        players: [
          {
            player_id: 'bench-bat',
            sport: 'mlb',
            full_name: 'Bench Bat',
            position: 'LF',
            avg: 0.218,
            hr: 4,
            ratings: { contact: 58, power: 61 },
            age: 30,
          },
        ],
      },
      cpuTeam: {
        wins: 88,
        losses: 74,
        players: [
          cpuAce,
          {
            player_id: 'slugger',
            sport: 'mlb',
            full_name: 'CPU Slugger',
            position: '1B',
            avg: 0.276,
            hr: 31,
            rbi: 96,
            ratings: { contact: 79, power: 87 },
            age: 27,
          },
        ],
      },
      source: {
        give: [
          {
            player_id: 'bench-bat',
            sport: 'mlb',
            full_name: 'Bench Bat',
            position: 'LF',
            avg: 0.218,
            hr: 4,
            ratings: { contact: 58, power: 61 },
            age: 30,
          },
        ],
        get: [cpuAce],
        givePicks: [],
        getPicks: [],
      },
    });

    expect(decision.decision).toBe('decline');
    expect(decision.reasons.join(' ')).toContain('star');
  });

  it('lets rebuilding CPU teams accept fair young-player and pick value', () => {
    const decision = evaluateCpuTrade({
      league: { sport: 'nba' },
      proposerTeam: {
        players: [
          { player_id: 'young', full_name: 'Young Wing', position: 'SF', overall: 82, potential: 90, age: 22 },
        ],
      },
      cpuTeam: {
        wins: 14,
        losses: 48,
        players: [
          { player_id: 'vet', full_name: 'Veteran Guard', position: 'SG', overall: 85, age: 33 },
          { player_id: 'big', full_name: 'Backup Big', position: 'C', overall: 74, age: 25 },
        ],
      },
      source: {
        give: [{ player_id: 'young', full_name: 'Young Wing', position: 'SF', overall: 82, potential: 90, age: 22 }],
        get: [{ player_id: 'vet', full_name: 'Veteran Guard', position: 'SG', overall: 85, age: 33 }],
        givePicks: [{ id: 'pick-1', round: 1, year: 2027 }],
        getPicks: [],
      },
    });

    expect(decision.decision).toBe('accept');
    expect(decision.identity).toBe('rebuilding');
  });
});
