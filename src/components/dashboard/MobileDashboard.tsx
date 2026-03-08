import { Badge, Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import { CharacterName } from '~/components/shared/CharacterName';
import type { VaultSlot, WeeklyProgress } from '~/db/types';
import { type ActivityState, CELL_COLORS, cn } from '~/lib/utils';
import type { DashboardData } from '~/server/functions/activities';
import {
  DAWNCREST_TIERS,
  DIFFICULTIES,
  DIFF_SHORT,
  MIDNIGHT_FACTIONS,
  MYTHIC_DUNGEONS,
} from './constants';

type Character = DashboardData['characters'][number];
type Activity = DashboardData['activities'][number];

interface MobileDashboardProps {
  characters: DashboardData['characters'];
  activities: DashboardData['activities'];
  renown: DashboardData['renown'];
}

export function MobileDashboard({
  characters,
  activities,
  renown,
}: MobileDashboardProps) {
  const dailyActivities = activities.filter((a) => a.category === 'daily');

  return (
    <div className="space-y-3">
      <MobileVaultCard characters={characters} />
      <MobileWeeklyCard characters={characters} />
      <MobileCrestCard characters={characters} />
      <MobileKeystoneCard characters={characters} />
      <MobileDelveCard characters={characters} />
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
            <VaultDots
              slots={char.weeklyActivities?.[0]?.vaultDungeonProgress}
            />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.weeklyActivities?.[0]?.vaultRaidProgress} />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.weeklyActivities?.[0]?.vaultWorldProgress} />
          </MobileCharacterRow>
        ))}
      </CardContent>
    </Card>
  );
}

const MOBILE_WEEKLY_ROWS = [
  { key: 'unity', label: 'Unity' },
  { key: 'abundance', label: 'Abund' },
  { key: 'soiree', label: 'Soiree' },
  { key: 'storm', label: 'Storm' },
  { key: 'sa', label: 'SA' },
  { key: 'prey_hard', label: 'Hard' },
  { key: 'prey_normal', label: 'Norm' },
  { key: 'dungeons', label: 'Dung' },
] as const;

function countUnityMobile(wp: WeeklyProgress): number {
  if (!wp.unity) return 0;
  return Object.values(wp.unity).filter(Boolean).length;
}

function countSoireeMobile(wp: WeeklyProgress): number {
  if (!wp.soiree) return 0;
  return Object.values(wp.soiree).filter(Boolean).length;
}

function getMobileWeeklyState(char: Character, rowKey: string): ActivityState {
  const wp = char.weeklyActivities?.[0]?.weeklyProgress as WeeklyProgress | null | undefined;

  switch (rowKey) {
    case 'unity': {
      const count = wp ? countUnityMobile(wp) : 0;
      return count >= 13 ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
    }
    case 'abundance':
      return wp?.abundance ? 'complete' : 'not-started';
    case 'soiree': {
      const count = wp ? countSoireeMobile(wp) : 0;
      return count >= 4 ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
    }
    case 'storm':
      return wp?.stormarion ? 'complete' : 'not-started';
    case 'sa': {
      const sas = wp?.specialAssignments ?? [];
      if (sas.length === 0) return 'not-started';
      const completed = sas.filter((s) => s.completed).length;
      const hasProgress = sas.some((s) => !s.completed && (s.have ?? 0) > 0);
      return completed === sas.length ? 'complete' : (completed > 0 || hasProgress) ? 'in-progress' : 'not-started';
    }
    case 'prey_normal': {
      const count = wp?.prey?.normal ?? 0;
      return count >= 4 ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
    }
    case 'prey_hard': {
      const count = wp?.prey?.hard ?? 0;
      return count >= 4 ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
    }
    case 'dungeons': {
      const dws = wp?.dungeonWeeklies ?? [];
      if (dws.length === 0) return 'not-started';
      const completed = dws.filter((d) => d.completed).length;
      return completed === dws.length ? 'complete' : completed > 0 ? 'in-progress' : 'not-started';
    }
    default: return 'not-started';
  }
}

