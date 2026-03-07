import { cn } from '~/lib/utils';
import { CharacterName } from '~/components/shared/CharacterName';
import type { DashboardData } from '~/server/functions/activities';

type Character = DashboardData['characters'][number];

interface MatrixGridProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (characterId: string) => void;
  children: (args: {
    characters: Character[];
    isCollapsed: (id: number) => boolean;
  }) => React.ReactNode;
}

export function MatrixGrid({
  characters,
  collapsedColumns,
  onToggleCollapse,
  children,
}: MatrixGridProps) {
  const isCollapsed = (id: number) => collapsedColumns.has(String(id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card min-w-40 text-left text-sm font-medium p-2" />
            {characters.map((char) => (
              <th
                key={char.id}
                className={cn(
                  'p-1 text-center transition-all',
                  isCollapsed(char.id) ? 'w-8' : 'min-w-20',
                )}
              >
                {isCollapsed(char.id) ? (
                  <button
                    type="button"
                    onClick={() => onToggleCollapse(String(char.id))}
                    className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 text-xs"
                    title={`Expand ${char.name}`}
                  >
                    +
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <CharacterName character={char} />
                    <button
                      type="button"
                      onClick={() => onToggleCollapse(String(char.id))}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                      title="Collapse column"
                    >
                      -
                    </button>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children({ characters, isCollapsed })}</tbody>
      </table>
    </div>
  );
}
