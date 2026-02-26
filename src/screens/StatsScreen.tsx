import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import {
  getSessionDuration,
  formatDurationMinutes,
  computeFocusScore,
  computeStreak,
} from '../utils/helpers';
import { LineChart } from 'react-native-chart-kit';
import { MealSession } from '../types/models';
import { fetchCaloriesByDateRange } from '../services/mealLogger';
import ScreenHeader from '../components/common/ScreenHeader';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = ['Weekly', 'Monthly', 'All-time'] as const;
type FilterType = typeof FILTERS[number];

function filterSessions(sessions: MealSession[], filter: FilterType): MealSession[] {
  const now = new Date();
  return sessions.filter((s) => {
    if (!s.endedAt) return false;
    const start = new Date(s.startedAt);
    if (filter === 'Weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return start >= weekAgo;
    }
    if (filter === 'Monthly') {
      const monthAgo = new Date(now);
      monthAgo.setDate(now.getDate() - 30);
      return start >= monthAgo;
    }
    return true;
  });
}

function getDaysForFilter(filter: FilterType): number {
  if (filter === 'Weekly') return 7;
  if (filter === 'Monthly') return 30;
  return 90;
}

function getMealsPerDayData(sessions: MealSession[], filter: FilterType) {
  const dayMap: Record<string, number> = {};
  const days = getDaysForFilter(filter);
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dayMap[key] = 0;
  }

  for (const s of sessions) {
    if (!s.endedAt) continue;
    const d = new Date(s.startedAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in dayMap) dayMap[key]++;
  }

  const entries = Object.entries(dayMap);
  const step = Math.max(1, Math.floor(entries.length / 7));
  const labels = entries.map(([k], i) => (i % step === 0 ? k : ''));
  const data = entries.map(([, v]) => v);

  return { labels, data };
}

function getIntegerSegments(maxValue: number): number {
  const safeMax = Math.max(1, Math.floor(maxValue));
  return safeMax <= 8 ? safeMax : 8;
}

/** Generate unique integer Y labels to avoid duplicates. */
function getUniqueYLabels(maxValue: number, segments: number): string[] {
  const step = Math.max(1, Math.ceil(maxValue / segments));
  const labels: string[] = [];
  for (let i = 0; i <= segments; i++) {
    labels.push(String(i * step));
  }
  return labels;
}

/** Build daily calorie chart data from Supabase logs + local sessions. */
function getCaloriesPerDayData(
  sessions: MealSession[],
  caloriesFromDb: Array<{ log_date: string; total_calories: number }>,
  filter: FilterType,
) {
  const days = getDaysForFilter(filter);
  const now = new Date();

  const orderedIsoKeys: string[] = [];
  const displayLabelByIso: Record<string, string> = {};
  const localCaloriesByIso: Record<string, number> = {};
  const dbCaloriesByIso: Record<string, number> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    orderedIsoKeys.push(iso);
    displayLabelByIso[iso] = `${d.getMonth() + 1}/${d.getDate()}`;
    localCaloriesByIso[iso] = 0;
    dbCaloriesByIso[iso] = 0;
  }

  for (const row of caloriesFromDb) {
    if (row.log_date in dbCaloriesByIso) {
      dbCaloriesByIso[row.log_date] = Math.max(0, Math.round(row.total_calories || 0));
    }
  }

  for (const s of sessions) {
    if (!s.endedAt) continue;
    const calories = s.preNutrition?.estimated_calories;
    if (!calories || calories <= 0) continue;
    const iso = new Date(s.startedAt).toISOString().slice(0, 10);
    if (iso in localCaloriesByIso) {
      localCaloriesByIso[iso] += Math.round(calories);
    }
  }

  const merged = orderedIsoKeys.map((iso) => {
    const db = dbCaloriesByIso[iso] || 0;
    const local = localCaloriesByIso[iso] || 0;
    return { label: displayLabelByIso[iso], value: Math.max(db, local) };
  });

  const step = Math.max(1, Math.floor(merged.length / 7));
  const labels = merged.map((entry, i) => (i % step === 0 ? entry.label : ''));
  const data = merged.map((entry) => entry.value);

  return { labels, data };
}

