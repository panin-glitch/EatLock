import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import {
  computeMacroTargetsFromCalories,
  computeFocusScore,
  computeStreak,
} from '../utils/helpers';
import InteractiveLineChart from '../components/charts/InteractiveLineChart';
import { DEFAULT_DAILY_CALORIE_GOAL, DEFAULT_MACRO_SPLIT } from '../types/models';
import ScreenHeader from '../components/common/ScreenHeader';
import { fetchRemoteUserSettings } from '../services/userSettingsService';
import { enrichMicros } from '../services/microsService';
import {
  buildMonthlyWeekBuckets,
  buildRollingDailyBuckets,
  buildWeeklyDayBuckets,
  endOfLocalDay,
  startOfLocalDay,
  toValidDate,
  type StatsBucketPoint,
} from '../utils/statsBuckets';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = ['Weekly', 'Monthly'] as const;
type FilterType = (typeof FILTERS)[number];
const tadlockSleepingImg = require('../../assets/tadlocksleeping.png');

// ── Helpers ──────────────────────────────────

function getDaysForFilter(filter: FilterType): number {
  return filter === 'Weekly' ? 7 : 30;
}

function getSafeSegments(maxValue: number): number {
  if (maxValue <= 0) return 1;
  return Math.min(Math.max(1, Math.ceil(maxValue)), 6);
}
function chartSeries(points: StatsBucketPoint[], metric: keyof Pick<StatsBucketPoint, 'meals' | 'calories' | 'focusMinutes' | 'lowDistraction'>) {
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
  const { sessions, activeSession, settings } = useAppState();
  const [filter, setFilter] = useState<FilterType>('Weekly');
  const periodDays = getDaysForFilter(filter);
  const sessionsForStats = useMemo(
    () => (activeSession ? [...sessions, activeSession] : sessions),
    [activeSession, sessions],
  );

  const currentPoints = useMemo(
    () => buildRollingDailyBuckets(sessionsForStats, periodDays),
    [periodDays, sessionsForStats],
  );
  const prevPoints = useMemo(
    () => buildRollingDailyBuckets(sessionsForStats, periodDays, periodDays),
    [periodDays, sessionsForStats],
  );
  const weeklyChartPoints = useMemo(
    () => buildWeeklyDayBuckets(sessionsForStats),
    [sessionsForStats],
  );
  const monthlyChartPoints = useMemo(
    () => buildMonthlyWeekBuckets(sessionsForStats),
    [sessionsForStats],
  );

  const filteredLocal = useMemo(() => {
    const rangeStart = startOfLocalDay(new Date(Date.now() - (periodDays - 1) * 24 * 60 * 60 * 1000)).getTime();
    const rangeEnd = endOfLocalDay(new Date()).getTime();
    return sessionsForStats.filter((s) => {
      if (s.status === 'ACTIVE' || s.status === 'INCOMPLETE') return false;
      const eventMs = (toValidDate(s.endedAt) ?? toValidDate(s.startedAt))?.getTime();
      return typeof eventMs === 'number' && eventMs >= rangeStart && eventMs <= rangeEnd;
    });
  }, [sessionsForStats, periodDays]);

  const chartPoints = useMemo(() => {
    return filter === 'Weekly' ? weeklyChartPoints : monthlyChartPoints;
  }, [filter, monthlyChartPoints, weeklyChartPoints]);

  // ── Stats ──
  const totalSessions = chartPoints.reduce((sum, point) => sum + point.meals, 0);
  const prevTotalSessions = prevPoints.reduce((sum, point) => sum + point.meals, 0);
  const totalFocusMinutes = chartPoints.reduce((sum, point) => sum + point.focusMinutes, 0);
  const prevTotalFocusMinutes = prevPoints.reduce((sum, point) => sum + point.focusMinutes, 0);
  const avgDuration = totalSessions > 0 ? (totalFocusMinutes / totalSessions) * 60000 : 0;
  const prevAvgDuration = prevTotalSessions > 0 ? (prevTotalFocusMinutes / prevTotalSessions) * 60000 : 0;
  const focusScore = computeFocusScore(filteredLocal);
  const streaks = computeStreak(sessionsForStats);

  const macroKnownCounts = useMemo(
    () => ({
      protein: filteredLocal.filter((s) => s.preNutrition?.protein_g != null).length,
      carbs: filteredLocal.filter((s) => s.preNutrition?.carbs_g != null).length,
      fat: filteredLocal.filter((s) => s.preNutrition?.fat_g != null).length,
    }),
    [filteredLocal],
  );

  const macroTotalsInRange = useMemo(
    () => ({
      protein: Math.round(filteredLocal.reduce((sum, s) => sum + (s.preNutrition?.protein_g ?? 0), 0)),
      carbs: Math.round(filteredLocal.reduce((sum, s) => sum + (s.preNutrition?.carbs_g ?? 0), 0)),
      fat: Math.round(filteredLocal.reduce((sum, s) => sum + (s.preNutrition?.fat_g ?? 0), 0)),
    }),
    [filteredLocal],
  );

  const hasEnoughMacroData = (knownCount: number) => filteredLocal.length > 0 && knownCount / filteredLocal.length >= 0.5;
  const macroCoveragePoor =
    !hasEnoughMacroData(macroKnownCounts.protein) ||
    !hasEnoughMacroData(macroKnownCounts.carbs) ||
    !hasEnoughMacroData(macroKnownCounts.fat);

  // ── Micros toggle + totals ──
  const [microsEnabled, setMicrosEnabled] = useState(false);
  const [enrichingMicros, setEnrichingMicros] = useState(false);

  useEffect(() => {
    fetchRemoteUserSettings().then((s) => setMicrosEnabled(s.micronutrients_enabled)).catch(() => {});
  }, []);

  const microsTotals = useMemo(() => {
    if (!microsEnabled) return null;
    let fiber = 0, sugar = 0, sodium = 0, satFat = 0;
    let hasFiber = 0, hasSugar = 0, hasSodium = 0, hasSatFat = 0;
    let missingMicros = 0;

    for (const s of filteredLocal) {
      const n = s.preNutrition;
      if (!n) continue;
      const hasSome = n.fiber_g != null || n.sugar_g != null || n.sodium_mg != null || n.saturated_fat_g != null;
      if (!hasSome) { missingMicros++; continue; }
      if (n.fiber_g != null) { fiber += n.fiber_g; hasFiber++; }
      if (n.sugar_g != null) { sugar += n.sugar_g; hasSugar++; }
      if (n.sodium_mg != null) { sodium += n.sodium_mg; hasSodium++; }
      if (n.saturated_fat_g != null) { satFat += n.saturated_fat_g; hasSatFat++; }
    }

    return {
      fiber: Math.round(fiber),
      sugar: Math.round(sugar),
      sodium: Math.round(sodium),
      satFat: Math.round(satFat * 10) / 10,
      hasFiber, hasSugar, hasSodium, hasSatFat,
      missingMicros,
      totalMeals: filteredLocal.length,
    };
  }, [filteredLocal, microsEnabled]);

  const handleBatchEnrich = useCallback(async () => {
    setEnrichingMicros(true);
    try {
      const missing = filteredLocal.filter((s) => {
        const n = s.preNutrition;
        return n && n.fiber_g == null && n.sugar_g == null && n.sodium_mg == null && n.saturated_fat_g == null;
      });
      let enriched = 0;
      for (const s of missing.slice(0, 10)) {
        try {
          await enrichMicros(s.id);
          enriched++;
        } catch { /* skip individual failures */ }
      }
      Alert.alert('Done', `Enriched ${enriched} of ${missing.length} meals. Refresh to see updated totals.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Enrichment failed');
    } finally {
      setEnrichingMicros(false);
    }
  }, [filteredLocal]);

  const dailyCalorieGoal = settings.nutritionGoals?.dailyCalorieGoal ?? DEFAULT_DAILY_CALORIE_GOAL;
  const macroSplit = settings.nutritionGoals?.macroSplit ?? DEFAULT_MACRO_SPLIT;
  const macroTargets = useMemo(() => computeMacroTargetsFromCalories(dailyCalorieGoal, macroSplit), [dailyCalorieGoal, macroSplit]);
  const periodProteinGoal = macroTargets.proteinGoalG * periodDays;

  // ── Calories ──
  const totalCaloriesInRange = chartPoints.reduce((sum, point) => sum + point.calories, 0);
  const prevCalories = prevPoints.reduce((sum, point) => sum + point.calories, 0);
  const hasMealsData = totalSessions > 0;
  const hasCaloriesData = totalCaloriesInRange > 0;

  const displayPeriod = filter === 'Weekly' ? 'week' : 'month';

  // ── Chart data ──
  const mealsChart = useMemo(() => chartSeries(chartPoints, 'meals'), [chartPoints]);
  const caloriesChart = useMemo(() => chartSeries(chartPoints, 'calories'), [chartPoints]);
  const periodCalories = totalCaloriesInRange;
  const mealsDataMax = Math.max(0, ...mealsChart.data);
  const mealsAxisMax = Math.max(1, mealsDataMax) + 1;
  const mealsSegments = Math.min(Math.max(1, mealsAxisMax), 6);
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
  const mealsYFormatter = useMemo(() => buildUniqueIntegerFormatter(mealsAxisMax, mealsSegments), [mealsAxisMax, mealsSegments]);
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

    if (macroCoveragePoor) {
      suggestions.push("Log meals with macro details to track protein, carbs, and fat accurately.");
    }

    if (!macroCoveragePoor && periodProteinGoal > 0 && macroTotalsInRange.protein < periodProteinGoal * 0.6) {
      suggestions.push("Protein is trending below your goal—consider adding a high-protein meal option.");
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
          <Text style={styles.cardTitle}>Meals per {displayPeriod}</Text>
          {hasMealsData ? (
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
              fromNumber={mealsAxisMax}
              bezier
              metricLabel="meals"
            />
          ) : (
            <View style={styles.chartEmpty}>
              <Image source={tadlockSleepingImg} style={styles.chartEmptyImage} resizeMode="contain" />
              <Text style={styles.chartEmptyText}>Tad slept off waiting for you</Text>
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
              {Math.round(periodCalories)}
            </Text>
            <Text style={styles.tileLabel}>Calories per {displayPeriod}</Text>
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
          <Text style={styles.cardTitle}>Calories per {displayPeriod}</Text>
          {hasCaloriesData ? (
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
              <Image source={tadlockSleepingImg} style={styles.chartEmptyImage} resizeMode="contain" />
              <Text style={styles.chartEmptyText}>Tad slept off waiting for you</Text>
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

        {/* ── Micronutrients daily totals ── */}
        {microsEnabled && microsTotals && microsTotals.totalMeals > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <MaterialIcons name="science" size={20} color={theme.primary} />
              <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8 }]}>
                Micronutrients ({filter === 'Weekly' ? 'week' : 'month'})
              </Text>
            </View>

            <View style={styles.tilesRow}>
              <View style={[styles.tile, { marginTop: 0 }]}>
                <Text style={[styles.tileValue, { color: '#34C759', fontSize: 20 }]}>{microsTotals.fiber}g</Text>
                <Text style={styles.tileLabel}>Fiber</Text>
              </View>
              <View style={[styles.tile, { marginTop: 0 }]}>
                <Text style={[styles.tileValue, { color: '#AF52DE', fontSize: 20 }]}>{microsTotals.sugar}g</Text>
                <Text style={styles.tileLabel}>Sugar</Text>
              </View>
            </View>
            <View style={[styles.tilesRow, { marginTop: 8 }]}>
              <View style={[styles.tile, { marginTop: 0 }]}>
                <Text style={[styles.tileValue, { color: '#5AC8FA', fontSize: 20 }]}>{microsTotals.sodium}mg</Text>
                <Text style={styles.tileLabel}>Sodium</Text>
              </View>
              <View style={[styles.tile, { marginTop: 0 }]}>
                <Text style={[styles.tileValue, { color: '#FF6482', fontSize: 20 }]}>{microsTotals.satFat}g</Text>
                <Text style={styles.tileLabel}>Sat Fat</Text>
              </View>
            </View>

            {microsTotals.missingMicros > 0 && (
              <View style={[styles.microsBanner, { borderColor: theme.border, backgroundColor: theme.chipBg }]}>
                <Text style={[styles.microsBannerText, { color: theme.textSecondary }]}>
                  {microsTotals.missingMicros} meal{microsTotals.missingMicros > 1 ? 's' : ''} missing micros
                </Text>
                {enrichingMicros ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <TouchableOpacity onPress={handleBatchEnrich}>
                    <Text style={[styles.microsBannerAction, { color: theme.primary }]}>Compute</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

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
    chartEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, minHeight: 180 },
    chartEmptyImage: { width: 112, height: 112 },
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
    microsBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
    },
    microsBannerText: { fontSize: 13, fontWeight: '500' },
    microsBannerAction: { fontSize: 13, fontWeight: '700' },
  });
