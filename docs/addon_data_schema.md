# WoWThing Collector Addon Data Schema

Reference for the `WoWthing_Collector.lua` SavedVariables file uploaded by users.

Derived from real upload data (version 9158, March 2026, Midnight 12.0).

## File Format

Lua SavedVariables table assigned to `WWTCSaved`. Parsed by `src/lib/addon/lua-parser.ts` into JSON, validated by `src/lib/addon/schema.ts`.

```lua
WWTCSaved = {
  ["version"] = 9158,
  ["chars"] = { ... },
  ...
}
```

---

## Top-Level Keys

| Key | Type | Description |
|-----|------|-------------|
| `version` | number | Addon data version |
| `chars` | object | Per-character data (see below) |
| `guilds` | object | Guild bank data: `{copper, items, tabs, scanTimes}` per guild key (`"region/realm/name"`) |
| `warbank` | object | Warband bank: `{items, copper, scannedAt}` |
| `scanTimes` | object | Account-level scan timestamps: `{equipment, transferCurrencies, housing, warbankGold, decor}` |
| `houses` | array | Housing data as encoded strings: `"Housing-type-id:name:level:..."` |
| `decor` | object | Housing decorations: `{itemId: "placed;total"}`, can be very large (1600+ entries) |
| `toys` | object | Toy collection (itemId → boolean) |
| `battlePets` | object | Pet collection (515+ entries) |
| `illusions` | array | Known weapon illusion IDs |
| `heirloomsV2` | object | Heirloom collection |
| `transmogIdsSquish` | string | Compressed transmog ID bitmap |
| `transmogSourcesSquishV2` | string | Compressed transmog source bitmap |
| `questsV2` | object | Account-wide quest completion: `{questId: 1}` |
| `worldQuestIds` | object | Completed world quest IDs: `{questId: 1}` (2500+ entries) |
| `transferCurrencies` | object | Warband transfer currencies |
| `honorLevel` | number | Account honor level |
| `honorCurrent` | number | Current honor points |
| `honorMax` | number | Max honor for current level |
| `fix_11_0_2_11_v2` | boolean | Internal patch migration flag |

---

## Character Data (`chars`)

Keyed by numeric Blizzard character ID (blizzardId) as a string.

Example: `"123456789"`

The processor parses these keys with `parseInt(key, 10)` and matches them against the `blizzardId` column in the `characters` table (which comes from the Blizzard API profile endpoint).

### Character Keys

#### Identity & Status

| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `level` | number | `90` | Character level |
| `copper` | number | `158554903` | Gold in copper (divide by 10000 for gold) |
| `currentLocation` | string | `"Silvermoon City > Astalor's Sanctum"` | Current zone |
| `bindLocation` | string | `"Wayfarer's Rest"` | Hearthstone location |
| `guildName` | string | `"1/Ner'zhul/Wartorn"` | `"region/realm/name"` format |
| `lastSeen` | number | `1772862047` | Unix timestamp of last addon scan |
| `isResting` | boolean | | In a rest area |
| `isWarMode` | boolean | | War Mode enabled |
| `isXpDisabled` | boolean | | XP gain locked |
| `playedTotal` | number | `1079583` | Total /played in seconds |
| `playedLevel` | number | `41543` | /played at current level |
| `levelXp` | number | | XP progress at current level |
| `restedXP` | number | | Rested XP accumulated |
| `chromieTime` | number | | Chromie Time expansion ID (0 = none) |
| `activeCovenantId` | number | | Active covenant (legacy) |
| `mountSkill` | number | `5` | Riding skill level |
| `bankTabs` | number | `6` | Number of bank tabs |

#### Weekly-Reset Data (Primary Tracking Targets)

##### Great Vault (`vault`)

Three tiers with 3 slots each. Progress resets weekly.

```json
{
  "t1": [  // Mythic+ dungeons
    {"threshold": 1, "progress": 0, "level": 0, "tier": 0, "rewards": {}},
    {"threshold": 4, "progress": 0, "level": 0, "tier": 0, "rewards": {}},
    {"threshold": 8, "progress": 0, "level": 0, "tier": 0, "rewards": {}}
  ],
  "t3": [  // Raid bosses
    {"threshold": 2, ...},
    {"threshold": 4, ...},
    {"threshold": 6, ...}
  ],
  "t6": [  // World activities
    {"threshold": 2, ...},
    {"threshold": 4, ...},
    {"threshold": 8, ...}
  ]
}
```

| Tier | Source | Thresholds |
|------|--------|------------|
| `t1` | Mythic+ dungeons | 1, 4, 8 |
| `t3` | Raid bosses killed | 2, 4, 6 |
| `t6` | World activities | 2, 4, 8 |

Fields per slot:
- `threshold` — number needed to unlock this slot
- `progress` — current progress toward threshold
- `level` — reward quality level from the vault (set when slot is earned)
- `tier` — reward quality tier
- `rewards` — available reward choices (populated after reset)

