/**
 * PreScanCamera — capture a "before" photo of the meal.
 *
 * Flow: User takes a photo → verifyFood() → if food confirmed → navigate to LockSetupConfirm.
 * On failure → show roast + "Retake" button.
 */

import React, { useState, useRef } from 'react';
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
import { getVisionService } from '../services/vision';
import { getPreScanRoast, getFoodConfirmedMessage } from '../services/vision/roasts';
import type { FoodCheckResult, FoodReasonCode } from '../services/vision/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'PreScanCamera'>;

export default function PreScanCameraScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FoodCheckResult | null>(null);
  const [roast, setRoast] = useState<string | null>(null);

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
      setResult(null);
      setRoast(null);
      verifyPhoto(uri);
    }
  };

  const verifyPhoto = async (uri: string) => {
    setChecking(true);
    try {
      const vision = getVisionService();
      const check = await vision.verifyFood(uri);
      setResult(check);

      if (check.isFood) {
        // Prefer GPT roastLine, fall back to local message
        setRoast(check.roastLine || getFoodConfirmedMessage());
      } else {
        // Prefer GPT roastLine, fall back to local roast library
        setRoast(check.roastLine || getPreScanRoast(check.reasonCode));
      }
    } catch {
      setResult({
        isFood: false,
        confidence: 0,
        hasPlateOrBowl: false,
        quality: { brightness: 1, blur: 1, framing: 1 },
        reasonCode: 'NOT_FOOD',
        roastLine: '',
        retakeHint: '',
      });
      setRoast('Something went wrong verifying. Try again.');
    }
    setChecking(false);
  };

  const handleContinue = () => {
    if (!photoUri || !result?.isFood) return;
    navigation.navigate('LockSetupConfirm', {
      preImageUri: photoUri,
      preCheck: result,
    });
  };

  const handleSkip = () => {
    // Allow continuing without photo (override)
    navigation.navigate('LockSetupConfirm', {
      preImageUri: undefined,
      preCheck: undefined,
      overrideUsed: true,
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Scan Your Meal</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Take a photo of your food before you start eating
      </Text>

      {/* Photo area */}
      <View style={[styles.photoArea, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialIcons name="restaurant" size={64} color={theme.textMuted} />
            <Text style={[styles.placeholderText, { color: theme.textMuted }]}>
              Tap the camera button below
            </Text>
          </View>
        )}
      </View>

      {/* Status message */}
      {checking && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Checking for food...
          </Text>
        </View>
      )}

      {roast && !checking && (
        <View style={[styles.roastCard, {
          backgroundColor: result?.isFood ? theme.primaryDim : 'rgba(255,69,58,0.12)',
          borderColor: result?.isFood ? theme.primary : theme.danger,
        }]}>
          <MaterialIcons
            name={result?.isFood ? 'check-circle' : 'error'}
            size={20}
            color={result?.isFood ? theme.success : theme.danger}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.roastText, {
              color: result?.isFood ? theme.success : theme.danger,
            }]}>
              {roast}
            </Text>
            {!result?.isFood && result?.retakeHint ? (
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                {result.retakeHint}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {!photoUri || (result && !result.isFood) ? (
          <TouchableOpacity
            style={[styles.cameraBtn, { backgroundColor: theme.primary }]}
            onPress={takePhoto}
          >
            <MaterialIcons name="camera-alt" size={28} color="#FFF" />
            <Text style={styles.cameraBtnText}>
              {photoUri ? 'Retake Photo' : 'Take Photo'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {result?.isFood && (
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: theme.primary }]}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>Looks Good — Continue</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip photo</Text>
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
  photoArea: {
    marginHorizontal: 24,
    height: 300,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 12 },
  placeholderText: { fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  statusText: { fontSize: 14 },
  roastCard: {
    marginHorizontal: 24,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roastText: { fontSize: 14, fontWeight: '600', flex: 1 },
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
