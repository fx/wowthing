import { Card, CardContent, CardHeader, CardTitle, Progress } from '@fx/ui';
import type { DashboardData } from '~/server/functions/activities';
import { MIDNIGHT_FACTIONS } from './constants';

interface RenownSectionProps {
  renown: DashboardData['renown'];
}

export function RenownSection({ renown }: RenownSectionProps) {
  if (renown.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Renown (Account-wide)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {MIDNIGHT_FACTIONS.map((faction) => {
          const data = renown.find((r) => r.factionId === faction.id);
          const level = data?.renownLevel ?? 0;
          return (
            <div key={faction.id} className="flex items-center gap-3">
              <span className="text-sm font-medium w-40">{faction.name}</span>
              <Progress value={(level / 20) * 100} className="flex-1 h-3" />
              <span className="text-sm text-muted-foreground w-12 text-right">
                {level}/20
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