The processor stores both `level` and `itemLevel` separately in the database. For the legacy array format, the index mapping is `[level, progress, threshold, itemLevel, upgradeItemLevel?]`.

Also: `vaultGeneratedRewards` (boolean) and `vaultAvailableRewards` (boolean) indicate vault state.

##### Raid Lockouts (`lockouts`)

Array of active lockout objects. Resets weekly per `resetTime`.

```json
[
  {
    "id": 1299,
    "name": "Windrunner Spire",
    "difficulty": 23,
    "maxBosses": 4,
    "defeatedBosses": 4,
    "locked": true,
    "resetTime": 1773154976,
    "bosses": ["1:Emberdawn", "1:Derelict Duo", "1:Commander Kroluk", "1:Restless Heart"]
  }
]
```

Known Midnight raid wings (from real data):

| Instance ID | Name | Bosses |
|-------------|------|--------|
| 1299 | Windrunner Spire | 4 (Emberdawn, Derelict Duo, Commander Kroluk, Restless Heart) |
| 1300 | Magisters' Terrace | 4 (Arcanotron Custos, Seranel Sunlash, Gemellus, Degentrius) |
| 1304 | Murder Row | 4 |
| 1309 | The Blinding Vale | 4 |
| 1311 | Den of Nalorakk | 3 (The Hoardmonger, Sentinel of Winter, Nalorakk) |
| 1315 | Maisara Caverns | 3 |

Difficulty IDs: 14=Normal, 15=Heroic, 16=Mythic, 23=Mythic (current raid format)

Boss format: `"defeated:bossName"` where `1` = killed, `0` = alive.

> **Note:** The seed file references instance IDs 16340, 16531, 16215 which don't match these real lockout IDs. The seed data needs updating to match actual game data.

##### Mythic+ (`mythicPlusV2`)

```json
{
  "weeks": {
    "1773154799": {}  // Weekly reset timestamp → runs for that week
  },
  "seasons": {
    "15": [{"mapId": 499}, {"mapId": 542}, ...],  // Season 15 dungeon pool
    "-1": [{"mapId": 499}, {"mapId": 542}, ...]   // Current season alias
  }
}
```

Season 15 (Midnight Season 1) M+ dungeon map IDs: 499, 542, 378, 525, 503, 392, 391, 505

Weekly runs appear under `weeks[resetTimestamp]` when completed.

##### Currencies (`currencies`)

Large map of currency ID → colon-separated string.

```
currencyId: "quantity:max:isWeekly:weekQuantity:weekMax:isMovingMax:totalQuantity"
```

Example: `3383: "270:200:0:0:0:1:200"` (Adventurer Dawncrest)

Midnight-relevant weekly-capped currencies:

| Currency ID | Name | Weekly Cap |
|-------------|------|------------|
| 3383 | Adventurer Dawncrest | 200 |
| 3341 | Veteran Dawncrest | 200 |
| 3343 | Champion Dawncrest | 200 |
| 3345 | Hero Dawncrest | 200 |
| 3348 | Myth Dawncrest | 200 |

Characters can have 400+ currencies tracked (including legacy).

##### Progress Quests (`progressQuests`)

Array of pipe-delimited strings for in-progress quests.

```
"questKey|questId|questName|status|expires|objectiveType~description~have~need[^obj2...]"
```

Example:
```
"q85460|85460|Ecological Succession|1|0|progressbar~Help the Oasis (0%)~0~100"
"q92319|92319|A Favor to Axe|1|0|item~0/10 Rusty Axe~0~10"
```

Fields:
- `questKey` — addon-internal key (usually `q{questId}`)
- `questId` — Blizzard quest ID
- `questName` — display name
- `status` — 1=in progress
- `expires` — expiry timestamp (0 = no expiry)
- Objectives: `type~description~have~need` separated by `^` for multiple

Can contain 50-70 quests per character (mix of weekly, campaign, and one-time).

##### Delves (`delves`, `delvesGilded`)

```json
{
  "delves": {"0": ["0"]},   // delve ID → progression array
  "delvesGilded": 0          // count of gilded delves completed
}
```

Sparse data — further investigation needed with a character that has done delves.

##### Weekly/Daily Reset Timestamps

| Key | Description |
|-----|-------------|
| `weeklyReset` | Unix timestamp of next weekly reset (e.g. `1773154799`) |
| `dailyReset` | Unix timestamp of next daily reset (e.g. `1772895599`) |

#### Other Character Data

##### Equipment (`equipmentV2`)

Gear in equipment slots. Slot keys: `s1`-`s25`.

```
"quality:itemId:upgradeLevel:?:itemLevel:numStats:?:statIds:gemInfo:enchantInfo:bonusIds:?"
```

Example: `"1:256996:27:0:233:3:0:6652,12667,13578,12773::28_3321:1:0"`

##### Highest Item Level (`highestItemLevel`)

Array of strings, one per equipment slot:

```
"slotIndex:itemLevel"
```

