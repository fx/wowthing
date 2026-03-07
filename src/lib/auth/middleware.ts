import { createMiddleware } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
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

    return next({
      context: {
        session,
        userId: session.user.id,
      },
    });
  },
);
