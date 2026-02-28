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
import { useAuth } from '../state/AuthContext';
import {
  computeFocusScore,
  computeStreak,
} from '../utils/helpers';
import InteractiveLineChart from '../components/charts/InteractiveLineChart';
import { MealSession } from '../types/models';
import { supabase } from '../services/supabaseClient';
import ScreenHeader from '../components/common/ScreenHeader';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = ['Weekly', 'Monthly'] as const;
type FilterType = (typeof FILTERS)[number];

// ── Helpers ──────────────────────────────────

function getDaysForFilter(filter: FilterType): number {
  return filter === 'Weekly' ? 7 : 30;
}

interface AggregatedDayPoint {
  key: string;
  label: string;
  meals: number;
  calories: number;
  focusMinutes: number;
  lowDistraction: number;
}

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string | null;
  distraction_rating: number | null;
}

function getSafeSegments(maxValue: number): number {
  if (maxValue <= 0) return 1;
  return Math.min(Math.max(1, Math.ceil(maxValue)), 6);
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function addDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

function toLocalDayKey(dateLike: string | Date): string {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalLabel(dateLike: string | Date): string {
  const date = new Date(dateLike);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildDaySeries(dayCount: number, offsetDays = 0): AggregatedDayPoint[] {
  const now = new Date();
  return Array.from({ length: dayCount }, (_, index) => {
    const dayOffset = dayCount - 1 - index + offsetDays;
    const d = addDays(now, -dayOffset);
    return {
      key: toLocalDayKey(d),
      label: toLocalLabel(d),
      meals: 0,
      calories: 0,
      focusMinutes: 0,
      lowDistraction: 0,
    };
  });
}

function chartSeries(points: AggregatedDayPoint[], metric: keyof Pick<AggregatedDayPoint, 'meals' | 'calories' | 'focusMinutes' | 'lowDistraction'>) {
  const step = Math.max(1, Math.floor(points.length / 7));
  return {
    labels: points.map((p, i) => (i % step === 0 ? p.label : '')),
    data: points.map((p) => p[metric]),
  };
}

function buildUniqueIntegerFormatter(maxValue: number, segments: number): (v: string) => string {
  const safeMax = Math.max(0, Math.round(maxValue));
  const safeSegments = Math.max(1, segments);
  const rawTicks = Array.from({ length: safeSegments + 1 }, (_, i) => safeMax - (safeMax / safeSegments) * i);
  const labels: number[] = [];
  let previous = Number.POSITIVE_INFINITY;

  for (const tick of rawTicks) {
    let value = Math.round(tick);
    value = Math.min(value, previous - 1);
    value = Math.max(value, 0);
    labels.push(value);
    previous = value;
  }

  return (v: string) => {
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    let closestIndex = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < rawTicks.length; i++) {
      const diff = Math.abs(rawTicks[i] - n);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    return String(labels[closestIndex]);
  };
}

function formatDelta(cur: number, prev: number, unit: string): string {
  const diff = cur - prev;
  const sign = diff >= 0 ? '+' : '';
  return `vs last ${unit}: ${sign}${diff}`;
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('Weekly');
  const [currentPoints, setCurrentPoints] = useState<AggregatedDayPoint[]>(() => buildDaySeries(getDaysForFilter('Weekly')));
  const [prevPoints, setPrevPoints] = useState<AggregatedDayPoint[]>(() => buildDaySeries(getDaysForFilter('Weekly'), getDaysForFilter('Weekly')));

  const filteredLocal = useMemo(() => {
    const days = getDaysForFilter(filter);
    const rangeStart = startOfLocalDay(addDays(new Date(), -(days - 1))).getTime();
    return sessions.filter((s) => {
      if (!s.endedAt) return false;
      const startedAt = new Date(s.startedAt).getTime();
      return startedAt >= rangeStart;
    });
  }, [sessions, filter]);

  const localCaloriesBySessionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) {
      const localCalories = session.preNutrition?.estimated_calories;
      if (localCalories && localCalories > 0) {
        map.set(session.id, Math.round(localCalories));
      }
    }
    return map;
  }, [sessions]);

  useEffect(() => {
    let cancelled = false;

    const loadAggregates = async () => {
      const days = getDaysForFilter(filter);
      const nextCurrent = buildDaySeries(days);
      const nextPrev = buildDaySeries(days, days);

      const currentByKey = new Map(nextCurrent.map((point) => [point.key, point]));
      const prevByKey = new Map(nextPrev.map((point) => [point.key, point]));

      if (!user?.id) {
        if (!cancelled) {
          setCurrentPoints(nextCurrent);
          setPrevPoints(nextPrev);
        }
        return;
      }

      const rangeStart = startOfLocalDay(addDays(new Date(), -(days * 2 - 1)));
      const rangeEnd = endOfLocalDay(new Date());

      const { data: sessionRows, error: sessionError } = await supabase
        .from('meal_sessions')
        .select('id, started_at, ended_at, status, distraction_rating')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('ended_at', 'is', null)
        .gte('started_at', rangeStart.toISOString())
        .lte('started_at', rangeEnd.toISOString());

      if (sessionError || !sessionRows) {
        if (!cancelled) {
          setCurrentPoints(nextCurrent);
          setPrevPoints(nextPrev);
        }
        return;
      }

      const typedRows = sessionRows as SessionRow[];
      const sessionIds = typedRows.map((row) => row.id);
      const nutritionCaloriesBySessionId = new Map<string, number>();

      if (sessionIds.length > 0) {
        const { data: nutritionRows } = await supabase
          .from('meal_nutrition')
          .select('meal_session_id, estimated_calories')
          .eq('user_id', user.id)
          .in('meal_session_id', sessionIds);

        for (const row of nutritionRows ?? []) {
          const sessionId = row.meal_session_id as string | null;
          const calories = row.estimated_calories as number | null;
          if (!sessionId || !calories || calories <= 0) continue;
          nutritionCaloriesBySessionId.set(
            sessionId,
            (nutritionCaloriesBySessionId.get(sessionId) ?? 0) + Math.round(calories),
          );
        }
      }

      for (const row of typedRows) {
        const dayKey = toLocalDayKey(row.started_at);
        const target = currentByKey.get(dayKey) ?? prevByKey.get(dayKey);
        if (!target) continue;

        target.meals += 1;

        const startedMs = new Date(row.started_at).getTime();
        const endedMs = row.ended_at ? new Date(row.ended_at).getTime() : startedMs;
        const minutes = Math.max(0, Math.round((endedMs - startedMs) / 60000));
        target.focusMinutes += minutes;

        if (typeof row.distraction_rating === 'number' && row.distraction_rating <= 2) {
          target.lowDistraction += 1;
        }

        const calories = nutritionCaloriesBySessionId.get(row.id) ?? localCaloriesBySessionId.get(row.id) ?? 0;
        if (calories > 0) {
          target.calories += calories;
        }
      }

      if (!cancelled) {
        setCurrentPoints(nextCurrent);
        setPrevPoints(nextPrev);
      }
    };

    loadAggregates().catch(() => {
      if (!cancelled) {
        const days = getDaysForFilter(filter);
        setCurrentPoints(buildDaySeries(days));
        setPrevPoints(buildDaySeries(days, days));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filter, user?.id, localCaloriesBySessionId]);

  // ── Stats ──
  const totalSessions = currentPoints.reduce((sum, point) => sum + point.meals, 0);
  const prevTotalSessions = prevPoints.reduce((sum, point) => sum + point.meals, 0);
  const totalFocusMinutes = currentPoints.reduce((sum, point) => sum + point.focusMinutes, 0);
  const prevTotalFocusMinutes = prevPoints.reduce((sum, point) => sum + point.focusMinutes, 0);
  const avgDuration = totalSessions > 0 ? (totalFocusMinutes / totalSessions) * 60000 : 0;
  const prevAvgDuration = prevTotalSessions > 0 ? (prevTotalFocusMinutes / prevTotalSessions) * 60000 : 0;
  const focusScore = computeFocusScore(filteredLocal);
  const streaks = computeStreak(sessions);

  // ── Calories ──
  const totalCaloriesInRange = currentPoints.reduce((sum, point) => sum + point.calories, 0);
  const prevCalories = prevPoints.reduce((sum, point) => sum + point.calories, 0);

  const displayPeriod = filter === 'Weekly' ? 'week' : 'month';

  // ── Chart data ──
  const mealsChart = useMemo(() => chartSeries(currentPoints, 'meals'), [currentPoints]);
  const caloriesChart = useMemo(() => chartSeries(currentPoints, 'calories'), [currentPoints]);
  const weeklyCalories = filter === 'Weekly'
    ? totalCaloriesInRange
    : Math.round(totalCaloriesInRange / Math.max(1, getDaysForFilter(filter) / 7));
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
  const mealsYFormatter = useMemo(() => buildUniqueIntegerFormatter(mealsMax, mealsSegments), [mealsMax, mealsSegments]);
  const caloriesYFormatter = useMemo(() => buildUniqueIntegerFormatter(caloriesMax, caloriesSegments), [caloriesMax, caloriesSegments]);

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
  const lowDistractionCount = currentPoints.reduce((sum, point) => sum + point.lowDistraction, 0);
  const avgMealMin = avgDuration > 0 ? Math.round(avgDuration / 60000) : 0;
  const habitsData = [
    { label: 'Meals tracked', current: totalSessions, goal: filter === 'Weekly' ? 21 : 90 },
    { label: 'Low-distraction meals', current: lowDistractionCount, goal: filter === 'Weekly' ? 14 : 60 },
    { label: 'Avg meal length (min)', current: avgMealMin, goal: 20 },
  ];

  // ── Suggestions ──
  const getSuggestions = () => {
    const suggestions: string[] = [];
    if (!filteredLocal.length) return ["Log your first meal to get personalized tips!"];

    const missingCals = filteredLocal.filter(s => !s.preNutrition?.estimated_calories).length;
    if (missingCals > filteredLocal.length * 0.5) {
      suggestions.push("Try scanning at least 1 meal per day to stay on top of your calories.");
    }

    const lateMeals = filteredLocal.filter(s => new Date(s.startedAt).getHours() >= 21).length;
    if (lateMeals > filteredLocal.length * 0.25) {
      suggestions.push("Try eating dinner a bit earlier to reduce late-night snacking.");
    }

    if (focusScore < 70) {
       suggestions.push("Try taking shorter meals and keep your phone locked to improve focus.");
    }

    if (suggestions.length === 0) {
      suggestions.push("You're doing great! Keep building those healthy habits.");
    }

    return suggestions;
  };
  const activeSuggestions = getSuggestions();

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

        {/* ── Meals per week chart ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meals per week</Text>
          {mealsChart.data.some((d) => d > 0) ? (
            <InteractiveLineChart
              data={{ labels: mealsChart.labels, datasets: [{ data: mealsChart.data }] }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={chartConfig}
              style={styles.chart}
              segments={mealsSegments}
              formatYLabel={mealsYFormatter}
              yAxisSuffix=""
              fromZero
              bezier
              metricLabel="meals"
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
              {weeklyCalories > 0 ? Math.round(weeklyCalories) : '—'}
            </Text>
            <Text style={styles.tileLabel}>Calories per week</Text>
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

        {/* ── Calories per week chart ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calories per week</Text>
          {caloriesChart.data.some((d) => d > 0) ? (
            <InteractiveLineChart
              data={{ labels: caloriesChart.labels, datasets: [{ data: caloriesChart.data }] }}
              width={SCREEN_WIDTH - 72}
              height={180}
              chartConfig={caloriesChartConfig}
              style={styles.chart}
              segments={caloriesSegments}
              formatYLabel={caloriesYFormatter}
              yAxisSuffix=""
              fromZero
              bezier
              metricLabel="cal"
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

        {/* ── Eat better suggestions ── */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialIcons name="lightbulb-outline" size={22} color={theme.primary} />
            <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8 }]}>Eat better</Text>
          </View>
          {activeSuggestions.map((sug, i) => (
            <View key={i} style={styles.suggestionRow}>
              <View style={[styles.suggestionDot, { backgroundColor: theme.primary }]} />
              <Text style={styles.suggestionText}>{sug}</Text>
            </View>
          ))}
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
    suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
    suggestionDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 10 },
    suggestionText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
  });
