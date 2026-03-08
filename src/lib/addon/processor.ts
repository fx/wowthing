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

/** Midnight Unity pillar quest IDs (13 total, all binary completion) */
const UNITY_QUESTS = {
  abundance: 93890,
  arcantina: 93767,
  battlegrounds: 94457,
  delves: 93909,
  dungeons: 93911,
  housing: 93769,
  haranir: 93891,
  prey: 93910,
  raid: 93912,
  soiree: 93889,
  stormarion: 93892,
  worldBoss: 93913,
  worldQuests: 93766,
} as const;

/** Midnight non-Unity weekly chore quest IDs */
const ABUNDANCE_QUEST = 89507;
const SOIREE_QUESTS = {
  magisters: 90573,
  bloodKnights: 90574,
  farstriders: 90575,
  shades: 90576,
} as const;
const STORMARION_QUEST = 90962;

/** Midnight Special Assignment definitions (pick 2 per week from 8).
 *  From ChoreTracker: Data/Chores/Midnight.lua */
const SA_DEFINITIONS: Array<{ name: string; assignment: number; unlock: number }> = [
  { name: 'What Remains of a Temple Broken', assignment: 91390, unlock: 94865 },
  { name: 'Ours Once More!', assignment: 91796, unlock: 94866 },
  { name: "A Hunter's Regret", assignment: 92063, unlock: 94390 },
  { name: 'Shade and Claw', assignment: 92139, unlock: 95435 },
  { name: "The Grand Magister's Drink", assignment: 92145, unlock: 92848 },
  { name: 'Push Back the Light', assignment: 93013, unlock: 94391 },
  { name: 'Agents of the Shield', assignment: 93244, unlock: 94795 },
  { name: 'Precision Excision', assignment: 93438, unlock: 94743 },
];
const SA_ASSIGNMENT_IDS = new Set(SA_DEFINITIONS.map((d) => d.assignment));
const SA_UNLOCK_TO_DEF = new Map(SA_DEFINITIONS.map((d) => [d.unlock, d]));

/** Midnight dungeon weekly quest IDs (account-wide, 8 total).
 *  From ChoreTracker: Data/Chores/Midnight.lua */
const DUNGEON_WEEKLY_QUESTS: Array<{ questId: number; name: string }> = [
  { questId: 93751, name: 'Windrunner Spire' },
  { questId: 93752, name: 'Murder Row' },
  { questId: 93753, name: "Magisters' Terrace" },
  { questId: 93754, name: 'Maisara Caverns' },
  { questId: 93755, name: 'Den of Nalorakk' },
  { questId: 93756, name: 'The Blinding Vale' },
  { questId: 93757, name: 'Voidscar Arena' },
  { questId: 93758, name: 'Nexus-Point Xenas' },
];
const DUNGEON_WEEKLY_IDS = new Set(DUNGEON_WEEKLY_QUESTS.map((d) => d.questId));

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

/** Known weekly activity quest IDs — persisted from questsV2 to quest_completions.
 *  All Midnight chore quest IDs from ChoreTracker. */
