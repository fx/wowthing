import PgBoss from 'pg-boss';

export type JobRegistry = {
  'sync-user-profile': { userId: string; accessToken: string; region: string };
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

  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'pgboss',
  });

  await boss.start();
  bossInstance = boss;

  // --- Sync workers (stubs -- actual implementations come in later tasks) ---

  await boss.work<JobRegistry['sync-user-profile']>(
    'sync-user-profile',
    { batchSize: 2 },
    async (_jobs) => {
      // TODO: implement in Wave 4a
    },
  );

  await boss.work<JobRegistry['sync-character-profile']>(
    'sync-character-profile',
    { batchSize: 5 },
    async (_jobs) => {
      // TODO: implement in Wave 4a
    },
  );

  await boss.work<JobRegistry['sync-character-quests']>(
    'sync-character-quests',
    { batchSize: 5 },
    async (_jobs) => {
      // TODO: implement in Wave 4a
    },
  );

  await boss.work<JobRegistry['sync-character-reputations']>(
    'sync-character-reputations',
    { batchSize: 5 },
    async (_jobs) => {
      // TODO: implement in Wave 4a
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
    // TODO: implement scheduler in Wave 4a
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

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return boss;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 10_000 });
    bossInstance = null;
  }
}
