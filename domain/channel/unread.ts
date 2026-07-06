export type ChannelUnreadMessage = {
  uid?: string | null;
  createdAtMs?: number | null;
};

export function channelReadKey(leagueId?: string | null, channelId?: string | null) {
  return `${leagueId || 'league'}__${channelId || 'channel'}`;
}

export function countUnreadChannelMessages(
  messages: ChannelUnreadMessage[],
  options: { currentUserId?: string | null; lastOpenedAtMs?: number | null },
) {
  const { currentUserId, lastOpenedAtMs } = options;
  if (!currentUserId || !lastOpenedAtMs) return 0;
  return messages.filter(message => (
    message.uid !== currentUserId
    && typeof message.createdAtMs === 'number'
    && message.createdAtMs > lastOpenedAtMs
  )).length;
}

export function formatUnreadBadge(count: number) {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}