export const WEEKLY_QUEST_IDS = new Set([
  // Unity quests (13)
  ...Object.values(UNITY_QUESTS),
  // Non-Unity weeklies
  ABUNDANCE_QUEST, ...Object.values(SOIREE_QUESTS), STORMARION_QUEST,
  // Hope in the Darkest Corners (pre-90)
  95468,
  // Special assignment quest IDs + unlock quest IDs
  ...SA_DEFINITIONS.flatMap((d) => [d.assignment, d.unlock]),
  // Dungeon weekly quest IDs
  ...DUNGEON_WEEKLY_QUESTS.map((d) => d.questId),
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
 * Extract all Midnight chore completion from completedQuestsSquish + progressQuests.
 * Uses quest IDs from ChoreTracker addon definitions.
 */
export function extractWeeklyProgress(
  charData: AddonCharacter,
  completedQuests: Set<number>,
): WeeklyProgress {
  const has = (id: number) => completedQuests.has(id);

  // Unity pillars — simple binary quest checks
  const unity = {
    abundance: has(UNITY_QUESTS.abundance),
    arcantina: has(UNITY_QUESTS.arcantina),
    battlegrounds: has(UNITY_QUESTS.battlegrounds),
    delves: has(UNITY_QUESTS.delves),
    dungeons: has(UNITY_QUESTS.dungeons),
    housing: has(UNITY_QUESTS.housing),
    haranir: has(UNITY_QUESTS.haranir),
    prey: has(UNITY_QUESTS.prey),
    raid: has(UNITY_QUESTS.raid),
    soiree: has(UNITY_QUESTS.soiree),
    stormarion: has(UNITY_QUESTS.stormarion),
    worldBoss: has(UNITY_QUESTS.worldBoss),
    worldQuests: has(UNITY_QUESTS.worldQuests),
  };

  // Non-Unity weeklies
  const abundance = has(ABUNDANCE_QUEST);
  const soiree = {
    magisters: has(SOIREE_QUESTS.magisters),
    bloodKnights: has(SOIREE_QUESTS.bloodKnights),
    farstriders: has(SOIREE_QUESTS.farstriders),
    shades: has(SOIREE_QUESTS.shades),
  };
  const stormarion = has(STORMARION_QUEST);

  // Dungeon weeklies — check completedQuestsSquish first, then progressQuests
  const dungeonWeeklies = extractDungeonWeeklies(charData, completedQuests);

  // Delves from progressQuests
  const delves: WeeklyProgress['delves'] = [];
  if (charData.progressQuests) {
    for (const pq of charData.progressQuests) {
      if (pq.name.includes('Delver') || pq.name.includes('Delve')) {
        delves.push({ questId: pq.questId, name: pq.name, completed: isQuestCompleted(pq) });
      }
    }
  }

  return {
    prey: countPreyByDifficulty(completedQuests, charData),
    unity,
    abundance,
    soiree,
    stormarion,
    specialAssignments: extractSpecialAssignments(charData, completedQuests),
    dungeonWeeklies,
    delves,
  };
}

/**
 * Extract dungeon weekly completion from completedQuestsSquish + progressQuests.
 * Uses known quest IDs (93751-93758) instead of name matching.
 */
function extractDungeonWeeklies(
  charData: AddonCharacter,
  completedQuests: Set<number>,
): WeeklyProgress['dungeonWeeklies'] {
  const result: WeeklyProgress['dungeonWeeklies'] = [];
  const handledIds = new Set<number>();

  // 1. Check completedQuestsSquish for turned-in dungeon weeklies
  for (const dw of DUNGEON_WEEKLY_QUESTS) {
    if (completedQuests.has(dw.questId)) {
      result.push({ questId: dw.questId, name: dw.name, completed: true });
      handledIds.add(dw.questId);
    }
  }

  // 2. Check progressQuests for in-progress dungeon weeklies
  if (charData.progressQuests) {
    for (const pq of charData.progressQuests) {
      if (handledIds.has(pq.questId)) continue;
      if (DUNGEON_WEEKLY_IDS.has(pq.questId)) {
        result.push({ questId: pq.questId, name: pq.name, completed: isQuestCompleted(pq) });
        handledIds.add(pq.questId);
      }
    }
  }

  return result;
}

function isQuestCompleted(pq: { status: number; objectives: Array<{ have: number; need: number }> }): boolean {
  return (
    pq.status === 2 ||
    (pq.objectives.length > 0 &&
      pq.objectives.some((obj) => obj.need > 0) &&
      pq.objectives.every((obj) => obj.need === 0 || obj.have >= obj.need))
  );
}

/**
 * Build Midnight SA list from completedQuestsSquish + progressQuests.
 * Uses Midnight SA quest IDs from ChoreTracker (pick 2 per week from 8).
 */
function extractSpecialAssignments(
  charData: AddonCharacter,
  completedQuests: Set<number>,
): WeeklyProgress['specialAssignments'] {
  const result: WeeklyProgress['specialAssignments'] = [];
  const handledIds = new Set<number>();

  // 1. Check completedQuestsSquish for finished SA assignments
  for (const def of SA_DEFINITIONS) {
    if (completedQuests.has(def.assignment)) {
      result.push({ questId: def.assignment, name: def.name, completed: true });
      handledIds.add(def.assignment);
      handledIds.add(def.unlock);
    }
  }

  // 2. Check progressQuests for in-progress Midnight SA quests only
  //    Only match known SA assignment or unlock quest IDs — ignore old TWW/Undermine SAs
  if (charData.progressQuests) {
    for (const pq of charData.progressQuests) {
      if (handledIds.has(pq.questId)) continue;

      const isAssignment = SA_ASSIGNMENT_IDS.has(pq.questId);
      const defByUnlock = SA_UNLOCK_TO_DEF.get(pq.questId);
      // Skip quests that don't match any known Midnight SA
      if (!isAssignment && !defByUnlock) continue;
      // If this is an unlock quest, check if we already have the assignment
      if (defByUnlock && handledIds.has(defByUnlock.assignment)) continue;

      const def = isAssignment
        ? SA_DEFINITIONS.find((d) => d.assignment === pq.questId)
        : defByUnlock;

      const completed = isQuestCompleted(pq);
      const primaryObj = pq.objectives.find((o) => o.need > 0);

      result.push({
        questId: pq.questId,
        name: def?.name ?? pq.name.replace(/^Special Assignment:\s*/, ''),
        completed,
        have: primaryObj?.have,
        need: primaryObj?.need,
      });
      handledIds.add(pq.questId);
      if (def) {
        handledIds.add(def.assignment);
        handledIds.add(def.unlock);
      }
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