function MobileWeeklyCard({ characters }: { characters: Character[] }) {
  const hasAnyData = characters.some((char) => {
    const wp = char.weeklyActivities?.[0]?.weeklyProgress as WeeklyProgress | null | undefined;
    if (!wp) return false;
    return (
      (wp.unity && Object.values(wp.unity).some(Boolean)) ||
      wp.abundance ||
      (wp.soiree && Object.values(wp.soiree).some(Boolean)) ||
      wp.stormarion ||
      (wp.prey?.normal ?? 0) > 0 ||
      (wp.prey?.hard ?? 0) > 0 ||
      (wp.specialAssignments?.length ?? 0) > 0 ||
      (wp.dungeonWeeklies?.length ?? 0) > 0
    );
  });

  if (!hasAnyData) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Weekly Chores</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => (
          <MobileCharacterRow key={char.id} character={char}>
            {MOBILE_WEEKLY_ROWS.map((row) => {
              const state = getMobileWeeklyState(char, row.key);
              return (
                <div
                  key={row.key}
                  className={cn(
                    'w-4 h-4 rounded-sm text-[9px] flex items-center justify-center',
                    CELL_COLORS[state],
                  )}
                  title={row.label}
                >
                  {state === 'complete' ? '\u2713' : '\u2014'}
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
                (c) => c.currencyId === tier.currencyId,
              );
              const weekQty = currency?.weekQuantity ?? 0;
              const weekMax = currency?.weekMax ?? tier.weeklyCap;
              const pct = weekMax > 0 ? weekQty / weekMax : 0;
              const state: ActivityState =
                pct >= 1 ? 'complete' : pct > 0 ? 'in-progress' : 'not-started';
              return (
                <div
                  key={tier.currencyId}
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
              <Badge
                variant={level ? 'default' : 'outline'}
                className="text-xs"
              >
                {level ? `+${level}` : 'No key'}
              </Badge>
            </MobileCharacterRow>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MobileDelveCard({ characters }: { characters: Character[] }) {
  const hasAnyDelves = characters.some(
    (c) => c.weeklyActivities?.[0]?.delvesGilded != null,
  );
  if (!hasAnyDelves) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Delves</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {characters.map((char) => {
          const gilded = char.weeklyActivities?.[0]?.delvesGilded ?? 0;
          return (
            <MobileCharacterRow key={char.id} character={char}>
              <span
                className={cn(
                  'text-xs font-mono',
                  gilded > 0 ? 'text-emerald-400' : 'text-zinc-500',
                )}
              >
                {gilded} gilded
              </span>
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
  const rows = MYTHIC_DUNGEONS.flatMap((dungeon) =>
    DIFFICULTIES.map((diff) => ({ dungeon, difficulty: diff })),
  );

  const activeRows = rows.filter((row) =>
    characters.some((char) => {
      const lockouts = char.weeklyActivities?.[0]?.lockouts;
      return lockouts?.some(
        (l) =>
          l.instanceId === row.dungeon.instanceId &&
          l.difficulty === row.difficulty &&
          l.bossesKilled > 0,
      );
    }),
  );

  if (activeRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Mythic Dungeons</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {activeRows.map((row) => (
          <div
            key={`${row.dungeon.instanceId}-${row.difficulty}`}
            className="mb-2 last:mb-0"
          >
            <div className="text-xs text-muted-foreground mb-1">
              {row.dungeon.name} ({DIFF_SHORT[row.difficulty]})
            </div>
            {characters.map((char) => {
              const lockouts = char.weeklyActivities?.[0]?.lockouts;
              const lockout = lockouts?.find(
                (l) =>
                  l.instanceId === row.dungeon.instanceId &&
                  l.difficulty === row.difficulty,
              );
              const killed = lockout?.bossesKilled ?? 0;
              const total = lockout?.bossCount ?? row.dungeon.bosses;
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
