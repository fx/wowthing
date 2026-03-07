import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNextWeeklyReset,
  getNextDailyReset,
  getCurrentResetWeek,
  getTodayDate,
} from '../resets';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getNextWeeklyReset', () => {
  it('returns a Tuesday for US region', () => {
    const reset = getNextWeeklyReset('us');
    expect(reset.getUTCDay()).toBe(2); // Tuesday
    expect(reset.getUTCHours()).toBe(15);
  });

  it('returns a Wednesday for EU region', () => {
    const reset = getNextWeeklyReset('eu');
    expect(reset.getUTCDay()).toBe(3); // Wednesday
    expect(reset.getUTCHours()).toBe(7);
  });

  it('returns a future date', () => {
    const reset = getNextWeeklyReset('us');
    expect(reset.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns next Tuesday when current time is Monday', () => {
    // Monday March 9, 2026 12:00 UTC
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));
    const reset = getNextWeeklyReset('us');
    expect(reset.toISOString()).toBe('2026-03-10T15:00:00.000Z');
  });

  it('returns next Tuesday when current time is Tuesday before reset', () => {
    // Tuesday March 10, 2026 10:00 UTC (before 15:00)
    vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));
    const reset = getNextWeeklyReset('us');
    expect(reset.toISOString()).toBe('2026-03-10T15:00:00.000Z');
  });

  it('returns following Tuesday when current time is Tuesday after reset', () => {
    // Tuesday March 10, 2026 16:00 UTC (after 15:00)
    vi.setSystemTime(new Date('2026-03-10T16:00:00Z'));
    const reset = getNextWeeklyReset('us');
    expect(reset.toISOString()).toBe('2026-03-17T15:00:00.000Z');
  });

  it('KR region resets on Tuesday at 15:00 UTC', () => {
    const reset = getNextWeeklyReset('kr');
    expect(reset.getUTCDay()).toBe(2);
    expect(reset.getUTCHours()).toBe(15);
  });
});

describe('getNextDailyReset', () => {
  it('returns 15:00 UTC for US region', () => {
    const reset = getNextDailyReset('us');
    expect(reset.getUTCHours()).toBe(15);
    expect(reset.getUTCMinutes()).toBe(0);
  });

  it('returns 07:00 UTC for EU region', () => {
    const reset = getNextDailyReset('eu');
    expect(reset.getUTCHours()).toBe(7);
    expect(reset.getUTCMinutes()).toBe(0);
  });

  it('returns today if before reset time', () => {
    // March 10, 2026 10:00 UTC (before US reset at 15:00)
    vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));
    const reset = getNextDailyReset('us');
    expect(reset.toISOString()).toBe('2026-03-10T15:00:00.000Z');
  });

  it('returns tomorrow if after reset time', () => {
    // March 10, 2026 16:00 UTC (after US reset at 15:00)
    vi.setSystemTime(new Date('2026-03-10T16:00:00Z'));
    const reset = getNextDailyReset('us');
    expect(reset.toISOString()).toBe('2026-03-11T15:00:00.000Z');
  });
});

describe('getCurrentResetWeek', () => {
  it('returns an ISO week string', () => {
    const week = getCurrentResetWeek('us');
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns consistent week for a fixed time', () => {
    // Wednesday March 11, 2026 — US reset was Tuesday March 10
    vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
    const week = getCurrentResetWeek('us');
    expect(week).toBe('2026-W11');
  });
});

describe('getTodayDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const date = getTodayDate('us');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns previous day if before daily reset', () => {
    // March 10, 2026 10:00 UTC (before US reset at 15:00)
    vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));
    expect(getTodayDate('us')).toBe('2026-03-09');
  });

  it('returns current day if after daily reset', () => {
    // March 10, 2026 16:00 UTC (after US reset at 15:00)
    vi.setSystemTime(new Date('2026-03-10T16:00:00Z'));
    expect(getTodayDate('us')).toBe('2026-03-10');
  });

  it('handles EU daily reset at 07:00 UTC', () => {
    // March 10, 2026 05:00 UTC (before EU reset at 07:00)
    vi.setSystemTime(new Date('2026-03-10T05:00:00Z'));
    expect(getTodayDate('eu')).toBe('2026-03-09');
  });
});
