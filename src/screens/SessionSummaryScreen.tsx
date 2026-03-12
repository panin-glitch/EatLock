import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useNavigation } from '@react-navigation/native';

function NutrientBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{Math.round(value)}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export default function SessionSummaryScreen() {
  const { themeName } = useTheme();
  const { sessions, updateCompletedSessionFeedback } = useAppState();
  const navigation = useNavigation<any>();

  const session = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  const [distractionRating, setDistractionRating] = useState<number>(session?.distractionRating ?? 3);
  const [distractionMinutes, setDistractionMinutes] = useState<number>(session?.estimatedDistractionMinutes ?? 0);
  const [focusLevel, setFocusLevel] = useState<number>(() => {
    const rating = session?.distractionRating ?? 3;
    if (rating <= 2) return 0;
    if (rating >= 4) return 2;
    return 1;
  });

  const nutrition = session?.preNutrition;
  const isForfeited = session?.status === 'FORFEITED' || session?.overrideUsed;
  const mealTitle = session?.foodName || nutrition?.food_label || 'Meal logged';
  const mealSubtitle = isForfeited
    ? 'Forfeited · Not verified'
    : nutrition?.notes ? `Portion: ${nutrition.notes}` : 'Portion: 1 serving';
  const distractionLabel = focusLevel === 0 ? 'Poor' : focusLevel === 1 ? 'Medium' : 'Great';

  const onFocusChange = (level: number) => {
    setFocusLevel(level);
    if (level === 0) {
      setDistractionRating(1);
      if ((session?.estimatedDistractionMinutes ?? 0) === 0) setDistractionMinutes(15);
    } else if (level === 1) {
      setDistractionRating(3);
      if ((session?.estimatedDistractionMinutes ?? 0) === 0) setDistractionMinutes(8);
    } else {
      setDistractionRating(5);
      if ((session?.estimatedDistractionMinutes ?? 0) === 0) setDistractionMinutes(2);
    }
  };

  const handleDone = async () => {
    if (session) {
      await updateCompletedSessionFeedback(session.id, distractionRating, distractionMinutes);
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  const sliderPercent = focusLevel * 50;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor="#F6F8F6"
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroImageZone}>
            <View style={styles.afterPhotoCard}>
              {session?.postImageUri ? (
                <Image source={{ uri: session.postImageUri }} style={styles.heroPhoto} />
              ) : (
                <View style={styles.heroPhotoPlaceholder} />
              )}
              <View style={styles.afterBadge}>
                <Text style={styles.afterBadgeText}>After</Text>
              </View>
            </View>

            <View style={styles.beforePhotoCard}>
              {session?.preImageUri ? (
                <Image source={{ uri: session.preImageUri }} style={styles.heroPhoto} />
              ) : (
                <View style={styles.heroPhotoPlaceholder} />
              )}
              <View style={styles.beforeBadge}>
                <Text style={styles.beforeBadgeText}>Before</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroBody}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.mealTitle}>{mealTitle}</Text>
                <Text style={styles.mealSubtitle}>{mealSubtitle}</Text>
                <View style={[styles.statusPill, isForfeited ? styles.statusPillForfeited : styles.statusPillVerified]}>
                  <Text style={[styles.statusPillText, isForfeited ? styles.statusPillTextForfeited : styles.statusPillTextVerified]}>
                    {isForfeited ? 'Forfeited' : 'Verified'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.editButton}>
                <MaterialIcons name="edit" size={18} color="#CA8A04" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.metricsGrid}>
              <NutrientBox label="Calories" value={nutrition?.estimated_calories ?? 0} unit="kcal" />
              <NutrientBox label="Protein" value={nutrition?.protein_g ?? 0} unit="g" />
              <NutrientBox label="Carbs" value={nutrition?.carbs_g ?? 0} unit="g" />
              <NutrientBox label="Fat" value={nutrition?.fat_g ?? 0} unit="g" />
            </View>
          </View>
        </View>

        <View style={styles.focusSection}>
          <Text style={styles.focusTitle}>Were you distracted while eating?</Text>

          <View style={styles.focusCard}>
            <View style={styles.focusHeaderRow}>
              <Text style={styles.focusLabel}>Distraction Level</Text>
              <View style={styles.focusBadge}>
                <Text style={styles.focusBadgeText}>{distractionLabel}</Text>
              </View>
            </View>

            <View style={styles.sliderWrap}>
              <View style={styles.sliderRail} />
              <View style={[styles.sliderFill, { width: `${sliderPercent}%` }]} />
              <View style={[styles.sliderThumb, { left: `${sliderPercent}%` }]} />

              <View style={styles.sliderStopsRow}>
                {[0, 1, 2].map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={styles.sliderStopTouch}
                    onPress={() => onFocusChange(level)}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
            </View>

            <View style={styles.sliderLabelsRow}>
              <Text style={styles.sliderLabel}>Poor</Text>
              <Text style={styles.sliderLabel}>Medium</Text>
              <Text style={styles.sliderLabel}>Great</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logMealBtn} onPress={handleDone} activeOpacity={0.9}>
          <Text style={styles.logMealText}>{isForfeited ? 'DONE' : 'LOG MEAL'}</Text>
          <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(250,204,21,0.14)',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.14)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroImageZone: {
    height: 174,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  afterPhotoCard: {
    position: 'absolute',
    top: 30,
    right: 28,
    width: 160,
    height: 112,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#E2E8F0',
    transform: [{ rotate: '2deg' }],
    opacity: 0.85,
    zIndex: 1,
  },
  beforePhotoCard: {
    position: 'absolute',
    top: 18,
    left: 26,
    width: 160,
    height: 112,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#E2E8F0',
    transform: [{ rotate: '-1deg' }],
    zIndex: 2,
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
  },
  heroPhotoPlaceholder: {
    flex: 1,
    backgroundColor: '#CBD5E1',
  },
  beforeBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FACC15',
  },
  beforeBadgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  afterBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  afterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  mealTitle: {
    color: '#0F172A',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  mealSubtitle: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 13,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillVerified: {
    backgroundColor: 'rgba(250,204,21,0.16)',
  },
  statusPillForfeited: {
    backgroundColor: 'rgba(249,115,22,0.14)',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusPillTextVerified: {
    color: '#CA8A04',
  },
  statusPillTextForfeited: {
    color: '#C2410C',
  },
  editButton: {
    borderRadius: 10,
    backgroundColor: 'rgba(250,204,21,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButtonText: {
    marginLeft: 4,
    color: '#CA8A04',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricBox: {
    width: '48.3%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.12)',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValueRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    marginRight: 3,
  },
  metricUnit: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  focusSection: {
    marginTop: 12,
  },
  focusTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  focusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.14)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  focusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  focusBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(250,204,21,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  focusBadgeText: {
    color: '#CA8A04',
    fontSize: 13,
    fontWeight: '800',
  },
  sliderWrap: {
    marginTop: 16,
    height: 24,
    justifyContent: 'center',
  },
  sliderRail: {
    position: 'absolute',
    left: 2,
    right: 2,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  sliderFill: {
    position: 'absolute',
    left: 2,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#FACC15',
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FACC15',
    transform: [{ translateX: -10 }],
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  sliderStopsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderStopTouch: {
    width: 32,
    height: 24,
  },
  sliderLabelsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  logMealBtn: {
    marginTop: 18,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logMealText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
