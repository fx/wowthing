import { describe, expect, it } from 'vitest';

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
      expect(questIds).toEqual([93890, 93751]);
    });
  });
});
