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
const FILTERS = ['Weekly', 'Monthly'] as const;
type FilterType = (typeof FILTERS)[number];

// ── Helpers ──────────────────────────────────

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
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);
    return start >= monthAgo;
  });
}

function prevFilterSessions(sessions: MealSession[], filter: FilterType): MealSession[] {
  const now = new Date();
  return sessions.filter((s) => {
    if (!s.endedAt) return false;
    const start = new Date(s.startedAt);
    if (filter === 'Weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(now.getDate() - 14);
      return start >= twoWeeksAgo && start < weekAgo;
    }
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setDate(now.getDate() - 60);
    return start >= twoMonthsAgo && start < monthAgo;
  });
}

function getDaysForFilter(filter: FilterType): number {
  return filter === 'Weekly' ? 7 : 30;
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

/** Generate unique integer ticks for Y axis – never returns duplicate values. */
function getSafeSegments(maxValue: number): number {
  if (maxValue <= 0) return 1;
  return Math.min(Math.max(1, Math.ceil(maxValue)), 6);
}

function formatDelta(cur: number, prev: number, unit: string): string {
  const diff = cur - prev;
  const sign = diff >= 0 ? '+' : '';
  return `vs last ${unit}: ${sign}${diff}`;
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const [filter, setFilter] = useState<FilterType>('Weekly');
  const [caloriesFromDb, setCaloriesFromDb] = useState<Array<{ log_date: string; total_calories: number }>>([]);

  const filtered = useMemo(() => filterSessions(sessions, filter), [sessions, filter]);
  const prevFiltered = useMemo(() => prevFilterSessions(sessions, filter), [sessions, filter]);

  useEffect(() => {
    const now = new Date();
    const days = getDaysForFilter(filter) * 2; // fetch prev period too
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
    fetchCaloriesByDateRange(startDate, now).then(setCaloriesFromDb).catch(() => setCaloriesFromDb([]));
  }, [filter, sessions.length]);

  // ── Stats ──
  const totalSessions = filtered.length;
  const prevTotalSessions = prevFiltered.length;
  const durations = filtered.map(getSessionDuration).filter((d) => d > 0);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const prevDurations = prevFiltered.map(getSessionDuration).filter((d) => d > 0);
  const prevAvgDuration = prevDurations.length > 0 ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length : 0;
  const focusScore = computeFocusScore(filtered);
  const streaks = computeStreak(sessions);

  // ── Calories ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const localCaloriesByDate: Record<string, number> = {};
  for (const s of filtered) {
    if (!s.endedAt || !s.preNutrition?.estimated_calories) continue;
    const day = new Date(s.startedAt).toISOString().slice(0, 10);
    localCaloriesByDate[day] = (localCaloriesByDate[day] || 0) + Math.round(s.preNutrition.estimated_calories);
  }
  const dbTodayCalories = caloriesFromDb.find((c) => c.log_date === todayStr)?.total_calories || 0;
  const localTodayCalories = localCaloriesByDate[todayStr] || 0;
  const todayCalories = Math.max(dbTodayCalories, localTodayCalories);

  const totalCaloriesInRange = Math.max(
    caloriesFromDb.reduce((sum, c) => sum + c.total_calories, 0),
    Object.values(localCaloriesByDate).reduce((sum, v) => sum + v, 0),
  );
  const prevCalories = prevFiltered.reduce((sum, s) => sum + (s.preNutrition?.estimated_calories ?? 0), 0);

  const displayPeriod = filter === 'Weekly' ? 'week' : 'month';

  // ── Chart data ──
  const mealsChart = useMemo(() => getMealsPerDayData(filtered, filter), [filtered, filter]);
  const caloriesChart = useMemo(
    () => getCaloriesPerDayData(filtered, caloriesFromDb, filter),
    [filtered, caloriesFromDb, filter],
  );
  const mealsMax = Math.max(1, ...mealsChart.data);
  const mealsSegments = getSafeSegments(mealsMax);
  const caloriesMax = Math.max(1, ...caloriesChart.data);
  const caloriesSegments = (() => {
    if (caloriesMax <= 0) return 1;
    const niceSteps = [50, 100, 200, 250, 500, 1000, 2000];
    const desired = 4;
    let step = Math.max(1, Math.ceil(caloriesMax / desired));
    for (const ns of niceSteps) {
      if (ns >= step) { step = ns; break; }
    }
    return Math.min(Math.max(1, Math.ceil(caloriesMax / step)), 6);
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

  // ── Habit insights ──
  const lowDistractionCount = filtered.filter((s) => (s.distractionRating ?? 5) <= 2).length;
  const avgMealMin = avgDuration > 0 ? Math.round(avgDuration / 60000) : 0;
  const habitsData = [
    { label: 'Meals tracked', current: totalSessions, goal: filter === 'Weekly' ? 21 : 90 },
    { label: 'Low-distraction meals', current: lowDistractionCount, goal: filter === 'Weekly' ? 14 : 60 },
    { label: 'Avg meal length (min)', current: avgMealMin, goal: 20 },
  ];

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
        {/* ── Filter row ── */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipSelected]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextSelected]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Meals per day chart ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meals per day</Text>
          {mealsChart.data.some((d) => d > 0) ? (
            <LineChart
              data={{ labels: mealsChart.labels, datasets: [{ data: mealsChart.data }] }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={chartConfig}
              style={styles.chart}
              segments={mealsSegments}
              formatYLabel={(v: string) => {
                const n = Number(v);
                return Number.isNaN(n) ? '' : String(Math.max(0, Math.round(n)));
              }}
              yAxisSuffix=""
              fromZero
              bezier
            />
          ) : (
            <View style={styles.chartEmpty}>
              <MaterialIcons name="bar-chart" size={32} color={theme.textMuted} />
              <Text style={styles.chartEmptyText}>Start tracking meals to see your chart</Text>
            </View>
          )}
        </View>

        {/* ── 2×2 stat tiles ── */}
        <View style={styles.tilesRow}>
          <View style={styles.tile}>
            <Text style={[styles.tileValue, { color: theme.primary }]}>{totalSessions}</Text>
            <Text style={styles.tileLabel}>Total meals</Text>
            <Text style={styles.tileDelta}>
              {formatDelta(totalSessions, prevTotalSessions, displayPeriod)} meals
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={[styles.tileValue, { color: '#FF9F0A' }]}>
              {todayCalories > 0 ? todayCalories : '—'}
            </Text>
            <Text style={styles.tileLabel}>Calories today</Text>
          </View>
        </View>
        <View style={styles.tilesRow}>
          <View style={styles.tile}>
            <Text style={styles.tileValue}>
              {avgDuration > 0 ? `${Math.round(avgDuration / 60000)}m` : '—'}
            </Text>
            <Text style={styles.tileLabel}>Avg meal time</Text>
            <Text style={styles.tileDelta}>
              {avgDuration > 0 && prevAvgDuration > 0
                ? `${formatDelta(
                    Math.round(avgDuration / 60000),
                    Math.round(prevAvgDuration / 60000),
                    displayPeriod,
                  )} min`
                : ''}
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={[styles.tileValue, { color: theme.primary }]}>{streaks.current}</Text>
            <Text style={styles.tileLabel}>Day streak</Text>
          </View>
        </View>

        {/* ── Calories over time chart ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calories over time</Text>
          {caloriesChart.data.some((d) => d > 0) ? (
            <LineChart
              data={{ labels: caloriesChart.labels, datasets: [{ data: caloriesChart.data }] }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={caloriesChartConfig}
              style={styles.chart}
              segments={caloriesSegments}
              formatYLabel={(v: string) => {
                const n = Number(v);
                return Number.isNaN(n) ? '' : String(Math.max(0, Math.round(n)));
              }}
              yAxisSuffix=""
              fromZero
              bezier
            />
          ) : (
            <View style={styles.chartEmpty}>
              <MaterialIcons name="local-fire-department" size={32} color={theme.textMuted} />
              <Text style={styles.chartEmptyText}>Log meals with calories to see trends</Text>
            </View>
          )}
          {totalCaloriesInRange > 0 && (
            <Text style={styles.chartSub}>
              Total {filter === 'Weekly' ? 'this week' : 'this month'}: {Math.round(totalCaloriesInRange)} cal
              {prevCalories > 0
                ? ` · ${formatDelta(Math.round(totalCaloriesInRange), Math.round(prevCalories), displayPeriod)} cal`
                : ''}
            </Text>
          )}
        </View>

        {/* ── Habit insights ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Habit insights</Text>
          {habitsData.map((h, i) => {
            const ratio = h.goal > 0 ? Math.min(h.current / h.goal, 1) : 0;
            return (
              <View key={i} style={styles.habitItem}>
                <View style={styles.habitHeader}>
                  <Text style={styles.habitLabel}>{h.label}</Text>
                  <Text style={styles.habitCount}>
                    {h.current}/{h.goal}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${ratio * 100}%`, backgroundColor: theme.primary },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Focus score ── */}
        <View style={styles.card}>
          <View style={styles.focusRow}>
            <MaterialIcons name="center-focus-strong" size={24} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle}>Focus score</Text>
              <Text style={styles.focusValue}>{focusScore}/100</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
    filterRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
    filterChip: {
      paddingHorizontal: 16,
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
      padding: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 10 },
    chart: { borderRadius: 12, marginTop: 4 },
    chartEmpty: { alignItems: 'center', paddingVertical: 30 },
    chartEmptyText: { color: theme.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' },
    chartSub: { color: theme.textSecondary, fontSize: 12, marginTop: 8, textAlign: 'center' },
    tilesRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    tile: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tileValue: { fontSize: 24, fontWeight: '800', color: theme.text },
    tileLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    tileDelta: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
    habitItem: { marginBottom: 14 },
    habitHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    habitLabel: { color: theme.text, fontSize: 13, fontWeight: '500', flex: 1, marginRight: 8 },
    habitCount: { color: theme.textSecondary, fontWeight: '700', fontSize: 13 },
    progressTrack: { height: 8, borderRadius: 8, backgroundColor: theme.chipBg, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 8 },
    focusRow: { flexDirection: 'row', alignItems: 'center' },
    focusValue: { fontSize: 28, fontWeight: '800', color: theme.primary },
  });
