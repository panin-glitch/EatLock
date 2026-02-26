import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';

type ScopeType = 'Global' | 'Groups';
type WindowType = 'Weekly' | 'All-time';
type RankMetric = 'Meals' | 'Focus minutes' | 'Low distraction' | 'Calories logged';

type Objective = {
  id: string;
  title: string;
  goal: number;
  progress: number;
};

const OBJECTIVE_CATALOG = [
  { id: 'obj-1', title: 'Complete 10 meals this week', goal: 10 },
  { id: 'obj-2', title: 'Log 5 meals with calories', goal: 5 },
  { id: 'obj-3', title: '3 low-distraction meals (1-2⭐)', goal: 3 },
  { id: 'obj-4', title: 'Finish 6 meals on first try', goal: 6 },
  { id: 'obj-5', title: 'Track 7 meal sessions', goal: 7 },
];

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const [scope, setScope] = useState<ScopeType>('Global');
  const [windowType, setWindowType] = useState<WindowType>('Weekly');
  const [metric, setMetric] = useState<RankMetric>('Meals');

  const thisWeekSessions = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return sessions.filter((s) => new Date(s.startedAt) >= start);
  }, [sessions]);

  const weeklyObjectives: Objective[] = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekKey = Math.floor(dayOfYear / 7);
    const offset = weekKey % OBJECTIVE_CATALOG.length;

    const picked = [
      OBJECTIVE_CATALOG[offset % OBJECTIVE_CATALOG.length],
      OBJECTIVE_CATALOG[(offset + 1) % OBJECTIVE_CATALOG.length],
      OBJECTIVE_CATALOG[(offset + 2) % OBJECTIVE_CATALOG.length],
    ];

    const completedMeals = thisWeekSessions.filter((s) => s.status === 'VERIFIED' || s.status === 'PARTIAL').length;
    const withCalories = thisWeekSessions.filter((s) => (s.preNutrition?.estimated_calories ?? 0) > 0).length;
    const lowDistraction = thisWeekSessions.filter((s) => (s.distractionRating ?? 5) <= 2).length;
    const firstTry = thisWeekSessions.filter((s) => s.status === 'VERIFIED').length;

    return picked.map((item) => {
      let progress = completedMeals;
      if (item.id === 'obj-2') progress = withCalories;
      if (item.id === 'obj-3') progress = lowDistraction;
      if (item.id === 'obj-4') progress = firstTry;
      return {
        ...item,
        progress: Math.min(progress, item.goal),
      };
    });
  }, [thisWeekSessions]);

  const tableRows = useMemo(() => {
    const rows = [
      { rank: 1, name: 'You', score: computeMetric(metric, thisWeekSessions) },
      { rank: 2, name: 'Ava', score: Math.max(1, computeMetric(metric, thisWeekSessions) + 2) },
      { rank: 3, name: 'Leo', score: Math.max(1, computeMetric(metric, thisWeekSessions) - 1) },
      { rank: 4, name: 'Mina', score: Math.max(1, computeMetric(metric, thisWeekSessions) - 2) },
    ];
    return rows;
  }, [metric, thisWeekSessions]);

  const styles = makeStyles(theme);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.toggleRow}>
        {(['Global', 'Groups'] as ScopeType[]).map((item) => (
          <Chip key={item} label={item} active={scope === item} onPress={() => setScope(item)} />
        ))}
      </View>

      <View style={styles.toggleRow}>
        {(['Weekly', 'All-time'] as WindowType[]).map((item) => (
          <Chip key={item} label={item} active={windowType === item} onPress={() => setWindowType(item)} />
        ))}
      </View>

      {scope === 'Groups' ? (
        <View style={styles.groupCard}>
          <Text style={styles.groupTitle}>You’re in 2 groups</Text>
          <TouchableOpacity style={styles.groupPicker}>
            <Text style={styles.groupPickerText}>Active group: Tad Squad</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ranking metric</Text>
        <View style={styles.metricWrap}>
          {(['Meals', 'Focus minutes', 'Low distraction', 'Calories logged'] as RankMetric[]).map((m) => (
            <Chip key={m} label={m} active={metric === m} onPress={() => setMetric(m)} compact />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Leaderboard</Text>
        {tableRows.map((row) => (
          <View key={row.rank} style={styles.row}>
            <Text style={styles.rank}>#{row.rank}</Text>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.score}>{row.score}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly objectives</Text>
        {weeklyObjectives.map((obj) => {
          const progressRatio = Math.min(obj.progress / obj.goal, 1);
          return (
            <View key={obj.id} style={styles.objectiveItem}>
              <View style={styles.objectiveHeader}>
                <Text style={styles.objectiveTitle}>{obj.title}</Text>
                <Text style={styles.objectiveCount}>{obj.progress}/{obj.goal}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressRatio * 100}%`, backgroundColor: theme.primary }]} />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function computeMetric(metric: RankMetric, sessions: any[]): number {
  if (metric === 'Meals') return sessions.filter((s) => s.status === 'VERIFIED' || s.status === 'PARTIAL').length;
  if (metric === 'Focus minutes') {
    const totalMs = sessions.reduce((sum, s) => {
      if (!s.endedAt) return sum;
      return sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
    }, 0);
    return Math.round(totalMs / 60000);
  }
  if (metric === 'Low distraction') return sessions.filter((s) => (s.distractionRating ?? 5) <= 2).length;
  return sessions.reduce((sum, s) => sum + (s.preNutrition?.estimated_calories ?? 0), 0);
}

function Chip({ label, active, onPress, compact }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.primary : theme.surface,
        borderRadius: 14,
        paddingHorizontal: compact ? 10 : 14,
        paddingVertical: compact ? 8 : 10,
      }}
    >
      <Text style={{ color: active ? theme.background : theme.text, fontWeight: '700', fontSize: compact ? 12 : 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, gap: 12, paddingBottom: 24 },
    toggleRow: { flexDirection: 'row', gap: 8 },
    card: { backgroundColor: theme.surface, borderRadius: 16, padding: 14 },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },
    metricWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    rank: { width: 38, color: theme.textSecondary, fontWeight: '700' },
    name: { flex: 1, color: theme.text, fontWeight: '600' },
    score: { color: theme.primary, fontWeight: '800' },
    groupCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 14 },
    groupTitle: { color: theme.text, fontWeight: '700', marginBottom: 8 },
    groupPicker: { backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    groupPickerText: { color: theme.textSecondary, fontWeight: '600' },
    objectiveItem: { marginBottom: 12 },
    objectiveHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    objectiveTitle: { color: theme.text, fontSize: 13, flex: 1, marginRight: 8 },
    objectiveCount: { color: theme.textSecondary, fontWeight: '700' },
    progressTrack: { height: 8, borderRadius: 8, backgroundColor: theme.card, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 8 },
  });
