import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'wowthing-collapsed-columns';

export function useCollapsedColumns() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
        return new Set();
      }
      return new Set(parsed as string[]);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const toggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
