import { and, eq, inArray } from 'drizzle-orm';
import { db } from '~/db';
import {
  accounts,
  characters,
  currencies,
  questCompletions,
  weeklyActivities,
} from '~/db/schema';
import type { Lockout, VaultSlot } from '~/db/types';
import { getCurrentResetWeek, getTodayDate } from '~/lib/activities/resets';
import type { Region } from '~/lib/activities/resets';
import type { AddonCharacter, AddonUpload } from './schema';

const DIFFICULTY_MAP: Record<number, Lockout['difficulty']> = {
  7: 'lfr',
  14: 'normal',
  15: 'heroic',
  16: 'mythic',
  23: 'mythic',
};

/** Dawncrest currency IDs that use isMovingMax tracking */
const MOVING_MAX_CURRENCY_IDS = new Set([3383, 3341, 3343, 3345, 3348]);

export async function processAddonUpload(
  userId: number,
  upload: AddonUpload,
): Promise<void> {
  // Get all accounts for this user
  const userAccounts = await db.query.accounts.findMany({
    where: eq(accounts.userId, userId),
  });
  const accountIds = userAccounts.map((a) => a.id);

  if (accountIds.length === 0) return;

  // Get all characters for these accounts
  const userCharacters = await db.query.characters.findMany({
    where: inArray(characters.accountId, accountIds),
  });

  // Build lookup: blizzardId -> character (with account for region)
  const charByBlizzardId = new Map(
    userCharacters.map((c) => {
      const account = userAccounts.find((a) => a.id === c.accountId);
      return [c.blizzardId, { character: c, region: account?.region ?? 'us' }];
    }),
  );

  for (const [charKey, charData] of Object.entries(upload.chars)) {
    const blizzardId = Number.parseInt(charKey);
    if (Number.isNaN(blizzardId)) continue;

    const match = charByBlizzardId.get(blizzardId);
    if (!match) continue; // Character not owned by this user

    const { character, region } = match;
    const regionTyped = region as Region;
    const resetWeek = getCurrentResetWeek(regionTyped);
    const todayDate = getTodayDate(regionTyped);

    await Promise.all([
      processCharacterCurrencies(character.id, charData),
      processCharacterQuests(
        character.id,
        charData,
        resetWeek,
        todayDate,
        upload.questsV2,
      ),
      processCharacterWeekly(character.id, charData, resetWeek),
    ]);
  }
}

async function processCharacterCurrencies(
  characterId: number,
  charData: AddonCharacter,
): Promise<void> {
  if (!charData.currencies) return;

  for (const [currencyIdStr, parsed] of Object.entries(charData.currencies)) {
    const currencyId = Number.parseInt(currencyIdStr);
    if (Number.isNaN(currencyId)) continue;

    // For isMovingMax currencies (e.g. Dawncrests), use totalQuantity as
    // the weekly progress since quantity tracks the rolling total, not the
    // standard isWeekly/weekQuantity fields.
    const isMovingMax =
      parsed.isMovingMax && MOVING_MAX_CURRENCY_IDS.has(currencyId);
    const weekQuantity = isMovingMax
      ? parsed.totalQuantity
      : parsed.isWeekly
        ? parsed.weekQuantity
        : null;
    const weekMax = isMovingMax
      ? parsed.max || 200
      : parsed.isWeekly
        ? parsed.weekMax
        : null;

    await db
      .insert(currencies)
      .values({
        characterId,
        currencyId,
        quantity: parsed.quantity,
        maxQuantity: parsed.max || null,
        weekQuantity,
        weekMax,
      })
      .onConflictDoUpdate({
        target: [currencies.characterId, currencies.currencyId],
        set: {
          quantity: parsed.quantity,
          maxQuantity: parsed.max || null,
          weekQuantity,
          weekMax,
          updatedAt: new Date(),
        },
      });
  }
}

