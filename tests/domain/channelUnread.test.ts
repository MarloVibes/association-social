import { describe, expect, it } from 'vitest';
import { channelReadKey, countUnreadChannelMessages, formatUnreadBadge } from '@/domain/channel/unread';

describe('channel unread badges', () => {
  it('counts only other-user messages newer than the last opened timestamp', () => {
    const count = countUnreadChannelMessages(
      [
        { uid: 'other', createdAtMs: 1000 },
        { uid: 'me', createdAtMs: 2000 },
        { uid: 'other', createdAtMs: 3000 },
        { uid: 'other', createdAtMs: 4000 },
      ],
      { currentUserId: 'me', lastOpenedAtMs: 2500 },
    );

    expect(count).toBe(2);
  });

  it('treats missing read state as no unread badge until the user opens the room once', () => {
    const count = countUnreadChannelMessages(
      [
        { uid: 'other', createdAtMs: 1000 },
        { uid: 'other', createdAtMs: 2000 },
      ],
      { currentUserId: 'me', lastOpenedAtMs: null },
    );

    expect(count).toBe(0);
  });

  it('formats unread badges quietly with a 99 plus cap', () => {
    expect(formatUnreadBadge(0)).toBe('');
    expect(formatUnreadBadge(8)).toBe('8');
    expect(formatUnreadBadge(130)).toBe('99+');
  });

  it('uses a stable per-league per-channel read key', () => {
    expect(channelReadKey('league-1', 'league-chat')).toBe('league-1__league-chat');
  });
});
