import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Linking,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { ThemeName, themes } from '../theme/colors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { DEFAULT_DAILY_CALORIE_GOAL } from '../types/models';
import { computeMacroTargetsFromCalories } from '../utils/helpers';
import { fetchRemoteUserSettings, setMicronutrientsEnabled } from '../services/userSettingsService';

export default function SettingsScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { settings, updateSettings, clearAll } = useAppState();
  const navigation = useNavigation<any>();

  const themeNames = Object.keys(themes) as ThemeName[];
  const [calorieGoalInput, setCalorieGoalInput] = useState(String(settings.nutritionGoals.dailyCalorieGoal));
  const [microsEnabled, setMicrosEnabled] = useState(false);
  const [microsLoading, setMicrosLoading] = useState(true);

  // Load remote micronutrients toggle on focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setMicrosLoading(true);
      fetchRemoteUserSettings().then((s) => {
        if (!cancelled) {
          setMicrosEnabled(s.micronutrients_enabled);
          setMicrosLoading(false);
        }
      }).catch(() => {
        if (!cancelled) setMicrosLoading(false);
      });
      return () => { cancelled = true; };
    }, []),
  );

  const toggleMicrosEnabled = async () => {
    const next = !microsEnabled;
    setMicrosEnabled(next);
    try {
      await setMicronutrientsEnabled(next);
    } catch (e: any) {
      setMicrosEnabled(!next); // revert
      Alert.alert('Error', e?.message || 'Could not save setting');
    }
  };

  useEffect(() => {
    setCalorieGoalInput(String(settings.nutritionGoals.dailyCalorieGoal));
  }, [settings.nutritionGoals.dailyCalorieGoal]);

  const recommendedTargets = useMemo(
    () =>
      computeMacroTargetsFromCalories(
        Number.isFinite(Number(calorieGoalInput)) ? Number(calorieGoalInput) : settings.nutritionGoals.dailyCalorieGoal,
        settings.nutritionGoals.macroSplit,
      ),
    [calorieGoalInput, settings.nutritionGoals.dailyCalorieGoal, settings.nutritionGoals.macroSplit],
  );

  const toggleWidget = (key: keyof typeof settings.homeWidgets) => {
    updateSettings({
      ...settings,
      homeWidgets: {
        ...settings.homeWidgets,
        [key]: !settings.homeWidgets[key],
      },
    });
  };

  const toggleDevDisableQuotas = () => {
    updateSettings({
      ...settings,
      developer: {
        disableQuotasDev: !(settings.developer?.disableQuotasDev ?? false),
      },
    });
  };

  const commitCalorieGoal = () => {
    const parsed = Number(calorieGoalInput);
    const nextGoal = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_DAILY_CALORIE_GOAL;

    if (nextGoal !== settings.nutritionGoals.dailyCalorieGoal) {
      updateSettings({
        ...settings,
        nutritionGoals: {
          ...settings.nutritionGoals,
          dailyCalorieGoal: nextGoal,
        },
      });
    }
    setCalorieGoalInput(String(nextGoal));
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your meal schedules, sessions, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            clearAll().then(() => {
              Alert.alert('Done', 'All data has been cleared.');
            });
          },
        },
      ]
    );
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Image source={require('../../assets/icon.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Profile')}
        >
          <MaterialIcons name="person" size={22} color={theme.text} />
          <Text style={styles.rowText}>Profile</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Nutrition goals */}
        <Text style={styles.sectionLabel}>NUTRITION GOALS</Text>
        <View style={styles.widgetGroup}>
          <View style={styles.goalRow}>
            <Text style={styles.widgetLabel}>Daily calorie goal</Text>
            <View style={styles.goalInputWrap}>
              <TextInput
                style={styles.goalInput}
                value={calorieGoalInput}
                onChangeText={setCalorieGoalInput}
                onBlur={commitCalorieGoal}
                onEndEditing={commitCalorieGoal}
                keyboardType="number-pad"
                returnKeyType="done"
                placeholder="2000"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={styles.goalUnit}>kcal</Text>
            </View>
          </View>

          <View style={styles.goalDivider} />

          <View style={styles.goalInfoRow}>
            <Text style={styles.goalInfoLabel}>Split</Text>
            <Text style={styles.goalInfoValue}>Carbs 50% · Protein 20% · Fat 30%</Text>
          </View>
          <View style={styles.goalInfoRow}>
            <Text style={styles.goalInfoLabel}>Recommended targets</Text>
            <Text style={styles.goalInfoValue}>
              {recommendedTargets.carbsGoalG}g carbs · {recommendedTargets.proteinGoalG}g protein · {recommendedTargets.fatGoalG}g fat
            </Text>
          </View>
        </View>

        {/* Permissions */}
        <Text style={styles.sectionLabel}>PERMISSIONS</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('PermissionsOnboarding')}
        >
          <MaterialIcons name="security" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Permissions setup</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('NotificationHelp')}
        >
          <MaterialIcons name="notifications-active" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Notification troubleshooting</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Themes */}
        <Text style={styles.sectionLabel}>THEMES</Text>
        <View style={styles.themeRow}>
          {themeNames.map((name) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.themeOption,
                themeName === name && styles.themeOptionSelected,
              ]}
              onPress={() => setThemeName(name)}
            >
              <View
                style={[
                  styles.themePreview,
                  { backgroundColor: themes[name].background },
                  { borderColor: themes[name].primary, borderWidth: 2 },
                ]}
              >
                <View
                  style={[
                    styles.themeAccent,
                    { backgroundColor: themes[name].primary },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.themeName,
                  themeName === name && { color: theme.primary },
                ]}
              >
                {name}
              </Text>
              {themeName === name && (
                <MaterialIcons name="check-circle" size={16} color={theme.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Home Widgets */}
        <Text style={styles.sectionLabel}>HOME WIDGETS</Text>
        <View style={styles.widgetGroup}>
          <View style={styles.widgetRow}>
            <Text style={styles.widgetLabel}>Show fun quips</Text>
            <Switch
              value={settings.homeWidgets.showTruthBomb}
              onValueChange={() => toggleWidget('showTruthBomb')}
              trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
              thumbColor={settings.homeWidgets.showTruthBomb ? theme.primary : theme.textMuted}
            />
          </View>
          <View style={styles.widgetRow}>
            <Text style={styles.widgetLabel}>Show next meal</Text>
            <Switch
              value={settings.homeWidgets.showNextMeal}
              onValueChange={() => toggleWidget('showNextMeal')}
              trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
              thumbColor={settings.homeWidgets.showNextMeal ? theme.primary : theme.textMuted}
            />
          </View>
          <View style={[styles.widgetRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.widgetLabel}>Show locked apps</Text>
            <Switch
              value={settings.homeWidgets.showLockedApps}
              onValueChange={() => toggleWidget('showLockedApps')}
              trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
              thumbColor={settings.homeWidgets.showLockedApps ? theme.primary : theme.textMuted}
            />
          </View>
        </View>

        {/* Micronutrients (beta) */}
        <Text style={styles.sectionLabel}>MICRONUTRIENTS</Text>
        <View style={styles.widgetGroup}>
          <View style={[styles.widgetRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.widgetLabel}>Micronutrients (beta)</Text>
              <Text style={[styles.goalInfoLabel, { marginTop: 2 }]}>
                Track fiber, sugar, sodium, sat. fat & more
              </Text>
            </View>
            {microsLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Switch
                value={microsEnabled}
                onValueChange={toggleMicrosEnabled}
                trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
                thumbColor={microsEnabled ? theme.primary : theme.textMuted}
              />
            )}
          </View>
        </View>

        {__DEV__ && (
          <>
            <Text style={styles.sectionLabel}>DEVELOPER</Text>
            <View style={styles.widgetGroup}>
              <View style={[styles.widgetRow, { borderBottomWidth: 0 }]}> 
                <Text style={styles.widgetLabel}>Disable quotas (dev)</Text>
                <Switch
                  value={settings.developer?.disableQuotasDev ?? false}
                  onValueChange={toggleDevDisableQuotas}
                  trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
                  thumbColor={(settings.developer?.disableQuotasDev ?? false) ? theme.primary : theme.textMuted}
                />
              </View>
            </View>
          </>
        )}

        {/* General */}
        <Text style={styles.sectionLabel}>GENERAL</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }}
        >
          <MaterialIcons name="notifications-none" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Notification settings</Text>
          <MaterialIcons name="open-in-new" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <MaterialIcons name="file-download" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Data export</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Social */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <TouchableOpacity style={styles.row}>
          <MaterialIcons name="share" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Share us</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <MaterialIcons name="feedback" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Give feedback</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <MaterialIcons name="star-outline" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>Rate us 5 stars</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <MaterialIcons name="help-outline" size={22} color={theme.textSecondary} />
          <Text style={styles.rowText}>FAQs</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAccount}>
          <MaterialIcons name="delete-forever" size={22} color={theme.danger} />
          <Text style={styles.dangerRowText}>Delete account / Clear data</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerLogo: {
      width: 22,
      height: 22,
      borderRadius: 6,
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted,
      marginTop: 28,
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rowText: { flex: 1, fontSize: 15, color: theme.text },
    themeRow: { gap: 8 },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    themeOptionSelected: {
      borderColor: theme.primary,
    },
    themePreview: {
      width: 36,
      height: 36,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    themeAccent: {
      width: 16,
      height: 16,
      borderRadius: 4,
    },
    themeName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: theme.text,
    },
    widgetGroup: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    widgetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    widgetLabel: { fontSize: 15, color: theme.text },
    goalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    goalInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      minWidth: 110,
      height: 40,
    },
    goalInput: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
      minWidth: 56,
      textAlign: 'right',
    },
    goalUnit: {
      marginLeft: 8,
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    goalDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 16,
    },
    goalInfoRow: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 2,
      gap: 4,
    },
    goalInfoLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
    goalInfoValue: { fontSize: 14, color: theme.textSecondary, lineHeight: 19 },
    dangerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: 'rgba(255,69,58,0.08)',
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,69,58,0.2)',
    },
    dangerRowText: { fontSize: 15, color: theme.danger, fontWeight: '500' },
  });
