import React, { useEffect, useMemo, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppState } from '../state/AppStateContext';
import type { MealType } from '../types/models';
import type { FoodCheckResult, NutritionEstimate } from '../services/vision/types';
import { blockingEngine } from '../services/blockingEngine';
import type { BlockingSupport } from '../services/blockingSupport';

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Custom'];

type Props = NativeStackScreenProps<any, 'LockSetupConfirm'>;

type AppBadgeStyle = {
  bg: string;
  textColor: string;
  glyph: string;
};

function getAppBadgeStyle(appId: string, appName: string): AppBadgeStyle {
  const id = appId.toLowerCase();
  if (id.includes('instagram')) return { bg: '#D62976', textColor: '#FFFFFF', glyph: 'I' };
  if (id.includes('youtube')) return { bg: '#FF0000', textColor: '#FFFFFF', glyph: 'Y' };
  if (id.includes('snapchat')) return { bg: '#FFFC00', textColor: '#111111', glyph: 'S' };
  if (id.includes('twitter') || id.includes('x')) return { bg: '#000000', textColor: '#FFFFFF', glyph: 'X' };
  return {
    bg: '#E5E7EB',
    textColor: '#334155',
    glyph: (appName || 'A').trim().charAt(0).toUpperCase() || 'A',
  };
}

