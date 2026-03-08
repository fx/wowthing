import { and, eq, inArray } from 'drizzle-orm';
import { db } from '~/db';
import {
  accounts,
  characters,
  currencies,
  questCompletions,
  weeklyActivities,
} from '~/db/schema';
import type { Lockout, VaultSlot, WeeklyProgress } from '~/db/types';
import { getCurrentResetWeek, getTodayDate } from '~/lib/activities/resets';
import type { Region } from '~/lib/activities/resets';
import type { AddonCharacter, AddonUpload } from './schema';
import { unsquish } from './unsquish';

/** Prey quest IDs per difficulty from upstream wowthing-again */
const PREY_NORMAL_IDS = new Set([
  91095, 91096, 91097, 91098, 91099, 91100, 91101, 91102, 91103, 91104,
  91105, 91106, 91107, 91108, 91109, 91110, 91111, 91112, 91113, 91114,
  91115, 91116, 91117, 91118, 91119, 91120, 91121, 91122, 91123, 91124,
]);
const PREY_HARD_IDS = new Set([
  91210, 91211, 91212, 91213, 91214, 91215, 91216, 91217, 91218, 91219,
  91220, 91221, 91222, 91223, 91224, 91225, 91226, 91227, 91228, 91229,
  91230, 91231, 91232, 91233, 91234, 91235, 91236, 91237, 91238, 91239,
  91240, 91241, 91242, 91243, 91244, 91245, 91246, 91247, 91248, 91249,
  91250, 91251, 91252, 91253, 91254, 91255,
]);
const PREY_NIGHTMARE_IDS = new Set([
  91256, 91257, 91258, 91259, 91260, 91261, 91262, 91263, 91264, 91265,
  91266, 91267, 91268, 91269,
]);

/**
 * Extract blizzardId from addon Player GUID format: "Player-{realmId}-{hexCharId}"
 * The hex portion is the same numeric ID the Blizzard API returns for the character.
 * Mirrors upstream wowthing-again: UserUploadJob.cs PlayerGuidRegex
 */
const PLAYER_GUID_REGEX = /^Player-\d+-([0-9A-Fa-f]+)$/;

export function extractBlizzardId(addonKey: string): number | null {
  const match = addonKey.match(PLAYER_GUID_REGEX);
  if (!match) return null;
  const id = parseInt(match[1], 16);
  return Number.isFinite(id) ? id : null;
}

const DIFFICULTY_MAP: Record<number, Lockout['difficulty']> = {
  7: 'lfr',
  14: 'normal',
  15: 'heroic',
  16: 'mythic',
  23: 'mythic',
};

/** Dawncrest currency IDs that use isMovingMax tracking */
const MOVING_MAX_CURRENCY_IDS = new Set([3383, 3341, 3343, 3345, 3348]);

/** Known weekly activity quest IDs from seeds/activities.yaml.
 *  Only these IDs are persisted from questsV2 to avoid bloating
 *  the quest_completions table with thousands of irrelevant quests. */
export const WEEKLY_QUEST_IDS = new Set([
  // Unity quests
  93890, 93767, 94457, 93909, 93911, 93769, 93891, 93910, 93912, 93889, 93892, 93913, 93766,
  // Hope in the Darkest Corners
  95468,
  // Special assignment quest IDs
  91390, 91796, 92063, 92139, 92145, 93013, 93244, 93438,
  // Special assignment unlock quest IDs
  94865, 94866, 94390, 95435, 92848, 94391, 94795, 94743,
  // Dungeon weekly
  93751, 93752, 93753, 93754, 93755, 93756, 93757, 93758,
]);

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

  // Build lookup: blizzardId -> character+region
  // Mirrors upstream wowthing-again which matches by converting the hex portion
  // of the Player GUID to a decimal blizzardId.
  const charWithRegion = userCharacters.map((c) => {
    const acct = userAccounts.find((a) => a.id === c.accountId);
    return { character: c, region: acct?.region ?? 'us' };
  });

  const charByBlizzardId = new Map(
    charWithRegion.map((entry) => [entry.character.blizzardId, entry]),
  );

  type CharEntry = (typeof charWithRegion)[number];
  const addonMatches: Array<{ charData: AddonCharacter; match: CharEntry }> = [];

  for (const [charKey, charData] of Object.entries(upload.chars)) {
    const blizzardId = extractBlizzardId(charKey);
    if (blizzardId == null) continue;

    const match = charByBlizzardId.get(blizzardId);
    if (match) {
      addonMatches.push({ charData, match });
    }
  }

  for (const { charData, match } of addonMatches) {

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
      ? parsed.max > 0 ? parsed.max : 200
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
    const questIds = Object.keys(questsV2)
      .map((k) => parseInt(k, 10))
      .filter((id) => Number.isFinite(id))
      .filter((id) => WEEKLY_QUEST_IDS.has(id));
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

  // Extract weekly progress from progressQuests + completedQuestsSquish
  const completedQuests = charData.completedQuestsSquish
    ? unsquish(charData.completedQuestsSquish)
    : new Set<number>();
  const preyHuntsCompleted = countPreyFromSquish(completedQuests, charData);
  const weeklyProgress = extractWeeklyProgress(charData, completedQuests);

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
      preyHuntsCompleted,
      weeklyProgress,
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
        preyHuntsCompleted,
        weeklyProgress,
        syncedAt: new Date(),
      },
    });
}

