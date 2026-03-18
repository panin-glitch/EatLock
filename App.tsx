import React, { useEffect, useState, type ReactNode } from 'react';
import { StatusBar, View, Image, StyleSheet, LogBox, Text, TouchableOpacity, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { requestNotificationPermissions } from './src/services/notifications';

// Suppress expo-notifications Expo Go warnings entirely
LogBox.ignoreLogs([
  'expo-notifications',
  'expo-notifications:',
  'Android Push notifications',
  'not fully supported in Expo Go',
]);

const SPLASH_BACKGROUND_COLOR = '#5CC86B';
const STARTUP_SPLASH_MIN_MS = 1800;

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.loader}>
      <Image source={require('./assets/appicon.png')} style={styles.fallbackIcon} resizeMode="contain" />
      <Text style={styles.fallbackTitle}>TadLock hit a startup error</Text>
      <Text style={styles.fallbackBody}>
        The app stayed alive so you can retry instead of getting kicked out.
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.85}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

class RootErrorBoundary extends React.Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[App] Root render error:', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <CrashFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function SplashLoader() {
  return (
    <View style={styles.loader}>
      <Image source={require('./assets/splashtadlock.gif')} style={styles.splashGif} resizeMode="contain" />
    </View>
  );
}

function AppRuntime() {
  const { useAppState } = require('./src/state/AppStateContext') as typeof import('./src/state/AppStateContext');
  const { isLoading } = useAppState();

  useEffect(() => {
    requestNotificationPermissions().catch(console.error);
  }, []);

  if (isLoading) {
    return <SplashLoader />;
  }

  const AppNavigator = require('./src/navigation/AppNavigator').default;
  return <AppNavigator />;
}

function MonetizationProvider({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') {
    return <>{children}</>;
  }

  const { RevenueCatProvider } = require('./src/state/RevenueCatContext') as typeof import('./src/state/RevenueCatContext');
  return <RevenueCatProvider>{children}</RevenueCatProvider>;
}

function AppProviders() {
  const { AuthProvider } = require('./src/state/AuthContext') as typeof import('./src/state/AuthContext');
  const { AppStateProvider } = require('./src/state/AppStateContext') as typeof import('./src/state/AppStateContext');

  return (
    <AuthProvider>
      <MonetizationProvider>
        <AppStateProvider>
          <AppRuntime />
        </AppStateProvider>
      </MonetizationProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { theme, themeName } = useTheme();

  return (
    <View style={[styles.appRoot, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
        translucent={false}
      />
      <AppProviders />
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ...MaterialIcons.font,
  });
  const [startupSplashDone, setStartupSplashDone] = useState(false);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setStartupSplashDone(true);
    }, STARTUP_SPLASH_MIN_MS);

    return () => clearTimeout(timerId);
  }, []);

  if (!startupSplashDone || (!fontsLoaded && !fontError)) {
    return <SplashLoader />;
  }

  return (
    <ThemeProvider>
      <RootErrorBoundary>
        <AppShell />
      </RootErrorBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#FFFDF5',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: SPLASH_BACKGROUND_COLOR,
  },
  splashGif: {
    width: 220,
    height: 220,
  },
  fallbackIcon: {
    width: 92,
    height: 92,
    borderRadius: 24,
    marginBottom: 18,
  },
  fallbackTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  fallbackBody: {
    maxWidth: 260,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: 'rgba(15,23,42,0.76)',
  },
  retryButton: {
    marginTop: 20,
    minWidth: 148,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
