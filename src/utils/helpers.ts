import { MealSchedule, MealSession, DayOfWeek } from '../types/models';

const DAYS_ORDER: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getNextMeal(schedules: MealSchedule[]): { schedule: MealSchedule; nextTime: Date } | null {
  const now = new Date();
  const currentDay = DAYS_ORDER[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let closest: { schedule: MealSchedule; nextTime: Date; diff: number } | null = null;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDayIndex = (now.getDay() + dayOffset) % 7;
      const checkDay = DAYS_ORDER[checkDayIndex];

      if (!schedule.repeatDays.includes(checkDay)) continue;

      const [h, m] = schedule.timeOfDay.split(':').map(Number);
      const scheduleMinutes = h * 60 + m;

      if (dayOffset === 0 && scheduleMinutes <= currentMinutes) continue;

      const nextTime = new Date(now);
      nextTime.setDate(now.getDate() + dayOffset);
      nextTime.setHours(h, m, 0, 0);

      const diff = nextTime.getTime() - now.getTime();
      if (!closest || diff < closest.diff) {
        closest = { schedule, nextTime, diff };
      }
      break; // Found closest occurrence for this schedule
    }
  }

  return closest ? { schedule: closest.schedule, nextTime: closest.nextTime } : null;
}

export function formatCountdown(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  if (diff <= 0) return 'Now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDurationMinutes(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function getSessionDuration(session: MealSession): number {
  if (!session.endedAt) return 0;
  return new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
}

export function getSessionsForDate(sessions: MealSession[], date: Date): MealSession[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return sessions.filter((s) => {
    const start = new Date(s.startedAt);
    return start >= dayStart && start <= dayEnd;
  });
}

export function getSchedulesForDay(schedules: MealSchedule[], day: DayOfWeek): MealSchedule[] {
  return schedules.filter((s) => s.repeatDays.includes(day));
}

export function getDayOfWeek(date: Date): DayOfWeek {
  return DAYS_ORDER[date.getDay()];
}

export function getWeekDates(referenceDate: Date): Date[] {
  const start = new Date(referenceDate);
  const day = start.getDay();
  start.setDate(start.getDate() - day); // Start from Sunday
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function computeFocusScore(sessions: MealSession[]): number {
  if (sessions.length === 0) return 0;
  let totalScore = 0;
  for (const s of sessions) {
    const completionScore = s.endedAt ? 50 : 0;
    const distractionScore = s.distractionRating
      ? Math.round(((5 - s.distractionRating + 1) / 5) * 50)
      : 25;
    totalScore += completionScore + distractionScore;
  }
  return Math.round(totalScore / sessions.length);
}

export function computeStreak(sessions: MealSession[]): { current: number; longest: number } {
  if (sessions.length === 0) return { current: 0, longest: 0 };

  const completedDays = new Set<string>();
  for (const s of sessions) {
    if (s.endedAt) {
      const d = new Date(s.startedAt);
      completedDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }

  const sortedDays = Array.from(completedDays).sort();
  if (sortedDays.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      currentStreak++;
      longest = Math.max(longest, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  // Check if current streak includes today
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(today.getDate() - 1);
  const yesterdayKey = `${yesterdayDate.getFullYear()}-${yesterdayDate.getMonth()}-${yesterdayDate.getDate()}`;

  if (!completedDays.has(todayKey) && !completedDays.has(yesterdayKey)) {
    currentStreak = 0;
  }

  return { current: currentStreak, longest };
}
