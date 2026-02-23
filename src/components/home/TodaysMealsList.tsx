/**
 * TodaysMealsList — vertical list of meal sessions for the selected date.
 * Shows time, meal type, status pill, and food name.
 * Empty-state when no sessions exist.
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import type { MealSession } from '../../types/models';

interface Props {
  sessions: MealSession[];
}

const statusConfig: Record<string, { color: string; label: string }> = {
  ACTIVE:     { color: '#FF9500', label: 'Active' },
  VERIFIED:   { color: '#34C759', label: 'Verified' },
  PARTIAL:    { color: '#FFCC00', label: 'Partial' },
  FAILED:     { color: '#FF3B30', label: 'Failed' },
  INCOMPLETE: { color: '#8E8E93', label: 'Missed' },
};

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function mealIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  switch (type) {
    case 'Breakfast': return 'free-breakfast';
    case 'Lunch': return 'lunch-dining';
    case 'Dinner': return 'dinner-dining';
    case 'Snack': return 'cookie';
    default: return 'restaurant';
  }
}

export default function TodaysMealsList({ sessions }: Props) {
  const { theme } = useTheme();

  if (sessions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="restaurant-menu" size={40} color={theme.textSecondary + '66'} />
        <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No meals logged yet</Text>
        <Text style={[styles.emptyHint, { color: theme.textSecondary + 'AA' }]}>
          Tap + to scan a meal
        </Text>
      </View>
    );
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.text }]}>Today's Meals</Text>
      <FlatList
        data={sorted}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const sc = statusConfig[item.status] ?? statusConfig.INCOMPLETE;
          return (
            <View style={[styles.row, { backgroundColor: theme.surface }]}>
              <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                <MaterialIcons name={mealIcon(item.mealType)} size={18} color={theme.primary} />
              </View>
              <View style={styles.info}>
                <Text style={[styles.food, { color: theme.text }]} numberOfLines={1}>
                  {item.foodName || item.mealType}
                </Text>
                <Text style={[styles.time, { color: theme.textSecondary }]}>
                  {formatSessionTime(item.startedAt)}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: sc.color + '22' }]}>
                <Text style={[styles.pillText, { color: sc.color }]}>{sc.label}</Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, marginTop: 14, paddingBottom: 80 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, marginLeft: 12 },
  food: { fontSize: 14, fontWeight: '600' },
  time: { fontSize: 12, marginTop: 2 },
  pill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingBottom: 80,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptyHint: { fontSize: 13, marginTop: 4 },
});
