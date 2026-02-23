/**
 * PreScanCamera — full-screen camera for "before" meal photo (Rork-style).
 *
 * Opens camera immediately. Shutter → freeze + "Analyzing…" → bottom sheet verdict.
 * Pass → navigate to LockSetupConfirm. Fail → Retake.
 *
 * Top bar: Close (X) | "Scan meal" | Help (?)
 * Bottom bar: Torch toggle | Shutter | (spacer)
 */

import React, { useState, useRef, useCallback } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../theme/ThemeProvider';
import { getVisionService } from '../services/vision';
import { getPreScanRoast, getFoodConfirmedMessage } from '../services/vision/roasts';
import type { FoodCheckResult } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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

  const sheetAnim = useRef(new Animated.Value(0)).current;

  // ── Permission handling ──
  if (!permission) return <View style={styles.fill} />;
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.permBox]}>
        <MaterialIcons name="camera-alt" size={48} color="#999" />
        <Text style={styles.permText}>Camera access is needed to scan meals</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
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
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.error('[PreScan] verifyFood error:', msg);
      // Network / Worker / OpenAI error → show "AI unavailable", NOT a NOT_FOOD verdict
      setResult(null);
      setRoast(null);
      setAiError(msg);
    }
    setChecking(false);
    // animate sheet in
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  const handleRetake = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setPhotoUri(null);
      setResult(null);
      setRoast(null);
      setAiError(null);
    });
  };

  const handleRetry = () => {
    if (!photoUri) return;
    Animated.timing(sheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setResult(null);
      setRoast(null);
      setAiError(null);
      verifyPhoto(photoUri);
    });
  };

  const handleConfirm = () => {
    if (!photoUri || !result?.isFood) return;
    navigation.navigate('LockSetupConfirm', { preImageUri: photoUri, preCheck: result });
  };

  const sheetTranslateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  // ── Render ──
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
        />
      ) : (
        <Image source={{ uri: photoUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* ── Overlays (always on top of camera) ── */}

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

      {/* Focus brackets (only when camera is live) */}
      {showCamera && (
        <View style={styles.bracketWrap} pointerEvents="none">
          {/* TL */}
          <View style={[styles.bracket, styles.bTL]} />
          {/* TR */}
          <View style={[styles.bracket, styles.bTR]} />
          {/* BL */}
          <View style={[styles.bracket, styles.bBL]} />
          {/* BR */}
          <View style={[styles.bracket, styles.bBR]} />
          <Text style={styles.hintText}>Keep plate in frame</Text>
        </View>
      )}

      {/* Bottom controls (torch + shutter) — only when camera is live */}
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

          {/* Spacer to balance layout */}
          <View style={styles.torchBtn} />
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

      {/* Result bottom sheet */}
      {!checking && (result || aiError) && (
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View style={styles.sheetHandle} />

          {/* AI / network error state */}
          {aiError && !result && (
            <>
              <View style={styles.sheetRow}>
                <MaterialIcons name="cloud-off" size={20} color="#FF9500" />
                <Text style={[styles.sheetTitle, { color: '#FF9500' }]}>AI unavailable</Text>
              </View>
              <Text style={styles.sheetRoast}>Could not reach the verification service. Check your connection and try again.</Text>
              <View style={styles.sheetBtns}>
                <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: '#FF9500' }]} onPress={handleRetry}>
                  <Text style={styles.sheetBtnText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: '#2C2C2E' }]} onPress={handleRetake}>
                  <Text style={styles.sheetBtnText}>Retake</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Valid verdict from backend */}
          {result && (
            <>
              <View style={styles.sheetRow}>
                <MaterialIcons
                  name={result.isFood ? 'check-circle' : 'error'}
                  size={20}
                  color={result.isFood ? '#34C759' : '#FF3B30'}
                />
                <Text style={[styles.sheetTitle, { color: result.isFood ? '#34C759' : '#FF3B30' }]}>
                  {result.isFood ? 'Food detected' : 'Not food'}
                </Text>
              </View>

              {roast ? <Text style={styles.sheetRoast}>{roast}</Text> : null}
              {!result.isFood && result.retakeHint ? (
                <Text style={styles.sheetHint}>{result.retakeHint}</Text>
              ) : null}

              <View style={styles.sheetBtns}>
                {result.isFood ? (
                  <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: '#34C759' }]} onPress={handleConfirm}>
                    <Text style={styles.sheetBtnText}>Confirm & Start</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.sheetBtn, { backgroundColor: result.isFood ? '#2C2C2E' : '#34C759' }]}
                  onPress={handleRetake}
                >
                  <Text style={styles.sheetBtnText}>Retake</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      )}

      {/* Help tips modal */}
      <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Scan Tips</Text>
            {[
              { icon: 'restaurant' as const, tip: 'Keep plate centered in the frame' },
              { icon: 'wb-sunny' as const, tip: 'Use good lighting — avoid shadows' },
              { icon: 'pan-tool' as const, tip: 'Hold still until you see the result' },
            ].map((item, i) => (
              <View key={i} style={styles.tipRow}>
                <MaterialIcons name={item.icon} size={18} color="#34C759" />
                <Text style={styles.tipText}>{item.tip}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setHelpVisible(false)}>
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

  /* Permission fallback */
  permBox: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  permText: { color: '#CCC', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  permBtn: { backgroundColor: '#34C759', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 },
  permBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  /* Top bar */
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingHorizontal: 16, paddingBottom: 10,
    zIndex: 10,
  },
  topBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center' },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  /* Brackets */
  bracketWrap: {
    position: 'absolute', top: SH * 0.22, left: SW * 0.12,
    width: SW * 0.76, height: SW * 0.76,
    zIndex: 5,
  },
  bracket: {
    position: 'absolute', width: BRACKET, height: BRACKET,
    borderColor: 'rgba(255,255,255,0.6)', borderWidth: 2.5,
  },
  bTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  bTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  bBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  hintText: {
    position: 'absolute', bottom: -28, alignSelf: 'center',
    color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500',
  },

  /* Bottom shutter bar */
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
  shutterInner: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF',
  },

  /* Analyzing */
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

  /* Bottom sheet */
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34,
    zIndex: 30,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 12,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetRoast: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  sheetHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 4 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetBtn: {
    flex: 1, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  sheetBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  /* Help modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    width: SW * 0.78, backgroundColor: '#1C1C1E', borderRadius: 18,
    padding: 24,
  },
  modalTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  tipText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, flex: 1 },
  modalClose: {
    marginTop: 8, backgroundColor: '#34C759', borderRadius: 12,
    height: 42, justifyContent: 'center', alignItems: 'center',
  },
  modalCloseText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
