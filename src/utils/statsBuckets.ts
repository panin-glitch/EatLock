import type { MealSession } from '../types/models';

export interface StatsBucketPoint {
  key: string;
  label: string;
  meals: number;
  calories: number;
  focusMinutes: number;
  lowDistraction: number;
}

function addDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function toValidDate(dateLike: string | Date | undefined): Date | null {
  if (!dateLike) return null;
  const direct = new Date(dateLike);
  if (!Number.isNaN(direct.getTime())) return direct;

  if (typeof dateLike === 'string') {
    const numeric = Number(dateLike);
    if (Number.isFinite(numeric)) {
      const fromNumeric = new Date(numeric);
      if (!Number.isNaN(fromNumeric.getTime())) return fromNumeric;
    }
  }

  return null;
}

export function toLocalDayKey(dateLike: string | Date): string {
  const date = toValidDate(dateLike);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalLabel(dateLike: string | Date): string {
  const date = toValidDate(dateLike);
  if (!date) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function getWeekOfMonthIndex(dateLike: string | Date): number {
  const date = toValidDate(dateLike);
  if (!date) return -1;
  return Math.floor((date.getDate() - 1) / 7);
}

function isCompletedMeal(session: MealSession): boolean {
  if (toValidDate(session.endedAt)) return true;
  return session.status !== 'ACTIVE' && session.status !== 'INCOMPLETE';
}

function getMealEventDate(session: MealSession): Date | null {
  return toValidDate(session.endedAt) ?? toValidDate(session.startedAt);
}

function addSessionToBucket(session: MealSession, bucket: StatsBucketPoint): void {
  bucket.meals += 1;

  const startedDate = toValidDate(session.startedAt);
  const endedDate = toValidDate(session.endedAt) ?? startedDate;
  const startedMs = startedDate?.getTime() ?? 0;
  const endedMs = endedDate?.getTime() ?? startedMs;
  bucket.focusMinutes += Math.max(0, Math.round((endedMs - startedMs) / 60000));

  if (typeof session.distractionRating === 'number' && session.distractionRating <= 2) {
    bucket.lowDistraction += 1;
  }

  bucket.calories += Math.max(0, Math.round(session.preNutrition?.estimated_calories ?? 0));
}

export function buildWeeklyDayBuckets(sessions: MealSession[], today = new Date()): StatsBucketPoint[] {
  const start = startOfLocalDay(addDays(today, -6));
  const end = endOfLocalDay(today);

  const points: StatsBucketPoint[] = Array.from({ length: 5 }, (_, index) => {
    return {
      key: `W${index + 1}`,
      label: `W${index + 1}`,
      meals: 0,
      calories: 0,
      focusMinutes: 0,
      lowDistraction: 0,
    };
  });

  const startMs = start.getTime();

  for (const session of sessions) {
    if (!isCompletedMeal(session)) continue;
    const eventDate = getMealEventDate(session);
    if (!eventDate) continue;
    if (eventDate < start || eventDate > end) continue;

    const dayOffset = Math.floor((startOfLocalDay(eventDate).getTime() - startMs) / (24 * 60 * 60 * 1000));
    if (dayOffset < 0 || dayOffset > 6) continue;
    const weekIndex = Math.min(4, Math.floor((dayOffset * 5) / 7));
    const target = points[weekIndex];
    if (!target) continue;
    addSessionToBucket(session, target);
  }

  return points;
}

export function buildMonthlyWeekBuckets(sessions: MealSession[], today = new Date()): StatsBucketPoint[] {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  const end = endOfLocalDay(today);

  const points: StatsBucketPoint[] = [
    { key: 'M1', label: 'M1', meals: 0, calories: 0, focusMinutes: 0, lowDistraction: 0 },
    { key: 'M2', label: 'M2', meals: 0, calories: 0, focusMinutes: 0, lowDistraction: 0 },
    { key: 'M3', label: 'M3', meals: 0, calories: 0, focusMinutes: 0, lowDistraction: 0 },
    { key: 'M4', label: 'M4', meals: 0, calories: 0, focusMinutes: 0, lowDistraction: 0 },
    { key: 'M5', label: 'M5', meals: 0, calories: 0, focusMinutes: 0, lowDistraction: 0 },
  ];

  for (const session of sessions) {
    if (!isCompletedMeal(session)) continue;
    const eventDate = getMealEventDate(session);
    if (!eventDate) continue;
    if (eventDate < monthStart || eventDate > end) continue;

    const weekIndex = getWeekOfMonthIndex(eventDate);
    if (weekIndex < 0 || weekIndex > 4) continue;
    addSessionToBucket(session, points[weekIndex]);
  }

  return points;
}

export function buildRollingDailyBuckets(
  sessions: MealSession[],
  dayCount: number,
  offsetDays = 0,
  today = new Date(),
): StatsBucketPoint[] {
  const end = endOfLocalDay(addDays(today, -offsetDays));
  const start = startOfLocalDay(addDays(end, -(dayCount - 1)));

  const points: StatsBucketPoint[] = Array.from({ length: dayCount }, (_, index) => {
    const d = addDays(start, index);
    return {
      key: toLocalDayKey(d),
      label: toLocalLabel(d),
      meals: 0,
      calories: 0,
      focusMinutes: 0,
      lowDistraction: 0,
    };
  });

  const byDay = new Map(points.map((point) => [point.key, point]));

  for (const session of sessions) {
    if (!isCompletedMeal(session)) continue;
    const eventDate = getMealEventDate(session);
    if (!eventDate) continue;
    if (eventDate < start || eventDate > end) continue;

    const dayKey = toLocalDayKey(eventDate);
    const target = byDay.get(dayKey);
    if (!target) continue;
    addSessionToBucket(session, target);
  }

  return points;
}

export function buildRollingMonthlyBuckets(
  sessions: MealSession[],
  monthCount: number,
  locale = 'en-US',
  today = new Date(),
): StatsBucketPoint[] {
  const end = endOfLocalDay(today);
  const startMonth = new Date(today.getFullYear(), today.getMonth() - (monthCount - 1), 1, 0, 0, 0, 0);

  const points: StatsBucketPoint[] = Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    return {
      key: monthKey,
      label: monthDate.toLocaleDateString(locale, { month: 'short' }),
      meals: 0,
      calories: 0,
      focusMinutes: 0,
      lowDistraction: 0,
    };
  });

  const byMonth = new Map(points.map((point) => [point.key, point]));

  for (const session of sessions) {
    if (!isCompletedMeal(session)) continue;
    const eventDate = getMealEventDate(session);
    if (!eventDate) continue;
    if (eventDate < startMonth || eventDate > end) continue;

    const key = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
    const target = byMonth.get(key);
    if (!target) continue;
    addSessionToBucket(session, target);
  }

  return points;
}
