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
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';
import type { DashboardData } from '~/server/functions/activities';

type Character = DashboardData['characters'][number];
type ActivityDef = DashboardData['activities'][number];

interface WeeklyChecklistProps {
  characters: Character[];
  activities: ActivityDef[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

export function WeeklyChecklist({
  characters,
  activities,
  collapsedColumns,
  onToggleCollapse,
}: WeeklyChecklistProps) {
  const checklistActivities = activities.filter(
    (a) =>
      !a.key.startsWith('vault_') &&
      !a.key.startsWith('dawncrest_') &&
      !a.key.startsWith('lockout_'),
  );

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Weekly Checklist</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MatrixGrid
          characters={characters}
          collapsedColumns={collapsedColumns}
          onToggleCollapse={onToggleCollapse}
        >
          {({ characters, isCollapsed }) => (
            <>
              {checklistActivities.map((activity) => (
                <tr key={activity.key}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{activity.shortName}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {activity.description ?? activity.name}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  {characters.map((char) => {
                    const { state, label, tooltip } = resolveActivityStatus(char, activity);
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

function resolveActivityStatus(char: Character, activity: ActivityDef) {
  const completions = char.questCompletions ?? [];
  const matches = completions.filter((qc) => activity.questIds?.includes(qc.questId));

  if (activity.accountWide && matches.length > 0) {
    return {
      state: 'account-done' as const,
      label: '\u2713',
      tooltip: `${activity.name}: Done (account-wide)`,
    };
  }
  if (activity.threshold && activity.threshold > 1) {
    const count = matches.length;
    const done = count >= activity.threshold;
    return {
      state: done ? ('complete' as const) : count > 0 ? ('in-progress' as const) : ('not-started' as const),
      label: `${count}/${activity.threshold}`,
      tooltip: `${activity.name}: ${count}/${activity.threshold}`,
    };
  }
  const done = matches.length > 0;
  return {
    state: done ? ('complete' as const) : ('not-started' as const),
    label: undefined,
    tooltip: `${activity.name}: ${done ? 'Complete' : 'Not started'}`,
  };
}
