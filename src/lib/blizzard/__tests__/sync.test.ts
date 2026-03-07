import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
vi.mock('~/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock encryption
vi.mock('~/lib/auth/encryption', () => ({
  decrypt: vi.fn((v: string) => `decrypted-${v}`),
  encrypt: vi.fn((v: string) => `encrypted-${v}`),
}));

// Mock resets
vi.mock('~/lib/activities/resets', () => ({
  getCurrentResetWeek: vi.fn(() => '2026-W10'),
}));

import { db } from '~/db';
import {
  getSyncState,
  updateSyncState,
  incrementSyncError,
  refreshAccessToken,
  syncCharacterProfile,
} from '../sync';
import { decrypt } from '~/lib/auth/encryption';
import { BlizzardClient, TokenExpiredError } from '../client';

// Helper to create chainable mock for select
function mockSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  return chain;
}

// Helper to create chainable mock for update
function mockUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

describe('getSyncState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sync state when found', async () => {
    const state = {
      id: 1,
      characterId: 42,
      syncType: 'profile',
      lastSyncedAt: new Date(),
      lastModifiedHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
      nextSyncAfter: new Date(),
      errorCount: 0,
    };

    const chain = mockSelectChain([state]);
    vi.mocked(db.select).mockReturnValue(chain as any);

    const result = await getSyncState(42, 'profile');
    expect(result).toEqual(state);
  });

  it('returns null when not found', async () => {
    const chain = mockSelectChain([]);
    vi.mocked(db.select).mockReturnValue(chain as any);

    const result = await getSyncState(99, 'quests');
    expect(result).toBeNull();
  });
});

describe('updateSyncState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates sync state with provided data', async () => {
    const chain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(chain as any);

    const nextSync = new Date(Date.now() + 3600_000);
    await updateSyncState(42, 'profile', {
      lastModifiedHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
      nextSyncAfter: nextSync,
    });

    expect(db.update).toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastModifiedHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
        nextSyncAfter: nextSync,
        errorCount: 0,
      }),
    );
  });
});

describe('incrementSyncError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments error count with exponential backoff', async () => {
    const selectChain = mockSelectChain([{ errorCount: 2 }]);
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    const before = Date.now();
    await incrementSyncError(42, 'profile');

    expect(db.update).toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCount: 3,
      }),
    );

    // Verify backoff: 1h * 2^2 = 4h
    const setCall = vi.mocked(updateChain.set).mock.calls[0][0] as any;
    const backoffMs = setCall.nextSyncAfter.getTime() - before;
    expect(backoffMs).toBeGreaterThan(14_395_000);
    expect(backoffMs).toBeLessThan(14_410_000);
  });

  it('caps backoff at 6 hours', async () => {
    const selectChain = mockSelectChain([{ errorCount: 10 }]);
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    const before = Date.now();
    await incrementSyncError(42, 'profile');

    const setCall = vi.mocked(updateChain.set).mock.calls[0][0] as any;
    const backoffMs = setCall.nextSyncAfter.getTime() - before;
    expect(backoffMs).toBeLessThanOrEqual(21_605_000);
    expect(backoffMs).toBeGreaterThan(21_595_000);
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes token and updates user', async () => {
    const selectChain = mockSelectChain([{ refreshToken: 'enc-refresh-token' }]);
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    process.env.BATTLENET_CLIENT_ID = 'test-client-id';
    process.env.BATTLENET_CLIENT_SECRET = 'test-client-secret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        }),
        { status: 200 },
      ),
    );

    const result = await refreshAccessToken(1);

    expect(result).toBe('new-access-token');
    expect(decrypt).toHaveBeenCalledWith('enc-refresh-token');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://oauth.battle.net/token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(db.update).toHaveBeenCalled();
  });

  it('throws when no refresh token', async () => {
    const selectChain = mockSelectChain([{ refreshToken: null }]);
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    await expect(refreshAccessToken(1)).rejects.toThrow(
      'No refresh token for user 1',
    );
  });

  it('throws when token refresh HTTP fails', async () => {
    const selectChain = mockSelectChain([{ refreshToken: 'enc-token' }]);
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    process.env.BATTLENET_CLIENT_ID = 'test-id';
    process.env.BATTLENET_CLIENT_SECRET = 'test-secret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 }),
    );

    await expect(refreshAccessToken(1)).rejects.toThrow(
      'Token refresh failed',
    );
  });
});

