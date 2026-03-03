/**
 * TodaysMealsList — vertical list of meal sessions for the selected date.
 * Shows time, meal type, status pill, and food name.
 * Tap a row to see full detail modal with calories, macros, roast, distraction.
 * Empty-state when no sessions exist.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Pressable, Animated, Easing, Image, Alert, ActivityIndicator, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppState } from '../../state/AppStateContext';
import type { MealSession } from '../../types/models';
import type { MicrosEnrichResult } from '../../services/vision/types';
import { SwipeableRow } from '../SwipeableRow';
import { fetchRemoteUserSettings } from '../../services/userSettingsService';
import { enrichMicros, updateFoodLabel } from '../../services/microsService';

interface Props {
  sessions: MealSession[];
}

const statusConfig: Record<string, { color: string; label: string }> = {
  ACTIVE:     { color: '#FF9500', label: 'Active' },
  VERIFIED:   { color: '#34C759', label: 'Verified' },
  PARTIAL:    { color: '#FFCC00', label: 'Partial' },
  FAILED:     { color: '#FF3B30', label: 'Failed' },
  INCOMPLETE: { color: '#FF9500', label: 'Active' },
};

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function mealIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  switch (type) {
    case 'Breakfast': return 'free-breakfast';
    case 'Lunch': return 'lunch-dining';
    case 'Dinner': return 'dinner-dining';
    case 'Snack': return 'cookie';
    default: return 'restaurant';
  }
}

export default function TodaysMealsList({ sessions }: Props) {
  const { theme } = useTheme();
  const { deleteSession, updateActiveSession } = useAppState();
  const [selected, setSelected] = useState<MealSession | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(36)).current;
  const lightHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  // Micros toggle state
  const [microsEnabled, setMicrosEnabled] = useState(false);
  const [microsData, setMicrosData] = useState<MicrosEnrichResult | null>(null);
  const [microsLoading, setMicrosLoading] = useState(false);

  // Edit food label state
  const [editingLabel, setEditingLabel] = useState(false);
  const [editLabelText, setEditLabelText] = useState('');
  const [editLabelSaving, setEditLabelSaving] = useState(false);

  useEffect(() => {
    fetchRemoteUserSettings().then((s) => setMicrosEnabled(s.micronutrients_enabled)).catch(() => {});
  }, []);

  const handleEnrichMicros = useCallback(async (mealId: string) => {
    setMicrosLoading(true);
    try {
      const result = await enrichMicros(mealId);
      setMicrosData(result);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not enrich micros');
    } finally {
      setMicrosLoading(false);
    }
  }, []);

  const handleSaveFoodLabel = useCallback(async () => {
    if (!selected || !editLabelText.trim()) return;
    setEditLabelSaving(true);
    try {
      await updateFoodLabel(selected.id, editLabelText.trim());
      // Update local session
      setSelected((prev) => prev ? { ...prev, foodName: editLabelText.trim() } : prev);
      setEditingLabel(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update food label');
    } finally {
      setEditLabelSaving(false);
    }
  }, [selected, editLabelText]);

  const openDetail = (session: MealSession) => {
    lightHaptic();
    setSelected(session);
    setDetailVisible(true);
    setMicrosData(null);
    setMicrosLoading(false);
    setEditingLabel(false);
    setEditLabelText(session.foodName || session.preNutrition?.food_label || '');
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(36);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDetail = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 28,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDetailVisible(false);
      setSelected(null);
    });
  };

  if (sessions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="restaurant-menu" size={40} color={theme.textSecondary + '66'} />
        <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No meals logged yet</Text>
        <Text style={[styles.emptyHint, { color: theme.textSecondary + 'AA' }]}>
          Tap + to scan a meal
        </Text>
      </View>
    );
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const renderDetail = () => {
    if (!selected) return null;
    const sc = statusConfig[selected.status] ?? statusConfig.INCOMPLETE;
    const nut = selected.preNutrition;
    const stars = selected.distractionRating;
    const timeSpentMin = selected.endedAt
      ? Math.max(0, Math.round((new Date(selected.endedAt).getTime() - new Date(selected.startedAt).getTime()) / 60000))
      : null;
    return (
      <Modal
        visible={detailVisible}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={closeDetail}
      >
        <View style={styles.modalRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalOverlay, { opacity: backdropOpacity }]}
          />
          <Pressable style={styles.modalBackdropTap} onPress={closeDetail} />

          <Animated.View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                <MaterialIcons name={mealIcon(selected.mealType)} size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {selected.foodName || selected.mealType}
                </Text>
                <Text style={[styles.time, { color: theme.textSecondary }]}>
                  {formatSessionTime(selected.startedAt)}
                  {selected.endedAt ? ` – ${formatSessionTime(selected.endedAt)}` : ''}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: sc.color + '22' }]}>
                <Text style={[styles.pillText, { color: sc.color }]}>{sc.label}</Text>
              </View>
            </View>

            {/* Food label (editable) */}
            <View style={styles.detailSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Food</Text>
                {!editingLabel && (
                  <TouchableOpacity onPress={() => { setEditingLabel(true); setEditLabelText(selected.foodName || selected.preNutrition?.food_label || ''); }}>
                    <MaterialIcons name="edit" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              {editingLabel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                    value={editLabelText}
                    onChangeText={setEditLabelText}
                    maxLength={80}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveFoodLabel}
                    editable={!editLabelSaving}
                  />
                  {editLabelSaving ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <TouchableOpacity onPress={handleSaveFoodLabel}>
                      <MaterialIcons name="check" size={22} color={theme.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {selected.foodName || selected.preNutrition?.food_label || selected.mealType}
                </Text>
              )}
            </View>

            {/* Calories & Macros */}
            {nut && (
              <View style={styles.detailSection}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Nutrition</Text>
                <View style={styles.macroRow}>
                  <View style={[styles.macroPill, { backgroundColor: '#FF9500' + '22' }]}>
                    <Text style={[styles.macroVal, { color: '#FF9500' }]}>{nut.estimated_calories}</Text>
                    <Text style={[styles.macroUnit, { color: '#FF9500' }]}>cal</Text>
                  </View>
                  {nut.protein_g != null && (
                    <View style={[styles.macroPill, { backgroundColor: '#FF3B30' + '22' }]}>
                      <Text style={[styles.macroVal, { color: '#FF3B30' }]}>{nut.protein_g}g</Text>
                      <Text style={[styles.macroUnit, { color: '#FF3B30' }]}>Protein</Text>
                    </View>
                  )}
                  {nut.carbs_g != null && (
                    <View style={[styles.macroPill, { backgroundColor: '#007AFF' + '22' }]}>
                      <Text style={[styles.macroVal, { color: '#007AFF' }]}>{nut.carbs_g}g</Text>
                      <Text style={[styles.macroUnit, { color: '#007AFF' }]}>Carbs</Text>
                    </View>
                  )}
                  {nut.fat_g != null && (
                    <View style={[styles.macroPill, { backgroundColor: '#FFCC00' + '22' }]}>
                      <Text style={[styles.macroVal, { color: '#FFCC00' }]}>{nut.fat_g}g</Text>
                      <Text style={[styles.macroUnit, { color: '#FFCC00' }]}>Fat</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Micronutrients section */}
            {microsEnabled && nut && (() => {
              const hasMicros = nut.fiber_g != null || nut.sugar_g != null || nut.sodium_mg != null || nut.saturated_fat_g != null || microsData?.enriched;
              const displayData = microsData?.enriched ? microsData : null;
              const fib = displayData?.fiber_g ?? nut.fiber_g;
              const sug = displayData?.sugar_g ?? nut.sugar_g;
              const sod = displayData?.sodium_mg ?? nut.sodium_mg;
              const sat = displayData?.saturated_fat_g ?? nut.saturated_fat_g;
              const anyMicro = fib != null || sug != null || sod != null || sat != null;

              return (
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Micronutrients</Text>
                  {anyMicro ? (
                    <View style={styles.macroRow}>
                      {fib != null && (
                        <View style={[styles.macroPill, { backgroundColor: '#34C759' + '22' }]}>
                          <Text style={[styles.macroVal, { color: '#34C759' }]}>{fib}g</Text>
                          <Text style={[styles.macroUnit, { color: '#34C759' }]}>Fiber</Text>
                        </View>
                      )}
                      {sug != null && (
                        <View style={[styles.macroPill, { backgroundColor: '#AF52DE' + '22' }]}>
                          <Text style={[styles.macroVal, { color: '#AF52DE' }]}>{sug}g</Text>
                          <Text style={[styles.macroUnit, { color: '#AF52DE' }]}>Sugar</Text>
                        </View>
                      )}
                      {sod != null && (
                        <View style={[styles.macroPill, { backgroundColor: '#5AC8FA' + '22' }]}>
                          <Text style={[styles.macroVal, { color: '#5AC8FA' }]}>{Math.round(sod)}mg</Text>
                          <Text style={[styles.macroUnit, { color: '#5AC8FA' }]}>Sodium</Text>
                        </View>
                      )}
                      {sat != null && (
                        <View style={[styles.macroPill, { backgroundColor: '#FF6482' + '22' }]}>
                          <Text style={[styles.macroVal, { color: '#FF6482' }]}>{sat}g</Text>
                          <Text style={[styles.macroUnit, { color: '#FF6482' }]}>Sat Fat</Text>
                        </View>
                      )}
                    </View>
                  ) : microsLoading ? (
                    <ActivityIndicator size="small" color={theme.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  ) : (
                    <TouchableOpacity
                      style={[styles.enrichBtn, { borderColor: theme.primary }]}
                      onPress={() => handleEnrichMicros(selected.id)}
                    >
                      <MaterialIcons name="auto-fix-high" size={16} color={theme.primary} />
                      <Text style={[styles.enrichBtnText, { color: theme.primary }]}>Compute micros</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            {(selected.preImageUri || selected.postImageUri) && (
              <View style={styles.detailSection}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Photos</Text>
                <View style={styles.thumbRow}>
                  {selected.preImageUri ? (
                    <View style={styles.thumbItem}>
                      <Image source={{ uri: selected.preImageUri }} style={styles.thumb} />
                      <Text style={[styles.thumbLabel, { color: theme.textSecondary }]}>Before</Text>
                    </View>
                  ) : null}
                  {selected.postImageUri ? (
                    <View style={styles.thumbItem}>
                      <Image source={{ uri: selected.postImageUri }} style={styles.thumb} />
                      <Text style={[styles.thumbLabel, { color: theme.textSecondary }]}>After</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {/* Roast */}
            {selected.roastMessage ? (
              <View style={styles.detailSection}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Verdict</Text>
                <Text style={[styles.detailText, { color: theme.text }]}>{selected.roastMessage}</Text>
              </View>
            ) : null}

            {/* Distraction */}
            {stars != null && (
              <View style={styles.detailSection}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Distraction</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <MaterialIcons
                      key={n}
                      name={n <= stars ? 'star' : 'star-border'}
                      size={22}
                      color="#FF9500"
                    />
                  ))}
                  {selected.estimatedDistractionMinutes != null && (
                    <Text style={[styles.distractMin, { color: theme.textSecondary }]}>
                      ~{selected.estimatedDistractionMinutes} min
                    </Text>
                  )}
                </View>
              </View>
            )}

            {timeSpentMin != null && (
              <View style={styles.detailSection}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Time spent</Text>
                <Text style={[styles.detailText, { color: theme.text }]}>{timeSpentMin} min</Text>
              </View>
            )}

            {/* Close */}
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.text }]}
              onPress={() => {
                lightHaptic();
                closeDetail();
              }}
            >
              <Text style={[styles.closeBtnText, { color: theme.background }]}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.text }]}>Tracked today</Text>
      <FlatList
        data={sorted}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const sc = statusConfig[item.status] ?? statusConfig.INCOMPLETE;
          const onDelete = () => {
            Alert.alert('Delete meal', 'Remove this tracked meal from today?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  deleteSession(item.id);
                  if (selected?.id === item.id) {
                    setDetailVisible(false);
                    setSelected(null);
                  }
                },
              },
            ]);
          };
          return (
            <SwipeableRow
              onDelete={onDelete}
              deleteColor={theme.danger}
              rowBackgroundColor={theme.surface}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => openDetail(item)}
                style={[styles.row, { backgroundColor: theme.surface }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                  <MaterialIcons name={mealIcon(item.mealType)} size={18} color={theme.primary} />
                </View>
                <View style={styles.info}>
                  <Text style={[styles.food, { color: theme.text }]} numberOfLines={1}>
                    {item.foodName || item.mealType}
                  </Text>
                  <Text style={[styles.time, { color: theme.textSecondary }]}>
                    {formatSessionTime(item.startedAt)}
                    {item.preNutrition
                      ? ` · ${item.preNutrition.estimated_calories} cal`
                      : ''}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: sc.color + '22' }]}>
                  <Text style={[styles.pillText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        }}
      />
      {renderDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, marginTop: 14, paddingBottom: 80 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, marginLeft: 12 },
  food: { fontSize: 14, fontWeight: '600' },
  time: { fontSize: 12, marginTop: 2 },
  pill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingBottom: 80,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptyHint: { fontSize: 13, marginTop: 4 },
  // ── Detail modal ──
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  modalBackdropTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    zIndex: 2,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  detailSection: { marginBottom: 14 },
  detailLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  detailText: { fontSize: 14, lineHeight: 20 },
  thumbRow: { flexDirection: 'row', gap: 10 },
  thumbItem: { alignItems: 'center' },
  thumb: { width: 112, height: 112, borderRadius: 12, backgroundColor: '#111' },
  thumbLabel: { fontSize: 12, marginTop: 5, fontWeight: '600' },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  macroPill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  macroVal: { fontSize: 15, fontWeight: '700' },
  macroUnit: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  distractMin: { fontSize: 12, marginLeft: 8 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
  enrichBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  enrichBtnText: { fontSize: 13, fontWeight: '600' },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
});