function getEatingTimeData(sessions: MealSession[], filter: FilterType) {
  const dayMap: Record<string, number[]> = {};
  const days = getDaysForFilter(filter);
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dayMap[key] = [];
  }

  for (const s of sessions) {
    if (!s.endedAt) continue;
    const d = new Date(s.startedAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in dayMap) {
      dayMap[key].push(getSessionDuration(s) / 60000);
    }
  }

  const entries = Object.entries(dayMap);
  const step = Math.max(1, Math.floor(entries.length / 7));
  const labels = entries.filter((_, i) => i % step === 0).map(([k]) => k);
  const data = entries.map(([, arr]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
  );

  return { labels, data };
}

function getRangeSuffix(filter: FilterType): string {
  if (filter === 'Weekly') return 'this week';
  if (filter === 'Monthly') return 'this month';
  return 'all time';
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const [filter, setFilter] = useState<FilterType>('Weekly');
  const [caloriesFromDb, setCaloriesFromDb] = useState<Array<{ log_date: string; total_calories: number }>>([]);

  const filtered = useMemo(() => filterSessions(sessions, filter), [sessions, filter]);

  // Fetch calories from Supabase
  useEffect(() => {
    const now = new Date();
    const days = getDaysForFilter(filter);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
    fetchCaloriesByDateRange(startDate, now).then(setCaloriesFromDb).catch(() => setCaloriesFromDb([]));
  }, [filter, sessions.length]);

  // Stats calculations
  const totalSessions = filtered.length;
  const strictSessions = filtered.filter((s) => s.strictMode);
  const durations = filtered.map(getSessionDuration).filter((d) => d > 0);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const fastestMeal = durations.length > 0 ? Math.min(...durations) : 0;
  const longestMeal = durations.length > 0 ? Math.max(...durations) : 0;
  const totalStrictTime = strictSessions
    .map(getSessionDuration)
    .filter((d) => d > 0)
    .reduce((a, b) => a + b, 0);
  const avgDistractionRating =
    filtered.filter((s) => s.distractionRating).length > 0
      ? filtered.reduce((sum, s) => sum + (s.distractionRating || 0), 0) /
        filtered.filter((s) => s.distractionRating).length
      : 0;
  const avgDistractionMinutes =
    filtered.filter((s) => s.estimatedDistractionMinutes).length > 0
      ? filtered.reduce((sum, s) => sum + (s.estimatedDistractionMinutes || 0), 0) /
        filtered.filter((s) => s.estimatedDistractionMinutes).length
      : 0;
  const focusScore = computeFocusScore(filtered);
  const streaks = computeStreak(sessions);

  const uniqueDays = new Set(filtered.map((s) => new Date(s.startedAt).toDateString())).size;
  const mealsPerDay = uniqueDays > 0 ? (totalSessions / uniqueDays).toFixed(1) : '0';

  // Snack metrics
  const snackSessions = filtered.filter((s) => s.mealType === 'Snack');
  const daysInRange = getDaysForFilter(filter);
  const avgSnacksPerDay = daysInRange > 0 ? (snackSessions.length / daysInRange).toFixed(1) : '0';

  // Snack sessions in range (uses filtered, not always last 7 days)
  const snacksInRange = snackSessions.length;

  // Best snack day (day with most snacks in range)
  const snackDayMap: Record<string, number> = {};
  for (const s of snackSessions) {
    const dayKey = new Date(s.startedAt).toLocaleDateString('en-US', { weekday: 'short' });
    snackDayMap[dayKey] = (snackDayMap[dayKey] || 0) + 1;
  }
  const bestSnackDay = Object.entries(snackDayMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  // Calories stats (DB + local fallback for immediate UI updates)
  const todayStr = new Date().toISOString().slice(0, 10);
  const dbTodayCalories = caloriesFromDb.find((c) => c.log_date === todayStr)?.total_calories || 0;
  const dbTotalCaloriesInRange = caloriesFromDb.reduce((sum, c) => sum + c.total_calories, 0);
  const dbDaysWithCalories = caloriesFromDb.filter((c) => c.total_calories > 0).length;

  const localCaloriesByDate: Record<string, number> = {};
  for (const s of filtered) {
    if (!s.endedAt || !s.preNutrition?.estimated_calories) continue;
    const day = new Date(s.startedAt).toISOString().slice(0, 10);
    localCaloriesByDate[day] = (localCaloriesByDate[day] || 0) + Math.round(s.preNutrition.estimated_calories);
  }
  const localTodayCalories = localCaloriesByDate[todayStr] || 0;
  const localTotalCaloriesInRange = Object.values(localCaloriesByDate).reduce((sum, v) => sum + v, 0);
  const localDaysWithCalories = Object.values(localCaloriesByDate).filter((v) => v > 0).length;

  const todayCalories = Math.max(dbTodayCalories, localTodayCalories);
  const totalCaloriesInRange = Math.max(dbTotalCaloriesInRange, localTotalCaloriesInRange);
  const daysWithCalories = Math.max(dbDaysWithCalories, localDaysWithCalories);
  const avgDailyCalories = daysWithCalories > 0 ? Math.round(totalCaloriesInRange / daysWithCalories) : 0;

  // 7-day average (always last 7 days regardless of filter)
  const avg7dCalories = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10);
    const recent = caloriesFromDb.filter((c) => c.log_date >= sevenDaysAgoIso && c.total_calories > 0);
    // Also merge local
    const localRecent: Record<string, number> = {};
    for (const s of sessions) {
      if (!s.endedAt || !s.preNutrition?.estimated_calories) continue;
      const iso = new Date(s.startedAt).toISOString().slice(0, 10);
      if (iso >= sevenDaysAgoIso) {
        localRecent[iso] = (localRecent[iso] || 0) + Math.round(s.preNutrition.estimated_calories);
      }
    }
    const mergedDays = new Set([...recent.map((r) => r.log_date), ...Object.keys(localRecent)]);
    let total = 0;
    for (const day of mergedDays) {
      const db = recent.find((r) => r.log_date === day)?.total_calories || 0;
      const local = localRecent[day] || 0;
      total += Math.max(db, local);
    }
    const daysCount = mergedDays.size;
    return daysCount > 0 ? Math.round(total / daysCount) : 0;
  }, [caloriesFromDb, sessions]);

  const mealsChart = useMemo(() => getMealsPerDayData(filtered, filter), [filtered, filter]);
  const eatingChart = useMemo(() => getEatingTimeData(filtered, filter), [filtered, filter]);
  const caloriesChart = useMemo(() => getCaloriesPerDayData(filtered, caloriesFromDb, filter), [filtered, caloriesFromDb, filter]);
  const mealsMax = Math.max(0, ...mealsChart.data);
  const mealsSegments = getIntegerSegments(mealsMax);
  const caloriesMax = Math.max(0, ...caloriesChart.data);
  // Use integer-safe segments: ensure step >= 1 so labels never duplicate
  const caloriesSegments = (() => {
    if (caloriesMax <= 0) return 1;
    // Pick a nice step size so we get 3-5 segments with no duplicates
    const niceSteps = [50, 100, 200, 250, 500, 1000, 2000];
    const desiredSegments = 4;
    let step = Math.max(1, Math.ceil(caloriesMax / desiredSegments));
    // Snap to a nice step
    for (const ns of niceSteps) {
      if (ns >= step) { step = ns; break; }
    }
    const segs = Math.max(1, Math.ceil(caloriesMax / step));
    return Math.min(segs, 6);
  })();

  const chartConfig = {
    backgroundGradientFrom: theme.card,
    backgroundGradientTo: theme.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(52,199,89,${opacity})`,
    labelColor: () => theme.textSecondary,
    style: { borderRadius: 16 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: theme.primary },
    propsForBackgroundLines: { stroke: theme.border, strokeDasharray: '' },
    fillShadowGradientFrom: theme.primary,
    fillShadowGradientTo: 'transparent',
    fillShadowGradientOpacity: 0.2,
  };

  const caloriesChartConfig = {
    ...chartConfig,
    color: (opacity = 1) => `rgba(255,159,10,${opacity})`,
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#FF9F0A' },
    fillShadowGradientFrom: '#FF9F0A',
  };

  const eatingMax = Math.max(0, ...eatingChart.data);
  const eatingSegments = getIntegerSegments(eatingMax);

  const styles = makeStyles(theme);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <ScreenHeader title="Progress" />

      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Encouragement card */}
        <View style={styles.encourageCard}>
          <MaterialIcons name="emoji-events" size={36} color={theme.warning} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.encourageTitle}>You are doing great!</Text>
            <Text style={styles.encourageSubtitle}>
              {totalSessions > 0
                ? `${totalSessions} meals tracked · ${streaks.current} day streak`
                : 'Start tracking your meals to see your stats'}
            </Text>
          </View>
        </View>

        {/* Filter */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipSelected]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[styles.filterText, filter === f && styles.filterTextSelected]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* A) Meal Consistency */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal Consistency ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{mealsPerDay}</Text>
              <Text style={styles.statLabel}>Avg meals/day</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalSessions}</Text>
              <Text style={styles.statLabel}>Total meals</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {streaks.current}
              </Text>
              <Text style={styles.statLabel}>Current streak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{streaks.longest}</Text>
              <Text style={styles.statLabel}>Longest streak</Text>
            </View>
          </View>
        </View>

        {/* B) Calories */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calories ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {todayCalories > 0 ? todayCalories : '—'}
              </Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#FF9F0A' }]}>
                {avg7dCalories > 0 ? avg7dCalories : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg (7d)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {avgDailyCalories > 0 ? avgDailyCalories : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg/day</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {totalCaloriesInRange > 0 ? totalCaloriesInRange : '—'}
              </Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* C) Meal Duration */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal Duration ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {avgDuration > 0 ? formatDurationMinutes(avgDuration) : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg eating time</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {fastestMeal > 0 ? formatDurationMinutes(fastestMeal) : '—'}
              </Text>
              <Text style={styles.statLabel}>Fastest meal</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {longestMeal > 0 ? formatDurationMinutes(longestMeal) : '—'}
              </Text>
              <Text style={styles.statLabel}>Longest meal</Text>
            </View>
          </View>
        </View>

        {/* C) Distraction & Savings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Distraction & Savings ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {avgDistractionRating > 0 ? avgDistractionRating.toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg distraction (1-5)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {avgDistractionMinutes > 0 ? `${avgDistractionMinutes.toFixed(0)} min` : '—'}
              </Text>
              <Text style={styles.statLabel}>Est. time saved/meal</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Blocked attempts</Text>
            </View>
          </View>
        </View>

        {/* D) Strict Mode Performance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Strict Mode ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{strictSessions.length}</Text>
              <Text style={styles.statLabel}>Strict sessions</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {totalStrictTime > 0 ? formatDurationMinutes(totalStrictTime) : '—'}
              </Text>
              <Text style={styles.statLabel}>Total strict time</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {focusScore}
              </Text>
              <Text style={styles.statLabel}>Focus score (0-100)</Text>
            </View>
          </View>
        </View>

        {/* E) Snack Insights */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Snack Insights ({getRangeSuffix(filter)})</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{avgSnacksPerDay}</Text>
              <Text style={styles.statLabel}>Avg snacks/day</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{snacksInRange}</Text>
              <Text style={styles.statLabel}>Snacks {getRangeSuffix(filter)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{bestSnackDay}</Text>
              <Text style={styles.statLabel}>Best snack day</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{snackSessions.length}</Text>
              <Text style={styles.statLabel}>Total snacks</Text>
            </View>
          </View>
        </View>

        {/* Chart: Meals completed over time */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meals Completed Over Time</Text>
          {mealsChart.data.length > 0 && mealsChart.data.some((d) => d > 0) ? (
            <LineChart
              data={{
                labels: mealsChart.labels,
                datasets: [{ data: mealsChart.data }],
              }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={chartConfig}
              style={styles.chart}
              segments={mealsSegments}
              formatYLabel={(value: string) => {
                const parsed = Number(value);
                if (Number.isNaN(parsed)) return '';
                return String(Math.max(0, Math.round(parsed)));
              }}
              yAxisSuffix=""
              fromZero
              bezier
            />
          ) : (
            <View style={styles.chartEmpty}>
              <MaterialIcons name="bar-chart" size={32} color={theme.textMuted} />
              <Text style={styles.chartEmptyText}>
                Start tracking meals to see your chart
              </Text>
            </View>
          )}
        </View>

        {/* Chart: Calories Over Time */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calories Over Time</Text>
          {caloriesChart.data.length > 0 && caloriesChart.data.some((d) => d > 0) ? (
            <LineChart
              data={{
                labels: caloriesChart.labels,
                datasets: [{ data: caloriesChart.data }],
              }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={caloriesChartConfig}
              style={styles.chart}
              segments={caloriesSegments}
              formatYLabel={(value: string) => {
                const parsed = Number(value);
                if (Number.isNaN(parsed)) return '';
                return String(Math.max(0, Math.round(parsed)));
              }}
              yAxisSuffix=""
              fromZero
              bezier
            />
          ) : (
            <View style={styles.chartEmpty}>
              <MaterialIcons name="local-fire-department" size={32} color={theme.textMuted} />
              <Text style={styles.chartEmptyText}>
                Log meals with calories to see trends
              </Text>
            </View>
          )}
        </View>

        {/* Chart: Average eating time over time */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Avg Eating Time Over Time</Text>
          {eatingChart.data.length > 0 && eatingChart.data.some((d) => d > 0) ? (
            <LineChart
              data={{
                labels: eatingChart.labels,
                datasets: [{ data: eatingChart.data }],
              }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={chartConfig}
              style={styles.chart}
              segments={eatingSegments}
              formatYLabel={(value: string) => {
                const parsed = Number(value);
                if (Number.isNaN(parsed)) return '';
                return String(Math.max(0, Math.round(parsed)));
              }}
              yAxisSuffix="m"
              bezier
              fromZero
            />
          ) : (
            <View style={styles.chartEmpty}>
              <MaterialIcons name="show-chart" size={32} color={theme.textMuted} />
              <Text style={styles.chartEmptyText}>
                Complete meals to see duration trends
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
    encourageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primaryDim,
      borderRadius: 20,
      padding: 20,
      marginTop: 16,
      borderWidth: 1,
      borderColor: 'rgba(52,199,89,0.2)',
    },
    encourageTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    encourageSubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
      marginBottom: 4,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.chipBg,
    },
    filterChipSelected: {
      backgroundColor: theme.primaryDim,
      borderColor: theme.primary,
      borderWidth: 1,
    },
    filterText: { fontSize: 13, color: theme.textSecondary },
    filterTextSelected: { color: theme.primary, fontWeight: '600' },
    card: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 20,
      marginTop: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 14,
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    statItem: {
      minWidth: '40%',
      flex: 1,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
    },
    statLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    chart: { borderRadius: 12, marginTop: 4 },
    chartEmpty: {
      alignItems: 'center',
      paddingVertical: 30,
    },
    chartEmptyText: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
  });
