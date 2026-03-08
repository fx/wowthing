export const MYTHIC_DUNGEONS = [
  { instanceId: 1299, name: 'Windrunner Spire', bosses: 4 },
  { instanceId: 1300, name: "Magisters' Terrace", bosses: 4 },
  { instanceId: 1304, name: 'Murder Row', bosses: 4 },
  { instanceId: 1309, name: 'The Blinding Vale', bosses: 4 },
  { instanceId: 1311, name: 'Den of Nalorakk', bosses: 3 },
  { instanceId: 1315, name: 'Maisara Caverns', bosses: 3 },
] as const;

export const DAWNCREST_TIERS = [
  { currencyId: 3383, name: 'Adventurer', weeklyCap: 200 },
  { currencyId: 3341, name: 'Veteran', weeklyCap: 200 },
  { currencyId: 3343, name: 'Champion', weeklyCap: 200 },
  { currencyId: 3345, name: 'Hero', weeklyCap: 200 },
  { currencyId: 3348, name: 'Myth', weeklyCap: 200 },
] as const;

export const DIFFICULTIES = ['normal', 'heroic', 'mythic'] as const;

export const DIFF_SHORT: Record<string, string> = {
  normal: 'N',
  heroic: 'H',
  mythic: 'M',
};


export const VAULT_THRESHOLDS = {
  mythicPlus: { tier: 't1', thresholds: [1, 4, 8], label: 'Mythic+' },
  raid: { tier: 't3', thresholds: [2, 4, 6], label: 'Raid' },
  world: { tier: 't6', thresholds: [2, 4, 8], label: 'World' },
} as const;

// Faction IDs from real addon data. Names are approximate — confirm via Blizzard API.
export const MIDNIGHT_FACTIONS = [
  { id: 2600, name: 'Faction 2600' },
  { id: 2644, name: 'Faction 2644' },
  { id: 2683, name: 'Faction 2683' },
  { id: 2722, name: 'Faction 2722' },
] as const;