describe('syncCharacterProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates character on successful API response', async () => {
    const joinChain = mockSelectChain([
      {
        id: 42,
        realmSlug: 'area-52',
        name: 'Testchar',
        accountId: 1,
        userId: 1,
        accessToken: 'enc-token',
      },
    ]);

    const syncStateChain = mockSelectChain([
      { lastModifiedHeader: 'old-date', errorCount: 0 },
    ]);

    vi.mocked(db.select)
      .mockReturnValueOnce(joinChain as any)
      .mockReturnValueOnce(syncStateChain as any);

    vi.spyOn(BlizzardClient.prototype, 'fetch').mockResolvedValueOnce({
      data: {
        id: 42,
        name: 'Testchar',
        level: 80,
        equipped_item_level: 620,
        character_class: { id: 1 },
        race: { id: 2 },
        faction: { type: 'ALLIANCE' },
      },
      lastModified: 'new-date',
      notModified: false,
    });

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    await syncCharacterProfile(42, 'us');

    expect(BlizzardClient.prototype.fetch).toHaveBeenCalledWith(
      '/profile/wow/character/area-52/testchar',
      expect.anything(),
      'old-date',
    );
    // Two updates: character + syncState
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('only updates sync state lastSyncedAt on 304', async () => {
    const joinChain = mockSelectChain([
      {
        id: 42,
        realmSlug: 'area-52',
        name: 'Testchar',
        accountId: 1,
        userId: 1,
        accessToken: 'enc-token',
      },
    ]);

    const syncStateChain = mockSelectChain([
      { lastModifiedHeader: 'old-date', errorCount: 0 },
    ]);

    vi.mocked(db.select)
      .mockReturnValueOnce(joinChain as any)
      .mockReturnValueOnce(syncStateChain as any);

    vi.spyOn(BlizzardClient.prototype, 'fetch').mockResolvedValueOnce({
      data: null,
      lastModified: 'old-date',
      notModified: true,
    });

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    await syncCharacterProfile(42, 'us');

    // Only one update: sync state lastSyncedAt (not character data)
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncedAt: expect.any(Date),
      }),
    );
  });

  it('refreshes token and rethrows on TokenExpiredError', async () => {
    const joinChain = mockSelectChain([
      {
        id: 42,
        realmSlug: 'area-52',
        name: 'Testchar',
        accountId: 1,
        userId: 1,
        accessToken: 'enc-token',
      },
    ]);

    const syncStateChain = mockSelectChain([null]);

    vi.mocked(db.select)
      .mockReturnValueOnce(joinChain as any)
      .mockReturnValueOnce(syncStateChain as any);

    vi.spyOn(BlizzardClient.prototype, 'fetch').mockRejectedValueOnce(
      new TokenExpiredError(),
    );

    // Mock refreshAccessToken's db calls
    const refreshSelectChain = mockSelectChain([
      { refreshToken: 'enc-refresh' },
    ]);
    vi.mocked(db.select).mockReturnValueOnce(refreshSelectChain as any);

    process.env.BATTLENET_CLIENT_ID = 'id';
    process.env.BATTLENET_CLIENT_SECRET = 'secret';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'new',
          expires_in: 86400,
        }),
        { status: 200 },
      ),
    );

    const updateChain = mockUpdateChain();
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    await expect(syncCharacterProfile(42, 'us')).rejects.toThrow(
      TokenExpiredError,
    );
  });
});
