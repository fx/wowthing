import { eq, and, inArray } from 'drizzle-orm';
import { db } from '~/db';
import {
  characters,
  accounts,
  users,
  syncState,
  questCompletions,
  renown,
} from '~/db/schema';
import { BlizzardClient, TokenExpiredError } from './client';
import {
  characterProfileSchema,
  completedQuestsSchema,
  reputationsSchema,
} from './schemas';
import { decrypt, encrypt } from '~/lib/auth/encryption';
import { getCurrentResetWeek } from '~/lib/activities/resets';
import { MIDNIGHT_FACTION_IDS } from '~/lib/wow/constants';
import type { Region } from '~/lib/activities/resets';

// --- Sync State Helpers ---

export async function getSyncState(characterId: number, syncType: string) {
  const rows = await db
    .select()
    .from(syncState)
    .where(
      and(
        eq(syncState.characterId, characterId),
        eq(syncState.syncType, syncType),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSyncState(
  characterId: number,
  syncType: string,
  data: {
    lastModifiedHeader?: string | null;
    nextSyncAfter: Date;
  },
) {
  await db
    .update(syncState)
    .set({
      lastSyncedAt: new Date(),
      lastModifiedHeader: data.lastModifiedHeader,
      nextSyncAfter: data.nextSyncAfter,
      errorCount: 0,
    })
    .where(
      and(
        eq(syncState.characterId, characterId),
        eq(syncState.syncType, syncType),
      ),
    );
}

export async function incrementSyncError(
  characterId: number,
  syncType: string,
) {
  // Exponential backoff: min(1h * 2^errorCount, 6h)
  const state = await getSyncState(characterId, syncType);
  const errorCount = (state?.errorCount ?? 0) + 1;
  const backoffMs = Math.min(
    3600_000 * Math.pow(2, errorCount - 1),
    6 * 3600_000,
  );

  await db
    .update(syncState)
    .set({
      errorCount,
      nextSyncAfter: new Date(Date.now() + backoffMs),
    })
    .where(
      and(
        eq(syncState.characterId, characterId),
        eq(syncState.syncType, syncType),
      ),
    );
}

// --- Token Refresh ---

export async function refreshAccessToken(userId: number): Promise<string> {
  const [user] = await db
    .select({
      refreshToken: users.refreshToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.refreshToken) {
    throw new Error(`No refresh token for user ${userId}`);
  }

  const decryptedRefreshToken = decrypt(user.refreshToken);

  const clientId = process.env.BATTLENET_CLIENT_ID;
  const clientSecret = process.env.BATTLENET_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing BATTLENET_CLIENT_ID or BATTLENET_CLIENT_SECRET');
  }

  const res = await globalThis.fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const tokenData = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newAccessToken = tokenData.access_token;
  const newRefreshToken = tokenData.refresh_token ?? decryptedRefreshToken;

  await db
    .update(users)
    .set({
      accessToken: encrypt(newAccessToken),
      refreshToken: encrypt(newRefreshToken),
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return newAccessToken;
}

// --- Helper: get character + user info for sync ---

async function getCharacterForSync(characterId: number) {
  const rows = await db
    .select({
      id: characters.id,
      realmSlug: characters.realmSlug,
      name: characters.name,
      accountId: characters.accountId,
      userId: accounts.userId,
      accessToken: users.accessToken,
    })
    .from(characters)
    .innerJoin(accounts, eq(characters.accountId, accounts.id))
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(eq(characters.id, characterId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Character ${characterId} not found`);
  }

  return rows[0];
}

// --- Character Sync Workers ---

export async function syncCharacterProfile(
  characterId: number,
  region: string,
) {
  const char = await getCharacterForSync(characterId);
  const state = await getSyncState(characterId, 'profile');
  const accessToken = decrypt(char.accessToken);

  const client = new BlizzardClient(accessToken, region as Region);

  try {
    const { data, lastModified, notModified } = await client.fetch(
      `/profile/wow/character/${char.realmSlug}/${char.name.toLowerCase()}`,
      characterProfileSchema,
      state?.lastModifiedHeader ?? undefined,
    );

    if (notModified) {
      await updateSyncState(characterId, 'profile', {
        lastModifiedHeader: state?.lastModifiedHeader,
        nextSyncAfter: new Date(Date.now() + 2 * 3600_000), // 2 hours
      });
      return;
    }

    if (data) {
      await db
        .update(characters)
        .set({
          level: data.level,
          itemLevel: data.equipped_item_level ?? null,
          classId: data.character_class.id,
          raceId: data.race.id,
          faction: data.faction.type.toLowerCase(),
          lastApiSyncAt: new Date(),
          lastApiModified: lastModified,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId));

      await updateSyncState(characterId, 'profile', {
        lastModifiedHeader: lastModified,
        nextSyncAfter: new Date(Date.now() + 2 * 3600_000), // 2 hours
      });
    }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await refreshAccessToken(char.userId);
      throw error; // pg-boss retry will use the new token
    }
    await incrementSyncError(characterId, 'profile');
    throw error;
  }
}

export async function syncCharacterQuests(
  characterId: number,
  region: string,
) {
  const char = await getCharacterForSync(characterId);
  const state = await getSyncState(characterId, 'quests');
  const accessToken = decrypt(char.accessToken);

  const client = new BlizzardClient(accessToken, region as Region);

  try {
    const { data, lastModified, notModified } = await client.fetch(
      `/profile/wow/character/${char.realmSlug}/${char.name.toLowerCase()}/quests/completed`,
      completedQuestsSchema,
      state?.lastModifiedHeader ?? undefined,
    );

    if (notModified) {
      await updateSyncState(characterId, 'quests', {
        lastModifiedHeader: state?.lastModifiedHeader,
        nextSyncAfter: new Date(Date.now() + 3600_000), // 1 hour
      });
      return;
    }

    if (data) {
      const resetWeek = getCurrentResetWeek(region as Region);

      // Batch check existing quest completions to avoid N+1 queries
      const questIds = data.quests.map((q) => q.id);
      const existingQuests = questIds.length > 0
        ? await db
            .select({ questId: questCompletions.questId })
            .from(questCompletions)
            .where(
              and(
                eq(questCompletions.characterId, characterId),
                eq(questCompletions.resetWeek, resetWeek),
                inArray(questCompletions.questId, questIds),
              ),
            )
        : [];
      const existingQuestIds = new Set(existingQuests.map((r) => r.questId));

      const newQuests = data.quests.filter((q) => !existingQuestIds.has(q.id));
      if (newQuests.length > 0) {
        await db.insert(questCompletions).values(
          newQuests.map((q) => ({
            characterId,
            questId: q.id,
            resetType: 'weekly' as const,
            resetWeek,
          })),
        );
      }

      await updateSyncState(characterId, 'quests', {
        lastModifiedHeader: lastModified,
        nextSyncAfter: new Date(Date.now() + 3600_000), // 1 hour
      });
    }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await refreshAccessToken(char.userId);
      throw error;
    }
    await incrementSyncError(characterId, 'quests');
    throw error;
  }
}

export async function syncCharacterReputations(
  characterId: number,
  region: string,
) {
  const char = await getCharacterForSync(characterId);
  const state = await getSyncState(characterId, 'reputations');
  const accessToken = decrypt(char.accessToken);

  const client = new BlizzardClient(accessToken, region as Region);

  try {
    const { data, lastModified, notModified } = await client.fetch(
      `/profile/wow/character/${char.realmSlug}/${char.name.toLowerCase()}/reputations`,
      reputationsSchema,
      state?.lastModifiedHeader ?? undefined,
    );

    if (notModified) {
      await updateSyncState(characterId, 'reputations', {
        lastModifiedHeader: state?.lastModifiedHeader,
        nextSyncAfter: new Date(Date.now() + 4 * 3600_000), // 4 hours
      });
      return;
    }

    if (data) {
      // Filter to only Midnight factions
      const midnightReps = data.reputations.filter((r) =>
        MIDNIGHT_FACTION_IDS.has(r.faction.id),
      );

      for (const rep of midnightReps) {
        // Renown is account-wide, stored per user
        const existingRenown = await db
          .select({ id: renown.id })
          .from(renown)
          .where(
            and(
              eq(renown.userId, char.userId),
              eq(renown.factionId, rep.faction.id),
            ),
          )
          .limit(1);

        if (existingRenown.length > 0) {
          await db
            .update(renown)
            .set({
              renownLevel: rep.standing.tier,
              reputationCurrent: rep.standing.value,
              reputationMax: rep.standing.max,
              updatedAt: new Date(),
            })
            .where(eq(renown.id, existingRenown[0].id));
        } else {
          await db.insert(renown).values({
            userId: char.userId,
            factionId: rep.faction.id,
            renownLevel: rep.standing.tier,
            reputationCurrent: rep.standing.value,
            reputationMax: rep.standing.max,
          });
        }
      }

      await updateSyncState(characterId, 'reputations', {
        lastModifiedHeader: lastModified,
        nextSyncAfter: new Date(Date.now() + 4 * 3600_000), // 4 hours
      });
    }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await refreshAccessToken(char.userId);
      throw error;
    }
    await incrementSyncError(characterId, 'reputations');
    throw error;
  }
}
