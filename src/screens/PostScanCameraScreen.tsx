/**
 * PostScanCamera — capture an "after" photo and run before/after comparison.
 *
 * Flow: Take photo → verifyFood() → if food, compareMeal(pre, post) → show result → SessionSummary.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { getVisionService } from '../services/vision';
import { getPreScanRoast, getPostScanRoast } from '../services/vision/roasts';
import type { FoodCheckResult, CompareResult, CompareVerdict } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'PostScanCamera'>;

export default function PostScanCameraScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, updateActiveSession, endSession } = useAppState();
  const { preImageUri } = (route.params as { preImageUri: string }) || {};

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [foodCheck, setFoodCheck] = useState<FoodCheckResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!res.canceled && res.assets[0]) {
      const uri = res.assets[0].uri;
      setPhotoUri(uri);
      setFoodCheck(null);
      setCompareResult(null);
      setErrorMsg(null);
      processPhoto(uri);
    }
  };

  const processPhoto = async (uri: string) => {
    setChecking(true);
    const vision = getVisionService();

    try {
      // Step 1: Verify after photo has food
      const check = await vision.verifyFood(uri);
      setFoodCheck(check);

      if (!check.isFood) {
        setErrorMsg(check.roastLine || getPreScanRoast(check.reasonCode));
        setChecking(false);
        return;
      }

      // Step 2: Compare before and after
      const comparison = await vision.compareMeal(preImageUri, uri);
      setCompareResult(comparison);

      // Update active session with post-scan data
      await updateActiveSession({
        postImageUri: uri,
        verification: {
          ...activeSession?.verification,
          postCheck: check,
          compareResult: comparison,
        },
        roastMessage: comparison.roastLine,
      });
    } catch (err) {
      setErrorMsg('Something went wrong. Try again.');
    }
    setChecking(false);
  };

  const handleContinue = async () => {
    if (!compareResult) return;

    // Map new CompareVerdict to SessionStatus
    const verdictToStatus: Record<string, 'VERIFIED' | 'PARTIAL' | 'FAILED' | 'INCOMPLETE'> = {
      EATEN: 'VERIFIED',
      PARTIAL: 'PARTIAL',
      UNCHANGED: 'FAILED',
      UNVERIFIABLE: 'INCOMPLETE',
    };
    const status = verdictToStatus[compareResult.verdict] || 'INCOMPLETE';

    await endSession(status, compareResult.roastLine);
    navigation.reset({
      index: 0,
      routes: [
        { name: 'Main' },
        { name: 'SessionSummary' },
      ],
    });
  };

  const handleSkip = async () => {
    // Override — skip post-scan
    await updateActiveSession({ overrideUsed: true, postImageUri: photoUri ?? undefined });
    await endSession('INCOMPLETE');
    navigation.reset({
      index: 0,
      routes: [
        { name: 'Main' },
        { name: 'SessionSummary' },
      ],
    });
  };

  const verdictColor = compareResult
    ? compareResult.verdict === 'EATEN' ? theme.success
      : compareResult.verdict === 'PARTIAL' ? theme.warning
        : compareResult.verdict === 'UNCHANGED' ? theme.danger
          : theme.textSecondary
    : theme.textSecondary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>After Photo</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Take a photo of your plate after eating
      </Text>

      {/* Before / After side by side */}
      <View style={styles.photoRow}>
        <View style={[styles.photoBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.photoLabel, { color: theme.textMuted }]}>Before</Text>
          {preImageUri ? (
            <Image source={{ uri: preImageUri }} style={styles.photoImg} resizeMode="cover" />
          ) : (
            <MaterialIcons name="image" size={40} color={theme.textMuted} />
          )}
        </View>

        <MaterialIcons name="arrow-forward" size={24} color={theme.textMuted} />

        <View style={[styles.photoBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.photoLabel, { color: theme.textMuted }]}>After</Text>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImg} resizeMode="cover" />
          ) : (
            <MaterialIcons name="camera-alt" size={40} color={theme.textMuted} />
          )}
        </View>
      </View>

      {/* Processing indicator */}
      {checking && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Analyzing your meal...
          </Text>
        </View>
      )}

      {/* Error / failure */}
      {errorMsg && !checking && (
        <View style={[styles.resultCard, { backgroundColor: 'rgba(255,69,58,0.12)', borderColor: theme.danger }]}>
          <MaterialIcons name="error" size={20} color={theme.danger} />
          <Text style={[styles.resultText, { color: theme.danger }]}>{errorMsg}</Text>
        </View>
      )}

      {/* Comparison result */}
      {compareResult && !checking && (
        <View style={[styles.resultCard, { backgroundColor: verdictColor + '18', borderColor: verdictColor }]}>
          <MaterialIcons
            name={compareResult.verdict === 'EATEN' ? 'emoji-events' : 'info'}
            size={22}
            color={verdictColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.verdictLabel, { color: verdictColor }]}>
              {compareResult.verdict === 'EATEN' ? 'Meal Finished!' :
                compareResult.verdict === 'PARTIAL' ? 'Partially Eaten' :
                  compareResult.verdict === 'UNCHANGED' ? 'Not Eaten' : 'Uncertain'}
              {' '}({Math.round(compareResult.foodChangeScore * 100)}%)
            </Text>
            <Text style={[styles.roastText, { color: theme.text }]}>
              {compareResult.roastLine || getPostScanRoast(compareResult.verdict)}
            </Text>
            {compareResult.verdict === 'UNVERIFIABLE' && compareResult.retakeHint ? (
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                {compareResult.retakeHint}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {!photoUri || (foodCheck && !foodCheck.isFood) ? (
          <TouchableOpacity
            style={[styles.cameraBtn, { backgroundColor: theme.primary }]}
            onPress={takePhoto}
          >
            <MaterialIcons name="camera-alt" size={28} color="#FFF" />
            <Text style={styles.cameraBtnText}>{photoUri ? 'Retake' : 'Take Photo'}</Text>
          </TouchableOpacity>
        ) : null}

        {compareResult && (
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: theme.primary }]}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>See Summary</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip verification</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 16, paddingHorizontal: 32 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  photoBox: {
    flex: 1,
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoLabel: { fontSize: 11, fontWeight: '600', position: 'absolute', top: 6, left: 8, zIndex: 1 },
  photoImg: { width: '100%', height: '100%' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
  },
  statusText: { fontSize: 14 },
  resultCard: {
    marginHorizontal: 24,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  resultText: { fontSize: 14, fontWeight: '600', flex: 1 },
  verdictLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  roastText: { fontSize: 14, lineHeight: 20 },
  hintText: { fontSize: 12, marginTop: 4 },
  actions: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 32, gap: 12 },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  cameraBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  continueBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skipBtn: { padding: 8 },
  skipText: { fontSize: 13 },
});
