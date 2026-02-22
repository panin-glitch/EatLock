import React, { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet, LogBox } from 'react-native';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AppStateProvider, useAppState } from './src/state/AppStateContext';
import AppNavigator from './src/navigation/AppNavigator';
import { requestNotificationPermissions } from './src/services/notifications';

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
  return (
    <ThemeProvider>
      <AppStateProvider>
        <StatusBar barStyle="light-content" />
        <AppContent />
      </AppStateProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
});
