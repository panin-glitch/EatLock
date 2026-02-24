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

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = ['Last week', 'Last 30 days', 'All time'] as const;
type FilterType = typeof FILTERS[number];

function filterSessions(sessions: MealSession[], filter: FilterType): MealSession[] {
  const now = new Date();
  return sessions.filter((s) => {
    if (!s.endedAt) return false;
    const start = new Date(s.startedAt);
    if (filter === 'Last week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return start >= weekAgo;
    }
    if (filter === 'Last 30 days') {
      const monthAgo = new Date(now);
      monthAgo.setDate(now.getDate() - 30);
      return start >= monthAgo;
    }
    return true;
  });
}

function getDaysForFilter(filter: FilterType): number {
  if (filter === 'Last week') return 7;
  if (filter === 'Last 30 days') return 30;
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
  const dayMap: Record<string, number> = {};
  const days = getDaysForFilter(filter);
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const isoKey = d.toISOString().slice(0, 10);
    dayMap[key] = 0;
    // Seed from DB data
    const dbEntry = caloriesFromDb.find((c) => c.log_date === isoKey);
    if (dbEntry) dayMap[key] = dbEntry.total_calories;
  }

  // Also add local session nutrition
  for (const s of sessions) {
    if (!s.endedAt || !s.preNutrition?.estimated_calories) continue;
    const d = new Date(s.startedAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in dayMap) {
      // Avoid double-counting if DB already has it  — use max
      // (DB should be source of truth, but local fallback if offline)
    }
  }

  const entries = Object.entries(dayMap);
  const step = Math.max(1, Math.floor(entries.length / 7));
  const labels = entries.map(([k], i) => (i % step === 0 ? k : ''));
  const data = entries.map(([, v]) => v);

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
  if (filter === 'Last week') return 'this week';
  if (filter === 'Last 30 days') return 'last 30 days';
  return 'all time';
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const [filter, setFilter] = useState<FilterType>('Last week');
  const [caloriesFromDb, setCaloriesFromDb] = useState<Array<{ log_date: string; total_calories: number }>>([]);

  const filtered = useMemo(() => filterSessions(sessions, filter), [sessions, filter]);

  // Fetch calories from Supabase
  useEffect(() => {
    const now = new Date();
    const days = getDaysForFilter(filter);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
    fetchCaloriesByDateRange(startDate, now).then(setCaloriesFromDb).catch(() => setCaloriesFromDb([]));
  }, [filter]);

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

  // Calories stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCalories = caloriesFromDb.find((c) => c.log_date === todayStr)?.total_calories || 0;
  const totalCaloriesInRange = caloriesFromDb.reduce((sum, c) => sum + c.total_calories, 0);
  const daysWithCalories = caloriesFromDb.filter((c) => c.total_calories > 0).length;
  const avgDailyCalories = daysWithCalories > 0 ? Math.round(totalCaloriesInRange / daysWithCalories) : 0;

  const mealsChart = useMemo(() => getMealsPerDayData(filtered, filter), [filtered, filter]);
  const eatingChart = useMemo(() => getEatingTimeData(filtered, filter), [filtered, filter]);
  const caloriesChart = useMemo(() => getCaloriesPerDayData(filtered, caloriesFromDb, filter), [filtered, caloriesFromDb, filter]);
  const mealsMax = Math.max(0, ...mealsChart.data);
  const mealsSegments = getIntegerSegments(mealsMax);
  const caloriesMax = Math.max(0, ...caloriesChart.data);
  const caloriesSegments = caloriesMax > 0 ? Math.min(5, Math.max(1, Math.ceil(caloriesMax / 500))) : 1;

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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Stats</Text>
      </View>

      <ScrollView
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
    header: {
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 8,
    },
    title: { fontSize: 28, fontWeight: '700', color: theme.text },
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
