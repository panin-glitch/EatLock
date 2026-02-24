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
import { useAppState } from '../state/AppStateContext';
import { getVisionService } from '../services/vision';
import { getPostScanRoast } from '../services/vision/roasts';
import type { CompareResult } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanFrameOverlay } from '../components/scan/ScanFrameOverlay';
import { ScanTipsModal } from '../components/scan/ScanTipsModal';
import { ResultCard } from '../components/scan/ResultCard';

type Props = NativeStackScreenProps<any, 'PostScanCamera'>;

export default function PostScanCameraScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, updateActiveSession, endSession } = useAppState();
  const { preImageUri } = (route.params as { preImageUri: string }) || {};

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const barcodeLockRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const processPhoto = async (uri: string) => {
    setChecking(true);
    setErrorMsg(null);
    showAnalyzing();

    try {
      const vision = getVisionService();
      const comparison = await vision.compareMeal(preImageUri, uri);
      setResult(comparison);

      await updateActiveSession({
        postImageUri: uri,
        verification: {
          ...activeSession?.verification,
          compareResult: comparison,
        },
        roastMessage: comparison.roastLine,
      });
    } catch (e: any) {
      setResult(null);
      setErrorMsg(e?.message || 'Could not verify this photo.');
    } finally {
      barcodeLockRef.current = false;
      setChecking(false);
      hideAnalyzing();
      showCard();
    }
  };

  const captureAndProcess = useCallback(async () => {
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
      setErrorMsg(null);
      await processPhoto(pic.uri);
    } catch {
      barcodeLockRef.current = false;
      hideFreeze();
    }
  }, [ready, checking]);

  const handleShutter = async () => {
    barcodeLockRef.current = false;
    await captureAndProcess();
  };

  const handleBarcodeScanned = async (_scan: BarcodeScanningResult) => {
    if (!barcodeMode || barcodeLockRef.current || checking || photoUri) return;
    barcodeLockRef.current = true;
    await captureAndProcess();
  };

  const handleRetake = () => {
    hideCard(() => {
      barcodeLockRef.current = false;
      setPhotoUri(null);
      setResult(null);
      setErrorMsg(null);
      hideFreeze();
    });
  };

  const handleContinue = async () => {
    if (!result) return;

    const verdictToStatus: Record<string, 'VERIFIED' | 'PARTIAL' | 'FAILED' | 'INCOMPLETE'> = {
      EATEN: 'VERIFIED',
      PARTIAL: 'PARTIAL',
      UNCHANGED: 'FAILED',
      UNVERIFIABLE: 'INCOMPLETE',
    };

    await endSession(verdictToStatus[result.verdict] || 'INCOMPLETE', result.roastLine);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }, { name: 'SessionSummary' }],
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

  const verdictColor = result
    ? result.verdict === 'EATEN'
      ? theme.success
      : result.verdict === 'PARTIAL'
        ? theme.warning
        : result.verdict === 'UNCHANGED'
          ? theme.danger
          : theme.textSecondary
    : theme.textSecondary;

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

      {preImageUri && !photoUri && (
        <View style={styles.preThumbWrap}>
          <Image source={{ uri: preImageUri }} style={styles.preThumb} />
          <Text style={styles.preThumbLabel}>Before</Text>
        </View>
      )}

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

      {checking && (
        <Animated.View style={[styles.analyzingWrap, { opacity: analyzingOpacity }]} pointerEvents="none">
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.analyzingText}>Analyzing food...</Text>
          </View>
        </Animated.View>
      )}

      {(result || errorMsg) && !checking && (
        <Animated.View style={[{ transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={errorMsg
              ? 'AI unavailable'
              : result?.verdict === 'EATEN'
                ? 'Meal finished'
                : result?.verdict === 'PARTIAL'
                  ? 'Partially eaten'
                  : result?.verdict === 'UNCHANGED'
                    ? 'Not eaten'
                    : 'Uncertain'}
            accentColor={errorMsg ? theme.warning : verdictColor}
            roast={errorMsg ? undefined : (result ? result.roastLine || getPostScanRoast(result.verdict) : undefined)}
            subtext={errorMsg || undefined}
            buttons={[
              ...(result ? [{ label: 'See Summary', onPress: handleContinue }] : []),
              { label: errorMsg ? 'Retry' : 'Retake', onPress: handleRetake, secondary: !!result },
            ]}
          />
        </Animated.View>
      )}

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

  preThumbWrap: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 94 : 108,
    left: 16,
    alignItems: 'center',
    zIndex: 12,
  },
  preThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  preThumbLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', marginTop: 2 },

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
});
