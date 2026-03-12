import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  Image,
  Platform,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTheme } from '../theme/ThemeProvider';
import { getVisionService, CloudVisionService } from '../services/vision';
import { getPreScanRoast, getFoodConfirmedMessage } from '../services/vision/roasts';
import type { FoodCheckResult, NutritionEstimate, VisionSoftError } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanFrameOverlay } from '../components/scan/ScanFrameOverlay';
import { ScanTipsModal } from '../components/scan/ScanTipsModal';
import { ResultCard, type ResultCardButton, type CaloriesRowData } from '../components/scan/ResultCard';
import { CaloriesEditModal } from '../components/scan/CaloriesEditModal';
import { lookupBarcode, type BarcodeLookupResult } from '../services/barcodeService';

type Props = NativeStackScreenProps<any, 'PreScanCamera'>;

function isVisionSoftError(value: unknown): value is VisionSoftError {
  return !!value && typeof value === 'object' && (value as VisionSoftError).kind === 'soft_error';
}

function preScanFailureTitle(check: FoodCheckResult | null): string {
  if (!check || check.isFood) return 'Retake photo';

  switch (check.reasonCode) {
    case 'HAND_SELFIE':
      return 'Hand in frame';
    case 'TOO_DARK':
      return 'Too dark';
    case 'TOO_BLURRY':
      return 'Too blurry';
    case 'NO_PLATE':
      return 'Center your meal';
    case 'BAD_FRAMING':
      return 'Reframe meal';
    case 'NOT_FOOD':
      return 'Retake meal photo';
    default:
      return 'Retake photo';
  }
}

