import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { computeStreak } from '../utils/helpers';

export default function StreakDetailsScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const { sessions } = useAppState();
  const streak = computeStreak(sessions);

  const days = Math.max(0, streak.current);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const s = makeStyles(theme);

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Streak</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.hero}>
        <View style={s.flameBadge}>
          <MaterialIcons name="local-fire-department" size={52} color="#F97316" />
        </View>
        <Text style={s.bigNumber}>{days}</Text>
        <Text style={s.bigLabel}>Streak Days</Text>
        <Text style={s.subText}>This is the longest streak you've ever had!</Text>
      </View>

      <View style={s.comingSoonBand}>
        <Text style={s.comingSoonText}>Coming Soon: Achievements</Text>
      </View>

      <View style={s.calendarWrap}>
        <Text style={s.monthLabel}>Current Week</Text>
        <View style={s.calendarGrid}>
          {weekdays.map((d, idx) => {
            const active = idx < Math.min(days, 7);
            return (
              <View key={d} style={s.dayCol}>
                <Text style={s.dayName}>{d}</Text>
                <View style={[s.dayCircle, active && s.dayCircleActive]}>
                  <Text style={[s.dayNumber, active && s.dayNumberActive]}>{idx + 1}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.achievementBtn}
          onPress={() => navigation.navigate('StreakAchievement', { days: Math.max(1, days) })}
        >
          <Text style={s.achievementText}>View Achievement</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 54,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
    hero: { alignItems: 'center', paddingTop: 18, paddingHorizontal: 24, paddingBottom: 16 },
    flameBadge: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: '#FDBA7422',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    bigNumber: { fontSize: 84, fontWeight: '900', color: theme.text, lineHeight: 90 },
    bigLabel: { fontSize: 28, fontWeight: '800', color: theme.text },
    subText: { marginTop: 8, color: theme.textSecondary, fontSize: 14, textAlign: 'center' },
    comingSoonBand: {
      marginTop: 10,
      marginHorizontal: 20,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.border,
      paddingVertical: 16,
      alignItems: 'center',
    },
    comingSoonText: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: theme.textMuted,
      fontWeight: '800',
    },
    calendarWrap: { marginTop: 18, marginHorizontal: 20, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16 },
    monthLabel: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 14 },
    calendarGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 8 },
    dayName: { fontSize: 10, color: theme.textMuted, fontWeight: '700' },
    dayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    dayCircleActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    dayNumber: { fontSize: 12, color: theme.textSecondary, fontWeight: '700' },
    dayNumberActive: { color: theme.onPrimary },
    footer: { marginTop: 'auto', paddingHorizontal: 20, paddingBottom: 34, paddingTop: 18 },
    achievementBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    achievementText: { color: theme.onPrimary, fontSize: 18, fontWeight: '800' },
  });
