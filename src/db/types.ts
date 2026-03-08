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
  /** Individual prey hunt quests: name -> completed */
  preyHunts: Array<{ name: string; completed: boolean }>;
  /** Special assignment quests with completion status */
  specialAssignments: Array<{ questId: number; name: string; completed: boolean }>;
  /** Dungeon-specific weekly quests */
  dungeonWeeklies: Array<{ questId: number; name: string; completed: boolean }>;
  /** Delve completion quests */
  delves: Array<{ questId: number; name: string; completed: boolean }>;
};
