import { eq } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import { db } from '~/db';
import { users } from '~/db/schema';
import { processAddonUpload } from '~/lib/addon/processor';
import type { AddonUpload } from '~/lib/addon/schema';
import { decrypt } from '~/lib/auth/encryption';
import { syncUserProfile } from '~/lib/blizzard/sync-profile';
import {
  syncCharacterProfile,
  syncCharacterQuests,
  syncCharacterReputations,
} from '~/lib/blizzard/sync';
import { scheduleCharacterSyncs } from '~/lib/blizzard/scheduler';

export type JobRegistry = {
  'sync-user-profile': { userId: number; region: string };
  'sync-character-profile': { characterId: number; region: string };
  'sync-character-quests': { characterId: number; region: string };
  'sync-character-reputations': { characterId: number; region: string };
  'process-addon-upload': { userId: number; upload: unknown };
  'schedule-syncs': Record<string, never>;
  'session-cleanup': Record<string, never>;
};

let bossInstance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBossAsync(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (!startPromise) {
    startPromise = startBoss();
  }
  return startPromise;
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
        const user = await db.query.users.findFirst({
          where: eq(users.id, job.data.userId),
        });
        if (!user) continue;
        const accessToken = decrypt(user.accessToken);
        await syncUserProfile(job.data.userId, accessToken, job.data.region);
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
    async (jobs) => {
      for (const job of jobs) {
        await processAddonUpload(
          job.data.userId,
          job.data.upload as AddonUpload,
        );
      }
    },
  );

  // --- Cron jobs ---

  await boss.createQueue('schedule-syncs');
  await boss.schedule('schedule-syncs', '* * * * *');
  await boss.work('schedule-syncs', async () => {
    await scheduleCharacterSyncs(boss);
  });

  await boss.createQueue('session-cleanup');
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
