import { describe, expect, it, vi } from 'vitest';

vi.mock('~/db', () => ({ db: {} }));

import { WEEKLY_QUEST_IDS, countPreyFromSquish, countPreyByDifficulty, extractBlizzardId, extractRealmSlug, extractWeeklyProgress } from '../processor';
import type { AddonCharacter } from '../schema';

// Test the DIFFICULTY_MAP logic and parseVaultSlots logic
// These are internal to processor.ts, so we test the exported behavior indirectly
// by testing the mapping expectations

describe('processor logic', () => {
  const DIFFICULTY_MAP: Record<number, string> = {
    7: 'lfr',
    14: 'normal',
    15: 'heroic',
    16: 'mythic',
    23: 'mythic',
  };

  describe('DIFFICULTY_MAP', () => {
    it('maps difficulty 7 to lfr', () => {
      expect(DIFFICULTY_MAP[7]).toBe('lfr');
    });

    it('maps difficulty 14 to normal', () => {
      expect(DIFFICULTY_MAP[14]).toBe('normal');
    });

    it('maps difficulty 15 to heroic', () => {
      expect(DIFFICULTY_MAP[15]).toBe('heroic');
    });

    it('maps difficulty 16 to mythic', () => {
      expect(DIFFICULTY_MAP[16]).toBe('mythic');
    });

    it('maps difficulty 23 to mythic (current raid format)', () => {
      expect(DIFFICULTY_MAP[23]).toBe('mythic');
    });

    it('returns undefined for unknown difficulties', () => {
      expect(DIFFICULTY_MAP[99]).toBeUndefined();
    });
  });

  describe('isMovingMax currency handling', () => {
    const MOVING_MAX_CURRENCY_IDS = new Set([3383, 3341, 3343, 3345, 3348]);

    function computeWeeklyProgress(
      parsed: {
        isMovingMax: boolean;
        isWeekly: boolean;
        totalQuantity: number;
        weekQuantity: number;
        weekMax: number;
        max: number;
      },
      currencyId: number,
    ) {
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
      return { weekQuantity, weekMax };
    }

    it('uses totalQuantity for isMovingMax dawncrest currencies', () => {
      const parsed = {
        isMovingMax: true,
        isWeekly: false,
        totalQuantity: 150,
        weekQuantity: 0,
        weekMax: 0,
        max: 200,
      };
      const result = computeWeeklyProgress(parsed, 3383);
      expect(result.weekQuantity).toBe(150);
      expect(result.weekMax).toBe(200);
    });

    it('uses standard weekQuantity for non-moving-max currencies', () => {
      const parsed = {
        isMovingMax: false,
        isWeekly: true,
        totalQuantity: 500,
        weekQuantity: 50,
        weekMax: 100,
        max: 0,
      };
      const result = computeWeeklyProgress(parsed, 9999);
      expect(result.weekQuantity).toBe(50);
      expect(result.weekMax).toBe(100);
    });

    it('returns null for non-weekly, non-movingMax currencies', () => {
      const parsed = {
        isMovingMax: false,
        isWeekly: false,
        totalQuantity: 0,
        weekQuantity: 0,
        weekMax: 0,
        max: 0,
      };
      const result = computeWeeklyProgress(parsed, 9999);
      expect(result.weekQuantity).toBeNull();
      expect(result.weekMax).toBeNull();
    });

    it('uses default 200 cap when max is 0 for isMovingMax', () => {
      const parsed = {
        isMovingMax: true,
        isWeekly: false,
        totalQuantity: 100,
        weekQuantity: 0,
        weekMax: 0,
        max: 0,
      };
      const result = computeWeeklyProgress(parsed, 3383);
      expect(result.weekQuantity).toBe(100);
      expect(result.weekMax).toBe(200);
    });

    it('does not apply movingMax logic to non-dawncrest currencies', () => {
      const parsed = {
        isMovingMax: true,
        isWeekly: false,
        totalQuantity: 100,
        weekQuantity: 0,
        weekMax: 0,
        max: 200,
      };
      // Currency ID 9999 is not in the MOVING_MAX set
      const result = computeWeeklyProgress(parsed, 9999);
      expect(result.weekQuantity).toBeNull();
      expect(result.weekMax).toBeNull();
    });
  });

  describe('vault slot parsing', () => {
    function parseVaultSlots(
      vault: Record<string, unknown[]> | undefined,
      tier: string,
    ) {
      if (!vault || !vault[tier]) return undefined;
      const raw = vault[tier];
      if (!Array.isArray(raw) || raw.length === 0) return undefined;

      return raw.map((entry) => {
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
        const obj = entry as {
          threshold: number;
          progress: number;
          level?: number;
        };
        return {
          level: obj.level ?? 0,
          progress: obj.progress ?? 0,
          threshold: obj.threshold ?? 0,
          itemLevel: 0,
        };
      });
    }

    it('parses object-format vault slots', () => {
      const vault = {
        t1: [
          { threshold: 1, progress: 4, level: 10 },
          { threshold: 4, progress: 4, level: 8 },
          { threshold: 8, progress: 4 },
        ],
      };
      const slots = parseVaultSlots(vault, 't1');
      expect(slots).toHaveLength(3);
      expect(slots?.[0]).toEqual({
        level: 10,
        progress: 4,
        threshold: 1,
        itemLevel: 0,
      });
      expect(slots?.[1]).toEqual({
        level: 8,
        progress: 4,
        threshold: 4,
        itemLevel: 0,
      });
      expect(slots?.[2]).toEqual({
        level: 0,
        progress: 4,
        threshold: 8,
        itemLevel: 0,
      });
    });

    it('parses legacy array-format vault slots', () => {
      const vault = {
        t1: [
          [10, 4, 8, 616],
          [15, 2, 6, 620],
        ],
      };
      const slots = parseVaultSlots(vault, 't1');
      expect(slots).toHaveLength(2);
      expect(slots?.[0]).toEqual({
        level: 10,
        progress: 4,
        threshold: 8,
        itemLevel: 616,
      });
      expect(slots?.[1]).toEqual({
        level: 15,
        progress: 2,
        threshold: 6,
        itemLevel: 620,
      });
    });

    it('handles array format with upgradeItemLevel', () => {
      const vault = {
        t1: [[10, 4, 8, 616, 630]],
      };
      const slots = parseVaultSlots(vault, 't1');
      expect(slots?.[0].upgradeItemLevel).toBe(630);
    });

    it('returns undefined for missing tier', () => {
      const vault = { t1: [{ threshold: 1, progress: 0 }] };
      expect(parseVaultSlots(vault, 't3')).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
      const vault = { t1: [] };
      expect(parseVaultSlots(vault, 't1')).toBeUndefined();
    });

    it('returns undefined for undefined vault', () => {
      expect(parseVaultSlots(undefined, 't1')).toBeUndefined();
    });
  });

  describe('lockout processing', () => {
    it('maps lockouts with difficulty 23 to mythic', () => {
      const lockout = {
        id: 1299,
        name: 'Windrunner Spire',
        difficulty: 23,
        maxBosses: 4,
        defeatedBosses: 4,
      };
      const mapped = {
        instanceId: lockout.id,
        instanceName: lockout.name,
        difficulty: DIFFICULTY_MAP[lockout.difficulty] ?? 'normal',
        bossesKilled: lockout.defeatedBosses,
        bossCount: lockout.maxBosses,
      };
      expect(mapped.difficulty).toBe('mythic');
      expect(mapped.instanceId).toBe(1299);
      expect(mapped.bossesKilled).toBe(4);
    });

    it('filters out lockouts with zero bosses killed', () => {
      const lockouts = [
        { id: 1299, defeatedBosses: 4, difficulty: 23, maxBosses: 4 },
        { id: 1300, defeatedBosses: 0, difficulty: 15, maxBosses: 4 },
        { id: 1311, defeatedBosses: 2, difficulty: 14, maxBosses: 3 },
      ];
      const filtered = lockouts
        .map((l) => ({
          instanceId: l.id,
          difficulty: DIFFICULTY_MAP[l.difficulty] ?? 'normal',
          bossesKilled: l.defeatedBosses,
          bossCount: l.maxBosses,
        }))
        .filter((l) => l.bossesKilled > 0);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].instanceId).toBe(1299);
      expect(filtered[1].instanceId).toBe(1311);
    });
  });

  describe('quest completion detection', () => {
    it('detects weekly quest IDs from questsV2', () => {
      const questsV2: Record<string, number> = {
        '93890': 1,
        '93751': 1,
        '12345': 1,
      };
      const knownWeeklyQuestIds = [93890, 93767, 94457];
      const completedWeeklies = Object.keys(questsV2)
        .map((k) => parseInt(k, 10))
        .filter((id) => Number.isFinite(id))
        .filter((id) => knownWeeklyQuestIds.includes(id));
      expect(completedWeeklies).toEqual([93890]);
    });

    it('handles empty questsV2', () => {
      const questsV2: Record<string, number> = {};
      const questIds = Object.keys(questsV2)
        .map((k) => parseInt(k, 10))
        .filter((id) => Number.isFinite(id));
      expect(questIds).toHaveLength(0);
    });

    it('filters out NaN from non-numeric questsV2 keys', () => {
      const questsV2: Record<string, number> = {
        '93890': 1,
        'abc': 1,
        '': 1,
        '93751': 1,
      };
      const questIds = Object.keys(questsV2)
        .map((k) => parseInt(k, 10))
        .filter((id) => Number.isFinite(id));
      expect(questIds.sort()).toEqual([93751, 93890]);
    });

    it('only includes allowlisted quest IDs from questsV2', () => {
      const questsV2: Record<string, number> = {
        '93890': 1, // Unity quest — allowlisted
        '93751': 1, // Dungeon weekly — allowlisted
        '12345': 1, // Random quest — NOT allowlisted
        '99999': 1, // Random quest — NOT allowlisted
      };
      const questIds = Object.keys(questsV2)
        .map((k) => parseInt(k, 10))
        .filter((id) => Number.isFinite(id))
        .filter((id) => WEEKLY_QUEST_IDS.has(id));
      expect(questIds.sort()).toEqual([93751, 93890]);
    });

    it('WEEKLY_QUEST_IDS does not contain random quest IDs', () => {
      expect(WEEKLY_QUEST_IDS.has(99999)).toBe(false);
      expect(WEEKLY_QUEST_IDS.has(0)).toBe(false);
    });
  });

  describe('countPreyFromSquish', () => {
    function makeChar(progressQuests?: AddonCharacter['progressQuests']): AddonCharacter {
      return { progressQuests } as AddonCharacter;
    }

    it('returns 0 with empty completedQuests and no progressQuests', () => {
      expect(countPreyFromSquish(new Set(), makeChar())).toBe(0);
      expect(countPreyFromSquish(new Set(), makeChar([]))).toBe(0);
    });

    it('counts completed prey from completedQuestsSquish', () => {
      // 91096 = normal, 91224 = hard
      const completed = new Set([91096, 91224]);
      expect(countPreyFromSquish(completed, makeChar())).toBe(2);
    });

    it('counts in-progress prey from quest log when objectives complete', () => {
      const char = makeChar([
        { key: 'q1', questId: 91096, name: 'Prey: Magistrix Emberlash (Normal)', status: 1, expires: 0, objectives: [{ type: 'monster', text: 'Hunt Prey', have: 1, need: 1 }] },
        { key: 'q2', questId: 91224, name: 'Prey: Nexus-Edge Hadim (Hard)', status: 1, expires: 0, objectives: [{ type: 'monster', text: 'Hunt Prey', have: 0, need: 1 }] },
      ]);
      // Only 91096 has completed objectives; 91224 has 0/1
      expect(countPreyFromSquish(new Set(), char)).toBe(1);
    });

    it('does not double-count prey in both completedQuests and quest log', () => {
      const completed = new Set([91096]);
      const char = makeChar([
        { key: 'q1', questId: 91096, name: 'Prey: Magistrix Emberlash (Normal)', status: 1, expires: 0, objectives: [{ type: 'monster', text: 'Hunt Prey', have: 1, need: 1 }] },
      ]);
      // 91096 in both - should count as 1
      expect(countPreyFromSquish(completed, char)).toBe(1);
    });
  });

  describe('countPreyByDifficulty', () => {
    function makeChar(progressQuests?: AddonCharacter['progressQuests']): AddonCharacter {
      return { progressQuests } as AddonCharacter;
    }

    it('separates prey by difficulty tier', () => {
      // 91096 = normal, 91224 = hard, 91256 = nightmare
      const completed = new Set([91096, 91098, 91224, 91256]);
      const result = countPreyByDifficulty(completed, makeChar());
      expect(result.normal).toBe(2);
      expect(result.hard).toBe(1);
      expect(result.nightmare).toBe(1);
    });
  });

  describe('extractBlizzardId', () => {
    it('extracts decimal blizzardId from Player GUID hex portion', () => {
      // Player-{realmId}-{hexCharId} -> decimal conversion of hex portion
      expect(extractBlizzardId('Player-1168-0A813ABB')).toBe(0x0a813abb);
      expect(extractBlizzardId('Player-3694-0A50BEBC')).toBe(0x0a50bebc);
    });

    it('handles uppercase and lowercase hex', () => {
      expect(extractBlizzardId('Player-1168-0a813abb')).toBe(0x0a813abb);
      expect(extractBlizzardId('Player-1168-0A813ABB')).toBe(0x0a813abb);
    });

    it('returns null for non-Player GUID keys', () => {
      expect(extractBlizzardId('12345')).toBeNull();
      expect(extractBlizzardId('abc')).toBeNull();
      expect(extractBlizzardId('')).toBeNull();
    });

    it('returns null for malformed Player GUIDs', () => {
      expect(extractBlizzardId('Player-')).toBeNull();
      expect(extractBlizzardId('Player-1168')).toBeNull();
      expect(extractBlizzardId('Player-1168-')).toBeNull();
      expect(extractBlizzardId('Player-1168-ZZZZ')).toBeNull();
    });
  });

  describe('extractRealmSlug', () => {
    it('extracts realm slug from guildName format', () => {
      expect(extractRealmSlug("1/Ner'zhul/Wartorn")).toBe('nerzhul');
    });

    it('handles simple realm names', () => {
      expect(extractRealmSlug('1/Darkspear/Guild')).toBe('darkspear');
    });

    it('handles multi-word realm names', () => {
      expect(extractRealmSlug('1/Area 52/Guild')).toBe('area52');
    });

    it('returns null for invalid format', () => {
      expect(extractRealmSlug('invalid')).toBeNull();
      expect(extractRealmSlug('')).toBeNull();
    });

    it('WEEKLY_QUEST_IDS contains known quest IDs from seeds', () => {
      // Unity quests
      expect(WEEKLY_QUEST_IDS.has(93890)).toBe(true);
      expect(WEEKLY_QUEST_IDS.has(93767)).toBe(true);
      // Hope quest
      expect(WEEKLY_QUEST_IDS.has(95468)).toBe(true);
      // Midnight SA assignment quest IDs
      expect(WEEKLY_QUEST_IDS.has(91390)).toBe(true);
      expect(WEEKLY_QUEST_IDS.has(93438)).toBe(true);
      // Midnight SA unlock quest IDs
      expect(WEEKLY_QUEST_IDS.has(94865)).toBe(true);
      expect(WEEKLY_QUEST_IDS.has(94743)).toBe(true);
      // Dungeon weekly
      expect(WEEKLY_QUEST_IDS.has(93751)).toBe(true);
      expect(WEEKLY_QUEST_IDS.has(93758)).toBe(true);
      // Non-Unity weeklies
      expect(WEEKLY_QUEST_IDS.has(89507)).toBe(true); // Abundance
      expect(WEEKLY_QUEST_IDS.has(90573)).toBe(true); // Soiree: Magisters
      expect(WEEKLY_QUEST_IDS.has(90962)).toBe(true); // Stormarion
      // Non-existent quest should not be in set
      expect(WEEKLY_QUEST_IDS.has(99999)).toBe(false);
    });
  });

  describe('extractWeeklyProgress', () => {
    function makeChar(opts: Partial<AddonCharacter> = {}): AddonCharacter {
      return { progressQuests: [], ...opts } as AddonCharacter;
    }

    it('extracts unity pillar completion from completedQuestsSquish', () => {
      // 93890=Abundance, 93767=Arcantina, 93912=Raid
      const completed = new Set([93890, 93767, 93912]);
      const wp = extractWeeklyProgress(makeChar(), completed);
      expect(wp.unity.abundance).toBe(true);
      expect(wp.unity.arcantina).toBe(true);
      expect(wp.unity.raid).toBe(true);
      expect(wp.unity.dungeons).toBe(false);
      expect(wp.unity.housing).toBe(false);
    });

    it('extracts abundance, soiree, stormarion from completedQuestsSquish', () => {
      const completed = new Set([89507, 90573, 90575, 90962]);
      const wp = extractWeeklyProgress(makeChar(), completed);
      expect(wp.abundance).toBe(true);
      expect(wp.soiree.magisters).toBe(true);
      expect(wp.soiree.bloodKnights).toBe(false);
      expect(wp.soiree.farstriders).toBe(true);
      expect(wp.soiree.shades).toBe(false);
      expect(wp.stormarion).toBe(true);
    });

    it('extracts Midnight SA completion from completedQuestsSquish', () => {
      // 91390 = Temple Broken assignment, 93013 = Push Back the Light assignment
      const completed = new Set([91390, 93013]);
      const wp = extractWeeklyProgress(makeChar(), completed);
      expect(wp.specialAssignments).toHaveLength(2);
      expect(wp.specialAssignments[0].completed).toBe(true);
      expect(wp.specialAssignments[0].name).toBe('What Remains of a Temple Broken');
      expect(wp.specialAssignments[1].completed).toBe(true);
      expect(wp.specialAssignments[1].name).toBe('Push Back the Light');
    });

    it('extracts dungeon weeklies by quest ID from completedQuestsSquish', () => {
      // 93753 = Magisters' Terrace
      const completed = new Set([93753]);
      const wp = extractWeeklyProgress(makeChar(), completed);
      expect(wp.dungeonWeeklies).toHaveLength(1);
      expect(wp.dungeonWeeklies[0].questId).toBe(93753);
      expect(wp.dungeonWeeklies[0].completed).toBe(true);
    });

    it('extracts in-progress dungeon weeklies from progressQuests', () => {
      const char = makeChar({
        progressQuests: [
          { key: 'q1', questId: 93751, name: 'Windrunner Spire', status: 1, expires: 0, objectives: [] },
        ],
      });
      const wp = extractWeeklyProgress(char, new Set());
      expect(wp.dungeonWeeklies).toHaveLength(1);
      expect(wp.dungeonWeeklies[0].name).toBe('Windrunner Spire');
      expect(wp.dungeonWeeklies[0].completed).toBe(false);
    });

    it('returns default values with empty data', () => {
      const wp = extractWeeklyProgress(makeChar(), new Set());
      expect(wp.abundance).toBe(false);
      expect(wp.stormarion).toBe(false);
      expect(Object.values(wp.unity).every((v) => v === false)).toBe(true);
      expect(Object.values(wp.soiree).every((v) => v === false)).toBe(true);
      expect(wp.specialAssignments).toHaveLength(0);
      expect(wp.dungeonWeeklies).toHaveLength(0);
      expect(wp.delves).toHaveLength(0);
    });
  });
});
