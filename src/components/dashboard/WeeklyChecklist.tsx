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
import type { WeeklyProgress } from '~/db/types';
import type { DashboardData } from '~/server/functions/activities';
import type { ActivityState } from '~/lib/utils';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

type Character = DashboardData['characters'][number];

interface WeeklyChecklistProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

/** Rows to display in the weekly objectives grid */
const WEEKLY_ROWS = [
  { key: 'prey', label: 'Prey', tooltip: 'Complete prey hunts (4 per week max)' },
  { key: 'special_assignments', label: 'SA', tooltip: 'Special Assignments' },
  { key: 'dungeon_weeklies', label: 'Dungeon', tooltip: 'Dungeon weekly quests' },
  { key: 'delves', label: 'Delves', tooltip: 'Delve completion quests' },
] as const;

export function WeeklyChecklist({
  characters,
  collapsedColumns,
  onToggleCollapse,
}: WeeklyChecklistProps) {
  // Only show rows where at least one character has data
  const activeRows = WEEKLY_ROWS.filter((row) =>
    characters.some((char) => {
      const wp = char.weeklyActivities?.[0]?.weeklyProgress as WeeklyProgress | null | undefined;
      if (!wp) return false;
      switch (row.key) {
        case 'prey': return (char.weeklyActivities?.[0]?.preyHuntsCompleted ?? 0) > 0 || wp.preyHunts.length > 0;
        case 'special_assignments': return wp.specialAssignments.length > 0;
        case 'dungeon_weeklies': return wp.dungeonWeeklies.length > 0;
        case 'delves': return wp.delves.length > 0;
        default: return false;
      }
    }),
  );

  if (activeRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Weekly Objectives</CardTitle>
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
                <tr key={row.key}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>{row.label}</span>
                        </TooltipTrigger>
                        <TooltipContent>{row.tooltip}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  {characters.map((char) => {
                    const { state, label, tooltip } = resolveRowStatus(
                      char,
                      row.key,
                    );
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={label}
                        tooltip={tooltip}
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

function resolveRowStatus(
  char: Character,
  rowKey: string,
): { state: ActivityState; label: string | undefined; tooltip: string } {
  const weekly = char.weeklyActivities?.[0];
  const wp = weekly?.weeklyProgress as WeeklyProgress | null | undefined;

  switch (rowKey) {
    case 'prey': {
      const count = weekly?.preyHuntsCompleted ?? 0;
      const total = wp?.preyHunts.length ?? 0;
      const state: ActivityState =
        count >= 4 ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
      return {
        state,
        label: total > 0 || count > 0 ? `${count}/${Math.max(total, 4)}` : undefined,
        tooltip: `Prey Hunts: ${count} completed`,
      };
    }

    case 'special_assignments': {
      const sas = wp?.specialAssignments ?? [];
      const completed = sas.filter((s) => s.completed).length;
      const state: ActivityState =
        sas.length === 0
          ? 'not-started'
          : completed === sas.length
            ? 'complete'
            : completed > 0
              ? 'in-progress'
              : 'not-started';
      const names = sas.map((s) => `${s.completed ? '\u2713' : '\u2717'} ${s.name}`).join('\n');
      return {
        state,
        label: sas.length > 0 ? `${completed}/${sas.length}` : undefined,
        tooltip: sas.length > 0 ? `Special Assignments:\n${names}` : 'Special Assignments: None active',
      };
    }

    case 'dungeon_weeklies': {
      const dws = wp?.dungeonWeeklies ?? [];
      const completed = dws.filter((d) => d.completed).length;
      const state: ActivityState =
        dws.length === 0
          ? 'not-started'
          : completed === dws.length
            ? 'complete'
            : completed > 0
              ? 'in-progress'
              : 'not-started';
      const names = dws.map((d) => `${d.completed ? '\u2713' : '\u2717'} ${d.name}`).join('\n');
      return {
        state,
        label: dws.length > 0 ? `${completed}/${dws.length}` : undefined,
        tooltip: dws.length > 0 ? `Dungeon Weeklies:\n${names}` : 'Dungeon Weeklies: None active',
      };
    }

    case 'delves': {
      const dvs = wp?.delves ?? [];
      const completed = dvs.filter((d) => d.completed).length;
      const state: ActivityState =
        dvs.length === 0
          ? 'not-started'
          : completed === dvs.length
            ? 'complete'
            : completed > 0
              ? 'in-progress'
              : 'not-started';
      return {
        state,
        label: dvs.length > 0 ? `${completed}/${dvs.length}` : undefined,
        tooltip: dvs.length > 0 ? `Delves: ${completed}/${dvs.length} complete` : 'Delves: None active',
      };
    }

    default:
      return { state: 'not-started', label: undefined, tooltip: '' };
  }
}
