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
import { getVisionService } from '../services/vision';
import { getPreScanRoast, getFoodConfirmedMessage } from '../services/vision/roasts';
import type { FoodCheckResult } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'PreScanCamera'>;

export default function PreScanCameraScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FoodCheckResult | null>(null);
  const [roast, setRoast] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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
    } catch (e: any) {
      setResult(null);
      setRoast(null);
      setAiError(e?.message || 'Could not reach verification service.');
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
      setRoast(null);
      setAiError(null);
      await verifyPhoto(pic.uri);
    } catch {
      hideFreeze();
    }
  };

  const handleRetake = () => {
    hideCard(() => {
      setPhotoUri(null);
      setResult(null);
      setRoast(null);
      setAiError(null);
      hideFreeze();
    });
  };

  const handleContinue = () => {
    if (!photoUri || !result?.isFood) return;
    navigation.navigate('LockSetupConfirm', {
      preImageUri: photoUri,
      preCheck: result,
    });
  };

  const handleSkip = () => {
    navigation.navigate('LockSetupConfirm', {
      preImageUri: undefined,
      preCheck: undefined,
      overrideUsed: true,
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
      />

      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}

      <Animated.View pointerEvents="none" style={[styles.freezeOverlay, { opacity: freezeOpacity }]} />
      <Animated.View pointerEvents="none" style={[styles.shutterOverlay, { opacity: shutterOpacity }]} />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan meal</Text>
        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch((prev) => !prev)}>
          <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

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

      {(result || aiError) && !checking && (
        <Animated.View style={[styles.cardWrap, { transform: [{ translateY: cardTranslateY }] }]}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: aiError ? theme.warning : result?.isFood ? theme.success : theme.danger }]}>
              {aiError ? 'AI unavailable' : result?.isFood ? 'Meal detected' : 'Not food'}
            </Text>
            <Text style={styles.cardMessage}>
              {aiError || roast || 'Please try another photo.'}
            </Text>

            <View style={styles.cardActions}>
              {result?.isFood ? (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={handleContinue}>
                  <Text style={styles.actionBtnText}>Confirm & Start</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: result?.isFood ? '#2A2A2A' : theme.primary }]}
                onPress={handleRetake}
              >
                <Text style={styles.actionBtnText}>{aiError ? 'Retry' : 'Retake'}</Text>
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
