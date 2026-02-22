import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeProvider';
import { useNavigation, useRoute } from '@react-navigation/native';
import { runVisionScan, VisionVerdict } from '../services/visionApi';
import { useAuth } from '../state/AuthContext';

type ScanStatus = 'idle' | 'scanning' | 'error';

export default function ScanMealScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { isAuthenticated } = useAuth();
  const {
    mealType,
    note,
    isAfterPhoto,
    foodName,
    beforeR2Key,
    sessionId,
  } = route.params || {};

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanError, setScanError] = useState('');
  const [roastLine, setRoastLine] = useState('');

  // Auto-open camera on mount
  useEffect(() => {
    openCamera();
  }, []);

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'EatLock needs camera access to scan your meal. Please enable it in Settings.',
        [{ text: 'Go Back', onPress: () => navigation.goBack() }]
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setScanStatus('idle');
      setScanError('');
    } else if (!photoUri) {
      navigation.goBack();
    }
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setScanStatus('idle');
    setScanError('');
    setRoastLine('');
    openCamera();
  };

  const handleUsePhoto = async () => {
    if (!photoUri) return;

    // If not authenticated, fall back to local-only flow (skip vision)
    if (!isAuthenticated) {
      navigateLocal(photoUri);
      return;
    }

    setScanStatus('scanning');
    setScanError('');

    try {
      const stage = isAfterPhoto ? 'END_SCAN' : 'START_SCAN';
      const job = await runVisionScan(
        photoUri,
        stage,
        sessionId,
        isAfterPhoto ? beforeR2Key : undefined
      );

      if (job.status === 'failed') {
        throw new Error(job.error || 'Vision analysis failed');
      }

      const verdict = job.result?.verdict as VisionVerdict | undefined;
      const roast = job.result?.roast || '';
      setRoastLine(roast);

      if (!verdict) throw new Error('No verdict returned');
      handleVerdict(verdict, photoUri, roast);
    } catch (err: any) {
      setScanStatus('error');
      setScanError(err.message || 'Failed to analyze photo');
    }
  };

  const handleVerdict = (verdict: VisionVerdict, uri: string, roast: string) => {
    if (isAfterPhoto) {
      switch (verdict) {
        case 'FINISHED':
          navigation.navigate('SessionSummary', {
            mealType,
            note,
            afterPhotoPath: uri,
            roast,
          });
          break;
        case 'NOT_FINISHED':
          setScanStatus('error');
          setScanError(
            "Looks like you're not done yet! Keep eating, then try again."
          );
          break;
        case 'NOT_FOOD':
        case 'UNCLEAR':
        default:
          setScanStatus('error');
          setScanError(
            verdict === 'NOT_FOOD'
              ? "That doesn't look like food. Please photograph your meal."
              : 'Photo is unclear. Please retake with better lighting.'
          );
      }
    } else {
      switch (verdict) {
        case 'FOOD_OK':
          navigation.navigate('LockedAppsConfirm', {
            mealType,
            note,
            beforePhotoPath: uri,
            foodName,
            roast,
          });
          break;
        case 'NOT_FOOD':
        case 'UNCLEAR':
        case 'CHEATING':
        default:
          setScanStatus('error');
          setScanError(
            verdict === 'NOT_FOOD'
              ? "That doesn't look like food. Please photograph your actual meal."
              : verdict === 'CHEATING'
              ? 'Nice try! Please take a real photo of your meal.'
              : 'Photo is unclear. Please retake with better lighting.'
          );
      }
    }
  };

  /** Fallback when offline / not authenticated */
  const navigateLocal = (uri: string) => {
    if (isAfterPhoto) {
      navigation.navigate('SessionSummary', { mealType, note, afterPhotoPath: uri });
    } else {
      navigation.navigate('LockedAppsConfirm', {
        mealType,
        note,
        beforePhotoPath: uri,
        foodName,
      });
    }
  };

  const styles = makeStyles(theme);
  const titleText = isAfterPhoto ? 'Scan Meal (After)' : 'Scan Meal (Before)';
  const subtitleText = isAfterPhoto
    ? 'Take a photo of your finished meal'
    : 'Take a photo of your meal before eating';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{titleText}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        {photoUri ? (
          <>
            <View style={styles.previewContainer}>
              <Image source={{ uri: photoUri }} style={styles.preview} />
              {scanStatus === 'scanning' && (
                <View style={styles.scanOverlay}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={styles.scanningText}>Analyzing your meal...</Text>
                </View>
              )}
            </View>

            {scanStatus === 'error' && scanError ? (
              <View style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={20} color={theme.danger} />
                <Text style={styles.errorText}>{scanError}</Text>
              </View>
            ) : null}

            {roastLine && scanStatus !== 'error' ? (
              <View style={styles.roastCard}>
                <Text style={styles.roastText}>"{roastLine}"</Text>
              </View>
            ) : null}

            <Text style={styles.confirmText}>
              {scanStatus === 'scanning' ? 'Scanning...' : 'Use this photo?'}
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={handleRetake}
                disabled={scanStatus === 'scanning'}
              >
                <MaterialIcons name="refresh" size={20} color={theme.text} />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.usePhotoBtn, scanStatus === 'scanning' && styles.btnDisabled]}
                onPress={handleUsePhoto}
                disabled={scanStatus === 'scanning'}
              >
                {scanStatus === 'scanning' ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={20} color="#FFF" />
                    <Text style={styles.usePhotoBtnText}>
                      {scanStatus === 'error' ? 'Retry Scan' : 'Scan & Continue'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <MaterialIcons name="camera-alt" size={64} color={theme.textMuted} />
            <Text style={styles.loadingText}>{subtitleText}</Text>
            <TouchableOpacity style={styles.openCameraBtn} onPress={openCamera}>
              <MaterialIcons name="camera-alt" size={22} color="#FFF" />
              <Text style={styles.openCameraBtnText}>Open Camera</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
    content: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
    previewContainer: { alignItems: 'center', marginBottom: 16, position: 'relative' },
    preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 20 },
    scanOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    scanningText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,69,58,0.12)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,69,58,0.3)',
    },
    errorText: { flex: 1, color: theme.danger, fontSize: 14, lineHeight: 20 },
    roastCard: {
      backgroundColor: theme.primaryDim,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      alignItems: 'center',
    },
    roastText: { color: theme.primary, fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
    confirmText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 20,
    },
    actionRow: { flexDirection: 'row', gap: 12, marginBottom: 40 },
    retakeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 16,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceElevated,
    },
    retakeBtnText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    usePhotoBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
    },
    usePhotoBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    btnDisabled: { opacity: 0.6 },
    loadingContainer: { alignItems: 'center', gap: 16 },
    loadingText: { fontSize: 16, color: theme.textSecondary, textAlign: 'center' },
    openCameraBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 32,
      marginTop: 12,
    },
    openCameraBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  });
