import { Card, CardContent, CardHeader, CardTitle, Progress } from '@fx/ui';
import type { DashboardData } from '~/server/functions/activities';

const FACTION_MAP: Record<number, string> = {
  2601: 'Silvermoon Court',
  2602: 'Amani Tribe',
  2603: "Hara'ti",
  2604: 'Singularity',
};

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
        {Object.entries(FACTION_MAP).map(([factionIdStr, name]) => {
          const factionId = Number(factionIdStr);
          const data = renown.find((r) => r.factionId === factionId);
          const level = data?.renownLevel ?? 0;
          return (
            <div key={factionId} className="flex items-center gap-3">
              <span className="text-sm font-medium w-40">{name}</span>
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
