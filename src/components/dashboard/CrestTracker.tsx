import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import type { DashboardData } from '~/server/functions/activities';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';
import { DAWNCREST_TIERS } from './constants';

type Character = DashboardData['characters'][number];

interface CrestTrackerProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

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
                <tr key={tier.currencyId}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    {tier.name}
                  </td>
                  {characters.map((char) => {
                    const currency = char.currencies?.find(
                      (c) => c.currencyId === tier.currencyId,
                    );

                    if (!currency || currency.weekMax == null) {
                      return (
                        <StatusCell
                          key={char.id}
                          state="not-started"
                          label={'\u2014'}
                          tooltip={`${char.name} ${tier.name}: \u2014`}
                          collapsed={isCollapsed(char.id)}
                        />
                      );
                    }

                    const weekQty = currency.weekQuantity ?? 0;
                    const weekMax = currency.weekMax;
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
