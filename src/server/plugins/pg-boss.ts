import PgBoss from 'pg-boss';
import { syncUserProfile } from '~/lib/blizzard/sync-profile';
import {
  syncCharacterProfile,
  syncCharacterQuests,
  syncCharacterReputations,
} from '~/lib/blizzard/sync';
import { scheduleCharacterSyncs } from '~/lib/blizzard/scheduler';

export type JobRegistry = {
  'sync-user-profile': { userId: number; accessToken: string; region: string };
  'sync-character-profile': { characterId: number; region: string };
  'sync-character-quests': { characterId: number; region: string };
  'sync-character-reputations': { characterId: number; region: string };
  'process-addon-upload': { userId: number; upload: unknown };
  'schedule-syncs': Record<string, never>;
  'session-cleanup': Record<string, never>;
};

let bossInstance: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!bossInstance) throw new Error('pg-boss not initialized');
  return bossInstance;
}

export async function startBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required to initialize pg-boss');
  }

  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
  });

  await boss.start();
  bossInstance = boss;

  // --- Sync workers ---

  await boss.work<JobRegistry['sync-user-profile']>(
    'sync-user-profile',
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        await syncUserProfile(
          job.data.userId,
          job.data.accessToken,
          job.data.region,
        );
      }
    },
  );

  await boss.work<JobRegistry['sync-character-profile']>(
    'sync-character-profile',
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) {
        await syncCharacterProfile(job.data.characterId, job.data.region);
      }
    },
  );

  await boss.work<JobRegistry['sync-character-quests']>(
    'sync-character-quests',
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) {
        await syncCharacterQuests(job.data.characterId, job.data.region);
      }
    },
  );

  await boss.work<JobRegistry['sync-character-reputations']>(
    'sync-character-reputations',
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) {
        await syncCharacterReputations(job.data.characterId, job.data.region);
      }
    },
  );

  await boss.work<JobRegistry['process-addon-upload']>(
    'process-addon-upload',
    { batchSize: 1 },
    async (_jobs) => {
      // TODO: implement in Wave 4b
    },
  );

  // --- Cron jobs ---

  await boss.schedule('schedule-syncs', '* * * * *');
  await boss.work('schedule-syncs', async () => {
    await scheduleCharacterSyncs(boss);
  });

  await boss.schedule('session-cleanup', '0 3 * * *');
  await boss.work('session-cleanup', async () => {
    // TODO: implement session cleanup
  });

  // --- Graceful shutdown ---

  const shutdown = async () => {
    if (bossInstance) {
      await bossInstance.stop({ graceful: true, timeout: 10_000 });
      bossInstance = null;
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return boss;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 10_000 });
    bossInstance = null;
  }
}
