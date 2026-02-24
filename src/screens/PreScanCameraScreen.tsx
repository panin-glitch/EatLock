/**
 * PreScanCamera — full-screen camera for "before" meal photo.
 *
 * Opens camera immediately. Shutter → freeze + "Analyzing…" → ResultCard with verdict.
 * If FOOD_OK → calories fetched in background → shown in card → "Confirm & Start".
 *
 * Top bar: Close (X) | "Scan meal" | Help (?)
 * Bottom bar: Torch toggle | Shutter | Barcode toggle
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useTheme } from '../theme/ThemeProvider';
import { getVisionService } from '../services/vision';
import { CloudVisionService } from '../services/vision/CloudVisionService';
import { getPreScanRoast, getFoodConfirmedMessage } from '../services/vision/roasts';
import type { FoodCheckResult, NutritionEstimate } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ResultCard } from '../components/scan/ResultCard';
import { CaloriesEditModal } from '../components/scan/CaloriesEditModal';

const { width: SW, height: SH } = Dimensions.get('window');
const BRACKET = 56;

type Props = NativeStackScreenProps<any, 'PreScanCamera'>;

export default function PreScanCameraScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FoodCheckResult | null>(null);
  const [roast, setRoast] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Barcode scanning
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<{ type: string; data: string } | null>(null);
  const barcodeLock = useRef(false);

  // Calories
  const [nutrition, setNutrition] = useState<NutritionEstimate | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState(false);
  const [calEditVisible, setCalEditVisible] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  // ── Permission handling ──
  if (!permission) return <View style={styles.fill} />;
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.permBox]}>
        <MaterialIcons name="camera-alt" size={48} color="#999" />
        <Text style={styles.permText}>Camera access is needed to scan meals</Text>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: theme.primary }]} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#999', fontSize: 13 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture ──
  const handleShutter = async () => {
    if (!cameraRef.current || !ready || checking) return;
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!pic) return;
      setPhotoUri(pic.uri);
      setResult(null);
      setRoast(null);
      setNutrition(null);
      setNutritionLoading(false);
      setNutritionError(false);
      verifyPhoto(pic.uri);
    } catch (e) {
      console.warn('[PreScan] takePicture failed', e);
    }
  };

  const verifyPhoto = async (uri: string) => {
    setChecking(true);
    setAiError(null);
    try {
      const vision = getVisionService();
      const check = await vision.verifyFood(uri);
      setResult(check);
      setRoast(
        check.isFood
          ? check.roastLine || getFoodConfirmedMessage()
          : check.roastLine || getPreScanRoast(check.reasonCode),
      );

      // If food is confirmed, start calorie estimation in background
      if (check.isFood) {
        const svc = vision as CloudVisionService;
        const r2Key = svc.lastR2Key;
        if (r2Key) {
          fetchCalories(r2Key);
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.error('[PreScan] verifyFood error:', msg);
      setResult(null);
      setRoast(null);
      setAiError(msg);
    }
    setChecking(false);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  const fetchCalories = async (r2Key: string) => {
    setNutritionLoading(true);
    setNutritionError(false);
    try {
      const vision = getVisionService();
      const est = await vision.estimateCalories(r2Key);
      if (est) {
        setNutrition(est);
      } else {
        setNutritionError(true);
      }
    } catch {
      setNutritionError(true);
    }
    setNutritionLoading(false);
  };

  // ── Barcode handler ──
  const handleBarcodeScanned = async (scanResult: BarcodeScanningResult) => {
    if (barcodeLock.current || checking || photoUri) return;
    barcodeLock.current = true;
    const barcode = { type: scanResult.type, data: scanResult.data };
    setScannedBarcode(barcode);

    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (pic) setPhotoUri(pic.uri);
    } catch (e) {
      console.warn('[PreScan] barcode auto-capture failed', e);
    }

    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  const handleRetake = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setPhotoUri(null);
      setResult(null);
      setRoast(null);
      setAiError(null);
      setScannedBarcode(null);
      barcodeLock.current = false;
      setNutrition(null);
      setNutritionLoading(false);
      setNutritionError(false);
    });
  };

  const handleRetry = () => {
    if (!photoUri) return;
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setResult(null);
      setRoast(null);
      setAiError(null);
      setNutrition(null);
      setNutritionLoading(false);
      setNutritionError(false);
      verifyPhoto(photoUri);
    });
  };

  const handleConfirm = () => {
    if (scannedBarcode) {
      navigation.navigate('LockSetupConfirm', {
        preImageUri: photoUri,
        preCheck: result,
        preBarcodeData: scannedBarcode,
        preNutrition: nutrition,
      });
      return;
    }
    if (!photoUri || !result?.isFood) return;
    navigation.navigate('LockSetupConfirm', {
      preImageUri: photoUri,
      preCheck: result,
      preNutrition: nutrition,
    });
  };

  const handleCaloriesSave = (cal: number) => {
    setCalEditVisible(false);
    setNutrition((prev) =>
      prev
        ? { ...prev, estimated_calories: cal, min_calories: cal, max_calories: cal, source: 'user' as const }
        : {
            food_label: 'Manual entry',
            estimated_calories: cal,
            min_calories: cal,
            max_calories: cal,
            confidence: 1,
            notes: 'User override',
            source: 'user' as const,
          },
    );
  };

  const sheetTranslateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const showCamera = !photoUri;

  return (
    <View style={styles.fill}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera / Frozen image layer */}
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
          barcodeScannerSettings={barcodeMode ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] } : undefined}
          onBarcodeScanned={barcodeMode && !barcodeLock.current ? handleBarcodeScanned : undefined}
        />
      ) : (
        <Image source={{ uri: photoUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.topBtn}>
          <MaterialIcons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan meal</Text>
        <TouchableOpacity hitSlop={12} style={styles.topBtn} onPress={() => setHelpVisible(true)}>
          <MaterialIcons name="help-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Focus brackets */}
      {showCamera && (
        <View style={styles.bracketWrap} pointerEvents="none">
          <View style={[styles.bracket, styles.bTL]} />
          <View style={[styles.bracket, styles.bTR]} />
          <View style={[styles.bracket, styles.bBL]} />
          <View style={[styles.bracket, styles.bBR]} />
          <Text style={styles.hintText}>{barcodeMode ? 'Point at product barcode' : 'Keep plate in frame'}</Text>
        </View>
      )}

      {/* Bottom controls */}
      {showCamera && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.torchBtn, torch && styles.torchBtnActive]}
            onPress={() => setTorch(t => !t)}
            activeOpacity={0.7}
          >
            <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterOuter, !ready && { opacity: 0.4 }]}
            onPress={handleShutter}
            activeOpacity={0.7}
            disabled={!ready}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.torchBtn, barcodeMode && { backgroundColor: 'rgba(52,199,89,0.35)' }]}
            onPress={() => { setBarcodeMode(b => !b); barcodeLock.current = false; }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="qr-code-scanner" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Analyzing overlay */}
      {checking && (
        <View style={styles.analyzingWrap} pointerEvents="none">
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.analyzingText}>Analyzing…</Text>
          </View>
        </View>
      )}

      {/* Result card (floating overlay) */}
      {!checking && (result || aiError || scannedBarcode) && (
        <Animated.View style={[styles.cardOverlay, { transform: [{ translateY: sheetTranslateY }] }]} pointerEvents="box-none">
          {/* AI / network error */}
          {aiError && !result && (
            <ResultCard
              theme={theme}
              accentColor={theme.warning}
              title="AI unavailable"
              roast="Could not reach the verification service 😭"
              subtext="Check your connection and try again."
              buttons={[
                { label: 'Retry', onPress: handleRetry },
                { label: 'Retake', onPress: handleRetake, secondary: true },
              ]}
            />
          )}

          {/* Barcode scanned */}
          {scannedBarcode && !result && !aiError && (
            <ResultCard
              theme={theme}
              accentColor={theme.success}
              title="Barcode Scanned"
              roast={`Product code: ${scannedBarcode.data} 📦✨`}
              subtext={`Type: ${scannedBarcode.type.toUpperCase()}`}
              buttons={[
                { label: 'Confirm & Start', onPress: handleConfirm },
                { label: 'Retake', onPress: handleRetake, secondary: true },
              ]}
            />
          )}

          {/* Valid verdict from backend */}
          {result && (
            <ResultCard
              theme={theme}
              accentColor={result.isFood ? theme.success : theme.danger}
              title={
                result.isFood
                  ? nutrition?.food_label || 'Meal detected'
                  : 'Not food'
              }
              confidence={result.confidence ? `${Math.round(result.confidence * 100)}%` : undefined}
              roast={roast || undefined}
              subtext={!result.isFood && result.retakeHint ? result.retakeHint : undefined}
              calories={
                result.isFood
                  ? {
                      nutrition,
                      loading: nutritionLoading,
                      error: nutritionError,
                      onEdit: () => setCalEditVisible(true),
                    }
                  : undefined
              }
              buttons={
                result.isFood
                  ? [
                      { label: 'Confirm & Start', onPress: handleConfirm },
                      { label: 'Retake', onPress: handleRetake, secondary: true },
                    ]
                  : [{ label: 'Retake', onPress: handleRetake }]
              }
            />
          )}
        </Animated.View>
      )}

      {/* Calories edit modal */}
      <CaloriesEditModal
        visible={calEditVisible}
        theme={theme}
        initial={nutrition?.estimated_calories}
        onSave={handleCaloriesSave}
        onCancel={() => setCalEditVisible(false)}
      />

      {/* Help tips modal */}
      <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Scan Tips</Text>
            {[
              { icon: 'restaurant' as const, tip: 'Keep plate centered in the frame' },
              { icon: 'wb-sunny' as const, tip: 'Use good lighting — avoid shadows' },
              { icon: 'pan-tool' as const, tip: 'Hold still until you see the result' },
            ].map((item, i) => (
              <View key={i} style={styles.tipRow}>
                <MaterialIcons name={item.icon} size={18} color={theme.primary} />
                <Text style={[styles.tipText, { color: theme.text }]}>{item.tip}</Text>
              </View>
            ))}
            <TouchableOpacity style={[styles.modalClose, { backgroundColor: theme.primary }]} onPress={() => setHelpVisible(false)}>
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  permBox: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  permText: { color: '#CCC', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  permBtn: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 },
  permBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingHorizontal: 16, paddingBottom: 10, zIndex: 10,
  },
  topBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  bracketWrap: {
    position: 'absolute', top: SH * 0.22, left: SW * 0.15,
    width: SW * 0.7, height: SW * 0.7, zIndex: 5,
  },
  bracket: {
    position: 'absolute', width: BRACKET, height: BRACKET,
    borderColor: 'rgba(255,255,255,0.4)', borderWidth: 2,
  },
  bTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  bTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  bBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  hintText: {
    position: 'absolute', bottom: -28, alignSelf: 'center',
    color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500',
  },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 120, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, zIndex: 10,
  },
  torchBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  torchBtnActive: { backgroundColor: 'rgba(255,204,0,0.35)' },
  shutterOuter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#FFF',
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 28,
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' },

  analyzingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', zIndex: 20,
  },
  analyzingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  analyzingText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  sheetWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
  },
  cardOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, zIndex: 30,
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: { width: SW * 0.78, borderRadius: 18, padding: 24 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  tipText: { fontSize: 14, flex: 1 },
  modalClose: {
    marginTop: 8, borderRadius: 12,
    height: 42, justifyContent: 'center', alignItems: 'center',
  },
  modalCloseText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
