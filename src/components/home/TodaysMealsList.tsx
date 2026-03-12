import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Easing,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppState } from '../../state/AppStateContext';
import type { MealSession } from '../../types/models';
import { SwipeableRow } from '../SwipeableRow';
import { triggerLightHaptic } from '../../services/haptics';

interface Props {
  sessions: MealSession[];
}

const statusConfig: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: '#FF9500', label: 'Active' },
  VERIFIED: { color: '#CA8A04', label: 'Verified' },
  PARTIAL: { color: '#FFCC00', label: 'Partial' },
  FAILED: { color: '#FF3B30', label: 'Failed' },
  FORFEITED: { color: '#F97316', label: 'Forfeited' },
  INCOMPLETE: { color: '#FF9500', label: 'Active' },
};

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function mealIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  switch (type) {
    case 'Breakfast':
      return 'free-breakfast';
    case 'Lunch':
      return 'lunch-dining';
    case 'Dinner':
      return 'dinner-dining';
    case 'Snack':
      return 'cookie';
    default:
      return 'restaurant';
  }
}

function MetricTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={styles.metricTile}>
      <View style={styles.metricHeaderRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricEdit}>EDIT</Text>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export default function TodaysMealsList({ sessions }: Props) {
  const { theme } = useTheme();
  const { deleteSession, settings } = useAppState();
  const lightHaptic = () => triggerLightHaptic(settings.app.hapticsEnabled);

  const [selected, setSelected] = useState<MealSession | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [portion, setPortion] = useState(1);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(34)).current;

  const openDetail = (session: MealSession) => {
    lightHaptic();
    setSelected(session);
    setPortion(1);
    setDetailVisible(true);
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(34);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 210,
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
        toValue: 26,
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
        <Text style={[styles.emptyHint, { color: theme.textSecondary + 'AA' }]}>Tap + to scan a meal</Text>
      </View>
    );
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const renderDetail = () => {
    if (!selected) return null;

    const selectedTitle = selected.foodName || selected.preNutrition?.food_label || selected.mealType;
    const nutrition = selected.preNutrition;
    const timeSpentMin = selected.endedAt
      ? Math.max(
          0,
          Math.round((new Date(selected.endedAt).getTime() - new Date(selected.startedAt).getTime()) / 60000),
        )
      : null;

    const scaled = (value?: number | null) => Math.round((value ?? 0) * portion);
    const calories = scaled(nutrition?.estimated_calories);
    const protein = scaled(nutrition?.protein_g);
    const carbs = scaled(nutrition?.carbs_g);
    const fat = scaled(nutrition?.fat_g);

    const isVerified = selected.status === 'VERIFIED';
    const isForfeited = selected.status === 'FORFEITED' || selected.overrideUsed;
    const stars = Math.max(0, Math.min(5, selected.distractionRating ?? 0));

    return (
      <Modal
        visible={detailVisible}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={closeDetail}
      >
        <View style={styles.modalRoot}>
          <Animated.View pointerEvents="none" style={[styles.modalOverlay, { opacity: backdropOpacity }]} />
          <Pressable style={styles.modalBackdropTap} onPress={closeDetail} />

          <Animated.View
            style={[
              styles.modalSheet,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            <View style={styles.pullHandleWrap}>
              <View style={styles.pullHandle} />
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.centerInfo}>
                <Text style={styles.mealTypePillText}>{selected.mealType}</Text>
                <View style={styles.titleRow}>
                  <Text style={styles.modalTitleText}>{selectedTitle}</Text>
                  <MaterialIcons name="edit" size={18} color="#CA8A04" />
                </View>
              </View>

              <View style={styles.portionCard}>
                <View style={styles.portionLeft}>
                  <View style={styles.portionIconWrap}>
                    <MaterialIcons name="restaurant" size={18} color="#CA8A04" />
                  </View>
                  <Text style={styles.portionText}>Portion Size</Text>
                </View>

                <View style={styles.portionRight}>
                  <TouchableOpacity
                    style={styles.portionCircleBtn}
                    onPress={() => {
                      lightHaptic();
                      setPortion((prev) => Math.max(1, prev - 1));
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="remove" size={18} color="#64748B" />
                  </TouchableOpacity>

                  <Text style={styles.portionCount}>{portion}</Text>

                  <TouchableOpacity
                    style={styles.portionCircleBtnActive}
                    onPress={() => {
                      lightHaptic();
                      setPortion((prev) => prev + 1);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="add" size={18} color="#0F172A" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <MetricTile label="CALORIES" value={String(calories)} unit="cal" />
                <MetricTile label="PROTEIN" value={String(protein)} unit="g" />
                <MetricTile label="CARBS" value={String(carbs)} unit="g" />
                <MetricTile label="FAT" value={String(fat)} unit="g" />
              </View>

              <View style={styles.contextWrap}>
                <View style={styles.verdictCard}>
                  <View style={styles.metricHeaderRow}>
                    <Text style={styles.metricLabel}>VERDICT</Text>
                    <Text style={styles.metricEdit}>EDIT</Text>
                  </View>

                  <View style={styles.verdictButtonsRow}>
                    <View style={[styles.verdictBtn, isVerified ? styles.verdictBtnActive : styles.verdictBtnInactive]}>
                      <MaterialIcons
                        name="check-circle"
                        size={18}
                        color={isVerified ? '#CA8A04' : '#94A3B8'}
                      />
                      <Text style={[styles.verdictBtnText, isVerified && styles.verdictBtnTextActive]}>Verified</Text>
                    </View>
                    <View style={[styles.verdictBtn, !isVerified ? styles.verdictBtnActive : styles.verdictBtnInactive]}>
                      <MaterialIcons
                        name={isForfeited ? 'gpp-bad' : 'cancel'}
                        size={18}
                        color={!isVerified ? '#CA8A04' : '#94A3B8'}
                      />
                      <Text style={[styles.verdictBtnText, !isVerified && styles.verdictBtnTextActive]}>
                        {isForfeited ? 'Forfeited' : 'Not Verified'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.secondaryGrid}>
                  <View style={styles.secondaryCard}>
                    <View style={styles.metricHeaderRow}>
                      <Text style={styles.metricLabel}>RATING</Text>
                      <Text style={styles.metricEdit}>EDIT</Text>
                    </View>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <MaterialIcons
                          key={value}
                          name={value <= stars ? 'star' : 'star-border'}
                          size={18}
                          color="#FACC15"
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.secondaryCard}>
                    <View style={styles.metricHeaderRow}>
                      <Text style={styles.metricLabel}>TIME SPENT</Text>
                      <Text style={styles.metricEdit}>EDIT</Text>
                    </View>
                    <View style={styles.timeRow}>
                      <MaterialIcons name="timer" size={18} color="#0F172A" />
                      <Text style={styles.timeText}>{timeSpentMin != null ? `${timeSpentMin} min` : '—'}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  lightHaptic();
                  closeDetail();
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.closeBtnText}>CLOSE</Text>
              </TouchableOpacity>
            </ScrollView>
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
          const status = item.overrideUsed
            ? statusConfig.FORFEITED
            : (statusConfig[item.status] ?? statusConfig.INCOMPLETE);

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
            <SwipeableRow onDelete={onDelete} deleteColor={theme.danger} rowBackgroundColor={theme.surface}>
              <TouchableOpacity
                activeOpacity={0.72}
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
                    {item.preNutrition ? ` · ${item.preNutrition.estimated_calories} cal` : ''}
                  </Text>
                </View>

                <View style={[styles.pill, { backgroundColor: status.color + '22' }]}>
                  <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
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
  container: {
    paddingHorizontal: 20,
    marginTop: 14,
    paddingBottom: 80,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
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
  info: {
    flex: 1,
    marginLeft: 12,
  },
  food: {
    fontSize: 14,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 4,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  modalBackdropTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  modalSheet: {
    zIndex: 2,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 12,
  },
  pullHandleWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pullHandle: {
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 26,
  },
  centerInfo: {
    alignItems: 'center',
    marginBottom: 18,
  },
  mealTypePillText: {
    color: '#CA8A04',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  titleRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleText: {
    color: '#0F172A',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 33,
    textAlign: 'center',
    marginRight: 6,
    maxWidth: '92%',
  },
  portionCard: {
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  portionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,204,21,0.16)',
    marginRight: 10,
  },
  portionText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  portionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  portionCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  portionCircleBtnActive: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FACC15',
  },
  portionCount: {
    marginHorizontal: 16,
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metricTile: {
    width: '48.5%',
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metricEdit: {
    color: '#CA8A04',
    fontSize: 11,
    fontWeight: '800',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 33,
    marginRight: 4,
  },
  metricUnit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  contextWrap: {
    marginBottom: 14,
  },
  verdictCard: {
    borderRadius: 12,
    backgroundColor: '#F6F8F6',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  verdictButtonsRow: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'space-between',
  },
  verdictBtn: {
    width: '48%',
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictBtnActive: {
    backgroundColor: 'rgba(250,204,21,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.28)',
  },
  verdictBtnInactive: {
    backgroundColor: '#F1F5F9',
  },
  verdictBtnText: {
    marginLeft: 6,
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  verdictBtnTextActive: {
    color: '#CA8A04',
  },
  secondaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryCard: {
    width: '48.5%',
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  timeText: {
    marginLeft: 6,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
