import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { formatDuration } from '../utils/helpers';
import { useNavigation, useRoute } from '@react-navigation/native';

const MIN_MEAL_MS = 5 * 60 * 1000; // 5 minutes in ms

export default function StrictModeSessionScreen() {
  const { theme } = useTheme();
  const { activeSession, endSession, blockConfig } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { mealType, note } = route.params || {};
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

    // Navigate to after-photo scan (camera-only) with beforeR2Key for vision comparison
    navigation.navigate('ScanMeal', {
      mealType: activeSession.mealType,
      note: activeSession.note,
      isAfterPhoto: true,
      beforeR2Key: activeSession.beforeR2Key,
      sessionId: activeSession.id,
    });
  };

  const handleLeave = () => {
    Alert.alert(
      'End Session?',
      'Are you sure you want to leave? Your meal session will be lost.',
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

  const styles = makeStyles(theme);
  const blockedApps = activeSession?.blockedAppsAtTime ?? blockConfig.blockedApps.map((a) => a.name);

  // Format remaining time as M:SS
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainMin = Math.floor(remainingSec / 60);
  const remainSec = remainingSec % 60;
  const remainText = `${remainMin}:${remainSec.toString().padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitle}>{mealType || activeSession?.mealType}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status indicator */}
        <View style={styles.statusBadge}>
          <MaterialIcons name="lock" size={16} color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.primary }]}>
            Blocking Active
          </Text>
        </View>

        {/* Timer */}
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
          <Text style={styles.timerLabel}>Meal in progress</Text>
        </View>

        {/* Minimum time progress */}
        {!canFinish && (
          <View style={styles.minTimeSection}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPct * 100}%` }]} />
            </View>
            <Text style={styles.minTimeText}>
              Available after {remainText}
            </Text>
          </View>
        )}

        {/* Blocking info */}
        {blockedApps.length > 0 && (
          <View style={styles.blockedSection}>
            <Text style={styles.blockedTitle}>
              Blocking {blockedApps.length} apps
            </Text>
            <View style={styles.blockedList}>
              {blockedApps.map((appName, idx) => {
                const appInfo = blockConfig.blockedApps.find((a) => a.name === appName);
                return (
                  <View key={idx} style={styles.blockedApp}>
                    <MaterialIcons
                      name={(appInfo?.icon as any) || 'apps'}
                      size={18}
                      color={theme.danger}
                    />
                    <Text style={styles.blockedAppName}>{appName}</Text>
                    <MaterialIcons name="block" size={14} color={theme.danger} />
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Note */}
        {(note || activeSession?.note) ? (
          <View style={styles.noteCard}>
            <MaterialIcons name="note" size={16} color={theme.textSecondary} />
            <Text style={styles.noteText}>{note || activeSession?.note}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Finish button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.finishBtn, !canFinish && styles.finishBtnDisabled]}
          onPress={handleDone}
          disabled={!canFinish}
        >
          <MaterialIcons
            name="check"
            size={22}
            color={canFinish ? '#FFF' : theme.textMuted}
          />
          <Text style={[styles.finishBtnText, !canFinish && styles.finishBtnTextDisabled]}>
            I'm done
          </Text>
        </TouchableOpacity>
        {!canFinish && (
          <Text style={styles.finishHint}>Available after 5:00</Text>
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
    content: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 180,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primaryDim,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 40,
    },
    statusText: { fontSize: 14, fontWeight: '600' },
    timerContainer: { alignItems: 'center', marginBottom: 24 },
    timerText: {
      fontSize: 64,
      fontWeight: '200',
      color: theme.text,
      fontVariant: ['tabular-nums'],
    },
    timerLabel: {
      fontSize: 16,
      color: theme.textSecondary,
      marginTop: 8,
    },
    minTimeSection: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 28,
    },
    progressBarBg: {
      width: '80%',
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.surfaceElevated,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: theme.primary,
    },
    minTimeText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    blockedSection: {
      width: '100%',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    blockedTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 12,
    },
    blockedList: { gap: 8 },
    blockedApp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    blockedAppName: { flex: 1, fontSize: 14, color: theme.text },
    noteCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    noteText: { color: theme.textSecondary, fontSize: 14, flex: 1 },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: theme.background,
      alignItems: 'center',
    },
    finishBtn: {
      width: '100%',
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    finishBtnDisabled: {
      backgroundColor: theme.surfaceElevated,
    },
    finishBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
    finishBtnTextDisabled: { color: theme.textMuted },
    finishHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 8,
    },
  });
