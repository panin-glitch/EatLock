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
  StatusBar,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { blockingEngine } from '../services/blockingEngine';
import type { BlockingSupport } from '../services/blockingSupport';

const MIN_MEAL_MS = 5 * 60 * 1000; // 5 minutes

type Props = NativeStackScreenProps<any, 'MealSessionActive'>;

export default function MealSessionActiveScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { activeSession, blockConfig } = useAppState();

  const [elapsed, setElapsed] = useState(0);
  const [support, setSupport] = useState<BlockingSupport | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canFinish = elapsed >= MIN_MEAL_MS;
  const remainingMs = Math.max(0, MIN_MEAL_MS - elapsed);
  const progressPct = Math.min(1, elapsed / MIN_MEAL_MS);
  const ringSize = 256;
  const ringRadius = 120;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressPct);

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

  useEffect(() => {
    let cancelled = false;
    blockingEngine.getSupport().then((next) => {
      if (!cancelled) {
        setSupport(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDone = () => {
    if (!activeSession || !canFinish) return;

    const routeBarcode = route.params?.preBarcodeData?.data || route.params?.barcode;
    const isBarcodeSession = !!(
      activeSession.preBarcodeData ||
      activeSession.barcode ||
      routeBarcode
    );

    if (!activeSession.preImageUri && !isBarcodeSession) {
      Alert.alert('Before photo required', 'This session can only finish after comparing BEFORE and AFTER photos.');
      return;
    }

    navigation.push('PostScanCamera', {
      preImageUri: activeSession.preImageUri,
      isBarcodeSession,
      previousBarcode: activeSession.barcode || activeSession.preBarcodeData?.data || routeBarcode,
    });
  };

  const s = makeStyles(theme);
  const blockedApps = activeSession?.blockedAppsAtTime ?? blockConfig.blockedApps.map((a) => a.name);
  const mealType = activeSession?.mealType ?? route.params?.mealType ?? '';
  const isEnforced = !!support?.canEnforce && blockingEngine.isEnforced();
  // Remaining time
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainMin = Math.floor(remainingSec / 60);
  const remainSec = remainingSec % 60;
  const remainText = `${remainMin}:${remainSec.toString().padStart(2, '0')}`;
  const elapsedTotalSec = Math.max(0, Math.floor(elapsed / 1000));
  const elapsedMin = Math.floor(elapsedTotalSec / 60)
    .toString()
    .padStart(2, '0');
  const elapsedSec = (elapsedTotalSec % 60).toString().padStart(2, '0');

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{mealType}</Text>
        <TouchableOpacity style={s.headerBtn}>
          <MaterialIcons name="more-horiz" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.statusBadge}>
          <MaterialIcons name={isEnforced ? 'check-circle' : 'info-outline'} size={15} color={theme.primary} />
          <Text style={[s.statusText, { color: theme.primary }]}>
            {isEnforced ? 'Blocking Active' : 'Focus Session Only'}
          </Text>
        </View>

        {!isEnforced && support?.detail ? (
          <Text style={s.supportHint}>{support.detail}</Text>
        ) : null}

        <View style={s.timerContainer}>
          <Svg width={ringSize} height={ringSize} style={s.timerRing}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={theme.border}
              strokeWidth={8}
              fill="none"
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={theme.primary}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${ringCircumference}`}
              strokeDashoffset={ringOffset}
              rotation="-90"
              origin={`${ringSize / 2}, ${ringSize / 2}`}
            />
          </Svg>

          <View style={s.timerCenter}>
            <View style={s.timeRow}>
              <Text style={s.timeNumber}>{elapsedMin}</Text>
              <Text style={s.timeColon}>:</Text>
              <Text style={s.timeNumber}>{elapsedSec}</Text>
            </View>
            <View style={s.timeLabelRow}>
              <Text style={s.timeLabel}>MIN</Text>
              <Text style={s.timeLabel}>SEC</Text>
            </View>
          </View>
        </View>

        <View style={s.blockedSection}>
          <View style={s.blockedHeader}>
            <View style={s.blockedHeaderLeft}>
              <MaterialIcons name="lock" size={17} color={theme.textMuted} />
              <Text style={s.blockedTitle}>
                {isEnforced ? `Blocking ${blockedApps.length} apps` : `Tracking ${blockedApps.length} selected apps`}
              </Text>
            </View>
            <Text style={s.manageText}>Manage</Text>
          </View>

          <View style={s.appsRow}>
            {blockedApps.slice(0, 4).map((appName, idx) => {
              const appInfo = blockConfig.blockedApps.find((a) => a.name === appName);
              return (
                <View key={`${appName}-${idx}`} style={s.blockedAppCard}>
                  <MaterialIcons
                    name={(appInfo?.icon as any) || 'apps'}
                    size={24}
                    color={theme.textMuted}
                  />
                </View>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[s.finishBtn, !canFinish && s.finishBtnDisabled]}
          onPress={handleDone}
          disabled={!canFinish}
        >
          <Text style={[s.finishBtnText, !canFinish && s.finishBtnTextDisabled]}>
            I'm Done Eating
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {!canFinish && (
        <View style={s.bottomBar}>
          <Text style={[s.finishBtnText, !canFinish && s.finishBtnTextDisabled]}>
            button will be available in {remainText}
          </Text>
        </View>
      )}
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
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 12,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: c.text },
    content: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 120,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.primaryDim,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: `${c.primary}40`,
      marginBottom: 20,
    },
    statusText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    supportHint: {
      marginBottom: 18,
      textAlign: 'center',
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    timerContainer: {
      width: 272,
      height: 272,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    timerRing: {
      position: 'absolute',
    },
    timerCenter: { alignItems: 'center' },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    timeNumber: {
      fontSize: 56,
      fontWeight: '900',
      color: c.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    timeColon: {
      fontSize: 48,
      fontWeight: '900',
      color: c.primary,
      marginTop: -4,
    },
    timeLabelRow: {
      width: 128,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    timeLabel: {
      color: c.textMuted,
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '700',
    },
    blockedSection: {
      width: '100%',
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 22,
    },
    blockedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    blockedHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    blockedTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    manageText: { fontSize: 12, fontWeight: '700', color: c.primary },
    appsRow: { flexDirection: 'row', gap: 10 },
    blockedAppCard: {
      width: 56,
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finishBtn: {
      width: '100%',
      height: 56,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#38BDF8',
    },
    finishBtnDisabled: { opacity: 0.45 },
    finishBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    finishBtnTextDisabled: { color: '#E2E8F0', fontWeight: '700' },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 22,
      paddingTop: 14,
      paddingBottom: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
