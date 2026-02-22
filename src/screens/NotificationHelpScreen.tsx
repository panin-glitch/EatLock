import React from 'react';
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

/**
 * Help screen displayed when alarm/notification scheduling is blocked
 * by Android battery optimization or manufacturer restrictions.
 */
export default function NotificationHelpScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const styles = makeStyles(theme);

  const openBatterySettings = () => {
    if (Platform.OS === 'android') {
      Linking.openURL('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() =>
        Linking.openSettings()
      );
    } else {
      Linking.openSettings();
    }
  };

  const openNotificationSettings = () => {
    Linking.openSettings();
  };

  const openAutoStartSettings = () => {
    // Attempt to open manufacturer-specific auto-start settings
    if (Platform.OS === 'android') {
      Linking.openURL('android.settings.APPLICATION_DETAILS_SETTINGS').catch(() =>
        Linking.openSettings()
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Help</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.alertCard}>
          <MaterialIcons name="warning" size={28} color={theme.warning} />
          <Text style={styles.alertText}>
            Some Android devices block alarms and notifications to save battery. This can
            prevent meal reminders from firing on time.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>STEPS TO FIX</Text>

        {/* Step 1 */}
        <TouchableOpacity style={styles.stepCard} onPress={openBatterySettings}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>1</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Disable Battery Optimization</Text>
            <Text style={styles.stepDesc}>
              Go to Settings → Battery → EatLock → Set to "Unrestricted" or
              "Don't optimize".
            </Text>
          </View>
          <MaterialIcons name="open-in-new" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Step 2 */}
        <TouchableOpacity style={styles.stepCard} onPress={openNotificationSettings}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>2</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Allow Alarm Notifications</Text>
            <Text style={styles.stepDesc}>
              Ensure EatLock's notification channel "Meal Reminders" is enabled and set to
              high priority.
            </Text>
          </View>
          <MaterialIcons name="open-in-new" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Step 3 */}
        <TouchableOpacity style={styles.stepCard} onPress={openAutoStartSettings}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>3</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Enable Auto-Start (if available)</Text>
            <Text style={styles.stepDesc}>
              On Xiaomi, Huawei, Samsung and similar devices, enable "Auto-Start" for
              EatLock in the device settings.
            </Text>
          </View>
          <MaterialIcons name="open-in-new" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          If meal reminders still don't work after following these steps, your device may
          require additional configuration. Visit dontkillmyapp.com for device-specific
          instructions.
        </Text>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => Linking.openURL('https://dontkillmyapp.com')}
        >
          <MaterialIcons name="language" size={18} color={theme.primary} />
          <Text style={styles.linkBtnText}>dontkillmyapp.com</Text>
        </TouchableOpacity>
      </ScrollView>
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
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    alertCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: 'rgba(255,204,0,0.1)',
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: 'rgba(255,204,0,0.25)',
    },
    alertText: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
      lineHeight: 20,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted,
      marginBottom: 12,
      letterSpacing: 0.5,
    },
    stepCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    stepNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.primaryDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepNumText: { fontSize: 14, fontWeight: '700', color: theme.primary },
    stepContent: { flex: 1 },
    stepTitle: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 4 },
    stepDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    footerNote: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 20,
      marginTop: 20,
      marginBottom: 12,
    },
    linkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
    },
    linkBtnText: { color: theme.primary, fontSize: 14, fontWeight: '600' },
  });
