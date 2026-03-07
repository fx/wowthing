import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';
import type { DashboardData } from '~/server/functions/activities';

type Character = DashboardData['characters'][number];

interface CrestTrackerProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

const DAWNCREST_TIERS = [
  { key: 'adventurer', id: 3383, name: 'Adventurer' },
  { key: 'veteran', id: 3341, name: 'Veteran' },
  { key: 'champion', id: 3343, name: 'Champion' },
  { key: 'hero', id: 3345, name: 'Hero' },
  { key: 'myth', id: 3348, name: 'Myth' },
] as const;

export function CrestTracker({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: CrestTrackerProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Dawncrests</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <>
              {DAWNCREST_TIERS.map((tier) => (
                <tr key={tier.key}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    {tier.name}
                  </td>
                  {characters.map((char) => {
                    const currency = char.currencies?.find(
                      (c) => c.currencyId === tier.id,
                    );
                    const weekQty = currency?.weekQuantity ?? 0;
                    const weekMax = currency?.weekMax ?? 100;
                    const pct = weekMax > 0 ? weekQty / weekMax : 0;
                    const state =
                      pct >= 1
                        ? ('complete' as const)
                        : pct > 0
                          ? ('in-progress' as const)
                          : ('not-started' as const);
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={`${weekQty}`}
                        tooltip={`${char.name} ${tier.name}: ${weekQty}/${weekMax}`}
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
