import { Badge } from '@fx/ui';
import { useResetTimer } from '~/hooks/useResetTimer';

export function ResetTimers({ weekly, daily }: { weekly: string; daily: string }) {
  const weeklyTime = useResetTimer(weekly);
  const dailyTime = useResetTimer(daily);

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge variant="outline" className="font-mono">Daily: {dailyTime}</Badge>
      <Badge variant="outline" className="font-mono">Weekly: {weeklyTime}</Badge>
    </div>
  );
}
