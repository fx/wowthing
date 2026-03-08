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

/** Midnight chore completion status from completedQuestsSquish + progressQuests */
export type WeeklyProgress = {
  /** Prey hunts completed this week per difficulty (max 4 each) */
  prey: { normal: number; hard: number; nightmare: number };
  /** Unity pillar quests (13 total, each binary) */
  unity: {
    abundance: boolean;
    arcantina: boolean;
    battlegrounds: boolean;
    delves: boolean;
    dungeons: boolean;
    housing: boolean;
    haranir: boolean;
    prey: boolean;
    raid: boolean;
    soiree: boolean;
    stormarion: boolean;
    worldBoss: boolean;
    worldQuests: boolean;
  };
  /** Abundant Offerings weekly quest (89507) */
  abundance: boolean;
  /** Soiree runestone quests (4 total: Magisters, Blood Knights, Farstriders, Shades) */
  soiree: { magisters: boolean; bloodKnights: boolean; farstriders: boolean; shades: boolean };
  /** Stormarion Assault weekly (90962) */
  stormarion: boolean;
  /** Special Assignments (pick 2 per week from 8 Midnight SAs) */
  specialAssignments: Array<{
    questId: number;
    name: string;
    completed: boolean;
    have?: number;
    need?: number;
  }>;
  /** Dungeon weekly quests (8 account-wide) */
  dungeonWeeklies: Array<{ questId: number; name: string; completed: boolean }>;
  /** Delve completion quests */
  delves: Array<{ questId: number; name: string; completed: boolean }>;
};
