import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { db } from '~/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  plugins: [
    tanstackStartCookies(),
    genericOAuth({
      config: [
        {
          providerId: 'battlenet',
          clientId: process.env.BATTLENET_CLIENT_ID!,
          clientSecret: process.env.BATTLENET_CLIENT_SECRET!,
          authorizationUrl: 'https://oauth.battle.net/authorize',
          tokenUrl: 'https://oauth.battle.net/token',
          userInfoUrl: 'https://oauth.battle.net/userinfo',
          scopes: ['wow.profile'],
          getUserInfo: async (tokens) => {
            const res = await fetch('https://oauth.battle.net/userinfo', {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            });
            const profile = (await res.json()) as {
              id: number;
              battletag: string;
            };
            return {
              id: String(profile.id),
              name: profile.battletag,
              email: `${profile.id}@battlenet.placeholder`,
              emailVerified: true,
            };
          },
        },
      ],
    }),
  ],
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  },
});
