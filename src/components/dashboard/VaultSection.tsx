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
import type { VaultSlot } from '~/db/types';
import { cn } from '~/lib/utils';
import type { DashboardData } from '~/server/functions/activities';
import { MatrixGrid } from './MatrixGrid';
import { VAULT_THRESHOLDS } from './constants';

type Character = DashboardData['characters'][number];

interface VaultSectionProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

type VaultField =
  | 'vaultDungeonProgress'
  | 'vaultRaidProgress'
  | 'vaultWorldProgress';

const VAULT_ROWS: Array<{
  label: string;
  thresholds: readonly number[];
  field: VaultField;
}> = [
  {
    label: VAULT_THRESHOLDS.mythicPlus.label,
    thresholds: VAULT_THRESHOLDS.mythicPlus.thresholds,
    field: 'vaultDungeonProgress',
  },
  {
    label: VAULT_THRESHOLDS.raid.label,
    thresholds: VAULT_THRESHOLDS.raid.thresholds,
    field: 'vaultRaidProgress',
  },
  {
    label: VAULT_THRESHOLDS.world.label,
    thresholds: VAULT_THRESHOLDS.world.thresholds,
    field: 'vaultWorldProgress',
  },
];

export function VaultSection({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: VaultSectionProps) {
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
              {VAULT_ROWS.map((row) => (
                <VaultRow
                  key={row.field}
                  label={row.label}
                  thresholds={row.thresholds}
                  characters={characters}
                  field={row.field}
                  isCollapsed={isCollapsed}
                />
              ))}
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
  thresholds: readonly number[];
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
        const slots = char.weeklyActivities?.[0]?.[field] as
          | VaultSlot[]
          | null
          | undefined;
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
  thresholds: readonly number[];
}) {
  return (
    <TooltipProvider>
      <div className="flex gap-0.5 items-center justify-center">
        {thresholds.map((threshold, i) => {
          const slot = slots?.[i];
          const filled = slot != null && slot.progress >= slot.threshold;
          const tooltipText = slot
            ? `${slot.progress}/${slot.threshold} \u2014 ilvl ${slot.itemLevel}`
            : `0/${threshold}`;
          return (
            <Tooltip key={`slot-${threshold}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'h-2.5 w-2.5 rounded-full cursor-default',
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
