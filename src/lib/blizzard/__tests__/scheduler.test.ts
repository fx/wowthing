import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
vi.mock('~/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from '~/db';
import { scheduleCharacterSyncs } from '../scheduler';

function createMockBoss() {
  return {
    send: vi.fn().mockResolvedValue('job-id'),
  } as any;
}

describe('scheduleCharacterSyncs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues jobs for due character syncs', async () => {
    const dueRows = [
      { characterId: 1, syncType: 'profile', region: 'us' },
      { characterId: 2, syncType: 'quests', region: 'eu' },
      { characterId: 3, syncType: 'reputations', region: 'us' },
    ];

    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(dueRows);
    vi.mocked(db.select).mockReturnValue(chain as any);

    const boss = createMockBoss();
    await scheduleCharacterSyncs(boss);

    expect(boss.send).toHaveBeenCalledTimes(3);

    expect(boss.send).toHaveBeenCalledWith(
      'sync-character-profile',
      { characterId: 1, region: 'us' },
      expect.objectContaining({
        singletonKey: '1-profile',
        retryLimit: 3,
        retryDelay: 60,
        expireInMinutes: 5,
      }),
    );

    expect(boss.send).toHaveBeenCalledWith(
      'sync-character-quests',
      { characterId: 2, region: 'eu' },
      expect.objectContaining({
        singletonKey: '2-quests',
      }),
    );

    expect(boss.send).toHaveBeenCalledWith(
      'sync-character-reputations',
      { characterId: 3, region: 'us' },
      expect.objectContaining({
        singletonKey: '3-reputations',
      }),
    );
  });

  it('does nothing when no syncs are due', async () => {
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue(chain as any);

    const boss = createMockBoss();
    await scheduleCharacterSyncs(boss);

    expect(boss.send).not.toHaveBeenCalled();
  });
});
