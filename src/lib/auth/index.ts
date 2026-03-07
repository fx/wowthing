import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { account as betterAuthAccount, users } from '~/db/schema';
import { encrypt } from '~/lib/auth/encryption';
import { getBoss } from '~/server/plugins/pg-boss';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Look up the Better Auth account record to get OAuth tokens
          const oauthAccount = await db.query.account.findFirst({
            where: eq(betterAuthAccount.userId, user.id),
          });

          if (!oauthAccount) {
            console.error(
              `No OAuth account found for Better Auth user ${user.id}`,
            );
            return;
          }

          // The Battle.net numeric ID is stored as the Better Auth user.id
          // (since getUserInfo returns id: String(profile.id))
          const battleNetId = parseInt(user.id, 10);
          if (!Number.isFinite(battleNetId)) {
            console.error(
              `Could not parse Battle.net ID from user.id: ${user.id}`,
            );
            return;
          }

          const accessToken = oauthAccount.accessToken;
          if (!accessToken) {
            console.error(
              `No access token found for Better Auth user ${user.id}`,
            );
            return;
          }

          const encryptedAccessToken = encrypt(accessToken);
          const encryptedRefreshToken = oauthAccount.refreshToken
            ? encrypt(oauthAccount.refreshToken)
            : null;
          const region = process.env.BATTLENET_DEFAULT_REGION || 'us';

          // Create or update the app user record
          const [appUser] = await db
            .insert(users)
            .values({
              betterAuthUserId: user.id,
              battleNetId,
              battleTag: user.name,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt:
                oauthAccount.accessTokenExpiresAt ?? new Date(),
              region,
            })
            .onConflictDoUpdate({
              target: users.betterAuthUserId,
              set: {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt:
                  oauthAccount.accessTokenExpiresAt ?? new Date(),
                updatedAt: new Date(),
              },
            })
            .returning();

          // Queue a sync job for the new user
          try {
            const boss = getBoss();
            await boss.send(
              'sync-user-profile',
              {
                userId: appUser.id,
                accessToken,
                region,
              },
              {
                singletonKey: `user-profile-${appUser.id}`,
                expireInMinutes: 5,
              },
            );
          } catch (e) {
            console.error('Failed to queue sync job:', e);
          }
        },
      },
    },
  },
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
          accessType: 'offline',
          getUserInfo: async (tokens) => {
            const res = await fetch('https://oauth.battle.net/userinfo', {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            });
            if (!res.ok) {
              throw new Error(
                `Battle.net userinfo failed: ${res.status} ${res.statusText}`,
              );
            }
            const profile = (await res.json()) as {
              id: number;
              battletag: string;
            };
            return {
              id: String(profile.id),
              name: profile.battletag,
              email: `${profile.id}@battlenet.placeholder`,
              emailVerified: false,
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
