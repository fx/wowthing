import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@fx/ui';
import { cn, CELL_COLORS, type ActivityState } from '~/lib/utils';

interface StatusCellProps {
  state: ActivityState;
  label?: string;
  tooltip: string;
  collapsed?: boolean;
}

export function StatusCell({ state, label, tooltip, collapsed }: StatusCellProps) {
  if (collapsed) return <td className="w-8" />;

  return (
    <td className="p-0.5 text-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className={cn(
                'inline-flex items-center justify-center rounded-sm text-[11px] font-medium min-w-5 h-5 px-1',
                CELL_COLORS[state],
              )}
            >
              {label ?? (state === 'complete' || state === 'account-done' ? '\u2713' : '\u2014')}
            </div>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}
