import { Badge, Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import type { DashboardData } from '~/server/functions/activities';

type ActivityDef = DashboardData['activities'][number];

interface DailySectionProps {
  activities: ActivityDef[];
}

export function DailySection({ activities }: DailySectionProps) {
  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Daily Activities</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.map((activity) => (
          <div
            key={activity.key}
            className="flex items-center justify-between py-2"
          >
            <span className="text-sm">{activity.name}</span>
            {activity.description && (
              <Badge variant="outline">{activity.description}</Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
