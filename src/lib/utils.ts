export { cn } from '@fx/ui';

export type ActivityState = 'complete' | 'in-progress' | 'urgent' | 'not-started' | 'account-done';

export const STATE_CLASSES: Record<ActivityState, string> = {
  complete: 'bg-emerald-600/40 text-emerald-200',
  'in-progress': 'bg-amber-600/40 text-amber-200',
  urgent: 'bg-red-600/40 text-red-200',
  'not-started': 'bg-zinc-700/40 text-zinc-400',
  'account-done': 'bg-sky-600/40 text-sky-200',
};

export const CELL_COLORS: Record<ActivityState, string> = {
  complete: 'bg-emerald-600/50 text-emerald-200',
  'in-progress': 'bg-amber-600/50 text-amber-200',
  urgent: 'bg-red-600/50 text-red-200',
  'not-started': 'bg-zinc-700/50 text-zinc-400',
  'account-done': 'bg-sky-600/50 text-sky-200',
};

export function getActivityState(
  isComplete: boolean,
  isAccountWide: boolean,
  hoursUntilReset: number,
  progress?: { current: number; max: number },
): ActivityState {
  if (isComplete && isAccountWide) return 'account-done';
  if (isComplete) return 'complete';
  if (progress && progress.current > 0 && progress.current < progress.max) return 'in-progress';
  if (hoursUntilReset < 6) return 'urgent';
  return 'not-started';
}
