import { useState, useEffect } from 'react';

export function useResetTimer(resetTime: string): string {
  const target = new Date(resetTime).getTime();
  const [remaining, setRemaining] = useState(() => formatDiff(target - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = target - Date.now();
      setRemaining(diff <= 0 ? 'Reset!' : formatDiff(diff));
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return remaining;
}

function formatDiff(ms: number): string {
  if (ms <= 0) return 'Reset!';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
