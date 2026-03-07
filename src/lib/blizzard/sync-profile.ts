import { eq, and } from 'drizzle-orm';
import { db } from '~/db';
import { accounts, characters, syncState } from '~/db/schema';
import { BlizzardClient } from './client';
import { userProfileSchema } from './schemas';
import type { Region } from '~/lib/activities/resets';

const SYNC_TYPES = ['profile', 'quests', 'reputations'] as const;

export async function syncUserProfile(
  userId: number,
  accessToken: string,
  region: string,
) {
  const client = new BlizzardClient(accessToken, region as Region);
  const { data } = await client.fetch(
    '/profile/user/wow',
    userProfileSchema,
  );

  if (!data) return;

  for (const wowAccount of data.wow_accounts) {
    // Upsert account by battleNetAccountId + userId
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.battleNetAccountId, wowAccount.id),
        ),
      )
      .limit(1);

    let accountId: number;
    if (existing.length > 0) {
      accountId = existing[0].id;
      await db
        .update(accounts)
        .set({ region })
        .where(eq(accounts.id, accountId));
    } else {
      const [inserted] = await db
        .insert(accounts)
        .values({
          userId,
          battleNetAccountId: wowAccount.id,
          region,
        })
        .returning({ id: accounts.id });
      accountId = inserted.id;
    }

    for (const char of wowAccount.characters) {
      // Upsert character by blizzardId + accountId
      const existingChar = await db
        .select({ id: characters.id })
        .from(characters)
        .where(
          and(
            eq(characters.accountId, accountId),
            eq(characters.blizzardId, char.id),
          ),
        )
        .limit(1);

      let characterId: number;
      if (existingChar.length > 0) {
        characterId = existingChar[0].id;
        await db
          .update(characters)
          .set({
            name: char.name,
            realmSlug: char.realm.slug,
            classId: char.playable_class.id,
            raceId: char.playable_race.id,
            faction: char.faction.type.toLowerCase(),
            level: char.level,
            updatedAt: new Date(),
          })
          .where(eq(characters.id, characterId));
      } else {
        const [inserted] = await db
          .insert(characters)
          .values({
            accountId,
            blizzardId: char.id,
            name: char.name,
            realmSlug: char.realm.slug,
            classId: char.playable_class.id,
            raceId: char.playable_race.id,
            faction: char.faction.type.toLowerCase(),
            level: char.level,
          })
          .returning({ id: characters.id });
        characterId = inserted.id;
      }

      // Initialize sync_state rows for each sync type (skip if already exists)
      for (const syncType of SYNC_TYPES) {
        await db
          .insert(syncState)
          .values({
            characterId,
            syncType,
            nextSyncAfter: new Date(),
          })
          .onConflictDoNothing();
      }
    }
  }
}