/**
 * Extract realm slug from addon guildName format: "region/realm/guildName"
 * e.g. "1/Ner'zhul/Wartorn" -> "nerzhul"
 */
export function extractRealmSlug(guildName: string): string | null {
  const parts = guildName.split('/');
  if (parts.length < 2) return null;
  // Convert realm name to slug: lowercase, remove apostrophes/spaces/special chars
  return parts[1]
    .toLowerCase()
    .replace(/[' ]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Count total prey hunts completed this week across all difficulties.
 * Uses completedQuestsSquish (weekly quest flags) + in-progress quests from quest log.
 */
export function countPreyFromSquish(
  completedQuests: Set<number>,
  charData: AddonCharacter,
): number {
  const prey = countPreyByDifficulty(completedQuests, charData);
  return prey.normal + prey.hard + prey.nightmare;
}

/**
 * Count prey hunts per difficulty from completed quest flags + in-progress quests.
 * WoW resets weekly quest completion flags each Tuesday, so completedQuestsSquish
 * only contains prey quest IDs completed THIS week.
 * Also counts in-progress prey quests from the quest log (accepted but not turned in).
 */
export function countPreyByDifficulty(
  completedQuests: Set<number>,
  charData: AddonCharacter,
): { normal: number; hard: number; nightmare: number } {
  let normal = 0;
  let hard = 0;
  let nightmare = 0;

  // Count completed prey from quest flags
  for (const id of completedQuests) {
    if (PREY_NORMAL_IDS.has(id)) normal++;
    else if (PREY_HARD_IDS.has(id)) hard++;
    else if (PREY_NIGHTMARE_IDS.has(id)) nightmare++;
  }

  // Also count in-progress prey from quest log (accepted, objective completed)
  if (charData.progressQuests) {
    for (const pq of charData.progressQuests) {
      if (!pq.name.startsWith('Prey:')) continue;
      // Skip if already counted via completedQuestsSquish
      if (completedQuests.has(pq.questId)) continue;
      // Check if objective is done (have >= need) or status=2
      const done =
        pq.status === 2 ||
        pq.objectives.some((obj) => obj.need > 0 && obj.have >= obj.need);
      if (!done) continue;
      if (PREY_NORMAL_IDS.has(pq.questId)) normal++;
      else if (PREY_HARD_IDS.has(pq.questId)) hard++;
      else if (PREY_NIGHTMARE_IDS.has(pq.questId)) nightmare++;
    }
  }

  return { normal, hard, nightmare };
}

/**
 * Extract categorized weekly progress from progressQuests + completedQuestsSquish.
 * A quest is "completed" when status=2 OR all objectives with need>0 have have>=need.
 */
export function extractWeeklyProgress(
  charData: AddonCharacter,
  completedQuests: Set<number>,
): WeeklyProgress {
  const result: WeeklyProgress = {
    prey: countPreyByDifficulty(completedQuests, charData),
    specialAssignments: [],
    dungeonWeeklies: [],
    delves: [],
  };

  if (!charData.progressQuests?.length) return result;

  for (const pq of charData.progressQuests) {
    // Skip prey quests — handled by countPreyByDifficulty
    if (pq.name.startsWith('Prey:')) continue;

    const completed =
      pq.status === 2 ||
      (pq.objectives.length > 0 &&
        pq.objectives.some((obj) => obj.need > 0) &&
        pq.objectives.every((obj) => obj.need === 0 || obj.have >= obj.need));

    if (pq.name.startsWith('Special Assignment')) {
      result.specialAssignments.push({
        questId: pq.questId,
        name: pq.name,
        completed,
      });
    } else if (
      pq.name.includes('Delver') ||
      pq.name.includes('Delve')
    ) {
      result.delves.push({ questId: pq.questId, name: pq.name, completed });
    } else if (
      pq.name.includes('Windrunner Spire:') ||
      pq.name.includes("Magisters' Terrace:") ||
      pq.name.includes('Murder Row:') ||
      pq.name.includes('Blinding Vale:') ||
      pq.name.includes('Den of Nalorakk:') ||
      pq.name.includes('Maisara Caverns:')
    ) {
      result.dungeonWeeklies.push({
        questId: pq.questId,
        name: pq.name,
        completed,
      });
    }
  }

  return result;
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
