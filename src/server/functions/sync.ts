import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { users } from '~/db/schema';
import { authMiddleware } from '~/lib/auth/middleware';
import { getBoss } from '~/server/plugins/pg-boss';

export const triggerSync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const numericUserId = parseInt(context.userId);
    if (!Number.isFinite(numericUserId)) {
      throw new Error('Invalid user id');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, numericUserId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    const boss = getBoss();
    await boss.send(
      'sync-user-profile',
      {
        userId: numericUserId,
        region: user.region,
      },
      {
        singletonKey: `user-profile-${numericUserId}`,
        expireInMinutes: 5,
      },
    );

    return { queued: true };
  });
