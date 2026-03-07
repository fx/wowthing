import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@fx/ui';
import { cn } from '~/lib/utils';
import { MatrixGrid } from './MatrixGrid';
import type { DashboardData } from '~/server/functions/activities';
import type { VaultSlot } from '~/db/types';

type Character = DashboardData['characters'][number];

interface VaultSectionProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

type VaultField = 'vaultDungeonProgress' | 'vaultRaidProgress' | 'vaultWorldProgress';

export function VaultSection({ characters, collapsedColumns, onToggleCollapse }: VaultSectionProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Great Vault</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <>
              <VaultRow
                label="M+"
                thresholds={[1, 4, 8]}
                characters={characters}
                field="vaultDungeonProgress"
                isCollapsed={isCollapsed}
              />
              <VaultRow
                label="Raid"
                thresholds={[2, 4, 6]}
                characters={characters}
                field="vaultRaidProgress"
                isCollapsed={isCollapsed}
              />
              <VaultRow
                label="World"
                thresholds={[2, 4, 8]}
                characters={characters}
                field="vaultWorldProgress"
                isCollapsed={isCollapsed}
              />
            </>
          )}
        </MatrixGrid>
      </CardContent>
    </Card>
  );
}

function VaultRow({
  label,
  thresholds,
  characters,
  field,
  isCollapsed,
}: {
  label: string;
  thresholds: number[];
  characters: Character[];
  field: VaultField;
  isCollapsed: (id: number) => boolean;
}) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-card p-2 text-sm">{label}</td>
      {characters.map((char) => {
        if (isCollapsed(char.id)) {
          return <td key={char.id} className="w-8" />;
        }
        const slots = char.weeklyActivities?.[0]?.[field] as VaultSlot[] | null | undefined;
        return (
          <td key={char.id} className="p-0.5 text-center">
            <VaultDots slots={slots ?? null} thresholds={thresholds} />
          </td>
        );
      })}
    </tr>
  );
}

function VaultDots({
  slots,
  thresholds,
}: {
  slots: VaultSlot[] | null;
  thresholds: number[];
}) {
  return (
    <TooltipProvider>
      <div className="flex gap-0.5 items-center justify-center">
        {thresholds.map((_, i) => {
          const slot = slots?.[i];
          const filled = slot != null && slot.progress >= slot.threshold;
          const tooltipText = slot
            ? `${slot.progress}/${slot.threshold} \u2014 ilvl ${slot.itemLevel}`
            : 'Not started';
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    filled ? 'bg-emerald-500' : 'bg-zinc-700',
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>{tooltipText}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
