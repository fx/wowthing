export type VaultSlot = {
  level: number;
  progress: number;
  threshold: number;
  itemLevel: number;
  upgradeItemLevel?: number;
};

export type Lockout = {
  instanceId: number;
  instanceName: string;
  difficulty: 'lfr' | 'normal' | 'heroic' | 'mythic';
  bossesKilled: number;
  bossCount: number;
};

/** Categorized weekly progress extracted from addon progressQuests */
export type WeeklyProgress = {
  /** Prey hunts completed this week per difficulty (max 4 each) */
  prey: { normal: number; hard: number; nightmare: number };
  /** Special assignment quests with completion and progress status */
  specialAssignments: Array<{
    questId: number;
    name: string;
    completed: boolean;
    /** Objective progress numerator (e.g., 2 of "2/3 WQs") */
    have?: number;
    /** Objective progress denominator */
    need?: number;
  }>;
  /** Dungeon-specific weekly quests */
  dungeonWeeklies: Array<{ questId: number; name: string; completed: boolean }>;
  /** Delve completion quests */
  delves: Array<{ questId: number; name: string; completed: boolean }>;
};
