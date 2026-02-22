import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MealType } from '../types/models';

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Custom'];

export default function LockedAppsConfirmScreen() {
  const { theme } = useTheme();
  const { blockConfig, startSession } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { mealType: routeMealType, note, beforePhotoPath, foodName, roast } = route.params || {};

  // Detect sensible default from time of day
  const detectMealType = (): MealType => {
    if (routeMealType) return routeMealType;
    const h = new Date().getHours();
    if (h < 11) return 'Breakfast';
    if (h < 15) return 'Lunch';
    if (h < 20) return 'Dinner';
    return 'Snack';
  };

  const [selectedMealType, setSelectedMealType] = useState<MealType>(detectMealType());
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);

  const blockedApps = blockConfig.blockedApps;

  const handleStart = async () => {
    if (!confirmed || starting) return;
    setStarting(true);
    try {
      await startSession(selectedMealType, note || '', true, beforePhotoPath, foodName);
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main' },
          {
            name: 'StrictModeSession',
            params: { mealType: selectedMealType, note, resuming: true },
          },
        ],
      });
    } catch (e) {
      console.error('Failed to start session:', e);
      setStarting(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Locked Apps During This Meal</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meal type selector */}
        <Text style={styles.sectionLabel}>Meal Type</Text>
        <View style={styles.mealTypeRow}>
          {MEAL_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.mealTypeChip, selectedMealType === type && styles.mealTypeChipSelected]}
              onPress={() => setSelectedMealType(type)}
            >
              <Text style={[styles.mealTypeText, selectedMealType === type && styles.mealTypeTextSelected]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Vision roast line */}
        {roast ? (
          <View style={styles.roastCard}>
            <Text style={styles.roastText}>"{roast}"</Text>
          </View>
        ) : null}

        {/* App count */}
        <View style={styles.countBadge}>
          <MaterialIcons name="lock" size={20} color={theme.primary} />
          <Text style={styles.countText}>
            {blockedApps.length} app{blockedApps.length !== 1 ? 's' : ''} will be blocked
          </Text>
        </View>

        {/* App chips */}
        <View style={styles.chipGrid}>
          {blockedApps.map((app) => (
            <View key={app.id} style={styles.appChip}>
              <MaterialIcons name={app.icon as any} size={20} color={theme.primary} />
              <Text style={styles.appChipText}>{app.name}</Text>
            </View>
          ))}
        </View>

        {blockedApps.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="lock-open" size={48} color={theme.textMuted} />
            <Text style={styles.emptyText}>
              No apps selected for blocking. Go to the Block tab to add apps.
            </Text>
          </View>
        )}

        {/* Confirmation checkbox */}
        <TouchableOpacity
          style={styles.confirmRow}
          onPress={() => setConfirmed(!confirmed)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
            {confirmed && <MaterialIcons name="check" size={16} color="#FFF" />}
          </View>
          <Text style={styles.confirmText}>
            I understand these apps will be blocked during this meal.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Start button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.startBtn, (!confirmed || starting) && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!confirmed || starting}
        >
          <MaterialIcons
            name="lock"
            size={20}
            color={confirmed && !starting ? '#FFF' : theme.textMuted}
          />
          <Text
            style={[
              styles.startBtnText,
              (!confirmed || starting) && styles.startBtnTextDisabled,
            ]}
          >
            {starting ? 'Starting...' : 'Start'}
          </Text>
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: theme.text },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 120,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      marginTop: 8,
      marginBottom: 8,
    },
    mealTypeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    mealTypeChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.chipBg,
    },
    mealTypeChipSelected: {
      backgroundColor: theme.chipSelectedBg,
      borderColor: theme.primary,
      borderWidth: 1,
    },
    mealTypeText: { fontSize: 14, color: theme.textSecondary },
    mealTypeTextSelected: { color: theme.primary, fontWeight: '600' },
    roastCard: {
      backgroundColor: theme.primaryDim,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      alignItems: 'center',
    },
    roastText: { color: theme.primary, fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
    countBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.primaryDim,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      marginTop: 8,
      marginBottom: 20,
      alignSelf: 'flex-start',
    },
    countText: {
      color: theme.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 30,
    },
    appChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    appChipText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 12,
    },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    confirmText: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: theme.background,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
    },
    startBtnDisabled: {
      backgroundColor: theme.surfaceElevated,
    },
    startBtnText: {
      color: '#FFF',
      fontSize: 17,
      fontWeight: '600',
    },
    startBtnTextDisabled: {
      color: theme.textMuted,
    },
  });
