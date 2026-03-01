import React, { useCallback, useRef, useState, useEffect } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { getVisionService } from '../services/vision';
import { getPostScanRoast } from '../services/vision/roasts';
import type { CompareResult, VisionSoftError } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanFrameOverlay } from '../components/scan/ScanFrameOverlay';
import { ScanTipsModal } from '../components/scan/ScanTipsModal';
import { ResultCard } from '../components/scan/ResultCard';

type Props = NativeStackScreenProps<any, 'PostScanCamera'>;

function isVisionSoftError(value: unknown): value is VisionSoftError {
  return !!value && typeof value === 'object' && (value as VisionSoftError).kind === 'soft_error';
}

export default function PostScanCameraScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, updateActiveSession, endSession } = useAppState();
  const { preImageUri } =
    (route.params as { preImageUri?: string }) || {};

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [softError, setSoftError] = useState<VisionSoftError | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackRoast, setFeedbackRoast] = useState<string | null>(null);

  useEffect(() => {
    setFeedbackRoast(null);
  }, [photoUri]);

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
    setSoftError(null);
    setFeedbackRoast(null);
    showAnalyzing();

    try {
      if (!preImageUri) {
        throw new Error('Missing before photo for comparison. Please retake your before scan.');
      }
      const vision = getVisionService();

      const afterCheck = await vision.verifyFood(uri);
      if (isVisionSoftError(afterCheck)) {
        setSoftError(afterCheck);
        return;
      }

      const invalidAfter = !afterCheck.isFood || afterCheck.reasonCode !== 'OK';
      if (invalidAfter) {
        setResult(null);
        setFeedbackRoast(afterCheck.roastLine || null);
        setErrorMsg(afterCheck.retakeHint || 'Capture a clear AFTER photo of your meal to continue.');
        return;
      }

      const comparison = await vision.compareMeal(preImageUri, uri);
      if (isVisionSoftError(comparison)) {
        setSoftError(comparison);
        return;
      }
      setResult(comparison);

      await updateActiveSession({
        postImageUri: uri,
        verification: {
          ...activeSession?.verification,
          postCheck: afterCheck,
          compareResult: comparison,
        },
        roastMessage: comparison.roastLine,
      });
    } catch (e: any) {
      if (__DEV__) {
        console.log('[PostScan] processPhoto failed', {
          message: e?.message,
          stack: e?.stack,
        });
      }
      setResult(null);
      setErrorMsg(e?.message || 'Could not verify this photo.');
    } finally {
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
        return;
      }
      setPhotoUri(pic.uri);
      setResult(null);
      setSoftError(null);
      setErrorMsg(null);
      setFeedbackRoast(null);
      await processPhoto(pic.uri);
    } catch {
      hideFreeze();
    }
  }, [ready, checking]);

  const handleShutter = async () => {
    await captureAndProcess();
  };

  const handleRetake = () => {
    hideCard(() => {
      setPhotoUri(null);
      setResult(null);
      setErrorMsg(null);
      setSoftError(null);
      setFeedbackRoast(null);
      hideFreeze();
    });
  };

  const handleContinue = async () => {
    if (!result) return;

    const verdict = String(result.verdict || '').toUpperCase();
    const isFinished = verdict === 'FINISHED' || verdict === 'EATEN';
    if (!isFinished) {
      return;
    }

    await endSession('VERIFIED', result.roastLine);
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

  const resultVerdict = String(result?.verdict || '').toUpperCase();
  const isFinishedResult = resultVerdict === 'FINISHED' || resultVerdict === 'EATEN';
  const verdictColor = result
    ? isFinishedResult
      ? theme.success
      : theme.warning
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
      />

      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}

      <Animated.View pointerEvents="none" style={[styles.freezeOverlay, { opacity: freezeOpacity }]} />
      <Animated.View pointerEvents="none" style={[styles.shutterOverlay, { opacity: shutterOpacity }]} />

      {!photoUri ? <ScanFrameOverlay hintText={'Keep plate in frame'} /> : null}

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
          <View style={styles.bottomControlsRow}>
            <View style={styles.bottomLeftSpacer} />

            <TouchableOpacity
              style={[styles.shutterOuter, !ready && { opacity: 0.45 }]}
              disabled={!ready}
              onPress={handleShutter}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setTorch((prev) => !prev)}>
              <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={20} color="#FFF" />
            </TouchableOpacity>
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

      {(result || errorMsg || softError) && !checking && (
        <Animated.View style={[styles.resultCardLayer, { transform: [{ translateY: cardTranslateY }] }]} pointerEvents="box-none">
          <ResultCard
            theme={theme}
            title={softError
              ? softError.title
              : errorMsg
                ? errorMsg.toLowerCase().includes('daily limit')
                ? 'Daily limit reached'
                : 'Retake after photo'
                : isFinishedResult
                  ? 'Meal finished'
                  : 'Not finished yet'}
            accentColor={(errorMsg || softError) ? theme.warning : verdictColor}
            roast={
              feedbackRoast
                ? feedbackRoast
                : errorMsg
                  ? undefined
                  : (result ? result.roastLine || getPostScanRoast(result.verdict as any) : undefined)
            }
            subtext={softError?.subtitle || errorMsg || undefined}
            buttons={[
              ...(softError?.code === 'SESSION_EXPIRED'
                ? [{ label: 'Sign in again', onPress: () => navigation.navigate('Auth') }]
                : []),
              ...(result && isFinishedResult ? [{ label: 'See Summary', onPress: handleContinue }] : []),
              ...(softError?.code === 'SESSION_EXPIRED'
                ? [{ label: 'Cancel', onPress: handleRetake, secondary: true }]
                : []),
              ...(!(result && isFinishedResult)
                ? [{ label: 'Retake', onPress: handleRetake }]
                : []),
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
  barcodeBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
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
});
