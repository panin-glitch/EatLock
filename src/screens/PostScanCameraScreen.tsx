/**
 * PostScanCamera — full-screen camera for "after" meal photo (Rork-style).
 *
 * Opens camera immediately. Shutter → freeze + "Analyzing…" → bottom sheet with verdict.
 * Confirm → endSession → SessionSummary. Retake → back to camera.
 *
 * Top bar: Close (X) | "After photo" | Help (?)
 * Bottom bar: Torch toggle | Shutter | (spacer)
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
import { useAppState } from '../state/AppStateContext';
import { getVisionService } from '../services/vision';
import { getPostScanRoast } from '../services/vision/roasts';
import type { CompareResult, CompareVerdict } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ResultCard } from '../components/scan/ResultCard';
import { DistractionRatingModal } from '../components/scan/DistractionRatingModal';

const { width: SW, height: SH } = Dimensions.get('window');
const BRACKET = 56;

type Props = NativeStackScreenProps<any, 'PostScanCamera'>;

export default function PostScanCameraScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, updateActiveSession, endSession } = useAppState();
  const { preImageUri, preBarcodeData } = (route.params as { preImageUri: string; preBarcodeData?: { type: string; data: string } }) || {};

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Barcode scanning
  const [barcodeMode, setBarcodeMode] = useState(!!preBarcodeData);
  const [scannedBarcode, setScannedBarcode] = useState<{ type: string; data: string } | null>(null);
  const barcodeLock = useRef(false);

  // Distraction rating
  const [ratingVisible, setRatingVisible] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  // ── Permission fallback ──
  if (!permission) return <View style={styles.fill} />;
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.permBox]}>
        <MaterialIcons name="camera-alt" size={48} color="#999" />
        <Text style={styles.permText}>Camera access is needed</Text>
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
      setCompareResult(null);
      setErrorMsg(null);
      processPhoto(pic.uri);
    } catch (e) {
      console.warn('[PostScan] takePicture failed', e);
    }
  };

  // ── Barcode handler ──
  const handleBarcodeScanned = async (scanResult: BarcodeScanningResult) => {
    if (barcodeLock.current || checking || photoUri) return;
    barcodeLock.current = true;
    const barcode = { type: scanResult.type, data: scanResult.data };
    setScannedBarcode(barcode);

    // Auto-capture frozen frame
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (pic) setPhotoUri(pic.uri);
    } catch (e) {
      console.warn('[PostScan] barcode auto-capture failed', e);
    }

    // Compare with pre-scan barcode
    if (preBarcodeData && barcode.data === preBarcodeData.data) {
      // Match! Treat as EATEN
      const matchResult: CompareResult = {
        isSameScene: true,
        duplicateScore: 0,
        foodChangeScore: 1,
        verdict: 'EATEN',
        confidence: 1,
        reasonCode: 'OK',
        roastLine: 'Barcode match! Snack consumed. 🎉',
        retakeHint: '',
      };
      setCompareResult(matchResult);
      await updateActiveSession({
        verification: {
          ...activeSession?.verification,
          compareResult: matchResult,
        },
        roastMessage: matchResult.roastLine,
      });
    } else if (preBarcodeData) {
      // Mismatch
      setErrorMsg(`Wrong barcode. Scan the same product (${preBarcodeData.data}).`);
    } else {
      setErrorMsg('Barcode scanned, but pre-scan didn\u2019t use a barcode.');
    }
    showSheet();
  };

  const processPhoto = async (uri: string) => {
    setChecking(true);
    setAiError(null);
    const vision = getVisionService();
    try {
      // Skip verifyFood for after-photo — an empty plate is expected!
      // Go straight to before/after comparison.
      const comparison = await vision.compareMeal(preImageUri, uri);
      setCompareResult(comparison);

      await updateActiveSession({
        postImageUri: uri,
        verification: {
          ...activeSession?.verification,
          compareResult: comparison,
        },
        roastMessage: comparison.roastLine,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.error('[PostScan] processPhoto error:', msg);
      // Network / Worker / OpenAI error → AI unavailable, not a food verdict
      setCompareResult(null);
      setErrorMsg(null);
      setAiError(msg);
    }
    setChecking(false);
    showSheet();
  };

  const showSheet = () => {
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  const handleRetake = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setPhotoUri(null);
      setCompareResult(null);
      setErrorMsg(null);
      setAiError(null);
      setScannedBarcode(null);
      barcodeLock.current = false;
    });
  };

  const handleRetry = () => {
    if (!photoUri) return;
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setCompareResult(null);
      setErrorMsg(null);
      setAiError(null);
      setScannedBarcode(null);
      barcodeLock.current = false;
      setErrorMsg(null);
      setAiError(null);
      processPhoto(photoUri);
    });
  };

  const handleConfirm = () => {
    if (!compareResult || compareResult.verdict !== 'EATEN') return;
    // Show distraction rating before ending session
    setRatingVisible(true);
  };

  const finishWithRating = async (rating?: number) => {
    setRatingVisible(false);
    // Save distraction rating to active session before ending
    if (rating) {
      await updateActiveSession({ distractionRating: rating });
      // Small delay to let state settle before endSession reads activeSession
      await new Promise((r) => setTimeout(r, 50));
    }
    await endSession('VERIFIED', compareResult?.roastLine);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }, { name: 'SessionSummary' }] });
  };

  const isEaten = compareResult?.verdict === 'EATEN';

  // Verdict color
  const verdictColor = compareResult
    ? compareResult.verdict === 'EATEN' ? theme.success
      : compareResult.verdict === 'PARTIAL' ? theme.warning
        : compareResult.verdict === 'UNCHANGED' ? theme.danger
          : theme.textMuted
    : theme.textMuted;

  const sheetTranslateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [350, 0] });
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
        <Text style={styles.topTitle}>After photo</Text>
        <TouchableOpacity hitSlop={12} style={styles.topBtn} onPress={() => setHelpVisible(true)}>
          <MaterialIcons name="help-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Before thumbnail overlay (small) */}
      {preImageUri && showCamera && (
        <View style={styles.preThumbWrap}>
          <Image source={{ uri: preImageUri }} style={styles.preThumb} resizeMode="cover" />
          <Text style={styles.preThumbLabel}>Before</Text>
        </View>
      )}

      {/* Focus brackets */}
      {showCamera && (
        <View style={styles.bracketWrap} pointerEvents="none">
          <View style={[styles.bracket, styles.bTL]} />
          <View style={[styles.bracket, styles.bTR]} />
          <View style={[styles.bracket, styles.bBL]} />
          <View style={[styles.bracket, styles.bBR]} />
          <Text style={styles.hintText}>{barcodeMode ? 'Scan the snack barcode' : 'Show your plate after eating'}</Text>
        </View>
      )}

      {/* Bottom controls (torch + shutter) */}
      {showCamera && (
        <View style={styles.bottomBar}>
          {/* Torch toggle */}
          <TouchableOpacity
            style={[styles.torchBtn, torch && styles.torchBtnActive]}
            onPress={() => setTorch(t => !t)}
            activeOpacity={0.7}
          >
            <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color="#FFF" />
          </TouchableOpacity>

          {/* Shutter */}
          <TouchableOpacity
            style={[styles.shutterOuter, !ready && { opacity: 0.4 }]}
            onPress={handleShutter}
            activeOpacity={0.7}
            disabled={!ready}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          {/* Barcode toggle */}
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
      {!checking && (compareResult || errorMsg || aiError || scannedBarcode) && (photoUri || scannedBarcode) && (
        <Animated.View style={[styles.cardOverlay, { transform: [{ translateY: sheetTranslateY }] }]} pointerEvents="box-none">
          {/* AI / network error state */}
          {aiError && !compareResult && (
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

          {/* Error message (non-AI) */}
          {errorMsg && !compareResult && !aiError && (
            <ResultCard
              theme={theme}
              accentColor={theme.danger}
              title="Error"
              roast={errorMsg}
              buttons={[
                { label: 'Retake', onPress: handleRetake },
              ]}
            />
          )}

          {/* Comparison result */}
          {compareResult && (
            <ResultCard
              theme={theme}
              accentColor={verdictColor}
              title={
                isEaten ? 'Plate Empty — Unlocked!'
                  : compareResult.verdict === 'PARTIAL' ? 'Still has food'
                    : compareResult.verdict === 'UNCHANGED' ? 'Plate not touched'
                      : "Can't verify"
              }
              roast={
                isEaten
                  ? compareResult.roastLine || getPostScanRoast(compareResult.verdict)
                  : compareResult.verdict === 'PARTIAL'
                    ? 'Finish your food to unlock! 🥀'
                    : compareResult.verdict === 'UNCHANGED'
                      ? "You haven't eaten yet. Empty the plate to unlock 💀"
                      : compareResult.retakeHint || 'Try again with the same angle and lighting 🙏'
              }
              buttons={
                isEaten
                  ? [{ label: 'Continue', onPress: handleConfirm }]
                  : [{ label: 'Retake Photo', onPress: handleRetake }]
              }
            />
          )}
        </Animated.View>
      )}

      {/* Help tips modal */}
      <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>After Photo Tips</Text>
            {[
              { icon: 'restaurant' as const, tip: 'Show the same plate from a similar angle' },
              { icon: 'wb-sunny' as const, tip: 'Keep the same lighting as before' },
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

      {/* Distraction rating modal */}
      <DistractionRatingModal
        visible={ratingVisible}
        theme={theme}
        onSubmit={(rating) => finishWithRating(rating)}
        onSkip={() => finishWithRating()}
      />
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

  /* Before thumbnail */
  preThumbWrap: {
    position: 'absolute', top: Platform.OS === 'android' ? 94 : 104,
    left: 16, zIndex: 10, alignItems: 'center',
  },
  preThumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  preThumbLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', marginTop: 3 },

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

  /* Help modal */
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
