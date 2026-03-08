import { useCollapsedColumns } from '~/hooks/useCollapsedColumns';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import type { DashboardData } from '~/server/functions/activities';
import { CrestTracker } from './CrestTracker';
import { DailySection } from './DailySection';
import { DelveProgress } from './DelveProgress';
import { EmptyState } from './EmptyState';
import { KeystoneDisplay } from './KeystoneDisplay';
import { LockoutGrid } from './LockoutGrid';
import { MobileDashboard } from './MobileDashboard';
import { RenownSection } from './RenownSection';
import { VaultSection } from './VaultSection';
import { WeeklyChecklist } from './WeeklyChecklist';

export function Dashboard(props: DashboardData) {
  const { characters, activities, renown } = props;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { collapsed, toggle } = useCollapsedColumns();

  if (characters.length === 0) {
    return <EmptyState />;
  }

  if (isMobile) {
    return (
      <MobileDashboard
        characters={characters}
        activities={activities}
        renown={renown}
      />
    );
  }

  const weeklyActivities = activities.filter((a) => a.category === 'weekly');
  const dailyActivities = activities.filter((a) => a.category === 'daily');
  const gridProps = {
    characters,
    collapsedColumns: collapsed,
    onToggleCollapse: toggle,
  };

  return (
    <div className="space-y-4">
      <VaultSection {...gridProps} />
      <WeeklyChecklist {...gridProps} activities={weeklyActivities} />
      <CrestTracker {...gridProps} />
      <KeystoneDisplay {...gridProps} />
      <DelveProgress {...gridProps} />
      <RenownSection renown={renown} />
      <LockoutGrid {...gridProps} />
      <DailySection activities={dailyActivities} />
    </div>
  );
}
