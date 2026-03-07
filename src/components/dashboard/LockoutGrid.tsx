import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';
import type { DashboardData } from '~/server/functions/activities';
import type { Lockout } from '~/db/types';

type Character = DashboardData['characters'][number];

interface LockoutGridProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

const RAIDS = [
  { id: 16340, name: 'Voidspire', bossCount: 6 },
  { id: 16531, name: 'Dreamrift', bossCount: 1 },
  { id: 16215, name: "March on Quel'Danes", bossCount: 2 },
] as const;

const DIFFICULTIES = ['normal', 'heroic', 'mythic'] as const;
const DIFF_SHORT: Record<string, string> = { normal: 'N', heroic: 'H', mythic: 'M' };

export function LockoutGrid({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: LockoutGridProps) {
  const rows = RAIDS.flatMap((raid) =>
    DIFFICULTIES.map((diff) => ({ raid, difficulty: diff })),
  );

  const activeRows = rows.filter((row) =>
    characters.some((char) => {
      const lockouts = char.weeklyActivities?.[0]?.lockouts as Lockout[] | null | undefined;
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
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <>
              {activeRows.map((row) => (
                <tr key={`${row.raid.id}-${row.difficulty}`}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    {row.raid.name} ({DIFF_SHORT[row.difficulty]})
                  </td>
                  {characters.map((char) => {
                    const lockouts = char.weeklyActivities?.[0]?.lockouts as
                      | Lockout[]
                      | null
                      | undefined;
                    const lockout = lockouts?.find(
                      (l) =>
                        l.instanceId === row.raid.id &&
                        l.difficulty === row.difficulty,
                    );
                    const killed = lockout?.bossesKilled ?? 0;
                    const total = lockout?.bossCount ?? row.raid.bossCount;
                    const state = !lockout
                      ? ('not-started' as const)
                      : killed === total
                        ? ('complete' as const)
                        : ('in-progress' as const);
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={lockout ? `${killed}/${total}` : undefined}
                        tooltip={`${char.name}: ${row.raid.name} ${DIFF_SHORT[row.difficulty]} \u2014 ${killed}/${total}`}
                        collapsed={isCollapsed(char.id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </>
          )}
        </MatrixGrid>
      </CardContent>
    </Card>
  );
}