async function processCharacterQuests(
  characterId: number,
  charData: AddonCharacter,
  resetWeek: string,
  todayDate: string,
  questsV2?: Record<string, number>,
): Promise<void> {
  // Daily quests — check existing to avoid duplicates (no unique constraint)
  if (charData.dailyQuests && charData.dailyQuests.length > 0) {
    const existingDaily = await db
      .select({ questId: questCompletions.questId })
      .from(questCompletions)
      .where(
        and(
          eq(questCompletions.characterId, characterId),
          eq(questCompletions.resetDate, todayDate),
          eq(questCompletions.resetType, 'daily'),
        ),
      );
    const existingDailyIds = new Set(existingDaily.map((r) => r.questId));

    const newDaily = charData.dailyQuests
      .filter((qid) => !existingDailyIds.has(qid))
      .map((questId) => ({
        characterId,
        questId,
        resetType: 'daily' as const,
        resetDate: todayDate,
      }));

    if (newDaily.length > 0) {
      await db.insert(questCompletions).values(newDaily);
    }
  }

  // Weekly quests — check existing to avoid duplicates (no unique constraint)
  if (charData.otherQuests && charData.otherQuests.length > 0) {
    const existingWeekly = await db
      .select({ questId: questCompletions.questId })
      .from(questCompletions)
      .where(
        and(
          eq(questCompletions.characterId, characterId),
          eq(questCompletions.resetWeek, resetWeek),
          eq(questCompletions.resetType, 'weekly'),
        ),
      );
    const existingWeeklyIds = new Set(existingWeekly.map((r) => r.questId));

    const newWeekly = charData.otherQuests
      .filter((qid) => !existingWeeklyIds.has(qid))
      .map((questId) => ({
        characterId,
        questId,
        resetType: 'weekly' as const,
        resetWeek,
      }));

    if (newWeekly.length > 0) {
      await db.insert(questCompletions).values(newWeekly);
    }
  }

  // Account-wide quests from questsV2 — store as weekly completions
  if (questsV2) {
    const questIds = Object.keys(questsV2).map((id) => Number.parseInt(id));
    if (questIds.length > 0) {
      const existingAccountQuests = await db
        .select({ questId: questCompletions.questId })
        .from(questCompletions)
        .where(
          and(
            eq(questCompletions.characterId, characterId),
            eq(questCompletions.resetWeek, resetWeek),
            eq(questCompletions.resetType, 'weekly'),
          ),
        );
      const existingIds = new Set(existingAccountQuests.map((r) => r.questId));

      const newAccountQuests = questIds
        .filter((qid) => !existingIds.has(qid))
        .map((questId) => ({
          characterId,
          questId,
          resetType: 'weekly' as const,
          resetWeek,
        }));

      if (newAccountQuests.length > 0) {
        await db.insert(questCompletions).values(newAccountQuests);
      }
    }
  }
}

async function processCharacterWeekly(
  characterId: number,
  charData: AddonCharacter,
  resetWeek: string,
): Promise<void> {
  // Parse vault data
  const vaultDungeon = parseVaultSlots(charData.vault, 't1');
  const vaultRaid = parseVaultSlots(charData.vault, 't3');
  const vaultWorld = parseVaultSlots(charData.vault, 't6');
  const hasRewards =
    (vaultDungeon?.some((s) => s.progress >= s.threshold) ?? false) ||
    (vaultRaid?.some((s) => s.progress >= s.threshold) ?? false) ||
    (vaultWorld?.some((s) => s.progress >= s.threshold) ?? false);

  // Parse lockouts
  const lockouts: Lockout[] | undefined = charData.lockouts
    ?.map((l) => ({
      instanceId: l.id,
      instanceName: l.name,
      difficulty: DIFFICULTY_MAP[l.difficulty] ?? 'normal',
      bossesKilled: l.defeatedBosses,
      bossCount: l.maxBosses,
    }))
    .filter((l) => l.bossesKilled > 0);

  await db
    .insert(weeklyActivities)
    .values({
      characterId,
      resetWeek,
      vaultDungeonProgress: vaultDungeon ?? null,
      vaultRaidProgress: vaultRaid ?? null,
      vaultWorldProgress: vaultWorld ?? null,
      vaultHasRewards: hasRewards,
      keystoneDungeonId: charData.keystoneInstance ?? null,
      keystoneLevel: charData.keystoneLevel ?? null,
      lockouts: lockouts?.length ? lockouts : null,
      delvesGilded: charData.delvesGilded ?? null,
    })
    .onConflictDoUpdate({
      target: [weeklyActivities.characterId, weeklyActivities.resetWeek],
      set: {
        vaultDungeonProgress: vaultDungeon ?? null,
        vaultRaidProgress: vaultRaid ?? null,
        vaultWorldProgress: vaultWorld ?? null,
        vaultHasRewards: hasRewards,
        keystoneDungeonId: charData.keystoneInstance ?? null,
        keystoneLevel: charData.keystoneLevel ?? null,
        lockouts: lockouts?.length ? lockouts : null,
        delvesGilded: charData.delvesGilded ?? null,
        syncedAt: new Date(),
      },
    });
}

function parseVaultSlots(
  vault: AddonCharacter['vault'],
  tier: string,
): VaultSlot[] | undefined {
  if (!vault || !vault[tier]) return undefined;
  const raw = vault[tier];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  return raw.map((entry) => {
    // Handle both object format (new typed schema) and legacy array format
    if (Array.isArray(entry)) {
      const arr = entry as number[];
      return {
        level: arr[0] ?? 0,
        progress: arr[1] ?? 0,
        threshold: arr[2] ?? 0,
        itemLevel: arr[3] ?? 0,
        ...(arr[4] != null ? { upgradeItemLevel: arr[4] } : {}),
      };
    }
    return {
      level: entry.level ?? 0,
      progress: entry.progress ?? 0,
      threshold: entry.threshold ?? 0,
      itemLevel: 0,
    };
  });
}
