import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { getSessionsForDate, getSessionDuration, getNextMeal, formatTime, formatCountdown } from '../utils/helpers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

const { width: SCREEN_W } = Dimensions.get('window');
const CIRCLE_SIZE = SCREEN_W * 0.62;

export default function HomeScreen() {
  const { theme } = useTheme();
  const { blockConfig, activeSession, sessions, schedules } = useAppState();
  const navigation = useNavigation<any>();

  const [usageMinutes, setUsageMinutes] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [nextMealInfo, setNextMealInfo] = useState<{ name: string; time: string; countdown: string } | null>(null);

  // Compute today's focus time from completed strict sessions
  const computeStats = useCallback(() => {
    const today = new Date();
    const todaySessions = getSessionsForDate(sessions, today);
    const strict = todaySessions.filter((s) => s.strictMode && s.endedAt);
    const totalFocusMs = strict.reduce((sum, s) => sum + getSessionDuration(s), 0);
    setFocusMinutes(Math.round(totalFocusMs / 60000));
    // Usage time is placeholder — would need OS permission to measure
    setUsageMinutes(0);

    // Next meal from planner
    const next = getNextMeal(schedules);
    if (next) {
      setNextMealInfo({
        name: next.schedule.name,
        time: formatTime(next.schedule.timeOfDay),
        countdown: formatCountdown(next.nextTime),
      });
    } else {
      setNextMealInfo(null);
    }
  }, [sessions, schedules]);

  useFocusEffect(
    useCallback(() => {
      computeStats();
    }, [computeStats])
  );

  // If there's an active session, don't auto-redirect — show resume card instead
  // (handled in JSX below)

  const handleStartMeal = () => {
    navigation.navigate('PreScanCamera');
  };

  const handleResume = () => {
    navigation.navigate('MealSessionActive', {
      mealType: activeSession?.mealType,
    });
  };

  const blockedApps = blockConfig.blockedApps;
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background gradient */}
      <LinearGradient
        colors={[theme.background, '#0A1A0F', '#0D2818', '#0A1A0F', theme.background]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('Settings')}
        >
          <MaterialIcons name="person" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>EatLock</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stat cards */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <MaterialIcons name="phone-android" size={16} color={theme.textSecondary} />
          <Text style={styles.statLabel}>Usage Time</Text>
          <Text style={styles.statValue}>
            {usageMinutes > 0 ? `${usageMinutes}m` : '—'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <MaterialIcons name="center-focus-strong" size={16} color={theme.primary} />
          <Text style={styles.statLabel}>Focus Time</Text>
          <Text style={styles.statValue}>
            {focusMinutes > 0 ? `${focusMinutes}m` : '—'}
          </Text>
        </View>
      </View>

      {/* Center circle */}
      <View style={styles.circleArea}>
        {/* Active session resume card */}
        {activeSession && (
          <TouchableOpacity style={styles.resumeCard} onPress={handleResume} activeOpacity={0.8}>
            <View style={styles.resumeRow}>
              <MaterialIcons name="restaurant" size={22} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Meal in Progress</Text>
                <Text style={styles.resumeSub}>{activeSession.mealType} — Tap to resume</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color={theme.primary} />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.circleOuter}
          onPress={handleStartMeal}
          activeOpacity={0.85}
        >
          {/* Glow ring */}
          <View style={styles.circleGlow} />

          <View style={styles.circleInner}>
            {/* Min lock time */}
            <Text style={styles.circleMinLabel}>Min 5:00</Text>

            {/* App icons row */}
            <View style={styles.circleIconRow}>
              {blockedApps.slice(0, 5).map((app) => (
                <View key={app.id} style={styles.circleAppIcon}>
                  <MaterialIcons name={app.icon as any} size={16} color={theme.primary} />
                </View>
              ))}
            </View>

            <Text style={styles.circleAppsText}>
              {blockedApps.length} apps blocked
            </Text>

            {/* Edit link */}
            <TouchableOpacity
              style={styles.editBadge}
              onPress={(e) => {
                e.stopPropagation?.();
                navigation.navigate('BlockTab');
              }}
            >
              <MaterialIcons name="edit" size={12} color={theme.primary} />
              <Text style={styles.editBadgeText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Label below circle */}
        <Text style={styles.circleLabel}>Tap to Start Meal</Text>

        {/* Next meal section */}
        {nextMealInfo && (
          <View style={styles.nextMealCard}>
            <View style={styles.nextMealRow}>
              <MaterialIcons name="schedule" size={16} color={theme.primary} />
              <Text style={styles.nextMealTitle}>Next meal</Text>
            </View>
            <Text style={styles.nextMealDetail}>
              {nextMealInfo.name} • {nextMealInfo.time} • in {nextMealInfo.countdown}
            </Text>
            <TouchableOpacity
              style={styles.viewPlannerBtn}
              onPress={() => navigation.navigate('PlannerTab')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewPlannerText}>View Planner</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 8,
    },
    profileBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    statRow: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      gap: 12,
      marginTop: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: 'rgba(28,28,30,0.8)',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 4,
    },
    statLabel: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.text,
    },
    circleArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    circleOuter: {
      width: CIRCLE_SIZE,
      height: CIRCLE_SIZE,
      borderRadius: CIRCLE_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    circleGlow: {
      position: 'absolute',
      width: CIRCLE_SIZE + 4,
      height: CIRCLE_SIZE + 4,
      borderRadius: (CIRCLE_SIZE + 4) / 2,
      borderWidth: 2,
      borderColor: 'rgba(52,199,89,0.35)',
      top: -2,
      left: -2,
    },
    circleInner: {
      width: CIRCLE_SIZE - 8,
      height: CIRCLE_SIZE - 8,
      borderRadius: (CIRCLE_SIZE - 8) / 2,
      backgroundColor: 'rgba(20,20,22,0.9)',
      borderWidth: 2,
      borderColor: 'rgba(52,199,89,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    circleMinLabel: {
      fontSize: 28,
      fontWeight: '300',
      color: theme.text,
      marginBottom: 12,
      fontVariant: ['tabular-nums'],
    },
    circleIconRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
    },
    circleAppIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    circleAppsText: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 8,
    },
    editBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(52,199,89,0.15)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    editBadgeText: {
      fontSize: 12,
      color: theme.primary,
      fontWeight: '600',
    },
    circleLabel: {
      fontSize: 16,
      color: theme.textSecondary,
      marginTop: 20,
      fontWeight: '500',
    },
    nextMealCard: {
      marginTop: 16,
      backgroundColor: 'rgba(28,28,30,0.8)',
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      width: '80%',
    },
    nextMealRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    nextMealTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primary,
    },
    nextMealDetail: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 10,
      textAlign: 'center',
    },
    viewPlannerBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: theme.primaryDim,
    },
    viewPlannerText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.primary,
    },
    resumeCard: {
      backgroundColor: theme.primaryDim,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      width: '85%',
      borderWidth: 1,
      borderColor: theme.primary + '44',
    },
    resumeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    resumeTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    resumeSub: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
  });
