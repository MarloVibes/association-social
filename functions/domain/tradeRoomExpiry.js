'use strict';

const TRADE_ROOM_AUTO_CLOSE_MS = 15 * 60 * 1000;
const ACTIVE_TRADE_ROOM_STATUSES = ['open', 'live', 'pushed', 'countered'];

function activeTradeRoomStatuses() {
  return [...ACTIVE_TRADE_ROOM_STATUSES];
}

function timestampMillis(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function isActiveTradeRoomStatus(status) {
  return ACTIVE_TRADE_ROOM_STATUSES.includes(String(status || ''));
}

function tradeRoomExpiresAtMs(room, now = Date.now()) {
  const explicit = timestampMillis(room && (room.expiresAtMs ?? room.expiresAt));
  if (Number.isFinite(explicit)) return explicit;
  const lastActivity = timestampMillis(room && (room.updatedAtMs ?? room.updatedAt ?? room.createdAt));
  return Number.isFinite(lastActivity) ? lastActivity + TRADE_ROOM_AUTO_CLOSE_MS : now + TRADE_ROOM_AUTO_CLOSE_MS;
}

function isTradeRoomExpired(room, now = Date.now()) {
  if (!room || !isActiveTradeRoomStatus(room.status)) return false;
  return tradeRoomExpiresAtMs(room, now) <= now;
}

function tradeRoomExpiryFromNow(now = Date.now()) {
  return {
    expiresAtMs: now + TRADE_ROOM_AUTO_CLOSE_MS,
  };
}

function buildExpiredTradeRoomUpdate(timestamp) {
  return {
    status: 'cancelled',
    cancelReason: 'expired',
    hostConfirmed: false,
    guestConfirmed: false,
    expiredAt: timestamp,
    updatedAt: timestamp,
  };
}

module.exports = {
  TRADE_ROOM_AUTO_CLOSE_MS,
  activeTradeRoomStatuses,
  buildExpiredTradeRoomUpdate,
  isActiveTradeRoomStatus,
  isTradeRoomExpired,
  timestampMillis,
  tradeRoomExpiresAtMs,
  tradeRoomExpiryFromNow,
};
