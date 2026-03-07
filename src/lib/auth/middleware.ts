import { createMiddleware } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { users } from '~/db/schema';
import { auth } from './index';

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const headers = getRequestHeaders();

    const session = await auth.api.getSession({
      headers: headers as unknown as Headers,
    });

    if (!session) {
      throw new Response(null, {
        status: 302,
        headers: { Location: '/login' },
      });
    }

    // Resolve the app user by Better Auth user ID
    const appUser = await db.query.users.findFirst({
      where: eq(users.betterAuthUserId, session.user.id),
    });

    if (!appUser) {
      throw new Response(null, {
        status: 302,
        headers: { Location: '/login' },
      });
    }

    return next({
      context: {
        session,
        userId: String(appUser.id),
      },
    });
  },
);
