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
import type { FoodCheckResult, NutritionEstimate } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanFrameOverlay } from '../components/scan/ScanFrameOverlay';
import { ScanTipsModal } from '../components/scan/ScanTipsModal';
import { ResultCard, type ResultCardButton, type CaloriesRowData } from '../components/scan/ResultCard';
import { CaloriesEditModal } from '../components/scan/CaloriesEditModal';
import { lookupBarcode, type BarcodeLookupResult } from '../services/barcodeService';

type Props = NativeStackScreenProps<any, 'PreScanCamera'>;

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
    setNutrition(null);
    setNutritionLoading(false);
    setNutritionError(false);
    showAnalyzing();

    try {
      const vision = getVisionService();
      const check = await vision.verifyFood(uri);
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
      setRoast(null);
      setAiError(null);
      setNutrition(null);
      setNutritionLoading(false);
      setNutritionError(false);
      setBarcodeResult(null);
      setScannedBarcode(null);
      hideFreeze();
    });
  };

  const handleContinue = () => {
    if (barcodeResult) {
      // Barcode flow: navigate with barcode nutrition
      const barcodeNutrition: NutritionEstimate = {
        food_label: barcodeResult.name,
        estimated_calories: barcodeResult.calories ?? 0,
        min_calories: barcodeResult.calories ?? 0,
        max_calories: barcodeResult.calories ?? 0,
        confidence: barcodeResult.source === 'not_found' ? 0 : 0.8,
        notes: barcodeResult.serving_hint || '',
        protein_g: barcodeResult.protein_g,
        carbs_g: barcodeResult.carbs_g,
        fat_g: barcodeResult.fat_g,
        source: 'barcode',
      };
      navigation.navigate('LockSetupConfirm', {
        preImageUri: null,
        preCheck: { isFood: true, confidence: 1, hasPlateOrBowl: false, quality: { brightness: 1, blur: 1, framing: 1 }, reasonCode: 'OK' as const, roastLine: barcodeResult.name, retakeHint: '' },
        preNutrition: barcodeNutrition,
        foodName: barcodeResult.name,
        barcode: scannedBarcode,
      });
      return;
    }
    if (!photoUri || !result?.isFood) return;
    navigation.navigate('LockSetupConfirm', {
      preImageUri: photoUri,
      preCheck: result,
      preNutrition: nutrition,
      foodName: nutrition?.food_label || result?.roastLine,
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
          <Text style={styles.permissionBtnText}>Grant access</Text>
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
            <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setTorch((prev) => !prev)}>
              <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={20} color="#FFF" />
            </TouchableOpacity>

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

            <View style={styles.bottomRightSpacer} />
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
      {barcodeResult && !barcodeLoading && (
        <Animated.View style={[styles.resultCardLayer, { transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={barcodeResult.name}
            accentColor={barcodeResult.source === 'not_found' ? theme.warning : theme.success}
            roast={barcodeResult.source === 'not_found' ? 'No nutrition data found for this barcode' : undefined}
            calories={{
              nutrition: barcodeResult.calories != null ? {
                food_label: barcodeResult.name,
                estimated_calories: barcodeResult.calories,
                min_calories: barcodeResult.calories,
                max_calories: barcodeResult.calories,
                confidence: 0.8,
                notes: barcodeResult.serving_hint || '',
                protein_g: barcodeResult.protein_g,
                carbs_g: barcodeResult.carbs_g,
                fat_g: barcodeResult.fat_g,
                source: 'barcode',
              } : null,
              loading: false,
              error: barcodeResult.source === 'not_found',
              onEdit: () => setEditCalVisible(true),
            }}
            subtext={barcodeResult.serving_hint ? `Per 100g · ${barcodeResult.serving_hint}` : undefined}
            buttons={[
              { label: 'Confirm & Start', onPress: handleContinue },
              { label: 'Scan again', onPress: handleRetake, secondary: true },
            ]}
          />
        </Animated.View>
      )}

      {/* Photo scan result card */}
      {(result || aiError) && !checking && !barcodeResult && (
        <Animated.View style={[styles.resultCardLayer, { transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={aiError ? 'AI unavailable' : result?.isFood ? (nutrition?.food_label || 'Meal detected') : 'Not food'}
            accentColor={aiError ? theme.warning : result?.isFood ? theme.success : theme.danger}
            roast={aiError ? undefined : roast || undefined}
            subtext={aiError || (!result?.isFood ? result?.retakeHint : undefined) || undefined}
            calories={result?.isFood ? {
              nutrition,
              loading: nutritionLoading,
              error: nutritionError,
              onEdit: nutrition ? () => setEditCalVisible(true) : undefined,
            } : undefined}
            buttons={[
              ...(result?.isFood ? [{ label: 'Confirm & Start', onPress: handleContinue }] : []),
              { label: aiError ? 'Retry' : 'Retake', onPress: handleRetake, secondary: !!result?.isFood },
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
  permissionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

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
  bottomRightSpacer: {
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
    backgroundColor: '#FFF',
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
});
