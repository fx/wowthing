import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';
import type { DashboardData } from '~/server/functions/activities';

type Character = DashboardData['characters'][number];

interface KeystoneDisplayProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

export function KeystoneDisplay({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: KeystoneDisplayProps) {
  const hasAnyKey = characters.some(
    (c) => c.weeklyActivities?.[0]?.keystoneLevel,
  );
  if (!hasAnyKey) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Mythic+ Keystones</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <tr>
              <td className="sticky left-0 z-10 bg-card p-2 text-sm">Key</td>
              {characters.map((char) => {
                const weekly = char.weeklyActivities?.[0];
                const level = weekly?.keystoneLevel;
                return (
                  <StatusCell
                    key={char.id}
                    state={level ? 'complete' : 'not-started'}
                    label={level ? `+${level}` : undefined}
                    tooltip={
                      level
                        ? `${char.name}: +${level}`
                        : `${char.name}: No keystone`
                    }
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
