/**
 * MealSessionActive — the main "eating" screen.
 *
 * Shows an elapsed timer, blocking status, and "I'm Done" button.
 * On "I'm Done" → navigate to PostScanCamera for the after-photo.
 * Minimum meal time = 5 min before unlock is allowed.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { formatDuration } from '../utils/helpers';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

const MIN_MEAL_MS = 5 * 60 * 1000; // 5 minutes

type Props = NativeStackScreenProps<any, 'MealSessionActive'>;

export default function MealSessionActiveScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, endSession, blockConfig, updateActiveSession } = useAppState();

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canFinish = elapsed >= MIN_MEAL_MS;
  const remainingMs = Math.max(0, MIN_MEAL_MS - elapsed);
  const progressPct = Math.min(1, elapsed / MIN_MEAL_MS);

  useEffect(() => {
    if (activeSession) {
      const startMs = new Date(activeSession.startedAt).getTime();
      setElapsed(Date.now() - startMs);

      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(activeSession.startedAt).getTime());
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession?.id]);

  const handleDone = () => {
    if (!activeSession || !canFinish) return;

    // If we have a preImageUri or barcode data, go to PostScanCamera for after-photo + comparison
    if (activeSession.preImageUri || preBarcodeData) {
      navigation.navigate('PostScanCamera', {
        preImageUri: activeSession.preImageUri,
        preBarcodeData,
      });
    } else {
      // No before photo (override was used) — end session as INCOMPLETE
      endSession('INCOMPLETE').then(() => {
        navigation.reset({
          index: 0,
          routes: [
            { name: 'Main' },
            { name: 'SessionSummary' },
          ],
        });
      });
    }
  };

  const handleLeave = () => {
    Alert.alert(
      'End Session?',
      'Are you sure? Your meal session will be marked as incomplete.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            endSession('INCOMPLETE').then(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
            });
          },
        },
      ]
    );
  };

  const s = makeStyles(theme);
  const blockedApps = activeSession?.blockedAppsAtTime ?? blockConfig.blockedApps.map((a) => a.name);
  const mealType = activeSession?.mealType ?? route.params?.mealType ?? '';
  const preBarcodeData = route.params?.preBarcodeData as { type: string; data: string } | undefined;

  // Remaining time
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainMin = Math.floor(remainingSec / 60);
  const remainSec = remainingSec % 60;
  const remainText = `${remainMin}:${remainSec.toString().padStart(2, '0')}`;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleLeave}>
          <MaterialIcons name="close" size={26} color={theme.textMuted} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{mealType}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Status badge */}
        <View style={s.statusBadge}>
          <MaterialIcons name="lock" size={16} color={theme.primary} />
          <Text style={[s.statusText, { color: theme.primary }]}>Blocking Active</Text>
        </View>

        {/* Before photo thumbnail */}
        {activeSession?.preImageUri && (
          <View style={s.preThumbWrap}>
            <Image source={{ uri: activeSession.preImageUri }} style={s.preThumb} />
          </View>
        )}

        {/* Timer */}
        <View style={s.timerContainer}>
          <Text style={s.timerText}>{formatDuration(elapsed)}</Text>
          <Text style={s.timerLabel}>Enjoy your meal</Text>
        </View>

        {/* Minimum time progress */}
        {!canFinish && (
          <View style={s.minTimeSection}>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${progressPct * 100}%` }]} />
            </View>
            <Text style={s.minTimeText}>Finish available in {remainText}</Text>
          </View>
        )}

        {/* Blocked apps */}
        {blockedApps.length > 0 && (
          <View style={s.blockedSection}>
            <Text style={s.blockedTitle}>Blocking {blockedApps.length} apps</Text>
            <View style={s.blockedList}>
              {blockedApps.map((appName, idx) => {
                const appInfo = blockConfig.blockedApps.find((a) => a.name === appName);
                return (
                  <View key={idx} style={s.blockedApp}>
                    <MaterialIcons
                      name={(appInfo?.icon as any) || 'apps'}
                      size={18}
                      color={theme.danger}
                    />
                    <Text style={s.blockedAppName}>{appName}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Finish button */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.finishBtn, !canFinish && s.finishBtnDisabled]}
          onPress={handleDone}
          disabled={!canFinish}
        >
          <MaterialIcons name="check-circle" size={22} color={canFinish ? '#FFF' : theme.textMuted} />
          <Text style={[s.finishBtnText, !canFinish && s.finishBtnTextDisabled]}>
            I'm Done Eating
          </Text>
        </TouchableOpacity>
        {!canFinish && (
          <Text style={s.finishHint}>Available after 5:00</Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: c.text },
    content: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 180,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primaryDim,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 24,
    },
    statusText: { fontSize: 14, fontWeight: '600' },
    preThumbWrap: {
      width: 80,
      height: 80,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 24,
      borderWidth: 2,
      borderColor: c.primary,
    },
    preThumb: { width: '100%', height: '100%' },
    timerContainer: { alignItems: 'center', marginBottom: 24 },
    timerText: {
      fontSize: 64,
      fontWeight: '200',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    timerLabel: { fontSize: 16, color: c.textSecondary, marginTop: 8 },
    minTimeSection: { width: '100%', alignItems: 'center', marginBottom: 28 },
    progressBarBg: {
      width: '80%',
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceElevated,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: c.primary,
    },
    minTimeText: { fontSize: 13, color: c.textSecondary },
    blockedSection: {
      width: '100%',
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    blockedTitle: { fontSize: 15, fontWeight: '600', color: c.text, marginBottom: 12 },
    blockedList: { gap: 8 },
    blockedApp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    blockedAppName: { fontSize: 14, color: c.text },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: c.background,
      alignItems: 'center',
    },
    finishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: 16,
      paddingVertical: 16,
      width: '100%',
    },
    finishBtnDisabled: { backgroundColor: c.surfaceElevated },
    finishBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
    finishBtnTextDisabled: { color: c.textMuted },
    finishHint: { fontSize: 12, color: c.textMuted, marginTop: 8 },
  });
