export type Region = 'us' | 'eu' | 'kr' | 'tw';

const RESET_CONFIG = {
  us: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 }, // Tuesday 15:00 UTC
  eu: { dailyHour: 7, weeklyDay: 3, weeklyHour: 7 }, // Wednesday 07:00 UTC
  kr: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
  tw: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
} as const;

export function getNextWeeklyReset(region: Region): Date {
  const config = RESET_CONFIG[region];
  const now = new Date();
  const reset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      config.weeklyHour,
      0,
      0,
      0,
    ),
  );

  // Advance to the correct weekday
  while (reset.getUTCDay() !== config.weeklyDay || reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset;
}

export function getNextDailyReset(region: Region): Date {
  const config = RESET_CONFIG[region];
  const now = new Date();
  const reset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      config.dailyHour,
      0,
      0,
      0,
    ),
  );

  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset;
}

export function getCurrentResetWeek(region: Region): string {
  const nextReset = getNextWeeklyReset(region);
  const weekStart = new Date(nextReset.getTime() - 7 * 24 * 60 * 60 * 1000);
  // ISO 8601 week number calculation
  // The ISO week date system: week 1 is the week containing the year's first Thursday
  const target = new Date(
    Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()),
  );
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = target.getUTCDay() || 7; // Convert Sunday from 0 to 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  // Get first day of year
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  // Calculate week number
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function getTodayDate(region: Region): string {
  const config = RESET_CONFIG[region];
  const now = new Date();
  // If before daily reset, the "WoW day" is still yesterday
  const adjusted = new Date(now.getTime());
  const todayReset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      config.dailyHour,
      0,
      0,
      0,
    ),
  );
  if (now < todayReset) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  const y = adjusted.getUTCFullYear();
  const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
