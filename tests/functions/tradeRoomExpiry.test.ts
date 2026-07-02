import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  TRADE_ROOM_AUTO_CLOSE_MS,
  activeTradeRoomStatuses,
  isTradeRoomExpired,
  tradeRoomExpiryFromNow,
} = require('../../functions/domain/tradeRoomExpiry.js');

describe('trade room expiry domain', () => {
  it('expires active trade rooms after fifteen minutes of inactivity', () => {
    expect(TRADE_ROOM_AUTO_CLOSE_MS).toBe(15 * 60 * 1000);
    expect(activeTradeRoomStatuses()).toEqual(['open', 'live', 'pushed', 'countered']);
    expect(isTradeRoomExpired({
      status: 'open',
      updatedAtMs: 1_000,
    }, 1_000 + TRADE_ROOM_AUTO_CLOSE_MS)).toBe(true);
  });

  it('uses explicit expiresAt when present and leaves terminal rooms alone', () => {
    expect(isTradeRoomExpired({
      status: 'pushed',
      updatedAtMs: 1_000,
      expiresAtMs: 10_000,
    }, 9_999)).toBe(false);
    expect(isTradeRoomExpired({
      status: 'pushed',
      updatedAtMs: 1_000,
      expiresAtMs: 10_000,
    }, 10_000)).toBe(true);
    expect(isTradeRoomExpired({
      status: 'executed',
      updatedAtMs: 1_000,
      expiresAtMs: 10_000,
    }, 99_999)).toBe(false);
  });

  it('builds a fresh expiry timestamp for trade activity', () => {
    expect(tradeRoomExpiryFromNow(25_000)).toEqual({
      expiresAtMs: 25_000 + TRADE_ROOM_AUTO_CLOSE_MS,
    });
  });
});