export default function PreScanCameraScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const barcodeLockRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FoodCheckResult | null>(null);
  const [softError, setSoftError] = useState<VisionSoftError | null>(null);
  const [roast, setRoast] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Nutrition state
  const [nutrition, setNutrition] = useState<NutritionEstimate | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState(false);
  const [editCalVisible, setEditCalVisible] = useState(false);

  // Barcode state
  const [barcodeResult, setBarcodeResult] = useState<BarcodeLookupResult | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  // Barcode + optional before photo: after barcode scanned, user can take a "before" photo
  const [barcodeBeforePhotoMode, setBarcodeBeforePhotoMode] = useState(false);
  const [barcodeBeforePhotoUri, setBarcodeBeforePhotoUri] = useState<string | null>(null);

  const freezeOpacity = useRef(new Animated.Value(0)).current;
  const shutterOpacity = useRef(new Animated.Value(0)).current;
  const analyzingOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(260)).current;

  const animateShutter = () => {
    Animated.sequence([
      Animated.timing(shutterOpacity, {
        toValue: 0.15,
        duration: 65,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(shutterOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const showFreeze = () => {
    Animated.timing(freezeOpacity, {
      toValue: 0.36,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const hideFreeze = () => {
    Animated.timing(freezeOpacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  };

  const showCard = () => {
    Animated.spring(cardTranslateY, {
      toValue: 0,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const hideCard = (onDone?: () => void) => {
    Animated.timing(cardTranslateY, {
      toValue: 260,
      duration: 130,
      useNativeDriver: true,
    }).start(onDone);
  };

  const showAnalyzing = () => {
    Animated.timing(analyzingOpacity, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const hideAnalyzing = () => {
    Animated.timing(analyzingOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const verifyPhoto = async (uri: string) => {
    setChecking(true);
    setAiError(null);
    setSoftError(null);
    setNutrition(null);
    setNutritionLoading(false);
    setNutritionError(false);
    showAnalyzing();

    try {
      const vision = getVisionService();
      const check = await vision.verifyFood(uri);
      if (isVisionSoftError(check)) {
        setSoftError(check);
        return;
      }
      setResult(check);
      setRoast(
        check.isFood
          ? check.roastLine || getFoodConfirmedMessage()
          : check.roastLine || getPreScanRoast(check.reasonCode),
      );

      // If food detected, fetch calories
      if (check.isFood) {
        setNutritionLoading(true);
        const svc = vision as CloudVisionService;
        const r2Key = svc.lastR2Key;
        if (r2Key) {
          try {
            const est = await vision.estimateCalories(r2Key);
            setNutrition(est);
          } catch {
            setNutritionError(true);
          }
        }
        setNutritionLoading(false);
      }
    } catch (e: any) {
      if (__DEV__) {
        console.log('[PreScan] verifyPhoto failed', {
          message: e?.message,
          stack: e?.stack,
        });
      }
      setResult(null);
      setRoast(null);
      setAiError(e?.message || 'Could not reach verification service.');
    } finally {
      barcodeLockRef.current = false;
      setChecking(false);
      hideAnalyzing();
      showCard();
    }
  };

  const captureAndVerify = useCallback(async () => {
    if (!cameraRef.current || !ready || checking) return;

    animateShutter();
    showFreeze();

    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.82, skipProcessing: false });
      if (!pic?.uri) {
        hideFreeze();
        barcodeLockRef.current = false;
        return;
      }
      setPhotoUri(pic.uri);
      setResult(null);
      setRoast(null);
      setAiError(null);
      await verifyPhoto(pic.uri);
    } catch {
      barcodeLockRef.current = false;
      hideFreeze();
    }
  }, [ready, checking]);

  const handleShutter = async () => {
    barcodeLockRef.current = false;
    await captureAndVerify();
  };

  const handleBarcodeScanned = async (scan: BarcodeScanningResult) => {
    if (!barcodeMode || barcodeLockRef.current || checking || photoUri || barcodeLoading) return;
    barcodeLockRef.current = true;
    const code = scan.data;
    setScannedBarcode(code);
    setBarcodeLoading(true);
    setBarcodeResult(null);
    showAnalyzing();

    try {
      const res = await lookupBarcode(code);
      setBarcodeResult(res);
    } catch (e: any) {
      setBarcodeResult({
        name: 'Unknown item',
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        serving_hint: null,
        source: 'not_found',
      });
    } finally {
      setBarcodeLoading(false);
      hideAnalyzing();
      showCard();
    }
  };

  const handleRetake = () => {
    hideCard(() => {
      barcodeLockRef.current = false;
      setPhotoUri(null);
      setResult(null);
      setSoftError(null);
      setRoast(null);
      setAiError(null);
      setNutrition(null);
      setNutritionLoading(false);
      setNutritionError(false);
      setBarcodeResult(null);
      setScannedBarcode(null);
      setBarcodeBeforePhotoMode(false);
      setBarcodeBeforePhotoUri(null);
      hideFreeze();
    });
  };

  /** Capture a "before" photo for a barcode session (optional but recommended). */
  const captureBarcodeBeforePhoto = useCallback(async () => {
    if (!cameraRef.current || !ready || checking) return;
    animateShutter();
    showFreeze();
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.82, skipProcessing: false });
      if (!pic?.uri) {
        hideFreeze();
        return;
      }
      setBarcodeBeforePhotoUri(pic.uri);
    } catch {
      hideFreeze();
    }
  }, [ready, checking]);

  const handleContinue = () => {
    if (barcodeResult) {
      if (barcodeResult.source === 'not_found') return;
      // Barcode flow: navigate with barcode nutrition
      const barcodeNutrition: NutritionEstimate = {
        food_label: barcodeResult.name,
        estimated_calories: barcodeResult.calories ?? 0,
        min_calories: barcodeResult.calories ?? 0,
        max_calories: barcodeResult.calories ?? 0,
        confidence: 0.8,
        notes: barcodeResult.per_100g
          ? `Per 100 g${barcodeResult.serving_hint ? ' · ' + barcodeResult.serving_hint : ''}`
          : (barcodeResult.serving_hint || ''),
        protein_g: barcodeResult.protein_g,
        carbs_g: barcodeResult.carbs_g,
        fat_g: barcodeResult.fat_g,
        source: 'barcode',
      };
      navigation.navigate('LockSetupConfirm', {
        preImageUri: barcodeBeforePhotoUri || null,
        preCheck: { isFood: true, confidence: 1, hasPlateOrBowl: false, quality: { brightness: 1, blur: 1, framing: 1 }, reasonCode: 'OK' as const, roastLine: barcodeResult.name, retakeHint: '' },
        preNutrition: barcodeNutrition,
        foodName: barcodeResult.name,
        barcode: scannedBarcode,
        preBarcodeData: scannedBarcode ? { type: 'barcode', data: scannedBarcode } : undefined,
      });
      return;
    }
    if (!photoUri || !result || !result.isFood) return;
    navigation.navigate('LockSetupConfirm', {
      preImageUri: photoUri,
      preCheck: result,
      preNutrition: result.isFood ? nutrition : undefined,
      foodName: result.isFood ? (nutrition?.food_label || result?.roastLine) : undefined,
    });
  };

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.permissionWrap]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <MaterialIcons name="camera-alt" size={46} color="#AAA" />
        <Text style={styles.permissionText}>Camera permission is required.</Text>
        <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: theme.primary }]} onPress={requestPermission}>
          <Text style={[styles.permissionBtnText, { color: theme.onPrimary }]}>Grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        onCameraReady={() => setReady(true)}
        onBarcodeScanned={barcodeMode ? handleBarcodeScanned : undefined}
        barcodeScannerSettings={
          barcodeMode
            ? { barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }
            : undefined
        }
      />

      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}

      <Animated.View pointerEvents="none" style={[styles.freezeOverlay, { opacity: freezeOpacity }]} />
      <Animated.View pointerEvents="none" style={[styles.shutterOverlay, { opacity: shutterOpacity }]} />

      {!photoUri ? <ScanFrameOverlay hintText={barcodeMode ? 'Scan barcode' : 'Keep plate in frame'} /> : null}

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan meal</Text>
        <TouchableOpacity style={styles.topBtn} onPress={() => setHelpVisible(true)}>
          <Text style={styles.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {!photoUri && (
        <View style={styles.controlsArea}>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeChip, !barcodeMode && styles.modeChipActive]}
              onPress={() => {
                barcodeLockRef.current = false;
                setBarcodeMode(false);
              }}
            >
              <Text style={[styles.modeChipText, !barcodeMode && styles.modeChipTextActive]}>Scan meal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, barcodeMode && styles.modeChipActive]}
              onPress={() => {
                barcodeLockRef.current = false;
                setBarcodeMode(true);
              }}
            >
              <Text style={[styles.modeChipText, barcodeMode && styles.modeChipTextActive]}>Barcode</Text>
            </TouchableOpacity>
          </View>

          {barcodeMode ? <Text style={styles.barcodeHint}>Scan barcode</Text> : null}

          <View style={styles.bottomControlsRow}>
            <View style={styles.bottomLeftSpacer} />

            {barcodeMode ? (
              <View style={styles.shutterPlaceholder}>
                <Text style={styles.shutterPlaceholderText}>Scanning…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.shutterOuter, !ready && { opacity: 0.45 }]}
                disabled={!ready}
                onPress={handleShutter}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setTorch((prev) => !prev)}>
              <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(checking || barcodeLoading) && (
        <Animated.View style={[styles.analyzingWrap, { opacity: analyzingOpacity }]} pointerEvents="none">
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.analyzingText}>{barcodeMode ? 'Looking up barcode...' : 'Analyzing food...'}</Text>
          </View>
        </Animated.View>
      )}

      {/* Barcode result card */}
      {barcodeResult && !barcodeLoading && !barcodeBeforePhotoMode && (
        <Animated.View style={[styles.resultCardLayer, { transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={barcodeResult.name}
            accentColor={barcodeResult.source === 'not_found' ? theme.warning : theme.success}
            confidencePercent={barcodeResult.source === 'not_found' ? undefined : 80}
            roast={barcodeResult.source === 'not_found' ? 'No nutrition data found for this barcode' : undefined}
            calories={{
              nutrition: barcodeResult.calories != null ? {
                food_label: barcodeResult.name,
                estimated_calories: barcodeResult.calories,
                min_calories: barcodeResult.calories,
                max_calories: barcodeResult.calories,
                confidence: 0.8,
                notes: barcodeResult.per_100g
                  ? `Per 100 g${barcodeResult.serving_hint ? ' \u00b7 ' + barcodeResult.serving_hint : ''}`
                  : (barcodeResult.serving_hint || ''),
                protein_g: barcodeResult.protein_g,
                carbs_g: barcodeResult.carbs_g,
                fat_g: barcodeResult.fat_g,
                source: 'barcode',
              } : null,
              loading: false,
              error: barcodeResult.source === 'not_found',
              onEdit: () => setEditCalVisible(true),
            }}
            subtext={
              barcodeBeforePhotoUri
                ? 'Before photo added \u2705'
                : barcodeResult.per_100g
                  ? `Per 100 g${barcodeResult.serving_hint ? ' \u00b7 ' + barcodeResult.serving_hint : ''}`
                  : barcodeResult.serving_hint
                    ? `Per serving \u00b7 ${barcodeResult.serving_hint}`
                    : undefined
            }
            buttons={[
              ...(barcodeResult.source !== 'not_found' ? [{ label: 'Confirm & Start', onPress: handleContinue }] : []),
              ...(barcodeResult.source !== 'not_found' && !barcodeBeforePhotoUri
                ? [{ label: '\ud83d\udcf7 Add before photo', onPress: () => setBarcodeBeforePhotoMode(true), secondary: true }]
                : []),
              { label: 'Scan again', onPress: handleRetake, secondary: true },
            ]}
          />
        </Animated.View>
      )}

      {/* Barcode before-photo capture mode */}
      {barcodeBeforePhotoMode && (
        <View style={styles.barcodePhotoOverlay}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topBtn} onPress={() => setBarcodeBeforePhotoMode(false)}>
              <MaterialIcons name="arrow-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Take before photo</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScanFrameOverlay hintText="Photo of your food before eating" />
          <View style={styles.controlsArea}>
            <View style={styles.bottomControlsRow}>
              <View style={styles.bottomLeftSpacer} />
              <TouchableOpacity
                style={[styles.shutterOuter, !ready && { opacity: 0.45 }]}
                disabled={!ready}
                onPress={async () => {
                  await captureBarcodeBeforePhoto();
                  setBarcodeBeforePhotoMode(false);
                  showCard();
                }}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setTorch((prev) => !prev)}>
                <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Photo scan result card */}
      {(result || aiError || softError) && !checking && !barcodeResult && (
        <Animated.View style={[styles.resultCardLayer, { transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={
              softError
                ? softError.title
                : aiError
                  ? aiError.toLowerCase().includes('daily limit')
                  ? 'Daily limit reached'
                  : 'AI unavailable'
                  : result?.isFood
                  ? (nutrition?.food_label || 'Meal detected')
                  : preScanFailureTitle(result)
            }
            accentColor={(aiError || softError) ? theme.warning : result?.isFood ? theme.success : theme.danger}
            confidencePercent={result ? Math.round((result.confidence ?? 0) * 100) : undefined}
            roast={aiError ? undefined : roast || undefined}
            subtext={softError?.subtitle || aiError || (!result?.isFood ? result?.retakeHint : undefined) || undefined}
            calories={result?.isFood ? {
              nutrition,
              loading: nutritionLoading,
              error: nutritionError,
              onEdit: nutrition ? () => setEditCalVisible(true) : undefined,
            } : undefined}
            buttons={[
              ...(softError?.code === 'SESSION_EXPIRED'
                ? [{ label: 'Sign in again', onPress: () => navigation.navigate('Auth') }]
                : []),
              ...(softError?.code === 'RATE_LIMIT'
                ? [{ label: 'OK', onPress: handleRetake }]
                : []),
              ...(result?.isFood ? [{ label: 'Confirm & Start', onPress: handleContinue }] : []),
              {
                label: softError?.code === 'SESSION_EXPIRED' ? 'Cancel' : softError?.code === 'RATE_LIMIT' ? 'Retake' : aiError ? 'Retry' : 'Retake',
                onPress: handleRetake,
                secondary: !!result?.isFood || !!softError,
              },
            ]}
          />
        </Animated.View>
      )}

      <CaloriesEditModal
        visible={editCalVisible}
        theme={theme}
        initial={nutrition?.estimated_calories ?? barcodeResult?.calories ?? undefined}
        onCancel={() => setEditCalVisible(false)}
        onSave={(cal) => {
          if (barcodeResult) {
            setBarcodeResult({ ...barcodeResult, calories: cal });
          } else if (nutrition) {
            setNutrition({ ...nutrition, estimated_calories: cal, source: 'user' });
          } else {
            setNutrition({
              food_label: 'Manual entry',
              estimated_calories: cal,
              min_calories: cal,
              max_calories: cal,
              confidence: 1,
              notes: 'User-entered',
              protein_g: null,
              carbs_g: null,
              fat_g: null,
              source: 'user',
            });
          }
          setEditCalVisible(false);
        }}
      />

      <ScanTipsModal visible={helpVisible} onClose={() => setHelpVisible(false)} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  permissionWrap: { justifyContent: 'center', alignItems: 'center', gap: 10 },
  permissionText: { color: '#CCC', fontSize: 14 },
  permissionBtn: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 10 },
  permissionBtnText: { fontSize: 14, fontWeight: '700' },

  topBar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 36 : 54,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 12,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { color: '#FFF', fontSize: 20, fontWeight: '700', lineHeight: 24 },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  controlsArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    alignItems: 'center',
    zIndex: 12,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 18,
    padding: 3,
    gap: 6,
    marginBottom: 8,
  },
  modeChip: {
    minWidth: 100,
    height: 32,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  modeChipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: '#FFF',
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF',
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 36,
  },
  bottomIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomLeftSpacer: {
    width: 42,
    height: 42,
  },
  shutterPlaceholder: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPlaceholderText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '600',
  },
  barcodeHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
  },

  freezeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 6,
  },
  shutterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 20,
  },

  analyzingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 132,
    alignItems: 'center',
    zIndex: 18,
  },
  analyzingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  analyzingText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  resultCardLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  barcodePhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    backgroundColor: 'transparent',
  },
});
