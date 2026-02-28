import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useAuth } from '../state/AuthContext';
import { supabase } from '../services/supabaseClient';
import { computeStreak, getSessionDuration, getSessionsForDate, getWeekDates } from '../utils/helpers';
import TodaysMealsList from '../components/home/TodaysMealsList';
import { HEADER_BOTTOM_PADDING, HEADER_HORIZONTAL_PADDING } from '../components/common/ScreenHeader';

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, activeSession, sessions } = useAppState();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekDates = useMemo(() => getWeekDates(new Date()), []);
  const selectedSessions = useMemo(() => getSessionsForDate(sessions, selectedDate), [sessions, selectedDate]);

  const { current: streak } = useMemo(() => computeStreak(sessions), [sessions]);
  const unreadNotifications = !!activeSession;

  const timeSpentMinutes = useMemo(() => {
    const totalMs = selectedSessions.reduce((sum, session) => {
      if (session.endedAt) return sum + getSessionDuration(session);
      if (session.status === 'ACTIVE') {
        return sum + (Date.now() - new Date(session.startedAt).getTime());
      }
      return sum;
    }, 0);
    return Math.max(0, Math.round(totalMs / 60000));
  }, [selectedSessions]);

  const gaugeColor = timeSpentMinutes <= 30 ? '#3B82F6' : timeSpentMinutes <= 60 ? '#8B5CF6' : '#FF453A';
  const gaugeProgress = Math.min(timeSpentMinutes / 90, 1);

  const macroStats = useMemo(() => {
    const caloriesEntries = selectedSessions.filter((s) => (s.preNutrition?.estimated_calories ?? 0) > 0).length;
    const caloriesTotal = Math.round(
      selectedSessions.reduce((sum, s) => sum + (s.preNutrition?.estimated_calories ?? 0), 0),
    );
    const withNutrition = selectedSessions.filter((s) => s.preNutrition);
    const knownCounts = {
      protein: withNutrition.filter((s) => s.preNutrition?.protein_g != null).length,
      fat: withNutrition.filter((s) => s.preNutrition?.fat_g != null).length,
    };

    const totals = {
      protein: Math.round(selectedSessions.reduce((sum, s) => sum + (s.preNutrition?.protein_g ?? 0), 0)),
      fat: Math.round(selectedSessions.reduce((sum, s) => sum + (s.preNutrition?.fat_g ?? 0), 0)),
    };

    const hasEnoughData = (known: number) => withNutrition.length > 0 && known / withNutrition.length >= 0.5;

    return {
      calories: caloriesEntries > 0 && caloriesTotal > 0 ? `${caloriesTotal}` : '—',
      protein: hasEnoughData(knownCounts.protein) ? `${totals.protein}g` : '—',
      fat: hasEnoughData(knownCounts.fat) ? `${totals.fat}g` : '—',
    };
  }, [selectedSessions]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const username = user?.email?.split('@')[0] || 'there';
  const quips = ['Small bites, big wins 🐸', 'You got this 💪', 'Stay steady, Tadlock style 🐸'];
  const showQuips = settings.homeWidgets.showTruthBomb ?? true;
  const quip = quips[now.getDay() % quips.length];
  const lightHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const loadProfileAvatar = useCallback(async () => {
    if (!user?.id) {
      setAvatarUrl(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    setAvatarUrl(data?.avatar_url ?? null);
  }, [user?.id]);

  useEffect(() => {
    loadProfileAvatar();
  }, [loadProfileAvatar]);

  useFocusEffect(
    useCallback(() => {
      loadProfileAvatar();
    }, [loadProfileAvatar]),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={theme.background === '#F2F2F7' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View
        style={[
          styles.headerRow,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: HEADER_HORIZONTAL_PADDING,
            paddingBottom: HEADER_BOTTOM_PADDING,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.avatar, { backgroundColor: theme.surface }]}
          onPress={() => {
            lightHaptic();
            navigation.navigate('Settings');
          }}
          activeOpacity={0.8}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <MaterialIcons name="person" size={20} color={theme.textSecondary} />
          )}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting}</Text>
          <Text style={[styles.username, { color: theme.text }]}>{username}</Text>
        </View>

        <View style={styles.headerIconsRow}>
          <View style={[styles.streakPill, { backgroundColor: theme.surface }]}> 
            <MaterialIcons name="local-fire-department" size={14} color={theme.warning} />
            <Text style={[styles.streakText, { color: theme.text }]}>Streak {streak}</Text>
          </View>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.surface }]}
            onPress={() => {
              lightHaptic();
              navigation.navigate('Planner');
            }}
          > 
            <MaterialIcons name="calendar-today" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: theme.surface }]}> 
            <MaterialIcons name="notifications-none" size={19} color={theme.textSecondary} />
            {unreadNotifications ? <View style={styles.redDot} /> : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.weekStrip}>
          {weekDates.map((date) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            return (
              <TouchableOpacity
                key={date.toISOString()}
                onPress={() => setSelectedDate(new Date(date))}
                style={[styles.dayCell, { backgroundColor: isSelected ? theme.primary : theme.surface }]}
              >
                <Text style={[styles.dayLetter, { color: isSelected ? theme.background : theme.textSecondary }]}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}
                </Text>
                <Text style={[styles.dayNum, { color: isSelected ? theme.background : theme.text }]}>{date.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.gaugeCard, { backgroundColor: theme.surface }]}> 
          <Text style={[styles.gaugeLabel, { color: theme.textSecondary }]}>Time spent eating today</Text>
          <View style={styles.gaugeInnerRow}>
            <Gauge progress={gaugeProgress} color={gaugeColor} trackColor={theme.border} />
            <View>
              <Text style={[styles.gaugeValue, { color: theme.text }]}>{timeSpentMinutes} min</Text>
              {showQuips ? <Text style={[styles.gaugeHint, { color: theme.textMuted }]}>{quip}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.macrosRow}>
          <MacroRing label="Calories today" value={macroStats.calories} color="#FF9F0A" trackColor={theme.border} textColor={theme.text} labelColor={theme.textSecondary} />
          <MacroRing label="Protein today" value={macroStats.protein} color="#8B5CF6" trackColor={theme.border} textColor={theme.text} labelColor={theme.textSecondary} />
          <MacroRing label="Fat today" value={macroStats.fat} color="#FF453A" trackColor={theme.border} textColor={theme.text} labelColor={theme.textSecondary} />
        </View>

        <TodaysMealsList sessions={selectedSessions} />
      </ScrollView>
    </View>
  );
}

