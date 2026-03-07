import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { db } from './index';
import { activityDefinitions } from './schema';

interface SeedActivity {
  key: string;
  name: string;
  short_name: string;
  category: string;
  reset_type: string;
  description?: string;
  quest_ids?: number[];
  threshold?: number;
  account_wide?: boolean;
  metadata?: Record<string, unknown>;
}

interface SeedData {
  expansion: number;
  patch: string;
  activities: SeedActivity[];
}

async function seed() {
  const raw = readFileSync('seeds/activities.yaml', 'utf-8');
  const data = parse(raw) as SeedData;

  for (const [i, activity] of data.activities.entries()) {
    await db
      .insert(activityDefinitions)
      .values({
        expansionId: data.expansion,
        patch: data.patch,
        category: activity.category,
        key: activity.key,
        name: activity.name,
        shortName: activity.short_name,
        description: activity.description ?? null,
        resetType: activity.reset_type,
        questIds: activity.quest_ids ?? null,
        threshold: activity.threshold ?? null,
        accountWide: activity.account_wide ?? false,
        sortOrder: i,
        enabled: true,
        metadata: activity.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: activityDefinitions.key,
        set: {
          expansionId: data.expansion,
          patch: data.patch,
          category: activity.category,
          name: activity.name,
          shortName: activity.short_name,
          description: activity.description ?? null,
          resetType: activity.reset_type,
          questIds: activity.quest_ids ?? null,
          threshold: activity.threshold ?? null,
          accountWide: activity.account_wide ?? false,
          sortOrder: i,
          enabled: true,
          metadata: activity.metadata ?? null,
        },
      });
  }

  console.log(`Seeded ${data.activities.length} activity definitions`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
