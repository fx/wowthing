import { eq, and, inArray } from 'drizzle-orm';
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
};

const VAULT_TIER_MAP: Record<string, 'dungeon' | 'raid' | 'world'> = {
  t1: 'dungeon',
  t3: 'raid',
  t6: 'world',
};

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
    const blizzardId = parseInt(charKey);
    if (isNaN(blizzardId)) continue;

    const match = charByBlizzardId.get(blizzardId);
    if (!match) continue; // Character not owned by this user

    const { character, region } = match;
    const regionTyped = region as Region;
    const resetWeek = getCurrentResetWeek(regionTyped);
    const todayDate = getTodayDate(regionTyped);

    await Promise.all([
      processCharacterCurrencies(character.id, charData),
      processCharacterQuests(character.id, charData, resetWeek, todayDate),
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
    const currencyId = parseInt(currencyIdStr);
    if (isNaN(currencyId)) continue;

    await db
      .insert(currencies)
      .values({
        characterId,
        currencyId,
        quantity: parsed.quantity,
        maxQuantity: parsed.max || null,
        weekQuantity: parsed.isWeekly ? parsed.weekQuantity : null,
        weekMax: parsed.isWeekly ? parsed.weekMax : null,
      })
      .onConflictDoUpdate({
        target: [currencies.characterId, currencies.currencyId],
        set: {
          quantity: parsed.quantity,
          maxQuantity: parsed.max || null,
          weekQuantity: parsed.isWeekly ? parsed.weekQuantity : null,
          weekMax: parsed.isWeekly ? parsed.weekMax : null,
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
): Promise<void> {
  // Daily quests
  if (charData.dailyQuests) {
    for (const questId of charData.dailyQuests) {
      await db
        .insert(questCompletions)
        .values({
          characterId,
          questId,
          resetType: 'daily',
          resetDate: todayDate,
        })
        .onConflictDoNothing();
    }
  }

  // Weekly quests (from otherQuests)
  if (charData.otherQuests) {
    for (const questId of charData.otherQuests) {
      await db
        .insert(questCompletions)
        .values({
          characterId,
          questId,
          resetType: 'weekly',
          resetWeek,
        })
        .onConflictDoNothing();
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
        syncedAt: new Date(),
      },
    });
}

function parseVaultSlots(
  vault: Record<string, unknown[]> | undefined,
  tier: string,
): VaultSlot[] | undefined {
  if (!vault || !vault[tier]) return undefined;
  const raw = vault[tier];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  // Vault data comes as arrays of [level, progress, threshold, itemLevel, upgradeItemLevel?]
  return raw
    .filter((entry) => Array.isArray(entry))
    .map((entry) => {
      const arr = entry as number[];
      return {
        level: arr[0] ?? 0,
        progress: arr[1] ?? 0,
        threshold: arr[2] ?? 0,
        itemLevel: arr[3] ?? 0,
        ...(arr[4] != null ? { upgradeItemLevel: arr[4] } : {}),
      };
    });
}
