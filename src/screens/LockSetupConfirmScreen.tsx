/**
 * LockSetupConfirm — confirms blocked apps + meal type, then starts the session.
 *
 * Receives preImageUri + preCheck from PreScanCamera.
 * On "Start Meal" → creates session → navigates to MealSessionActive.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MealType } from '../types/models';
import type { FoodCheckResult } from '../services/vision/types';

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Custom'];

type Props = NativeStackScreenProps<any, 'LockSetupConfirm'>;

export default function LockSetupConfirmScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { blockConfig, startSession } = useAppState();
  const {
    preImageUri,
    preCheck,
    overrideUsed: routeOverride,
  } = (route.params as {
    preImageUri?: string;
    preCheck?: FoodCheckResult;
    overrideUsed?: boolean;
  }) || {};

  const detectMealType = (): MealType => {
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
      await startSession(
        selectedMealType,
        '', // note
        true, // strictMode
        preImageUri,
        undefined, // foodName — GPT doesn't return a label
        preCheck,
      );
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main' },
          { name: 'MealSessionActive', params: { mealType: selectedMealType } },
        ],
      });
    } catch (e) {
      console.error('Failed to start session:', e);
      setStarting(false);
    }
  };

  const s = makeStyles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Confirm & Lock</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Before photo thumbnail */}
        {preImageUri && (
          <View style={s.thumbRow}>
            <Image source={{ uri: preImageUri }} style={s.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.thumbLabel}>Before Photo</Text>
              {preCheck?.roastLine ? (
                <Text style={s.thumbSub}>{preCheck.roastLine}</Text>
              ) : null}
            </View>
            <MaterialIcons name="check-circle" size={22} color={theme.success} />
          </View>
        )}

        {routeOverride && (
          <View style={[s.overrideBadge, { backgroundColor: theme.warning + '22' }]}>
            <MaterialIcons name="warning" size={18} color={theme.warning} />
            <Text style={[s.overrideText, { color: theme.warning }]}>
              Photo skipped — meal won't be verified
            </Text>
          </View>
        )}

        {/* Meal type selector */}
        <Text style={s.sectionLabel}>Meal Type</Text>
        <View style={s.mealTypeRow}>
          {MEAL_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[s.mealTypeChip, selectedMealType === type && s.mealTypeChipSelected]}
              onPress={() => setSelectedMealType(type)}
            >
              <Text style={[s.mealTypeText, selectedMealType === type && s.mealTypeTextSelected]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* App count */}
        <View style={s.countBadge}>
          <MaterialIcons name="lock" size={20} color={theme.primary} />
          <Text style={s.countText}>
            {blockedApps.length} app{blockedApps.length !== 1 ? 's' : ''} will be blocked
          </Text>
        </View>

        {/* App chips */}
        <View style={s.chipGrid}>
          {blockedApps.map((app) => (
            <View key={app.id} style={s.appChip}>
              <MaterialIcons name={app.icon as any} size={20} color={theme.primary} />
              <Text style={s.appChipText}>{app.name}</Text>
            </View>
          ))}
        </View>

        {blockedApps.length === 0 && (
          <View style={s.emptyState}>
            <MaterialIcons name="lock-open" size={48} color={theme.textMuted} />
            <Text style={s.emptyText}>No apps selected. Go to Block tab to add.</Text>
          </View>
        )}

        {/* Confirmation checkbox */}
        <TouchableOpacity
          style={s.confirmRow}
          onPress={() => setConfirmed(!confirmed)}
          activeOpacity={0.7}
        >
          <View style={[s.checkbox, confirmed && s.checkboxChecked]}>
            {confirmed && <MaterialIcons name="check" size={16} color="#FFF" />}
          </View>
          <Text style={s.confirmText}>
            I understand these apps will be blocked until I finish eating.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Start button */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.startBtn, (!confirmed || starting) && s.startBtnDisabled]}
          onPress={handleStart}
          disabled={!confirmed || starting}
        >
          <MaterialIcons
            name="restaurant"
            size={20}
            color={confirmed && !starting ? '#FFF' : theme.textMuted}
          />
          <Text
            style={[s.startBtnText, (!confirmed || starting) && s.startBtnTextDisabled]}
          >
            {starting ? 'Starting...' : 'Start Meal'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    thumbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    thumb: { width: 56, height: 56, borderRadius: 10 },
    thumbLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    thumbSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    overrideBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    overrideText: { fontSize: 13, fontWeight: '600' },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 8,
      marginBottom: 8,
    },
    mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    mealTypeChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.chipBg,
    },
    mealTypeChipSelected: {
      backgroundColor: c.chipSelectedBg,
      borderColor: c.primary,
      borderWidth: 1,
    },
    mealTypeText: { fontSize: 14, color: c.textSecondary },
    mealTypeTextSelected: { color: c.primary, fontWeight: '600' },
    countBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.primaryDim,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      marginTop: 8,
      marginBottom: 20,
      alignSelf: 'flex-start',
    },
    countText: { color: c.primary, fontSize: 15, fontWeight: '600' },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
    appChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    appChipText: { color: c.text, fontSize: 14, fontWeight: '500' },
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: c.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    confirmText: { flex: 1, color: c.text, fontSize: 14, lineHeight: 20 },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: c.background,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: 16,
      paddingVertical: 16,
    },
    startBtnDisabled: { backgroundColor: c.surfaceElevated },
    startBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
    startBtnTextDisabled: { color: c.textMuted },
  });
