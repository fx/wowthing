import type PgBoss from 'pg-boss';
import { lt, asc, eq } from 'drizzle-orm';
import { db } from '~/db';
import { syncState, characters, accounts } from '~/db/schema';

export async function scheduleCharacterSyncs(boss: PgBoss) {
  const dueRows = await db
    .select({
      characterId: syncState.characterId,
      syncType: syncState.syncType,
      region: accounts.region,
    })
    .from(syncState)
    .innerJoin(characters, eq(syncState.characterId, characters.id))
    .innerJoin(accounts, eq(characters.accountId, accounts.id))
    .where(lt(syncState.nextSyncAfter, new Date()))
    .orderBy(asc(syncState.lastSyncedAt))
    .limit(20);

  for (const row of dueRows) {
    const jobName = `sync-character-${row.syncType}` as
      | 'sync-character-profile'
      | 'sync-character-quests'
      | 'sync-character-reputations';

    await boss.send(
      jobName,
      { characterId: row.characterId, region: row.region },
      {
        singletonKey: `${row.characterId}-${row.syncType}`,
        retryLimit: 3,
        retryDelay: 60,
        expireInMinutes: 5,
      },
    );
  }
}
