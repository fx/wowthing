import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import type { DashboardData } from '~/server/functions/activities';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

type Character = DashboardData['characters'][number];

interface DelveProgressProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

export function DelveProgress({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: DelveProgressProps) {
  const hasAnyDelves = characters.some(
    (c) => c.weeklyActivities?.[0]?.delvesGilded != null,
  );

  if (!hasAnyDelves) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Delves</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <tr>
              <td className="sticky left-0 z-10 bg-card p-2 text-sm">Gilded</td>
              {characters.map((char) => {
                const gilded = char.weeklyActivities?.[0]?.delvesGilded ?? 0;
                const state =
                  gilded > 0 ? ('complete' as const) : ('not-started' as const);
                return (
                  <StatusCell
                    key={char.id}
                    state={state}
                    label={gilded > 0 ? String(gilded) : undefined}
                    tooltip={`${char.name}: ${gilded} gilded delves`}
                    collapsed={isCollapsed(char.id)}
                  />
                );
              })}
            </tr>
          )}
        </MatrixGrid>
      </CardContent>
    </Card>
  );
}
