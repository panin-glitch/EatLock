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
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { withAlpha } from '../theme/colorUtils';
import { useAppState } from '../state/AppStateContext';
import { useAuth } from '../state/AuthContext';
import { useRevenueCat } from '../state/RevenueCatContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchRemoteUserSettings, setMicronutrientsEnabled } from '../services/userSettingsService';
import { signOut } from '../services/authService';
import { findPackageForPlan, hasTadLockProEntitlement } from '../services/revenueCat';
import { languageToLocale } from '../utils/locale';

function Row({
  theme,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
}: {
  theme: ThemeColors;
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
      accessibilityRole={touchable ? 'button' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
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
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>

      {right ?? (
        <>
          {value ? <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{value}</Text> : null}
          {touchable ? <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { theme, themeName } = useTheme();
  const { user } = useAuth();
  const { settings, updateSettings, clearAll } = useAppState();
  const {
    isSupported: subscriptionsSupported,
    isLoading: subscriptionsLoading,
    isPro,
    currentOffering,
    restorePurchases,
    presentCustomerCenter,
    presentPaywall,
  } = useRevenueCat();
  const navigation = useNavigation<any>();
  const localeTag = useMemo(() => languageToLocale(settings.language), [settings.language]);
  const isAnonymous = !user?.email;

  const [microsEnabled, setMicrosEnabled] = useState(false);
  const [microsLoading, setMicrosLoading] = useState(true);
  const [subscriptionAction, setSubscriptionAction] = useState<'paywall' | 'restore' | 'manage' | null>(null);

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

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Sign out of your account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            navigation.navigate('Auth');
          } catch (error: any) {
            Alert.alert('Sign out failed', error?.message || 'Could not sign out.');
          }
        },
      },
    ]);
  }, [navigation]);

  const handleClearDeviceData = useCallback(() => {
    Alert.alert(
      'Clear device data',
      'This clears meal history and settings stored on this device, then signs you out. Cloud-synced account data is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear device data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAll();
              await signOut().catch(() => undefined);
              Alert.alert('Device data cleared', 'Local data was cleared and this device was signed out.');
              navigation.navigate('Auth');
            } catch (error: any) {
              Alert.alert('Clear failed', error?.message || 'Could not clear device data.');
            }
          },
        },
      ],
    );
  }, [clearAll, navigation]);

  const macroValue = useMemo(() => {
    const carbs = Math.round(settings.nutritionGoals.macroSplit.carbsPct * 100);
    const protein = Math.round(settings.nutritionGoals.macroSplit.proteinPct * 100);
    const fat = Math.round(settings.nutritionGoals.macroSplit.fatPct * 100);
    return `${carbs}/${protein}/${fat}`;
  }, [settings.nutritionGoals.macroSplit]);

  const sectionTitle = (label: string) => (
    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{label}</Text>
  );

  const cardStyle = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }];
  const tones = useMemo(
    () => ({
      primary: { bg: withAlpha(theme.primary, 0.16), fg: theme.primary },
      warning: { bg: withAlpha(theme.warning, 0.16), fg: theme.warning },
      success: { bg: withAlpha(theme.success, 0.16), fg: theme.success },
      danger: { bg: withAlpha(theme.danger, 0.14), fg: theme.danger },
      neutral: { bg: theme.chipBg, fg: theme.textSecondary },
    }),
    [theme],
  );
  const monthlyPackage = useMemo(() => findPackageForPlan(currentOffering, 'monthly'), [currentOffering]);
  const yearlyPackage = useMemo(() => findPackageForPlan(currentOffering, 'yearly'), [currentOffering]);
  const plusSubtitle = useMemo(() => {
    if (!subscriptionsSupported) {
      return 'TadLock Pro purchases are available on iOS development builds.';
    }
    if (isAnonymous) {
      return 'Create an account before purchasing or restoring TadLock Pro.';
    }
    if (isPro) {
      return 'Your TadLock Pro entitlement is active on this account.';
    }

    const priceParts = [monthlyPackage?.product.priceString, yearlyPackage?.product.priceString].filter(Boolean);
    if (priceParts.length === 2) {
      return `Monthly ${priceParts[0]} | Yearly ${priceParts[1]}`;
    }

    return 'Unlock personalized insights and advanced tracking.';
  }, [isAnonymous, isPro, monthlyPackage?.product.priceString, subscriptionsSupported, yearlyPackage?.product.priceString]);

  const routeToAuth = useCallback(() => {
    navigation.navigate('Auth');
  }, [navigation]);

  const handleManageSubscription = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'Subscription management is currently available on iOS development builds.');
      return;
    }
    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before managing subscriptions.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }

    setSubscriptionAction('manage');
    try {
      await presentCustomerCenter();
    } catch (error: any) {
      Alert.alert(
        'Customer Center unavailable',
        error?.message ?? 'Open App Store subscriptions to manage your plan, or restore purchases here.',
      );
    } finally {
      setSubscriptionAction(null);
    }
  }, [isAnonymous, presentCustomerCenter, routeToAuth, subscriptionsSupported]);

  const handleRestorePurchases = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'Purchase restoration is currently available on iOS development builds.');
      return;
    }
    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before restoring purchases.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }

    setSubscriptionAction('restore');
    try {
      const restored = await restorePurchases();
      if (hasTadLockProEntitlement(restored)) {
        Alert.alert('TadLock Pro restored', 'Your TadLock Pro access is active on this account.');
      } else {
        Alert.alert('No purchases found', 'No TadLock Pro purchases were found for this App Store account.');
      }
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message ?? 'Could not restore purchases.');
    } finally {
      setSubscriptionAction(null);
    }
  }, [isAnonymous, restorePurchases, routeToAuth, subscriptionsSupported]);

  const handleOpenPlus = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'TadLock Pro purchases are currently available on iOS development builds.');
      return;
    }
    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before purchasing TadLock Pro.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }
    if (isPro) {
      await handleManageSubscription();
      return;
    }

    setSubscriptionAction('paywall');
    try {
      const result = await presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED) {
        Alert.alert('Welcome to TadLock Pro', 'Your subscription is active.');
      } else if (result === PAYWALL_RESULT.RESTORED) {
        Alert.alert('Purchases restored', 'Your TadLock Pro access has been restored.');
      } else if (result === PAYWALL_RESULT.ERROR) {
        Alert.alert('Paywall error', 'The paywall could not complete your request.');
      }
    } catch (error: any) {
      Alert.alert('Subscription unavailable', error?.message ?? 'Could not open TadLock Pro right now.');
    } finally {
      setSubscriptionAction(null);
    }
  }, [handleManageSubscription, isAnonymous, isPro, presentPaywall, routeToAuth, subscriptionsSupported]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.plusBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.plusOverlay, { backgroundColor: withAlpha(theme.primary, 0.08) }]} />
          <View style={{ zIndex: 1 }}>
            <View style={styles.plusTopRow}>
              <Text style={[styles.plusTag, { backgroundColor: theme.primary, color: theme.onPrimary }]}>
                {isPro ? 'Pro' : 'Plus'}
              </Text>
              <Text style={[styles.plusTitle, { color: theme.text }]}>
                {isPro ? 'TadLock Pro Active' : 'Try TadLock Plus'}
              </Text>
            </View>
            <Text style={[styles.plusSub, { color: theme.textSecondary }]}>{plusSubtitle}</Text>
            <TouchableOpacity
              style={[
                styles.plusBtn,
                { backgroundColor: theme.primary },
                (subscriptionAction === 'paywall' || subscriptionsLoading) && styles.plusBtnDisabled,
              ]}
              onPress={handleOpenPlus}
              activeOpacity={0.85}
              disabled={subscriptionAction === 'paywall' || subscriptionsLoading}
            >
              {subscriptionAction === 'paywall' || subscriptionsLoading ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <Text style={[styles.plusBtnText, { color: theme.onPrimary }]}>
                  {isAnonymous ? 'Create account' : isPro ? 'Manage plan' : 'Get Plus'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {sectionTitle('SUBSCRIPTIONS')}
        <View style={cardStyle}>
          <Row
            theme={theme}
            icon="stars"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="TadLock Pro"
            subtitle={isPro ? 'Subscription active on this account' : plusSubtitle}
            value={isPro ? 'Active' : subscriptionsSupported ? 'Inactive' : 'iOS only'}
            onPress={handleOpenPlus}
          />
          <Row
            theme={theme}
            icon="restore"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Restore purchases"
            subtitle="Sync App Store purchases to this account"
            value={subscriptionAction === 'restore' ? 'Working...' : undefined}
            onPress={handleRestorePurchases}
          />
          <Row
            theme={theme}
            icon="manage-accounts"
            iconBg={tones.success.bg}
            iconColor={tones.success.fg}
            title="Manage subscription"
            subtitle="Open RevenueCat Customer Center"
            value={subscriptionAction === 'manage' ? 'Opening...' : undefined}
            onPress={handleManageSubscription}
          />
        </View>

        {sectionTitle('GOALS')}
        <View style={cardStyle}>
          <Row
            theme={theme}
            icon="local-fire-department"
            iconBg={tones.warning.bg}
            iconColor={tones.warning.fg}
            title="Calories"
            subtitle="Daily target"
            value={`${settings.nutritionGoals.dailyCalorieGoal.toLocaleString(localeTag)} cal`}
            onPress={() => navigation.push('CalorieSetting')}
          />
          <Row
            theme={theme}
            icon="pie-chart"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Macros"
            subtitle="Custom ratio"
            value={macroValue}
            onPress={() => navigation.push('MacroBalanceSetting')}
          />
          <Row
            theme={theme}
            icon="sync"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Recalculate plan"
            subtitle="Based on latest stats"
            onPress={() => Alert.alert('Plan recalculated', 'Your nutrition plan is up to date.')}
          />
        </View>

        {sectionTitle('EATING PREFERENCES')}
        <View style={cardStyle}>
          <Row
            theme={theme}
            icon="restaurant"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="Diet"
            subtitle="Current strategy"
            value="High protein"
            onPress={() => navigation.push('DietSelection')}
          />
          <Row
            theme={theme}
            icon="fastfood"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="Meals per day"
            subtitle="Frequency"
            value="3 meals"
            onPress={() => navigation.push('MealFrequencySetting')}
          />
          <Row
            theme={theme}
            icon="biotech"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="Micronutrients"
            subtitle="Track vitamins & minerals"
            right={
              microsLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Switch
                  value={microsEnabled}
                  onValueChange={toggleMicrosEnabled}
                  trackColor={{ false: theme.border, true: theme.primaryDim }}
                  thumbColor={microsEnabled ? theme.primary : theme.textMuted}
                />
              )
            }
          />
        </View>

        {sectionTitle('APPLE HEALTH')}
        <View style={cardStyle}>
          <Row
            theme={theme}
            icon="favorite"
            iconBg={tones.danger.bg}
            iconColor={tones.danger.fg}
            title="Apple Health"
            value="Soon"
          />
          <Row
            theme={theme}
            icon="arrow-upward"
            iconBg={tones.warning.bg}
            iconColor={tones.warning.fg}
            title="Send Calories to Health"
            right={<Switch value={healthToggles.sendCalories} onValueChange={(v) => setHealthToggles((p) => ({ ...p, sendCalories: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.sendCalories ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="arrow-upward"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Send Macros to Health"
            right={<Switch value={healthToggles.sendMacros} onValueChange={(v) => setHealthToggles((p) => ({ ...p, sendMacros: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.sendMacros ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="local-fire-department"
            iconBg={tones.warning.bg}
            iconColor={tones.warning.fg}
            title="Read Burned Calories"
            right={<Switch value={healthToggles.readBurned} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readBurned: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.readBurned ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="hotel"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Read Resting Energy"
            subtitle="Base calories your body burns"
            right={<Switch value={healthToggles.readResting} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readResting: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.readResting ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="directions-walk"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Read Steps"
            right={<Switch value={healthToggles.readSteps} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readSteps: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.readSteps ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="fitness-center"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="Read Workouts"
            right={<Switch value={healthToggles.readWorkouts} onValueChange={(v) => setHealthToggles((p) => ({ ...p, readWorkouts: v }))} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={healthToggles.readWorkouts ? theme.primary : theme.textMuted} />}
          />
        </View>

        {sectionTitle('APPLICATIONS')}
        <View style={cardStyle}>
          <Row
            theme={theme}
            icon="vibration"
            iconBg={tones.primary.bg}
            iconColor={tones.primary.fg}
            title="Haptic feedback"
            subtitle="System vibrations"
            right={<Switch value={settings.app.hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={settings.app.hapticsEnabled ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="notifications"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Daily reminders"
            subtitle="Stay on track"
            right={<Switch value={settings.app.dailyRemindersEnabled} onValueChange={setDailyRemindersEnabled} trackColor={{ false: theme.border, true: theme.primaryDim }} thumbColor={settings.app.dailyRemindersEnabled ? theme.primary : theme.textMuted} />}
          />
          <Row
            theme={theme}
            icon="language"
            iconBg={tones.neutral.bg}
            iconColor={tones.neutral.fg}
            title="Language"
            subtitle="App interface"
            value={settings.language}
            onPress={() => navigation.push('LanguageSelection')}
          />
        </View>

        {sectionTitle('COMMUNITY')}
        <View style={cardStyle}>
          <Row theme={theme} icon="forum" iconBg={tones.neutral.bg} iconColor={tones.neutral.fg} title="Discord" subtitle="Join our community" value="Soon" />
          <Row theme={theme} icon="photo-camera" iconBg={tones.primary.bg} iconColor={tones.primary.fg} title="Instagram" subtitle="Follow us for tips" value="Soon" />
          <Row theme={theme} icon="bug-report" iconBg={tones.warning.bg} iconColor={tones.warning.fg} title="Report a bug" subtitle="Help us improve" value="Soon" />
          <Row theme={theme} icon="lightbulb" iconBg={tones.success.bg} iconColor={tones.success.fg} title="Feature requests" subtitle="What should we build next?" value="Soon" />
        </View>

        {sectionTitle('ACCOUNT')}
        <View style={cardStyle}>
          <Row theme={theme} icon="person" iconBg={tones.neutral.bg} iconColor={tones.neutral.fg} title="Profile" subtitle="Personal details" onPress={() => navigation.push('Profile')} />
          <Row theme={theme} icon="mail" iconBg={tones.neutral.bg} iconColor={tones.neutral.fg} title="Email" subtitle="Manage your contact info" onPress={() => navigation.push('Profile')} />

          <TouchableOpacity
            style={[styles.signOutRow, { borderBottomColor: theme.border }]}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <View style={[styles.iconBox, { backgroundColor: tones.danger.bg }]}>
              <MaterialIcons name="logout" size={20} color={tones.danger.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.signOutTitle, { color: theme.danger }]}>Sign out</Text>
              <Text style={[styles.signOutSub, { color: theme.textSecondary }]}>Logout from your account</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteRow}
            onPress={() => {
              handleClearDeviceData();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear device data"
          >
            <View style={[styles.iconBox, { backgroundColor: tones.danger.bg }]}>
              <MaterialIcons name="delete" size={20} color={tones.danger.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.deleteTitle, { color: theme.danger }]}>Clear Device Data</Text>
              <Text style={[styles.deleteSub, { color: theme.textSecondary }]}>Remove local data and sign out</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
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
    borderWidth: 1,
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
    borderWidth: 1,
    overflow: 'hidden',
  },
  plusOverlay: StyleSheet.absoluteFillObject,
  plusTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plusTag: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  plusTitle: { fontSize: 22, fontWeight: '800' },
  plusSub: { fontSize: 13, marginTop: 8, maxWidth: 240 },
  plusBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  plusBtnDisabled: { opacity: 0.7 },
  plusBtnText: { fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
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
  },
  signOutTitle: { fontSize: 14, fontWeight: '700' },
  signOutSub: { fontSize: 12, marginTop: 2 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  deleteTitle: { fontSize: 14, fontWeight: '700' },
  deleteSub: { fontSize: 12, marginTop: 2 },
});
