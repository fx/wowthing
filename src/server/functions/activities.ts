import { createServerFn } from '@tanstack/react-start';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '~/db';
import {
  accounts,
  activityDefinitions,
  characters,
  questCompletions,
  renown,
  weeklyActivities,
} from '~/db/schema';
import {
  getCurrentResetWeek,
  getNextDailyReset,
  getNextWeeklyReset,
} from '~/lib/activities/resets';
import type { Region } from '~/lib/activities/resets';
import { authMiddleware } from '~/lib/auth/middleware';

export const getDashboardData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, parseInt(userId)),
    });
    const accountIds = userAccounts.map((a) => a.id);

    // Derive region from first account, fallback to 'us'
    const region = (userAccounts[0]?.region ?? 'us') as Region;
    const resetWeek = getCurrentResetWeek(region);

    const [chars, definitions, userRenown] = await Promise.all([
      accountIds.length > 0
        ? db.query.characters.findMany({
            where: inArray(characters.accountId, accountIds),
            with: {
              weeklyActivities: {
                where: eq(weeklyActivities.resetWeek, resetWeek),
              },
              questCompletions: {
                where: eq(questCompletions.resetWeek, resetWeek),
              },
              currencies: true,
            },
            orderBy: (c, { desc }) => [desc(c.level)],
          })
        : ([] as Awaited<
            ReturnType<typeof db.query.characters.findMany<{
              with: {
                weeklyActivities: { where: ReturnType<typeof eq> };
                questCompletions: { where: ReturnType<typeof eq> };
                currencies: true;
              };
            }>>
          >),
      db
        .select()
        .from(activityDefinitions)
        .where(
          and(
            eq(activityDefinitions.expansionId, 11),
            eq(activityDefinitions.enabled, true),
          ),
        )
        .orderBy(activityDefinitions.sortOrder),
      db
        .select()
        .from(renown)
        .where(eq(renown.userId, parseInt(userId))),
    ]);

    return {
      characters: chars,
      activities: definitions.map((d) => ({
        ...d,
        metadata: d.metadata as Record<string, {}> | null,
      })),
      renown: userRenown,
      resetWeek,
      nextWeeklyReset: getNextWeeklyReset(region).toISOString(),
      nextDailyReset: getNextDailyReset(region).toISOString(),
    };
  });

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
