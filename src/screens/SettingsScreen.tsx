import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchRemoteUserSettings, setMicronutrientsEnabled } from '../services/userSettingsService';
import { languageToLocale } from '../utils/locale';

function Row({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const touchable = !!onPress;
  return (
    <TouchableOpacity
      activeOpacity={touchable ? 0.7 : 1}
      onPress={onPress}
      disabled={!touchable}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconBg,
        }}
      >
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{subtitle}</Text> : null}
      </View>

      {right ?? (
        <>
          {value ? <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>{value}</Text> : null}
          <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
        </>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { theme, themeName } = useTheme();
  const { settings, updateSettings, clearAll } = useAppState();
  const navigation = useNavigation<any>();
  const localeTag = useMemo(() => languageToLocale(settings.language), [settings.language]);

  const [microsEnabled, setMicrosEnabled] = useState(false);
  const [microsLoading, setMicrosLoading] = useState(true);

  const [healthToggles, setHealthToggles] = useState({
    sendCalories: false,
    sendMacros: false,
    readBurned: false,
    readResting: false,
    readSteps: false,
    readWorkouts: false,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setMicrosLoading(true);
      fetchRemoteUserSettings()
        .then((s) => {
          if (!cancelled) {
            setMicrosEnabled(s.micronutrients_enabled);
            setMicrosLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setMicrosLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggleMicrosEnabled = async () => {
    const next = !microsEnabled;
    setMicrosEnabled(next);
    try {
      await setMicronutrientsEnabled(next);
    } catch (e: any) {
      setMicrosEnabled(!next);
      Alert.alert('Error', e?.message || 'Could not save micronutrients setting');
    }
  };

  const setHapticsEnabled = (enabled: boolean) => {
    updateSettings({
      ...settings,
      app: {
        ...settings.app,
        hapticsEnabled: enabled,
      },
    }).catch(() => undefined);
  };

  const setDailyRemindersEnabled = (enabled: boolean) => {
    updateSettings({
      ...settings,
      app: {
        ...settings.app,
        dailyRemindersEnabled: enabled,
      },
    }).catch(() => undefined);
  };

  const macroValue = useMemo(() => {
    const carbs = Math.round(settings.nutritionGoals.macroSplit.carbsPct * 100);
    const protein = Math.round(settings.nutritionGoals.macroSplit.proteinPct * 100);
    const fat = Math.round(settings.nutritionGoals.macroSplit.fatPct * 100);
    return `${carbs}/${protein}/${fat}`;
  }, [settings.nutritionGoals.macroSplit]);

  const sectionTitle = (label: string) => (
    <Text style={styles.sectionLabel}>{label}</Text>
  );

  const cardStyle = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.plusBanner}>
          <View style={styles.plusOverlay} />
          <View style={{ zIndex: 1 }}>
            <View style={styles.plusTopRow}>
              <Text style={styles.plusTag}>Plus</Text>
              <Text style={styles.plusTitle}>Try Tadlock Plus</Text>
            </View>
            <Text style={styles.plusSub}>Unlock personalized insights and advanced tracking.</Text>
            <TouchableOpacity style={styles.plusBtn}>
              <Text style={styles.plusBtnText}>Get Plus</Text>
            </TouchableOpacity>
          </View>
        </View>

        {sectionTitle('GOALS')}
        <View style={cardStyle}>
          <Row
            icon="local-fire-department"
            iconBg="#FFF7ED"
            iconColor="#EA580C"
            title="Calories"
            subtitle="Daily target"
            value={`${settings.nutritionGoals.dailyCalorieGoal.toLocaleString(localeTag)} cal`}
            onPress={() => navigation.push('CalorieSetting')}
          />
          <Row
            icon="pie-chart"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            title="Macros"
            subtitle="Custom ratio"
            value={macroValue}
            onPress={() => navigation.push('MacroBalanceSetting')}
          />
          <Row
            icon="sync"
            iconBg="#F1F5F9"
            iconColor="#475569"
            title="Recalculate plan"
            subtitle="Based on latest stats"
            onPress={() => Alert.alert('Plan recalculated', 'Your nutrition plan is up to date.')}
          />
        </View>

        {sectionTitle('EATING PREFERENCES')}
        <View style={cardStyle}>
          <Row
            icon="restaurant"
            iconBg="#FEF3C7"
            iconColor="#CA8A04"
            title="Diet"
            subtitle="Current strategy"
            value="High protein"
            onPress={() => navigation.push('DietSelection')}
          />
          <Row
            icon="fastfood"
            iconBg="#FEF9C3"
            iconColor="#CA8A04"
            title="Meals per day"
            subtitle="Frequency"
            value="3 meals"
            onPress={() => navigation.push('MealFrequencySetting')}
          />
          <Row
            icon="biotech"
            iconBg="#FEF3C7"
            iconColor="#CA8A04"
            title="Micronutrients"
            subtitle="Track vitamins & minerals"
            right={
              microsLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Switch
                  value={microsEnabled}
                  onValueChange={toggleMicrosEnabled}
                  trackColor={{ false: '#E2E8F0', true: theme.primaryDim }}
                  thumbColor={microsEnabled ? theme.primary : '#94A3B8'}
                />
              )
            }
          />
        </View>

        {sectionTitle('APPLE HEALTH')}
        <View style={cardStyle}>
          <Row
            icon="favorite"
            iconBg="#FEE2E2"
            iconColor="#EF4444"
            title="Apple Health"
            onPress={() => {}}
          />
          <Row
            icon="arrow-upward"
            iconBg="#FFF7ED"
            iconColor="#F97316"
            title="Send Calories to Health"
            right={<Switch value={healthToggles.sendCalories} onValueChange={(v) => setHealthToggles((p) => ({ ...p, sendCalories: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.sendCalories ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="arrow-upward"
            iconBg="#EFF6FF"
            iconColor="#3B82F6"
            title="Send Macros to Health"
            right={<Switch value={healthToggles.sendMacros} onValueChange={(v) => setHealthToggles((p) => ({ ...p, sendMacros: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.sendMacros ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="local-fire-department"
            iconBg="#FFF7ED"
            iconColor="#EA580C"
            title="Read Burned Calories"
            right={<Switch value={healthToggles.readBurned} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readBurned: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.readBurned ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="hotel"
            iconBg="#F3E8FF"
            iconColor="#9333EA"
            title="Read Resting Energy"
            subtitle="Base calories your body burns"
            right={<Switch value={healthToggles.readResting} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readResting: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.readResting ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="directions-walk"
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            title="Read Steps"
            right={<Switch value={healthToggles.readSteps} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readSteps: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.readSteps ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="fitness-center"
            iconBg="#FEF3C7"
            iconColor="#CA8A04"
            title="Read Workouts"
            right={<Switch value={healthToggles.readWorkouts} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readWorkouts: v }))} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={healthToggles.readWorkouts ? theme.primary : '#94A3B8'} />}
          />
        </View>

        {sectionTitle('APPLICATIONS')}
        <View style={cardStyle}>
          <Row
            icon="vibration"
            iconBg="#FCE7F3"
            iconColor="#DB2777"
            title="Haptic feedback"
            subtitle="System vibrations"
            right={<Switch value={settings.app.hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={settings.app.hapticsEnabled ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="notifications"
            iconBg="#E0E7FF"
            iconColor="#4F46E5"
            title="Daily reminders"
            subtitle="Stay on track"
            right={<Switch value={settings.app.dailyRemindersEnabled} onValueChange={setDailyRemindersEnabled} trackColor={{ false: '#E2E8F0', true: theme.primaryDim }} thumbColor={settings.app.dailyRemindersEnabled ? theme.primary : '#94A3B8'} />}
          />
          <Row
            icon="language"
            iconBg="#F1F5F9"
            iconColor="#475569"
            title="Language"
            subtitle="App interface"
            value={settings.language}
            onPress={() => navigation.push('LanguageSelection')}
          />
        </View>

        {sectionTitle('COMMUNITY')}
        <View style={cardStyle}>
          <Row icon="forum" iconBg="#EFF6FF" iconColor="#2563EB" title="Discord" subtitle="Join our community" onPress={() => {}} />
          <Row icon="photo-camera" iconBg="#F5F3FF" iconColor="#7C3AED" title="Instagram" subtitle="Follow us for tips" onPress={() => {}} />
          <Row icon="bug-report" iconBg="#FFFBEB" iconColor="#D97706" title="Report a bug" subtitle="Help us improve" onPress={() => {}} />
          <Row icon="lightbulb" iconBg="#ECFEFF" iconColor="#0891B2" title="Feature requests" subtitle="What should we build next?" onPress={() => {}} />
        </View>

        {sectionTitle('ACCOUNT')}
        <View style={cardStyle}>
          <Row icon="person" iconBg="#F1F5F9" iconColor="#475569" title="Profile" subtitle="Personal details" onPress={() => navigation.push('Profile')} />
          <Row icon="mail" iconBg="#F1F5F9" iconColor="#475569" title="Email" subtitle="Manage your contact info" onPress={() => {}} />

          <TouchableOpacity
            style={styles.signOutRow}
            onPress={() => Alert.alert('Signed out', 'You can sign in again anytime.')}
          >
            <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
              <MaterialIcons name="logout" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signOutTitle}>Sign out</Text>
              <Text style={styles.signOutSub}>Logout from your account</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteRow} onPress={() => {
            Alert.alert('Delete Data', 'This will permanently erase your data. Continue?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await clearAll();
                  Alert.alert('Done', 'All data has been cleared.');
                },
              },
            ]);
          }}>
            <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
              <MaterialIcons name="delete" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deleteTitle}>Delete Data</Text>
              <Text style={styles.deleteSub}>Permanently erase your data</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
        <View style={{ height: 44 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 30, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  plusBanner: {
    borderRadius: 16,
    minHeight: 148,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },
  plusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.2)',
  },
  plusTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plusTag: {
    backgroundColor: '#FACC15',
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  plusTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  plusSub: { color: '#CBD5E1', fontSize: 13, marginTop: 8, maxWidth: 240 },
  plusBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#FACC15',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  plusBtnText: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#94A3B8',
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  signOutTitle: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  signOutSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  deleteTitle: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  deleteSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