export default function LockSetupConfirmScreen({ navigation, route }: Props) {
  const { blockConfig, startSession } = useAppState();
  const {
    preImageUri,
    preCheck,
    preBarcodeData,
    preNutrition,
    foodName: routeFoodName,
    barcode: routeBarcode,
  } =
    (route.params as {
      preImageUri?: string;
      preCheck?: FoodCheckResult;
      preNutrition?: NutritionEstimate;
      preBarcodeData?: { type: string; data: string };
      foodName?: string;
      barcode?: string;
    }) || {};

  const detectMealType = (): MealType => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Breakfast';
    if (hour < 15) return 'Lunch';
    if (hour < 20) return 'Dinner';
    return 'Snack';
  };

  const [selectedMealType, setSelectedMealType] = useState<MealType>(detectMealType());
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [support, setSupport] = useState<BlockingSupport | null>(null);

  useEffect(() => {
    let cancelled = false;
    blockingEngine.getSupport().then((next) => {
      if (!cancelled) {
        setSupport(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const blockedApps = blockConfig.blockedApps;
  const displayApps = useMemo(() => blockedApps.slice(0, 4), [blockedApps]);

  const handleStart = async () => {
    if (!confirmed || starting) return;
    setStarting(true);
    try {
      const resolvedPreBarcodeData =
        preBarcodeData || (routeBarcode ? { type: 'barcode', data: routeBarcode } : undefined);

      await startSession(
        selectedMealType,
        '',
        true,
        preImageUri,
        routeFoodName || undefined,
        preCheck,
        preNutrition,
        routeBarcode,
        resolvedPreBarcodeData,
      );

      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main' },
          {
            name: 'MealSessionActive',
            params: { mealType: selectedMealType, preBarcodeData: resolvedPreBarcodeData },
          },
        ],
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      setStarting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F8F6" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm & Lock</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.beforeCard}>
          <View style={styles.beforeImageWrap}>
            {preImageUri ? (
              <Image source={{ uri: preImageUri }} style={styles.beforeImage} />
            ) : (
              <View style={styles.beforeImagePlaceholder}>
                <MaterialIcons
                  name={preBarcodeData ? 'qr-code-scanner' : 'photo-camera'}
                  size={30}
                  color="#94A3B8"
                />
              </View>
            )}

            <View style={styles.verifiedBadgeIcon}>
              <MaterialIcons name="check" size={14} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.beforeTextRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.beforeTitle}>{preBarcodeData ? 'Snack Barcode' : 'Before Photo'}</Text>
              <Text style={styles.beforeSubtitle}>
                {preBarcodeData
                  ? `Code: ${preBarcodeData.data}`
                  : preCheck?.roastLine || 'Meal captured'}
              </Text>
            </View>
            <View style={styles.verifiedPill}>
              <Text style={styles.verifiedPillText}>Verified</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 6 }}>
          <Text style={styles.sectionLabel}>Meal Type</Text>
          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((type) => {
              const selected = selectedMealType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.mealTypeChip, selected && styles.mealTypeChipSelected]}
                  onPress={() => setSelectedMealType(type)}
                  activeOpacity={0.8}
                >
                  {selected ? <MaterialIcons name="check" size={16} color="#FFFFFF" /> : null}
                  <Text style={[styles.mealTypeText, selected && styles.mealTypeTextSelected]}>{type}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.restrictionsWrap}>
          <View style={styles.restrictionsHeader}>
            <Text style={styles.sectionLabel}>App Restrictions</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {support?.canEnforce
                  ? `${blockedApps.length} app${blockedApps.length === 1 ? '' : 's'} will be blocked`
                  : `${blockedApps.length} app${blockedApps.length === 1 ? '' : 's'} selected for focus mode`}
              </Text>
            </View>
          </View>

          {!support?.canEnforce && support?.detail ? (
            <Text style={styles.supportHint}>{support.detail}</Text>
          ) : null}

          <View style={styles.appsGrid}>
            {displayApps.map((app) => {
              const badgeStyle = getAppBadgeStyle(app.id, app.name);
              return (
                <View key={app.id} style={styles.appGridItem}>
                  <View style={[styles.appLogo, { backgroundColor: badgeStyle.bg }]}>
                    <Text style={[styles.appLogoText, { color: badgeStyle.textColor }]}>{badgeStyle.glyph}</Text>
                  </View>
                  <Text style={styles.appLabel} numberOfLines={1}>
                    {app.name}
                  </Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.confirmRow}
            onPress={() => setConfirmed((prev) => !prev)}
            activeOpacity={0.85}
          >
            <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
              {confirmed ? <MaterialIcons name="check" size={14} color="#FFFFFF" /> : null}
            </View>
            <Text style={styles.confirmText}>
              {support?.canEnforce
                ? 'I understand these apps will be blocked until I upload my Finished Plate photo.'
                : 'I understand this device cannot enforce app blocking in the current build.'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomActionWrap}>
        <TouchableOpacity
          style={[styles.startBtn, (!confirmed || starting) && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!confirmed || starting}
          activeOpacity={0.9}
        >
          <MaterialIcons name="restaurant" size={18} color="#FFFFFF" />
          <Text style={styles.startBtnText}>{starting ? 'Starting…' : 'Start Meal'}</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,199,88,0.12)',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    paddingRight: 40,
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 120,
  },
  beforeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,199,88,0.15)',
    backgroundColor: 'rgba(255,255,255,0.78)',
    padding: 12,
  },
  beforeImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  beforeImage: { width: '100%', height: '100%' },
  beforeImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  verifiedBadgeIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#33C758',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beforeTextRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  beforeTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  beforeSubtitle: { marginTop: 2, color: '#64748B', fontSize: 13 },
  verifiedPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(51,199,88,0.18)',
  },
  verifiedPillText: {
    color: '#1EA84B',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  sectionLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  mealTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealTypeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealTypeChipSelected: {
    backgroundColor: '#33C758',
    borderColor: '#33C758',
  },
  mealTypeText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  mealTypeTextSelected: { color: '#FFFFFF' },
  restrictionsWrap: {
    marginTop: 18,
  },
  restrictionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(51,199,88,0.12)',
  },
  countPillText: {
    color: '#1EA84B',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  supportHint: {
    marginBottom: 10,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },
  appsGrid: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  appGridItem: {
    alignItems: 'center',
    width: '24%',
  },
  appLogo: {
    width: 54,
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLogoText: { fontSize: 24, fontWeight: '900' },
  appLabel: {
    marginTop: 6,
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(51,199,88,0.16)',
    backgroundColor: 'rgba(51,199,88,0.07)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: '#33C758',
    backgroundColor: '#33C758',
  },
  confirmText: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  bottomActionWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  startBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#33C758',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#33C758',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  startBtnDisabled: {
    opacity: 0.55,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
