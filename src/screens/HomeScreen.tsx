import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import {
  getSessionsForDate,
  getNextMeal,
  formatTime,
  formatCountdown,
  getWeekDates,
  getSchedulesForDay,
  getDayOfWeek,
  computeStreak,
} from '../utils/helpers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateStrip from '../components/home/DateStrip';
import HeroCard from '../components/home/HeroCard';
import MiniCards from '../components/home/MiniCards';
import TodaysMealsList from '../components/home/TodaysMealsList';
import HomeFAB from '../components/home/HomeFAB';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { blockConfig, activeSession, sessions, schedules } = useAppState();
  const navigation = useNavigation<any>();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekDates = useMemo(() => getWeekDates(new Date()), []);

  // Build dot-date set (dates with at least one session)
  const dotDates = useMemo(() => {
    const set = new Set<string>();
    for (const d of weekDates) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (getSessionsForDate(sessions, d).length > 0) set.add(key);
    }
    return set;
  }, [sessions, weekDates]);

  // Stats for selected date
  const [nextMealLabel, setNextMealLabel] = useState<string | null>(null);
  const [mealsToday, setMealsToday] = useState(0);
  const [mealsGoal, setMealsGoal] = useState(0);

  const selectedSessions = useMemo(
    () => getSessionsForDate(sessions, selectedDate),
    [sessions, selectedDate],
  );

  const computeStats = useCallback(() => {
    // Meals today vs goal
    const todaySessions = getSessionsForDate(sessions, new Date());
    setMealsToday(todaySessions.length);

    const day = getDayOfWeek(new Date());
    const todaySchedules = getSchedulesForDay(schedules, day);
    setMealsGoal(todaySchedules.length || 3); // default 3 if no planner configured

    // Next meal
    const next = getNextMeal(schedules);
    if (next) {
      setNextMealLabel(
        `${next.schedule.name} • ${formatTime(next.schedule.timeOfDay)} • in ${formatCountdown(next.nextTime)}`,
      );
    } else {
      setNextMealLabel(null);
    }
  }, [sessions, schedules]);

  useFocusEffect(
    useCallback(() => {
      computeStats();
    }, [computeStats]),
  );

  // ── Handlers ──
  const handleStartMeal = () => navigation.navigate('PreScanCamera');
  const handleResume = () =>
    navigation.navigate('MealSessionActive', { mealType: activeSession?.mealType });

  // ── Mini card data ──
  const { current: streak } = useMemo(() => computeStreak(sessions), [sessions]);
  const blockedCount = blockConfig.blockedApps.length;

  const miniCards: [any, any, any] = [
    { icon: 'lock' as const, iconBg: '#FF3B30', label: 'Locked Apps', value: String(blockedCount) },
    { icon: 'photo-camera' as const, iconBg: '#007AFF', label: 'Scans Today', value: String(mealsToday) },
    { icon: 'local-fire-department' as const, iconBg: '#FF9500', label: 'Day Streak', value: streak > 0 ? String(streak) : '—' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={theme.background === '#F2F2F7' ? 'dark-content' : 'light-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={[styles.title, { color: theme.text }]}>EatLock</Text>
        <TouchableOpacity
          style={[styles.profileBtn, { backgroundColor: theme.surface }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <MaterialIcons name="person" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Date strip */}
        <DateStrip
          dates={weekDates}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          dotDates={dotDates}
        />

        {/* Hero card */}
        <HeroCard
          activeSession={activeSession}
          nextMealLabel={nextMealLabel}
          mealsToday={mealsToday}
          mealsGoal={mealsGoal}
          onResume={handleResume}
          onStartMeal={handleStartMeal}
        />

        {/* Mini stat cards */}
        <MiniCards cards={miniCards} />

        {/* Today's meals list */}
        <TodaysMealsList sessions={selectedSessions} />
      </ScrollView>

      {/* Floating Action Button */}
      <HomeFAB onPress={handleStartMeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  profileBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { paddingBottom: 100 },
});
