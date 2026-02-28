import React, { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet, LogBox } from 'react-native';
import { useFonts } from 'expo-font';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AppStateProvider, useAppState } from './src/state/AppStateContext';
import { AuthProvider } from './src/state/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { requestNotificationPermissions } from './src/services/notifications';
import { ensureAuth } from './src/services/authService';

// Suppress expo-notifications Expo Go warnings entirely
LogBox.ignoreLogs([
  'expo-notifications',
  'expo-notifications:',
  'Android Push notifications',
  'not fully supported in Expo Go',
]);

function AppContent() {
  const { isLoading } = useAppState();

  useEffect(() => {
    requestNotificationPermissions().catch(console.error);
    ensureAuth().catch((err) => {
      console.warn('[App] Failed to initialize anonymous auth session:', err?.message || err);
    });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  return <AppNavigator />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ...MaterialIcons.font,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <ThemeProvider>
        <AuthProvider>
          <AppStateProvider>
            <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" translucent={false} />
            <AppContent />
          </AppStateProvider>
        </AuthProvider>
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
});
