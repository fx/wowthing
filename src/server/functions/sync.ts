import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { users } from '~/db/schema';
import { decrypt } from '~/lib/auth/encryption';
import { authMiddleware } from '~/lib/auth/middleware';
import { getBoss } from '~/server/plugins/pg-boss';

export const triggerSync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const user = await db.query.users.findFirst({
      where: eq(users.id, parseInt(userId)),
    });

    if (!user) {
      throw new Error('User not found');
    }

    const accessToken = decrypt(user.accessToken);

    const boss = getBoss();
    await boss.send(
      'sync-user-profile',
      {
        userId,
        accessToken,
        region: user.region,
      },
      {
        singletonKey: `user-profile-${userId}`,
        expireInMinutes: 5,
      },
    );

    return { queued: true };
  });
