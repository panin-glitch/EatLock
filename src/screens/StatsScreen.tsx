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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Line, Path, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { MACRO_COLORS } from '../theme/macroColors';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  computeMacroTargetsFromCalories,
  computeStreak,
  getSessionDuration,
} from '../utils/helpers';
import { DEFAULT_DAILY_CALORIE_GOAL, DEFAULT_MACRO_SPLIT } from '../types/models';
import { fetchRemoteUserSettings } from '../services/userSettingsService';
import {
  buildRollingMonthlyBuckets,
  buildMonthlyWeekBuckets,
  buildRollingDailyBuckets,
  endOfLocalDay,
  startOfLocalDay,
  toValidDate,
  type StatsBucketPoint,
} from '../utils/statsBuckets';
import { languageToLocale } from '../utils/locale';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = ['Weekly', 'Monthly', 'Quarterly', 'SemiAnnual'] as const;
type FilterType = (typeof FILTERS)[number];
const DISPLAY_FILTERS: Array<{ label: string; value: FilterType | null }> = [
  { label: 'Week', value: 'Weekly' },
  { label: 'Month', value: 'Monthly' },
  { label: '3 M', value: 'Quarterly' },
  { label: '6 M', value: 'SemiAnnual' },
];
const tadlockSleepingImg = require('../../assets/tadlocksleeping.png');

// ── Helpers ──────────────────────────────────

