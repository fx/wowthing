import { Card, CardHeader, CardTitle, CardContent, Badge } from '@fx/ui';
import { CharacterName } from '~/components/shared/CharacterName';
import { cn } from '~/lib/utils';
import { CELL_COLORS, type ActivityState } from '~/lib/utils';
import type { DashboardData } from '~/server/functions/activities';
import type { VaultSlot, Lockout } from '~/db/types';

type Character = DashboardData['characters'][number];
type Activity = DashboardData['activities'][number];

const DAWNCREST_TIERS = [
  { key: 'adventurer', id: 3383, name: 'Adv' },
  { key: 'veteran', id: 3341, name: 'Vet' },
  { key: 'champion', id: 3343, name: 'Chm' },
  { key: 'hero', id: 3345, name: 'Hero' },
  { key: 'myth', id: 3348, name: 'Myth' },
] as const;

const RAIDS = [
  { id: 16340, name: 'Voidspire', bossCount: 6 },
  { id: 16531, name: 'Dreamrift', bossCount: 1 },
  { id: 16215, name: "Quel'Danes", bossCount: 2 },
] as const;

const DIFFICULTIES = ['normal', 'heroic', 'mythic'] as const;
const DIFF_SHORT: Record<string, string> = { normal: 'N', heroic: 'H', mythic: 'M' };

const MIDNIGHT_FACTIONS = [
  { id: 2601, name: 'Silvermoon Court' },
  { id: 2602, name: 'Amani Tribe' },
  { id: 2603, name: "Hara'ti" },
  { id: 2604, name: 'Singularity' },
];

interface MobileDashboardProps {
  characters: DashboardData['characters'];
  activities: DashboardData['activities'];
  renown: DashboardData['renown'];
}

export function MobileDashboard({ characters, activities, renown }: MobileDashboardProps) {
  const weeklyActivities = activities.filter((a) => a.category === 'weekly');
  const dailyActivities = activities.filter((a) => a.category === 'daily');

  return (
    <div className="space-y-3">
      <MobileVaultCard characters={characters} />
      <MobileWeeklyCard characters={characters} activities={weeklyActivities} />
      <MobileCrestCard characters={characters} />
      <MobileKeystoneCard characters={characters} />
      <MobileRenownCard renown={renown} />
      <MobileLockoutCard characters={characters} />
      <MobileDailyCard activities={dailyActivities} />
    </div>
  );
}

function MobileCharacterRow({
  character,
  children,
}: {
  character: { name: string; classId: number };
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <CharacterName character={character} />
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function VaultDots({ slots }: { slots: VaultSlot[] | null | undefined }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[0, 1, 2].map((i) => {
        const slot = slots?.[i];
        const filled = slot && slot.progress >= slot.threshold;
        return (
          <div
            key={i}
            className={cn(
              'h-2 w-2 rounded-full',
              filled ? 'bg-emerald-500' : 'bg-zinc-700',
            )}
            title={
              slot
                ? `${slot.progress}/${slot.threshold} - ilvl ${slot.itemLevel}`
                : 'Not started'
            }
          />
        );
      })}
    </div>
  );
}

function MobileVaultCard({ characters }: { characters: Character[] }) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Great Vault</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => (
          <MobileCharacterRow key={char.id} character={char}>
            <VaultDots slots={char.weeklyActivities?.[0]?.vaultDungeonProgress as VaultSlot[] | null} />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.weeklyActivities?.[0]?.vaultRaidProgress as VaultSlot[] | null} />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.weeklyActivities?.[0]?.vaultWorldProgress as VaultSlot[] | null} />
          </MobileCharacterRow>
        ))}
      </CardContent>
    </Card>
  );
}

function getCharActivityState(char: Character, activity: Activity): ActivityState {
  const completions = char.questCompletions ?? [];
  const matches = completions.filter((qc) =>
    activity.questIds?.includes(qc.questId),
  );

  if (activity.accountWide && matches.length > 0) return 'account-done';
  if (activity.threshold && activity.threshold > 1) {
    return matches.length >= activity.threshold ? 'complete' : matches.length > 0 ? 'in-progress' : 'not-started';
  }
  return matches.length > 0 ? 'complete' : 'not-started';
}

function MobileWeeklyCard({
  characters,
  activities,
}: {
  characters: Character[];
  activities: Activity[];
}) {
  const checklistActivities = activities.filter(
    (a) =>
      !a.key.startsWith('vault_') &&
      !a.key.startsWith('dawncrest_') &&
      !a.key.startsWith('lockout_'),
  );

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Weekly Checklist</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => (
          <MobileCharacterRow key={char.id} character={char}>
            {checklistActivities.map((activity) => {
              const state = getCharActivityState(char, activity);
              return (
                <div
                  key={activity.key}
                  className={cn(
                    'w-4 h-4 rounded-sm text-[9px] flex items-center justify-center',
                    CELL_COLORS[state],
                  )}
                  title={activity.shortName}
                >
                  {state === 'complete' || state === 'account-done' ? '\u2713' : '\u2014'}
                </div>
              );
            })}
          </MobileCharacterRow>
        ))}
      </CardContent>
    </Card>
  );
}

