/**
 * TodaysMealsList — vertical list of meal sessions for the selected date.
 * Shows time, meal type, status pill, and food name.
 * Tap a row to see full detail modal with calories, macros, roast, distraction.
 * Empty-state when no sessions exist.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Pressable, Animated, Easing, Image, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppState } from '../../state/AppStateContext';
import type { MealSession } from '../../types/models';
import { SwipeableRow } from '../SwipeableRow';

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
  const { deleteSession } = useAppState();
  const [selected, setSelected] = useState<MealSession | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(36)).current;
  const lightHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const openDetail = (session: MealSession) => {
    lightHaptic();
    setSelected(session);
    setDetailVisible(true);
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
});