function getDaysForFilter(filter: FilterType): number {
  if (filter === 'Weekly') return 7;
  if (filter === 'Monthly') return 30;
  if (filter === 'Quarterly') return 90;
  return 180;
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

function buildSmoothPath(values: number[], width: number, height: number): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = ((max - value) / range) * (height - 12) + 6;
    return { x, y };
  });

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export default function StatsScreen() {
  const { theme, themeName } = useTheme();
  const navigation = useNavigation<any>();
  const { sessions, activeSession, settings } = useAppState();
  const localeTag = useMemo(() => languageToLocale(settings.language), [settings.language]);
  const [filter, setFilter] = useState<FilterType>('Weekly');
  const periodDays = getDaysForFilter(filter);
  const sessionsForStats = useMemo(
    () => (activeSession ? [...sessions, activeSession] : sessions),
    [activeSession, sessions],
  );

  const weeklyChartPoints = useMemo(
    () => buildRollingDailyBuckets(sessionsForStats, 7),
    [sessionsForStats],
  );
  const weeklyCenteredDistractionPoints = useMemo(
    () => buildRollingDailyBuckets(sessionsForStats, 7, -3),
    [sessionsForStats],
  );
  const monthlyChartPoints = useMemo(
    () => buildMonthlyWeekBuckets(sessionsForStats).map((point, index) => ({
      ...point,
      key: `W${index + 1}`,
      label: `W${index + 1}`,
    })),
    [sessionsForStats],
  );
  const quarterlyChartPoints = useMemo(
    () => buildRollingMonthlyBuckets(sessionsForStats, 3, localeTag),
    [localeTag, sessionsForStats],
  );
  const semiAnnualChartPoints = useMemo(
    () => buildRollingMonthlyBuckets(sessionsForStats, 6, localeTag),
    [localeTag, sessionsForStats],
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

  const weeklyCompletedDurationsMin = useMemo(() => {
    const rangeStart = startOfLocalDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)).getTime();
    const rangeEnd = endOfLocalDay(new Date()).getTime();

    return sessionsForStats
      .filter((session) => {
        if (!session.endedAt) return false;
        if (session.status === 'ACTIVE' || session.status === 'INCOMPLETE') return false;
        const eventMs = (toValidDate(session.endedAt) ?? toValidDate(session.startedAt))?.getTime();
        return typeof eventMs === 'number' && eventMs >= rangeStart && eventMs <= rangeEnd;
      })
      .map((session) => Math.max(1, Math.round(getSessionDuration(session) / 60000)));
  }, [sessionsForStats]);

  const chartPoints = useMemo(() => {
    if (filter === 'Weekly') return weeklyChartPoints;
    if (filter === 'Monthly') return monthlyChartPoints;
    if (filter === 'Quarterly') return quarterlyChartPoints;
    return semiAnnualChartPoints;
  }, [filter, monthlyChartPoints, quarterlyChartPoints, semiAnnualChartPoints, weeklyChartPoints]);

  // ── Stats ──
  const totalSessions = chartPoints.reduce((sum, point) => sum + point.meals, 0);
  const streaks = computeStreak(sessionsForStats);
  const totalFocusMinutes = chartPoints.reduce((sum, point) => sum + point.focusMinutes, 0);
  const avgDuration = totalSessions > 0 ? (totalFocusMinutes / totalSessions) * 60000 : 0;

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

  const refreshMicrosToggle = useCallback(() => {
    fetchRemoteUserSettings().then((s) => setMicrosEnabled(s.micronutrients_enabled)).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshMicrosToggle();
      return undefined;
    }, [refreshMicrosToggle]),
  );

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

  const dailyCalorieGoal = settings.nutritionGoals?.dailyCalorieGoal ?? DEFAULT_DAILY_CALORIE_GOAL;
  const macroSplit = settings.nutritionGoals?.macroSplit ?? DEFAULT_MACRO_SPLIT;
  const macroTargets = useMemo(() => computeMacroTargetsFromCalories(dailyCalorieGoal, macroSplit), [dailyCalorieGoal, macroSplit]);
  const periodProteinGoal = macroTargets.proteinGoalG * periodDays;

  // ── Calories ──
  const totalCaloriesInRange = chartPoints.reduce((sum, point) => sum + point.calories, 0);
  const hasMealsData = totalSessions > 0;
  const displayPeriod = filter === 'Weekly' ? 'week' : filter === 'Monthly' ? 'month' : filter === 'Quarterly' ? '3 months' : '6 months';

  const distractionPoints = useMemo(
    () => (filter === 'Weekly' ? weeklyCenteredDistractionPoints : chartPoints),
    [chartPoints, filter, weeklyCenteredDistractionPoints],
  );

  const distractionSeries = useMemo(() => {
    const values = distractionPoints.map((point) => point.lowDistraction);
    if (values.length === 0) return [40, 35, 28, 22, 18, 14, 12];
    return values;
  }, [distractionPoints]);

  const distractionPath = useMemo(
    () => buildSmoothPath(distractionSeries, 400, 150),
    [distractionSeries],
  );

  const currentLowIndex = filter === 'Weekly'
    ? Math.min(3, Math.max(0, distractionSeries.length - 1))
    : Math.max(0, distractionSeries.length - 1);
  const currentLowValue = distractionSeries[currentLowIndex] ?? 0;
  const lowX = distractionSeries.length > 1 ? (currentLowIndex / (distractionSeries.length - 1)) * 400 : 200;
  const distractionMax = Math.max(...distractionSeries, 1);
  const distractionMin = Math.min(...distractionSeries, 0);
  const distractionRange = Math.max(1, distractionMax - distractionMin);
  const lowY = ((distractionMax - currentLowValue) / distractionRange) * (150 - 12) + 6;
  const xAxisLabels = useMemo(() => {
    if (filter === 'Weekly') {
      const labels: string[] = [];
      for (let offset = 3; offset >= -3; offset--) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        labels.push(date.toLocaleDateString(localeTag, { weekday: 'short' }));
      }
      return labels;
    }
    if (filter === 'Monthly') {
      return ['W1', 'W2', 'W3', 'W4', 'W5'];
    }
    return chartPoints.map((point) => point.label);
  }, [chartPoints, filter, localeTag]);

  const hasWeeklyDurationData = weeklyCompletedDurationsMin.length > 0;
  const fastestMin = hasWeeklyDurationData ? Math.min(...weeklyCompletedDurationsMin) : 15;
  const avgMin = hasWeeklyDurationData
    ? Math.round(weeklyCompletedDurationsMin.reduce((sum, value) => sum + value, 0) / weeklyCompletedDurationsMin.length)
    : 30;
  const longestMin = hasWeeklyDurationData ? Math.max(...weeklyCompletedDurationsMin) : 45;
  const durationTotal = Math.max(1, fastestMin + avgMin + longestMin);

  const weeklyCaloriesGoal = Math.max(1, dailyCalorieGoal * periodDays);
  const caloriesRingRatio = Math.min(totalCaloriesInRange / weeklyCaloriesGoal, 1);
  const fatRingRatio = Math.min(macroTotalsInRange.fat / Math.max(1, macroTargets.fatGoalG * periodDays), 1);
  const donutSize = 128;
  const donutStroke = 8;
  const donutRadius = 56;
  const donutCircumference = 2 * Math.PI * donutRadius;

  const avgProtein = periodDays > 0 ? Math.round(macroTotalsInRange.protein / periodDays) : 0;
  const avgCarbs = periodDays > 0 ? Math.round(macroTotalsInRange.carbs / periodDays) : 0;
  const avgFat = periodDays > 0 ? Math.round(macroTotalsInRange.fat / periodDays) : 0;

  const microFiber = microsTotals?.fiber ?? 0;
  const microSugar = microsTotals?.sugar ?? 0;
  const microSodium = microsTotals?.sodium ?? 0;
  const microWater = Math.max(0, Math.round((filteredLocal.length * 0.6) * 10) / 10);

  const phoneDayLabels = useMemo(() => {
    const labels: string[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      labels.push(date.toLocaleDateString(localeTag, { weekday: 'short' }));
    }
    return labels;
  }, [localeTag]);
  const phoneUsageValues = useMemo(() => [0, 0, 0, 0, 0, 0, 0], []);
  const maxPhoneUsage = Math.max(...phoneUsageValues, 0);
  const maxPhoneIndex = -1;

  const styles = makeStyles(theme);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Progress</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <MaterialIcons name="ios-share" size={19} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('Settings')}>
            <MaterialIcons name="settings" size={19} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterRow}>
          {DISPLAY_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.filterChip, f.value != null && filter === f.value && styles.filterChipSelected]}
              onPress={() => {
                if (f.value != null) setFilter(f.value);
              }}
              disabled={f.value == null}
            >
              <Text style={[styles.filterText, f.value != null && filter === f.value && styles.filterTextSelected]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.filterMoreBtn}>
            <MaterialIcons name="unfold-more" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal Distraction</Text>
          <Text style={styles.cardSub}>Lower is better</Text>
          {hasMealsData ? (
            <View style={styles.distractionChartWrap}>
              <View style={styles.yAxisLabelsCol}>
                <Text style={styles.yAxisLabel}>HIGH {Math.round(distractionMax)}%</Text>
                <Text style={styles.yAxisLabel}>LOW {Math.round(distractionMin)}%</Text>
              </View>
              <Svg width="100%" height="100%" viewBox="0 0 400 150">
                <Line x1="0" y1="0" x2="400" y2="0" stroke={theme.border} strokeWidth="1" opacity={0.6} />
                <Line x1="0" y1="50" x2="400" y2="50" stroke={theme.border} strokeWidth="1" opacity={0.6} />
                <Line x1="0" y1="100" x2="400" y2="100" stroke={theme.border} strokeWidth="1" opacity={0.6} />
                <Line x1="0" y1="150" x2="400" y2="150" stroke={theme.border} strokeWidth="1" opacity={0.6} />
                <Path d={distractionPath} stroke={MACRO_COLORS.protein} strokeWidth="4" fill="none" />
                <Circle cx={lowX} cy={lowY} r="6" fill={MACRO_COLORS.protein} />
                <Circle cx={lowX} cy={lowY} r="10" stroke={MACRO_COLORS.protein} strokeWidth="2" fill="none" opacity={0.3} />
              </Svg>
              <View style={[styles.lowBadge, { left: `${Math.max(8, Math.min(78, (lowX / 400) * 100 - 12))}%` }]}>
                <Text style={styles.lowBadgeText}>CURRENT LOW {Math.round(currentLowValue)}%</Text>
              </View>
              <View style={styles.axisLabelsRow}>
                {xAxisLabels.map((label, index) => (
                  <Text key={`${label}-${index}`} style={styles.axisLabel}>{label}</Text>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.chartEmpty}>
              <Image source={tadlockSleepingImg} style={styles.chartEmptyImage} resizeMode="contain" />
              <Text style={styles.chartEmptyText}>Tad slept off waiting for you</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal Duration (Last 7 Days)</Text>
          {hasWeeklyDurationData ? (
            <>
              <View style={styles.durationTrack}>
                <View style={[styles.durationSegment, { width: `${(fastestMin / durationTotal) * 100}%`, backgroundColor: theme.primary }]} />
                <View style={[styles.durationSegment, { width: `${(avgMin / durationTotal) * 100}%`, backgroundColor: MACRO_COLORS.fat }]} />
                <View style={[styles.durationSegment, { width: `${(longestMin / durationTotal) * 100}%`, backgroundColor: '#FACC15' }]} />
              </View>
              <View style={styles.durationStatsRow}>
                <View style={styles.durationStatItem}>
                  <Text style={styles.durationValue}>{fastestMin}m</Text>
                  <Text style={styles.durationCaption}>Fastest</Text>
                </View>
                <View style={styles.durationStatItem}>
                  <Text style={styles.durationValue}>{avgMin}m</Text>
                  <Text style={styles.durationCaption}>Average</Text>
                </View>
                <View style={styles.durationStatItem}>
                  <Text style={styles.durationValue}>{longestMin}m</Text>
                  <Text style={styles.durationCaption}>Longest</Text>
                </View>
              </View>
              <Text style={styles.durationFootnote}>based on completed meals in the last 7 days</Text>
            </>
          ) : (
            <View style={styles.chartEmpty}>
              <Image source={tadlockSleepingImg} style={styles.chartEmptyImage} resizeMode="contain" />
              <Text style={styles.chartEmptyText}>Tad slept off waiting for you</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.weeklyLabel}>WEEKLY OVERVIEW</Text>
          <View style={styles.weeklyRow}>
            <View style={styles.donutWrap}>
              <Svg width={donutSize} height={donutSize} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle
                  cx={donutSize / 2}
                  cy={donutSize / 2}
                  r={donutRadius}
                  stroke={theme.chipBg}
                  strokeWidth={donutStroke}
                  fill="none"
                />
                <Circle
                  cx={donutSize / 2}
                  cy={donutSize / 2}
                  r={donutRadius}
                  stroke={MACRO_COLORS.protein}
                  strokeWidth={donutStroke}
                  strokeLinecap="round"
                  strokeDasharray={`${donutCircumference}`}
                  strokeDashoffset={donutCircumference * (1 - caloriesRingRatio)}
                  fill="none"
                />
                <Circle
                  cx={donutSize / 2}
                  cy={donutSize / 2}
                  r={donutRadius}
                  stroke={MACRO_COLORS.fat}
                  strokeWidth={donutStroke}
                  strokeLinecap="round"
                  strokeDasharray={`${donutCircumference}`}
                  strokeDashoffset={donutCircumference * (1 - fatRingRatio)}
                  fill="none"
                />
              </Svg>
              <View style={styles.donutCenter}>
                <Text style={styles.donutValue}>{Math.round(totalCaloriesInRange / Math.max(1, periodDays))}</Text>
                <Text style={styles.donutCaption}>AVG CAL</Text>
                <View style={styles.loggedBadge}>
                  <Text style={styles.loggedBadgeText}>{Math.round(totalCaloriesInRange)} Logged</Text>
                </View>
              </View>
            </View>

            <View style={styles.macroOverviewCol}>
              <View style={[styles.macroOverviewCard, { borderLeftColor: MACRO_COLORS.protein }]}>
                <Text style={styles.macroOverviewTitle}>Average Protein</Text>
                <Text style={[styles.macroOverviewValue, { color: MACRO_COLORS.protein }]}>
                  {avgProtein}/{macroTargets.proteinGoalG}g
                </Text>
              </View>
              <View style={[styles.macroOverviewCard, { borderLeftColor: MACRO_COLORS.carbs }]}>
                <Text style={styles.macroOverviewTitle}>Average Carbs</Text>
                <Text style={[styles.macroOverviewValue, { color: MACRO_COLORS.carbs }]}>
                  {avgCarbs}/{macroTargets.carbsGoalG}g
                </Text>
              </View>
              <View style={[styles.macroOverviewCard, { borderLeftColor: MACRO_COLORS.fat }]}>
                <Text style={styles.macroOverviewTitle}>Average Fat</Text>
                <Text style={[styles.macroOverviewValue, { color: MACRO_COLORS.fat }]}>
                  {avgFat}/{macroTargets.fatGoalG}g
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Meals Logged</Text>
            <Text style={styles.tileValue}>{totalSessions}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Streak Days 🔥</Text>
            <Text style={styles.tileValue}>{streaks.current}</Text>
          </View>
        </View>

        {microsEnabled && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Micronutrients (Last 7 Days)</Text>
            <View style={styles.microGrid}>
              <View style={styles.microItem}>
                <View style={[styles.microCircle, { borderColor: MACRO_COLORS.protein }]}>
                  <Text style={styles.microValue}>{microFiber}g</Text>
                </View>
                <Text style={styles.microLabel}>Fiber</Text>
              </View>
              <View style={styles.microItem}>
                <View style={[styles.microCircle, { borderColor: MACRO_COLORS.sugar }]}>
                  <Text style={styles.microValue}>{microSugar}g</Text>
                </View>
                <Text style={styles.microLabel}>Sugar</Text>
              </View>
              <View style={styles.microItem}>
                <View style={[styles.microCircle, { borderColor: MACRO_COLORS.sodium }]}>
                  <Text style={styles.microValue}>{microSodium}mg</Text>
                </View>
                <Text style={styles.microLabel}>Sodium</Text>
              </View>
              <View style={styles.microItem}>
                <View style={[styles.microCircle, { borderColor: MACRO_COLORS.water }]}>
                  <Text style={styles.microValue}>{microWater}L</Text>
                </View>
                <Text style={styles.microLabel}>Water</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phone Usage (Last 7 Days)</Text>
          <View style={styles.phoneChartWrap}>
            <View style={styles.phoneGridLines}>
              <View style={styles.phoneGridLine} />
              <View style={styles.phoneGridLine} />
              <View style={styles.phoneGridLine} />
            </View>
            <View style={styles.phoneBarsRow}>
              {phoneUsageValues.map((value, index) => {
                const isMax = maxPhoneUsage > 0 && index === maxPhoneIndex;
                const heightPct = maxPhoneUsage > 0 ? Math.max(18, (value / maxPhoneUsage) * 100) : 0;
                return (
                  <View key={`phone-${index}`} style={styles.phoneBarCell}>
                    {isMax ? (
                      <View style={styles.phoneTooltip}>
                        <Text style={styles.phoneTooltipText}>{Math.floor(value / 60)}h {value % 60}m</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.phoneBar,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: isMax ? MACRO_COLORS.fat : index === 3 ? MACRO_COLORS.protein : theme.chipBg,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.phoneLabelsRow}>
            {phoneDayLabels.map((label, index) => (
              <Text key={label} style={[styles.phoneLabel, index === maxPhoneIndex && { color: MACRO_COLORS.fat }]}>
                {label}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
      paddingHorizontal: 24,
      paddingTop: 54,
      paddingBottom: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    screenTitle: { fontSize: 32, fontWeight: '800', color: theme.text },
    headerActions: { flexDirection: 'row', gap: 10 },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.chipBg,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 110 },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
      marginBottom: 6,
      backgroundColor: theme.chipBg,
      padding: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    filterChip: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: 'transparent',
      alignItems: 'center',
    },
    filterChipSelected: {
      backgroundColor: theme.primary,
    },
    filterText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    filterTextSelected: { color: theme.onPrimary, fontWeight: '700' },
    filterMoreBtn: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 22,
      padding: 18,
      marginTop: 14,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    cardTitle: { fontSize: 17, fontWeight: '600', color: theme.text, marginBottom: 8 },
    cardSub: { fontSize: 12, color: theme.textSecondary, marginBottom: 8 },
    chart: { borderRadius: 12, marginTop: 4 },
    chartEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, minHeight: 180 },
    chartEmptyImage: { width: 112, height: 112 },
    chartEmptyText: { color: theme.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' },
    chartSub: { color: theme.textSecondary, fontSize: 12, marginTop: 8, textAlign: 'center' },
    distractionChartWrap: { height: 165, width: '100%', position: 'relative' },
    yAxisLabelsCol: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 16,
      justifyContent: 'space-between',
      zIndex: 2,
    },
    yAxisLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    lowBadge: {
      position: 'absolute',
      top: 78,
      backgroundColor: theme.primary,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    lowBadgeText: { fontSize: 10, fontWeight: '800', color: theme.onPrimary },
    axisLabelsRow: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' },
    axisLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    durationTrack: {
      height: 10,
      borderRadius: 999,
      overflow: 'hidden',
      flexDirection: 'row',
      backgroundColor: theme.chipBg,
      marginTop: 8,
    },
    durationSegment: { height: '100%' },
    durationStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    durationStatItem: { alignItems: 'center' },
    durationValue: { fontSize: 11, fontWeight: '700', color: theme.text },
    durationCaption: { fontSize: 10, color: theme.textMuted, marginTop: 2 },
    durationFootnote: { marginTop: 10, textAlign: 'center', fontSize: 10, color: theme.textMuted, fontStyle: 'italic' },
    weeklyLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.8, marginBottom: 12 },
    weeklyRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    donutWrap: { width: 136, height: 136, alignItems: 'center', justifyContent: 'center' },
    donutCenter: { position: 'absolute', alignItems: 'center' },
    donutValue: { fontSize: 20, fontWeight: '800', color: theme.text },
    donutCaption: { fontSize: 9, fontWeight: '800', color: theme.textMuted, marginTop: 2 },
    loggedBadge: { marginTop: 4, borderRadius: 6, backgroundColor: theme.chipBg, paddingHorizontal: 6, paddingVertical: 2 },
    loggedBadgeText: { fontSize: 9, fontWeight: '700', color: theme.primary },
    macroOverviewCol: { flex: 1, gap: 8 },
    macroOverviewCard: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    macroOverviewTitle: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', fontWeight: '700' },
    macroOverviewValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
    statsGrid: { flexDirection: 'row', gap: 12, marginTop: 14 },
    tilesRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    tile: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tileValue: { fontSize: 26, fontWeight: '800', color: theme.text },
    tileLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    tileDelta: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
    microGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    microItem: { alignItems: 'center', width: '24%' },
    microCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    microValue: { fontSize: 11, fontWeight: '800', color: theme.text },
    microLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', fontWeight: '700' },
    phoneChartWrap: { height: 170, marginTop: 4, position: 'relative' },
    phoneGridLines: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
      paddingTop: 8,
      paddingBottom: 16,
    },
    phoneGridLine: { borderTopWidth: 1, borderTopColor: theme.border, opacity: 0.4 },
    phoneBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 154, gap: 8, paddingTop: 18 },
    phoneBarCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
    phoneBar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    phoneTooltip: {
      position: 'absolute',
      top: 0,
      backgroundColor: '#0F172A',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      zIndex: 10,
    },
    phoneTooltipText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
    phoneLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 2 },
    phoneLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
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
