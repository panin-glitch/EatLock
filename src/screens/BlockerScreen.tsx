import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  BackHandler,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useRoute } from '@react-navigation/native';

/**
 * Full-screen blocker overlay displayed when the user tries to open
 * a blocked app during an active meal session.
 *
 * In production, this screen is launched by the native overlay/accessibility
 * service. For now, it can be pushed onto the stack.
 */
export default function BlockerScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const { appName } = route.params || {};

  // Pressing back returns the user to the home screen (not the blocked app)
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Swallow back press — user must tap "Go Back"
      return true;
    });
    return () => sub.remove();
  }, []);

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="block" size={56} color={theme.danger} />
        </View>

        <Text style={styles.title}>App Blocked</Text>

        <Text style={styles.subtitle}>
          {appName
            ? `${appName} is blocked during your meal.`
            : 'This app is blocked during your meal.'}
        </Text>

        <Text style={styles.message}>
          Stay focused on your food! You can use this app again once your meal session ends.
        </Text>

        <View style={styles.timerCard}>
          <MaterialIcons name="timer" size={20} color={theme.primary} />
          <Text style={styles.timerText}>Meal in progress — stay present</Text>
        </View>

        <TouchableOpacity
          style={styles.goBackBtn}
          onPress={() => {
            // In production, this would bring up EatLock via an intent.
            // For now, BackHandler returns to the previous screen.
            BackHandler.exitApp();
          }}
        >
          <MaterialIcons name="arrow-back" size={20} color="#FFF" />
          <Text style={styles.goBackBtnText}>Return to EatLock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    iconCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: 'rgba(255,69,58,0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 17,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    timerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.primaryDim,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 12,
      marginBottom: 32,
    },
    timerText: { color: theme.primary, fontSize: 15, fontWeight: '500' },
    goBackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 32,
    },
    goBackBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  });
