export { cn } from '@fx/ui';

export type ActivityState = 'complete' | 'in-progress' | 'urgent' | 'not-started' | 'account-done';

export const STATE_CLASSES: Record<ActivityState, string> = {
  complete: 'bg-emerald-500/20 text-emerald-400',
  'in-progress': 'bg-amber-500/20 text-amber-400',
  urgent: 'bg-red-500/20 text-red-400',
  'not-started': 'bg-zinc-800 text-zinc-400',
  'account-done': 'bg-blue-500/20 text-blue-400',
};

export const CELL_COLORS: Record<ActivityState, string> = {
  complete: 'bg-emerald-500/30 text-emerald-300',
  'in-progress': 'bg-amber-500/30 text-amber-300',
  urgent: 'bg-red-500/30 text-red-300',
  'not-started': 'bg-zinc-800 text-zinc-500',
  'account-done': 'bg-blue-500/30 text-blue-300',
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
