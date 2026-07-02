export const TRADE_ROOM_AUTO_CLOSE_MS = 15 * 60 * 1000;

const ACTIVE_TRADE_ROOM_STATUSES = ['open', 'live', 'pushed', 'countered'] as const;

export function activeTradeRoomStatuses(): string[] {
  return [...ACTIVE_TRADE_ROOM_STATUSES];
}

export function timestampMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

export function isActiveTradeRoomStatus(status: unknown): boolean {
  return ACTIVE_TRADE_ROOM_STATUSES.includes(String(status || '') as typeof ACTIVE_TRADE_ROOM_STATUSES[number]);
}

export function tradeRoomExpiresAtMs(room: any, now = Date.now()): number {
  const explicit = timestampMillis(room?.expiresAtMs ?? room?.expiresAt);
  if (Number.isFinite(explicit)) return explicit;
  const lastActivity = timestampMillis(room?.updatedAtMs ?? room?.updatedAt ?? room?.createdAt);
  return Number.isFinite(lastActivity) ? lastActivity + TRADE_ROOM_AUTO_CLOSE_MS : now + TRADE_ROOM_AUTO_CLOSE_MS;
}

export function isTradeRoomExpired(room: any, now = Date.now()): boolean {
  if (!room || !isActiveTradeRoomStatus(room.status)) return false;
  return tradeRoomExpiresAtMs(room, now) <= now;
}

export function tradeRoomExpiryFromNow(now = Date.now()): { expiresAtMs: number } {
  return {
    expiresAtMs: now + TRADE_ROOM_AUTO_CLOSE_MS,
  };
}
