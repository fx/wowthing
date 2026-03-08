import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { user as betterAuthUser, users } from '~/db/schema';
import { encrypt } from '~/lib/auth/encryption';
import { getBossAsync } from '~/server/plugins/pg-boss';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  databaseHooks: {
    account: {
      create: {
        after: async (accountRecord) => {
          // Look up the Better Auth user for name/battletag
          const betterAuthUserRecord = await db.query.user.findFirst({
            where: eq(betterAuthUser.id, accountRecord.userId),
          });

          // accountId holds the provider's user ID from getUserInfo (Battle.net numeric ID)
          const battleNetId = parseInt(accountRecord.accountId, 10);
          if (!Number.isFinite(battleNetId)) {
            console.error(
              `Could not parse Battle.net ID from accountId: ${accountRecord.accountId}`,
            );
            return;
          }

          const accessToken = accountRecord.accessToken;
          if (!accessToken) {
            console.error(
              `No access token found for account ${accountRecord.id}`,
            );
            return;
          }

          const encryptedAccessToken = encrypt(accessToken);
          const encryptedRefreshToken = accountRecord.refreshToken
            ? encrypt(accountRecord.refreshToken)
            : null;
          const region = process.env.BATTLENET_DEFAULT_REGION || 'us';

          // Create or update the app user record
          const [appUser] = await db
            .insert(users)
            .values({
              betterAuthUserId: accountRecord.userId,
              battleNetId,
              battleTag: betterAuthUserRecord?.name ?? `User-${battleNetId}`,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt:
                accountRecord.accessTokenExpiresAt ?? new Date(),
              region,
            })
            .onConflictDoUpdate({
              target: users.betterAuthUserId,
              set: {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt:
                  accountRecord.accessTokenExpiresAt ?? new Date(),
                updatedAt: new Date(),
              },
            })
            .returning();

          // Queue a sync job for the new user
          try {
            const boss = await getBossAsync();
            await boss.send(
              'sync-user-profile',
              {
                userId: appUser.id,
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