function MobileCrestCard({ characters }: { characters: Character[] }) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Dawncrests</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => (
          <MobileCharacterRow key={char.id} character={char}>
            {DAWNCREST_TIERS.map((tier) => {
              const currency = char.currencies?.find(
                (c) => c.currencyId === tier.id,
              );
              const weekQty = currency?.weekQuantity ?? 0;
              const weekMax = currency?.weekMax ?? 100;
              const pct = weekMax > 0 ? weekQty / weekMax : 0;
              const state: ActivityState =
                pct >= 1 ? 'complete' : pct > 0 ? 'in-progress' : 'not-started';
              return (
                <div
                  key={tier.key}
                  className={cn(
                    'w-4 h-4 rounded-sm text-[9px] flex items-center justify-center',
                    CELL_COLORS[state],
                  )}
                  title={`${tier.name}: ${weekQty}/${weekMax}`}
                >
                  {pct >= 1 ? '\u2713' : weekQty > 0 ? '\u00B7' : '\u2014'}
                </div>
              );
            })}
          </MobileCharacterRow>
        ))}
      </CardContent>
    </Card>
  );
}

function MobileKeystoneCard({ characters }: { characters: Character[] }) {
  const hasAnyKey = characters.some(
    (c) => c.weeklyActivities?.[0]?.keystoneLevel,
  );
  if (!hasAnyKey) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Mythic+ Keystones</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => {
          const weekly = char.weeklyActivities?.[0];
          const level = weekly?.keystoneLevel;
          return (
            <MobileCharacterRow key={char.id} character={char}>
              <Badge variant={level ? 'default' : 'outline'} className="text-xs">
                {level ? `+${level}` : 'No key'}
              </Badge>
            </MobileCharacterRow>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MobileRenownCard({ renown }: { renown: DashboardData['renown'] }) {
  if (renown.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Renown (Account-wide)</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-2">
        {MIDNIGHT_FACTIONS.map((faction) => {
          const data = renown.find((r) => r.factionId === faction.id);
          const level = data?.renownLevel ?? 0;
          const pct = Math.round((level / 20) * 100);
          return (
            <div key={faction.id} className="flex items-center gap-2">
              <span className="text-xs font-medium w-28 truncate">
                {faction.name}
              </span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10 text-right">
                {level}/20
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MobileLockoutCard({ characters }: { characters: Character[] }) {
  const rows = RAIDS.flatMap((raid) =>
    DIFFICULTIES.map((diff) => ({ raid, difficulty: diff })),
  );

  const activeRows = rows.filter((row) =>
    characters.some((char) => {
      const lockouts = char.weeklyActivities?.[0]?.lockouts as Lockout[] | null;
      return lockouts?.some(
        (l) =>
          l.instanceId === row.raid.id &&
          l.difficulty === row.difficulty &&
          l.bossesKilled > 0,
      );
    }),
  );

  if (activeRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Raid Lockouts</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {activeRows.map((row) => (
          <div
            key={`${row.raid.id}-${row.difficulty}`}
            className="mb-2 last:mb-0"
          >
            <div className="text-xs text-muted-foreground mb-1">
              {row.raid.name} ({DIFF_SHORT[row.difficulty]})
            </div>
            {characters.map((char) => {
              const lockouts = char.weeklyActivities?.[0]?.lockouts as
                | Lockout[]
                | null;
              const lockout = lockouts?.find(
                (l) =>
                  l.instanceId === row.raid.id &&
                  l.difficulty === row.difficulty,
              );
              const killed = lockout?.bossesKilled ?? 0;
              const total = lockout?.bossCount ?? row.raid.bossCount;
              return (
                <MobileCharacterRow key={char.id} character={char}>
                  <span
                    className={cn(
                      'text-xs font-mono',
                      killed === total && killed > 0
                        ? 'text-emerald-400'
                        : killed > 0
                          ? 'text-amber-400'
                          : 'text-zinc-500',
                    )}
                  >
                    {killed}/{total}
                  </span>
                </MobileCharacterRow>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MobileDailyCard({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Daily Activities</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {activities.map((activity) => (
          <div
            key={activity.key}
            className="flex items-center justify-between py-1.5 border-b border-border last:border-0"
          >
            <span className="text-sm">{activity.name}</span>
            <Badge variant="outline" className="text-xs">
              {activity.description ?? activity.shortName}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
