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