Example: `["0:233", "1:224", "2:230", ...]`

##### Reputations (`reputations`)

```json
{"factionId": reputationPoints}
```

Example: `{"2600": 62500, "2644": 42000, "2683": 13995, "2722": 29898}`

Midnight factions (approximate IDs from data — need wowhead confirmation):
- 2600, 2644, 2683, 2722 are the non-zero factions in current data

##### Paragons (`paragons`)

Paragon (overflow) reputation tracking.

```
factionId: "overflowAmount:maxPerCycle:?"
```

Example: `"1828": "0:10000:0"`

54+ factions tracked (mostly legacy with 0 overflow).

##### Achievements (`achievements`)

```json
[{"id": 19451, "earned": true, "criteria": []}]
```

Array of achievement objects with optional criteria progress arrays.

##### World Quests (`worldQuests`)

Nested by expansion zone → map → quest array.

```json
{
  "6": {   // Zone/expansion ID
    "882": [  // Map ID
      "48105:1772895600:63.4:39.7:11-1533-6|11-0-202200"
    ]
  }
}
```

Quest string format: `"questId:expiryTimestamp:x:y:rewardInfo"`

Reward info: pipe-separated segments like `11-currencyId-amount` or `9-itemId-count`.

Zone distribution in sample data: Zone 6 (79 quests), Zone 8 (36), Zone 9 (55), Zone 10 (29).

##### Professions (`professions`, `professionTraits`, `professionCooldowns`)

```json
// professions - skill levels
[{"id": 978, "maxSkill": 0, "currentSkill": 0, "knownRecipes": {}}]

// professionTraits - specialization trees
["2832|59701:0|59700:0|..."]  // professionId|traitId:rank|...

// professionCooldowns - daily/weekly cooldowns
["dfHerbalismOverload:0:1:1", "twwMiningOverload:0:1:1"]
```

##### Auras (`aurasV2`)

Active buffs/debuffs as encoded strings:

```
"spellId:?:?:?"
```

Example: `"97341:0:0:0"` (4 entries in sample)

##### Other

| Key | Type | Description |
|-----|------|-------------|
| `bags` | object | Bag slot data (b0-b4) |
| `bank` | object | Bank contents |
| `items` | object | Item data across containers |
| `garrisons` | array | Legacy garrison/order hall data |
| `covenants` | array | Shadowlands covenant data |
| `knownSpells` | object | Known spell IDs |
| `scanTimes` | object | Per-category scan timestamps (18 categories) |
| `instanceDone` | object | Instance completion flags |
| `mythicDungeons` | object | Mythic dungeon completions (non-M+) |
| `professionOrders` | object | Active crafting orders |
| `patronOrders` | object | Patron work orders |
| `completedQuestsSquish` | string | Compressed quest completion bitmap (base64-like encoding, pipe-delimited by expansion) |

---

## Midnight Weekly Activity Mapping

How addon data maps to weekly activities defined in `seeds/activities.yaml`:

| Activity | Addon Source | How to Detect Completion |
|----------|-------------|------------------------|
| Unity Quest | `progressQuests` or `questsV2` | Check quest IDs [93890, 93767, 94457, ...] in completed quests |
| Special Assignment 1/2 | `progressQuests` or `questsV2` | Check quest IDs [91390, 91796, 92063, ...] |
| Dungeon Weekly | `questsV2` | Check quest IDs [93751-93758] |
| Prey Hunts | Quest completion count | Track via quest IDs per week |
| Great Vault: M+ | `vault.t1` | Read `progress` vs `threshold` per slot |
| Great Vault: Raid | `vault.t3` | Read `progress` vs `threshold` per slot |
| Great Vault: World | `vault.t6` | Read `progress` vs `threshold` per slot |
| Dawncrest currencies | `currencies[id]` | Parse currency string, check `totalQuantity` or weekly tracking |
| Bountiful Delves | `delves` + quest tracking | Track daily delve completions |
| Raid Lockouts | `lockouts[]` | Match `id` to known instance IDs, read `defeatedBosses/maxBosses` |

### Seed Data vs Real Data Discrepancies

The `seeds/activities.yaml` lockout instance IDs don't match real addon data:

| Seed File | Real Addon Data |
|-----------|----------------|
| Voidspire (16340) | Windrunner Spire (1299), Magisters' Terrace (1300), Murder Row (1304), The Blinding Vale (1309), Den of Nalorakk (1311), Maisara Caverns (1315) |
| Dreamrift (16531) | Not seen in data |
| Quel'Danes (16215) | Not seen in data |

The seed IDs appear to be placeholder/speculative. Real lockout IDs from the addon need to be used instead. The raid is split into 6 wings rather than 3 large instances.

### Character Key Mapping Gap

The addon uses `Player-{realmId}-{guid}` format while the database stores integer `blizzardId` from the API. Options:
1. Store the addon character key in the `characters` table
2. Match by name + realm (fragile)
3. Map via the Blizzard API character profile which includes the GUID
