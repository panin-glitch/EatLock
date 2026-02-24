/**
 * HeroCard — large rounded card showing the primary metric.
 *
 * - Active session → "Meal in progress" + progress ring
 * - Else → "Next Meal" or "No meals active" + meals-today progress ring
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

interface Props {
  activeSession: any | null;
  nextMealLabel: string | null; // e.g. "Lunch • 2:00 PM • in 45m"
  mealsToday: number;
  mealsGoal: number; // total scheduled for today
  caloriesToday: number;
  calorieGoal: number;
  onResume: () => void;
  onStartMeal: () => void;
}

function ProgressRing({
  progress,
  size,
  stroke,
  color,
  bgColor,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
  bgColor: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={bgColor}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={strokeDashoffset}
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export default function HeroCard({
  activeSession,
  nextMealLabel,
  mealsToday,
  mealsGoal,
  caloriesToday,
  calorieGoal,
  onResume,
  onStartMeal,
}: Props) {
  const { theme } = useTheme();
  const isActive = !!activeSession;
  const progress = isActive
    ? 0.5 // Placeholder; could compute from session duration
    : calorieGoal > 0
      ? caloriesToday / calorieGoal
      : 0;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      activeOpacity={0.85}
      onPress={isActive ? onResume : onStartMeal}
    >
      <View style={styles.left}>
        {isActive ? (
          <>
            <View style={[styles.liveBadge, { backgroundColor: theme.primary + '22' }]}>
              <View style={[styles.liveDot, { backgroundColor: theme.primary }]} />
              <Text style={[styles.liveText, { color: theme.primary }]}>Active</Text>
            </View>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Meal in Progress</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              {activeSession.mealType} — Tap to resume
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>
              {nextMealLabel ? 'Next Meal' : 'Ready'}
            </Text>
            <Text style={[styles.heroTitle, { color: theme.text }]} numberOfLines={1}>
              {nextMealLabel || 'No meals scheduled'}
            </Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              {caloriesToday > 0 ? `${caloriesToday} cal` : '0 cal'} · {mealsToday}/{mealsGoal} meals
            </Text>
          </>
        )}
      </View>

      <View style={styles.ringWrap}>
        <ProgressRing
          progress={progress}
          size={72}
          stroke={6}
          color={theme.primary}
          bgColor={theme.border}
        />
        <View style={styles.ringCenter}>
          {isActive ? (
            <MaterialIcons name="restaurant" size={22} color={theme.primary} />
          ) : (
            <>
              <Text style={[styles.ringText, { color: theme.text }]}>
                {caloriesToday > 0 ? caloriesToday : 0}
              </Text>
              <Text style={[styles.ringUnit, { color: theme.textSecondary }]}>cal</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  left: { flex: 1, marginRight: 16 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginBottom: 8,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveText: { fontSize: 12, fontWeight: '700' },
  heroLabel: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  heroTitle: { fontSize: 17, fontWeight: '700', marginBottom: 3 },
  heroSub: { fontSize: 13 },
  ringWrap: { position: 'relative', width: 72, height: 72 },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringText: { fontSize: 14, fontWeight: '700' },
  ringUnit: { fontSize: 9, fontWeight: '500', marginTop: -1 },
});
