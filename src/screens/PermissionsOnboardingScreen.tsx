import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useNavigation } from '@react-navigation/native';

interface PermStep {
  key: string;
  icon: string;
  title: string;
  description: string;
  action: () => void;
}

export default function PermissionsOnboardingScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [granted, setGranted] = useState<Record<string, boolean>>({});

  const markGranted = (key: string) => {
    setGranted((prev) => ({ ...prev, [key]: true }));
  };

  const steps: PermStep[] = [
    {
      key: 'accessibility',
      icon: 'accessibility',
      title: 'Accessibility Service',
      description:
        'Required to detect when you open a blocked app and redirect you back to EatLock.',
      action: () => {
        if (Platform.OS === 'android') {
          Linking.openURL('android.settings.ACCESSIBILITY_SETTINGS').catch(() =>
            Linking.openSettings()
          );
        }
        markGranted('accessibility');
      },
    },
    {
      key: 'overlay',
      icon: 'picture-in-picture',
      title: 'Display Over Other Apps',
      description:
        'Allows EatLock to show a blocker overlay when you try to open a blocked app during a meal.',
      action: () => {
        if (Platform.OS === 'android') {
          Linking.openURL('android.settings.action.MANAGE_OVERLAY_PERMISSION').catch(() =>
            Linking.openSettings()
          );
        }
        markGranted('overlay');
      },
    },
    {
      key: 'notifications',
      icon: 'notifications-active',
      title: 'Notifications',
      description: 'Get meal reminders and session alerts on time.',
      action: () => {
        Linking.openSettings();
        markGranted('notifications');
      },
    },
    {
      key: 'battery',
      icon: 'battery-full',
      title: 'Unrestricted Battery',
      description:
        'Prevents Android from killing EatLock in the background, ensuring blocking stays active.',
      action: () => {
        if (Platform.OS === 'android') {
          Linking.openURL('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(
            () => Linking.openSettings()
          );
        }
        markGranted('battery');
      },
    },
  ];

  const allGranted = steps.every((s) => granted[s.key]);
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permissions Setup</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          EatLock needs a few permissions to block apps during your meals. Tap each item to
          open the relevant settings.
        </Text>

        {steps.map((step, idx) => (
          <TouchableOpacity
            key={step.key}
            style={[styles.stepCard, granted[step.key] && styles.stepCardGranted]}
            onPress={step.action}
          >
            <View style={[styles.stepIcon, granted[step.key] && styles.stepIconGranted]}>
              <MaterialIcons
                name={step.icon as any}
                size={24}
                color={granted[step.key] ? '#FFF' : theme.primary}
              />
            </View>
            <View style={styles.stepContent}>
              <View style={styles.stepRow}>
                <Text style={styles.stepNumber}>{idx + 1}</Text>
                <Text style={styles.stepTitle}>{step.title}</Text>
                {granted[step.key] && (
                  <MaterialIcons name="check-circle" size={18} color={theme.primary} />
                )}
              </View>
              <Text style={styles.stepDesc}>{step.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.doneBtn, !allGranted && styles.doneBtnMuted]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneBtnText}>
            {allGranted ? "All Set — Let's Go!" : 'Skip for Now'}
          </Text>
        </TouchableOpacity>
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
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    description: {
      fontSize: 15,
      color: theme.textSecondary,
      lineHeight: 22,
      marginBottom: 20,
    },
    stepCard: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 14,
    },
    stepCardGranted: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryDim,
    },
    stepIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.primaryDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepIconGranted: {
      backgroundColor: theme.primary,
    },
    stepContent: { flex: 1 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    stepNumber: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    stepTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.text },
    stepDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: theme.background,
    },
    doneBtn: {
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
    },
    doneBtnMuted: { backgroundColor: theme.surfaceElevated },
    doneBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  });