function Gauge({ progress, color, trackColor }: { progress: number; color: string; trackColor: string }) {
  const size = 108;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
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

function MacroRing({
  label,
  value,
  color,
  trackColor,
  textColor,
  labelColor,
}: {
  label: string;
  value: string;
  color: string;
  trackColor: string;
  textColor: string;
  labelColor: string;
}) {
  const size = 74;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const hasData = value !== '—';
  const ringColor = hasData ? color : '#9CA3AF';
  return (
    <View style={styles.macroItem}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={ringColor} strokeWidth={stroke} fill="none" strokeDasharray={hasData ? '160 220' : `${2 * Math.PI * radius} ${2 * Math.PI * radius}`} rotation="-90" origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <View style={styles.macroCenterText}>
        <Text style={[styles.macroValue, { color: hasData ? textColor : '#9CA3AF' }]}>{value}</Text>
      </View>
      <Text style={[styles.macroLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  greeting: { fontSize: 12, fontWeight: '600' },
  username: { fontSize: 19, fontWeight: '800' },
  headerIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 10, height: 32, gap: 4 },
  streakText: { fontSize: 12, fontWeight: '700' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  redDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF3B30' },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
    gap: 12,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayCell: {
    width: 42,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: 'center',
  },
  dayLetter: { fontSize: 11, fontWeight: '700' },
  dayNum: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  gaugeCard: { borderRadius: 20, padding: 14, marginTop: 10 },
  gaugeLabel: { fontSize: 14, fontWeight: '700' },
  gaugeInnerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  gaugeValue: { fontSize: 32, fontWeight: '800' },
  gaugeHint: { fontSize: 12, marginTop: 2, maxWidth: 180 },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  macroItem: { alignItems: 'center', width: '31%' },
  macroCenterText: { position: 'absolute', top: 25 },
  macroValue: { fontWeight: '800', fontSize: 14 },
  macroLabel: {
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center',
  },
});
