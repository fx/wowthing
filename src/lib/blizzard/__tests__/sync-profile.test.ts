import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
vi.mock('~/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from '~/db';
import { syncUserProfile } from '../sync-profile';
import { BlizzardClient } from '../client';

describe('syncUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts accounts, characters, and initializes sync state', async () => {
    const profileData = {
      wow_accounts: [
        {
          id: 100,
          characters: [
            {
              id: 1001,
              name: 'Testchar',
              realm: { slug: 'area-52' },
              playable_class: { id: 1 },
              playable_race: { id: 2 },
              faction: { type: 'ALLIANCE' },
              level: 80,
            },
          ],
        },
      ],
    };

    vi.spyOn(BlizzardClient.prototype, 'fetch').mockResolvedValueOnce({
      data: profileData,
      lastModified: null,
      notModified: false,
    });

    // Mock account lookup (not found)
    const selectAccountChain: any = {};
    selectAccountChain.from = vi.fn().mockReturnValue(selectAccountChain);
    selectAccountChain.where = vi.fn().mockReturnValue(selectAccountChain);
    selectAccountChain.limit = vi.fn().mockResolvedValue([]);

    // Mock character lookup (not found)
    const selectCharChain: any = {};
    selectCharChain.from = vi.fn().mockReturnValue(selectCharChain);
    selectCharChain.where = vi.fn().mockReturnValue(selectCharChain);
    selectCharChain.limit = vi.fn().mockResolvedValue([]);

    vi.mocked(db.select)
      .mockReturnValueOnce(selectAccountChain as any)
      .mockReturnValueOnce(selectCharChain as any);

    // Mock insert for account
    const insertAccountChain: any = {};
    insertAccountChain.values = vi.fn().mockReturnValue(insertAccountChain);
    insertAccountChain.returning = vi.fn().mockResolvedValue([{ id: 10 }]);

    // Mock insert for character
    const insertCharChain: any = {};
    insertCharChain.values = vi.fn().mockReturnValue(insertCharChain);
    insertCharChain.returning = vi.fn().mockResolvedValue([{ id: 42 }]);

    // Mock insert for sync_state (3 types)
    const insertSyncChain: any = {};
    insertSyncChain.values = vi.fn().mockReturnValue(insertSyncChain);
    insertSyncChain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.insert)
      .mockReturnValueOnce(insertAccountChain as any)
      .mockReturnValueOnce(insertCharChain as any)
      .mockReturnValueOnce(insertSyncChain as any)
      .mockReturnValueOnce(insertSyncChain as any)
      .mockReturnValueOnce(insertSyncChain as any);

    await syncUserProfile(1, 'test-token', 'us');

    expect(BlizzardClient.prototype.fetch).toHaveBeenCalledWith(
      '/profile/user/wow',
      expect.anything(),
    );

    // Account was inserted
    expect(insertAccountChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        battleNetAccountId: 100,
        region: 'us',
      }),
    );

    // Character was inserted
    expect(insertCharChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 10,
        blizzardId: 1001,
        name: 'Testchar',
        realmSlug: 'area-52',
        faction: 'alliance',
      }),
    );

    // Sync state initialized for 3 types
    expect(db.insert).toHaveBeenCalledTimes(5); // 1 account + 1 char + 3 sync_state
  });

  it('updates existing account and character', async () => {
    const profileData = {
      wow_accounts: [
        {
          id: 100,
          characters: [
            {
              id: 1001,
              name: 'UpdatedName',
              realm: { slug: 'area-52' },
              playable_class: { id: 1 },
              playable_race: { id: 2 },
              faction: { type: 'HORDE' },
              level: 85,
            },
          ],
        },
      ],
    };

    vi.spyOn(BlizzardClient.prototype, 'fetch').mockResolvedValueOnce({
      data: profileData,
      lastModified: null,
      notModified: false,
    });

    // Mock account lookup (found)
    const selectAccountChain: any = {};
    selectAccountChain.from = vi.fn().mockReturnValue(selectAccountChain);
    selectAccountChain.where = vi.fn().mockReturnValue(selectAccountChain);
    selectAccountChain.limit = vi.fn().mockResolvedValue([{ id: 10 }]);

    // Mock character lookup (found)
    const selectCharChain: any = {};
    selectCharChain.from = vi.fn().mockReturnValue(selectCharChain);
    selectCharChain.where = vi.fn().mockReturnValue(selectCharChain);
    selectCharChain.limit = vi.fn().mockResolvedValue([{ id: 42 }]);

    vi.mocked(db.select)
      .mockReturnValueOnce(selectAccountChain as any)
      .mockReturnValueOnce(selectCharChain as any);

    // Mock updates
    const updateChain: any = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    // Mock sync_state inserts (onConflictDoNothing)
    const insertSyncChain: any = {};
    insertSyncChain.values = vi.fn().mockReturnValue(insertSyncChain);
    insertSyncChain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert)
      .mockReturnValueOnce(insertSyncChain as any)
      .mockReturnValueOnce(insertSyncChain as any)
      .mockReturnValueOnce(insertSyncChain as any);

    await syncUserProfile(1, 'test-token', 'us');

    // Account and character were updated (not inserted)
    expect(db.update).toHaveBeenCalledTimes(2); // account + character
    expect(db.insert).toHaveBeenCalledTimes(3); // only 3 sync_state inserts
  });

  it('does nothing when API returns no data', async () => {
    vi.spyOn(BlizzardClient.prototype, 'fetch').mockResolvedValueOnce({
      data: null,
      lastModified: null,
      notModified: true,
    });

    await syncUserProfile(1, 'test-token', 'us');

    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
