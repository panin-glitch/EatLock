import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import {
  getWeekDates,
  getDayOfWeek,
  getSchedulesForDay,
  getSessionsForDate,
  formatTime,
  getSessionDuration,
  formatDurationMinutes,
} from '../utils/helpers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { DayOfWeek } from '../types/models';
import { SwipeableRow } from '../components/SwipeableRow';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function PlannerScreen() {
  const { theme } = useTheme();
  const { schedules, sessions, toggleSchedule, deleteSchedule } = useAppState();
  const navigation = useNavigation<any>();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState(getWeekDates(new Date()));

  useFocusEffect(
    useCallback(() => {
      setWeekDates(getWeekDates(selectedDate));
    }, [selectedDate])
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDay = getDayOfWeek(selectedDate);
  const daySchedules = getSchedulesForDay(schedules, selectedDay);
  const daySessions = getSessionsForDate(sessions, selectedDate);

  const completedByType = new Map<string, number>();
  daySessions
    .filter((s) => s.status === 'VERIFIED' || s.status === 'PARTIAL')
    .forEach((s) => {
      completedByType.set(s.mealType, (completedByType.get(s.mealType) || 0) + 1);
    });
  const usedByType = new Map<string, number>();
  const isScheduleCompleted = (mealType: string): boolean => {
    const used = usedByType.get(mealType) || 0;
    const completed = completedByType.get(mealType) || 0;
    if (used < completed) {
      usedByType.set(mealType, used + 1);
      return true;
    }
    return false;
  };

  const handleDeleteSchedule = (id: string, name: string) => {
    Alert.alert('Delete Meal', `Remove "${name}" from your schedule?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSchedule(id) },
    ]);
  };

  // Stats for selected day
  const strictSessions = daySessions.filter((s) => s.strictMode && s.endedAt);
  const focusTime = strictSessions.reduce((sum, s) => sum + getSessionDuration(s), 0);

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
        </Text>
      </View>

      {/* Week strip */}
      <View style={styles.weekStrip}>
        {weekDates.map((date, index) => {
          const isSelected =
            date.toDateString() === selectedDate.toDateString();
          const isToday = date.toDateString() === today.toDateString();
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayPill,
                isSelected && styles.dayPillSelected,
              ]}
              onPress={() => setSelectedDate(new Date(date))}
            >
              <Text
                style={[
                  styles.dayLetter,
                  isSelected && styles.dayLetterSelected,
                ]}
              >
                {DAY_LETTERS[date.getDay()]}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isSelected && styles.dayNumberSelected,
                  isToday && !isSelected && styles.dayNumberToday,
                ]}
              >
                {date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Mini stat cards */}
      <View style={styles.statRow}>
        <View style={styles.miniStat}>
          <MaterialIcons name="center-focus-strong" size={18} color={theme.primary} />
          <View>
            <Text style={styles.miniStatLabel}>Focus</Text>
            <Text style={styles.miniStatValue}>
              {focusTime > 0 ? formatDurationMinutes(focusTime) : '—'}
            </Text>
          </View>
        </View>
        <View style={styles.miniStat}>
          <MaterialIcons name="phone-android" size={18} color={theme.warning} />
          <View>
            <Text style={styles.miniStatLabel}>Usage</Text>
            <Text style={styles.miniStatValue}>—</Text>
            <Text style={styles.miniStatHint}>Requires OS permission</Text>
          </View>
        </View>
      </View>

      {/* Meals list */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Meals for this day</Text>
      </View>

      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {daySchedules.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="event-note" size={48} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No schedules on this day</Text>
            <Text style={styles.emptySubtitle}>
              Tap the button below to add a meal schedule
            </Text>
          </View>
        ) : (
          daySchedules
            .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))
            .map((schedule) => {
              const completed = isScheduleCompleted(schedule.mealType);
              return (
                <SwipeableRow
                  key={schedule.id}
                  onDelete={() => handleDeleteSchedule(schedule.id, schedule.name)}
                  deleteColor={theme.danger}
                  disabled={!schedule.enabled}
                  rowBackgroundColor={theme.card}
                >
                  <TouchableOpacity
                    style={styles.mealRow}
                    onPress={() =>
                      navigation.navigate('EditSchedule', { scheduleId: schedule.id })
                    }
                    onLongPress={() => {
                      navigation.navigate('PreScanCamera');
                    }}
                  >
                    <View style={styles.mealRowLeft}>
                      <View
                        style={[
                          styles.mealDot,
                          { backgroundColor: completed ? theme.success : schedule.enabled ? theme.primary : theme.textMuted },
                        ]}
                      />
                      {completed && (
                        <MaterialIcons name="check-circle" size={16} color={theme.success} style={{ marginRight: 4 }} />
                      )}
                      {!schedule.enabled && (
                        <MaterialIcons name="pause-circle-filled" size={16} color={theme.textMuted} style={{ marginRight: 4 }} />
                      )}
                      <View>
                        <Text
                          style={[
                            styles.mealName,
                            !schedule.enabled && styles.mealNameDisabled,
                            completed && styles.mealNameCompleted,
                          ]}
                        >
                          {schedule.name}
                        </Text>
                        <Text style={styles.mealRepeat}>
                          {!schedule.enabled ? 'Disabled · not active today' : schedule.repeatDays.join(', ')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.mealRowRight}>
                      <Text
                        style={[
                          styles.mealTime,
                          !schedule.enabled && styles.mealTimeDisabled,
                          completed && styles.mealTimeCompleted,
                        ]}
                      >
                        {completed ? '✓ Done' : !schedule.enabled ? 'Disabled' : formatTime(schedule.timeOfDay)}
                      </Text>
                      {!completed && (
                        <Switch
                          value={schedule.enabled}
                          onValueChange={() => toggleSchedule(schedule.id)}
                          trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
                          thumbColor={schedule.enabled ? theme.primary : theme.textMuted}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                </SwipeableRow>
              );
            })
        )}
      </ScrollView>

      {/* Add button */}
      <View style={styles.addButtonContainer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('EditSchedule', {})}
        >
          <MaterialIcons name="add" size={20} color="#FFF" />
          <Text style={styles.addButtonText}>New Meal</Text>
        </TouchableOpacity>
      </View>
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
    monthTitle: { fontSize: 24, fontWeight: '700', color: theme.text },
    weekStrip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    dayPill: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 16,
    },
    dayPillSelected: {
      backgroundColor: theme.primary,
    },
    dayLetter: {
      fontSize: 12,
      color: theme.textMuted,
      marginBottom: 4,
      fontWeight: '500',
    },
    dayLetterSelected: { color: '#FFF' },
    dayNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    dayNumberSelected: { color: '#FFF' },
    dayNumberToday: { color: theme.primary },
    statRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 8,
    },
    miniStat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    miniStatLabel: { fontSize: 12, color: theme.textSecondary },
    miniStatValue: { fontSize: 18, fontWeight: '700', color: theme.text },
    miniStatHint: { fontSize: 10, color: theme.textMuted },
    sectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
    listContainer: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingBottom: 100 },
    mealRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    mealRowDisabled: {},
    mealRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    mealDot: { width: 10, height: 10, borderRadius: 5 },
    mealName: { fontSize: 16, fontWeight: '600', color: theme.text },
    mealNameDisabled: { color: theme.textMuted, textDecorationLine: 'none' },
    mealNameCompleted: { color: theme.textSecondary, textDecorationLine: 'line-through' },
    mealRepeat: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    mealRowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    mealTime: { fontSize: 15, fontWeight: '500', color: theme.textSecondary },
    mealTimeDisabled: { color: theme.textMuted, fontWeight: '600' },
    mealTimeCompleted: { color: theme.success, fontWeight: '600' },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.textSecondary,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 4,
      textAlign: 'center',
    },
    addButtonContainer: {
      position: 'absolute',
      bottom: 24,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 28,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  });
