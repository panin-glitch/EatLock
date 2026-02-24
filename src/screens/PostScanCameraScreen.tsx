import React, { useRef, useState } from 'react';
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
import type { CompareResult } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'PostScanCamera'>;

export default function PostScanCameraScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, updateActiveSession, endSession } = useAppState();
  const { preImageUri } = (route.params as { preImageUri: string }) || {};

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);

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
    }

    setChecking(false);
    hideAnalyzing();
    showCard();
  };

  const handleShutter = async () => {
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
      setErrorMsg(null);
      await processPhoto(pic.uri);
    } catch {
      hideFreeze();
    }
  };

  const handleRetake = () => {
    hideCard(() => {
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

  const handleSkip = async () => {
    await endSession('INCOMPLETE');
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
      />

      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}

      <Animated.View pointerEvents="none" style={[styles.freezeOverlay, { opacity: freezeOpacity }]} />
      <Animated.View pointerEvents="none" style={[styles.shutterOverlay, { opacity: shutterOpacity }]} />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>After photo</Text>
        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch((prev) => !prev)}>
          <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {preImageUri && !photoUri && (
        <View style={styles.preThumbWrap}>
          <Image source={{ uri: preImageUri }} style={styles.preThumb} />
          <Text style={styles.preThumbLabel}>Before</Text>
        </View>
      )}

      {!photoUri && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.shutterOuter, !ready && { opacity: 0.45 }]}
            disabled={!ready}
            onPress={handleShutter}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {checking && (
        <Animated.View style={[styles.analyzingWrap, { opacity: analyzingOpacity }]} pointerEvents="none">
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.analyzingText}>Analyzing…</Text>
          </View>
        </Animated.View>
      )}

      {(result || errorMsg) && !checking && (
        <Animated.View style={[styles.cardWrap, { transform: [{ translateY: cardTranslateY }] }]}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: errorMsg ? theme.warning : verdictColor }]}>
              {errorMsg
                ? 'AI unavailable'
                : result?.verdict === 'EATEN'
                  ? 'Meal finished'
                  : result?.verdict === 'PARTIAL'
                    ? 'Partially eaten'
                    : result?.verdict === 'UNCHANGED'
                      ? 'Not eaten'
                      : 'Uncertain'}
            </Text>
            <Text style={styles.cardMessage}>
              {errorMsg || (result ? result.roastLine || getPostScanRoast(result.verdict) : 'Please try again.')}
            </Text>

            <View style={styles.cardActions}>
              {result ? (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={handleContinue}>
                  <Text style={styles.actionBtnText}>See Summary</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: result ? '#2A2A2A' : theme.primary }]}
                onPress={handleRetake}
              >
                <Text style={styles.actionBtnText}>{errorMsg ? 'Retry' : 'Retake'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
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

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
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
  skipBtn: { marginTop: 14, paddingVertical: 6, paddingHorizontal: 10 },
  skipBtnText: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600' },

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
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
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

  cardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    zIndex: 22,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardMessage: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
