import React, { useMemo, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useAuth } from '../state/AuthContext';
import { computeMacroTargetsFromCalories, computeStreak, getSessionDuration, getSessionsForDate } from '../utils/helpers';
import TodaysMealsList from '../components/home/TodaysMealsList';
import { HEADER_BOTTOM_PADDING, HEADER_HORIZONTAL_PADDING } from '../components/common/ScreenHeader';
import { DEFAULT_DAILY_CALORIE_GOAL, DEFAULT_MACRO_SPLIT } from '../types/models';

const tadlockImg = require('../../assets/tadlock.gif');

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, activeSession, sessions } = useAppState();
  const { displayName, profile, refreshProfile } = useAuth();
  const navigation = useNavigation<any>();
  const dateStripRef = useRef<ScrollView>(null);
  const hasPositionedDateStrip = useRef(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateStripDates = useMemo(() => {
    const today = new Date();
    const daysBack = 12 * 7; // 12 weeks past
    const daysForward = 4 * 7; // 4 weeks future
    return Array.from({ length: daysBack + daysForward + 1 }, (_, index) => {
      const d = new Date(today);
      d.setDate(today.getDate() - daysBack + index);
      return d;
    });
  }, []);
  const initialTodayIndex = 12 * 7;
  const dayCellWidth = 50;
  const selectedSessions = useMemo(() => getSessionsForDate(sessions, selectedDate), [sessions, selectedDate]);
  const completedSelectedSessions = useMemo(() => selectedSessions.filter((s) => !!s.endedAt), [selectedSessions]);

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
    const caloriesTotal = Math.round(
      completedSelectedSessions.reduce((sum, s) => sum + (s.preNutrition?.estimated_calories ?? 0), 0),
    );

    const totals = {
      protein: Math.round(completedSelectedSessions.reduce((sum, s) => sum + (s.preNutrition?.protein_g ?? 0), 0)),
      carbs: Math.round(completedSelectedSessions.reduce((sum, s) => sum + (s.preNutrition?.carbs_g ?? 0), 0)),
      fat: Math.round(completedSelectedSessions.reduce((sum, s) => sum + (s.preNutrition?.fat_g ?? 0), 0)),
    };

    const dailyCalorieGoal = settings.nutritionGoals?.dailyCalorieGoal ?? DEFAULT_DAILY_CALORIE_GOAL;
    const macroSplit = settings.nutritionGoals?.macroSplit ?? DEFAULT_MACRO_SPLIT;
    const macroTargets = computeMacroTargetsFromCalories(dailyCalorieGoal, macroSplit);
    const hasGoal = dailyCalorieGoal > 0;

    return {
      caloriesValue: hasGoal ? `${caloriesTotal}` : 'Set goal',
      proteinValue: !hasGoal ? 'Set goal' : `${totals.protein}g`,
      carbsValue: !hasGoal ? 'Set goal' : `${totals.carbs}g`,
      fatValue: !hasGoal ? 'Set goal' : `${totals.fat}g`,
      caloriesProgress: hasGoal ? caloriesTotal / dailyCalorieGoal : null,
      proteinProgress: hasGoal && macroTargets.proteinGoalG > 0
        ? totals.protein / macroTargets.proteinGoalG
        : null,
      carbsProgress: hasGoal && macroTargets.carbsGoalG > 0
        ? totals.carbs / macroTargets.carbsGoalG
        : null,
      fatProgress: hasGoal && macroTargets.fatGoalG > 0
        ? totals.fat / macroTargets.fatGoalG
        : null,
    };
  }, [completedSelectedSessions, settings.nutritionGoals]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const username = displayName;
  const quips = ['Small bites, big wins 🐸', 'You got this 💪', 'Stay steady, Tadlock style 🐸'];
  const showQuips = settings.homeWidgets.showTruthBomb ?? true;
  const quip = quips[now.getDay() % quips.length];
  const lightHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile]),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={'light-content'}
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
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
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
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.surface }]}
            onPress={() => {
              lightHaptic();
              navigation.navigate('NotificationHelp');
            }}
          > 
            <MaterialIcons name="notifications-none" size={19} color={theme.textSecondary} />
            {unreadNotifications ? <View style={styles.redDot} /> : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScrollView
          ref={dateStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekStrip}
          onContentSizeChange={() => {
            if (hasPositionedDateStrip.current) return;
            hasPositionedDateStrip.current = true;
            dateStripRef.current?.scrollTo({ x: initialTodayIndex * dayCellWidth - dayCellWidth, y: 0, animated: false });
          }}
        >
          {dateStripDates.map((date) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            return (
              <TouchableOpacity
                key={date.toISOString()}
                onPress={() => setSelectedDate(new Date(date))}
                style={[
                  styles.dayCell,
                  styles.dayCellSpaced,
                  { backgroundColor: isSelected ? theme.primary : theme.surface },
                ]}
              >
                <Text style={[styles.dayLetter, { color: isSelected ? theme.background : theme.textSecondary }]}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}
                </Text>
                <Text style={[styles.dayNum, { color: isSelected ? theme.background : theme.text }]}>{date.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[styles.gaugeCard, { backgroundColor: theme.surface }]}> 
          <Text style={[styles.gaugeLabel, { color: theme.textSecondary }]}>Time spent eating today</Text>
          <View style={styles.gaugeInnerRow}>
            <Gauge
              progress={gaugeProgress}
              color={gaugeColor}
              trackColor={theme.border}
              overlayColor={theme.background === '#F2F2F7' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.25)'}
            />
            <View>
              <Text style={[styles.gaugeValue, { color: theme.text }]}>{timeSpentMinutes} min</Text>
              {showQuips ? <Text style={[styles.gaugeHint, { color: theme.textMuted }]}>{quip}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.macrosRow}>
          <MacroRing
            label="Calories today"
            value={macroStats.caloriesValue}
            progress={macroStats.caloriesProgress}
            color="#FF9F0A"
            trackColor={theme.surfaceElevated}
            textColor={theme.text}
            labelColor={theme.textSecondary}
          />
          <MacroRing
            label="Protein today"
            value={macroStats.proteinValue}
            progress={macroStats.proteinProgress}
            color="#8B5CF6"
            trackColor={theme.surfaceElevated}
            textColor={theme.text}
            labelColor={theme.textSecondary}
          />
          <MacroRing
            label="Carbs today"
            value={macroStats.carbsValue}
            progress={macroStats.carbsProgress}
            color="#3B82F6"
            trackColor={theme.surfaceElevated}
            textColor={theme.text}
            labelColor={theme.textSecondary}
          />
          <MacroRing
            label="Fat today"
            value={macroStats.fatValue}
            progress={macroStats.fatProgress}
            color="#FF453A"
            trackColor={theme.surfaceElevated}
            textColor={theme.text}
            labelColor={theme.textSecondary}
          />
        </View>

        <TodaysMealsList sessions={selectedSessions} />
      </ScrollView>
    </View>
  );
}

function Gauge({
  progress,
  color,
  trackColor,
  overlayColor,
}: {
  progress: number;
  color: string;
  trackColor: string;
  overlayColor: string;
}) {
  const size = 108;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  const innerSize = Math.round(size * 0.7);
  return (
    <View style={styles.gaugeWrap}>
      <ImageBackground
        source={tadlockImg}
        resizeMode="cover"
        style={[
          styles.gaugeInnerArtwork,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
        imageStyle={{ borderRadius: innerSize / 2 }}
      >
        <View style={[styles.gaugeArtworkOverlay, { backgroundColor: overlayColor }]} />
      </ImageBackground>

      <Svg width={size} height={size} style={styles.gaugeSvgLayer}>
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
    </View>
  );
}

function MacroRing({
  label,
  value,
  progress,
  color,
  trackColor,
  textColor,
  labelColor,
}: {
  label: string;
  value: string;
  progress: number | null;
  color: string;
  trackColor: string;
  textColor: string;
  labelColor: string;
}) {
  const size = 74;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasProgress = typeof progress === 'number';
  const ringColor = hasProgress ? color : labelColor;
  const clampedProgress = Math.min(Math.max(progress ?? 0, 0), 1);
  const strokeDashoffset = circumference * (1 - clampedProgress);
  return (
    <View style={styles.macroItem}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={hasProgress ? strokeDashoffset : 0}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.macroCenterText}>
        <Text style={[styles.macroValue, { color: hasProgress ? textColor : labelColor }]}>{value}</Text>
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
    marginTop: 12,
    paddingRight: 8,
  },
  dayCell: {
    width: 42,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: 'center',
  },
  dayCellSpaced: { marginRight: 8 },
  dayLetter: { fontSize: 11, fontWeight: '700' },
  dayNum: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  gaugeCard: { borderRadius: 20, padding: 14, marginTop: 10 },
  gaugeLabel: { fontSize: 14, fontWeight: '700' },
  gaugeInnerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  gaugeValue: { fontSize: 32, fontWeight: '800' },
  gaugeHint: { fontSize: 12, marginTop: 2, maxWidth: 180 },
  gaugeWrap: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeSvgLayer: {
    position: 'absolute',
    zIndex: 2,
  },
  gaugeInnerArtwork: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  gaugeArtworkOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  macroItem: { alignItems: 'center', width: '24%' },
  macroCenterText: { position: 'absolute', top: 25 },
  macroValue: { fontWeight: '800', fontSize: 12 },
  macroLabel: {
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center',
  },
});
