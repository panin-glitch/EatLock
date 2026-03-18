import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/colorUtils';
import { useAppState } from '../state/AppStateContext';
import { triggerLightHaptic } from '../services/haptics';

function lazyScreen(loader: () => any) {
  return function LazyLoadedScreen(props: any) {
    const Screen = React.useMemo(() => loader(), []);
    return <Screen {...props} />;
  };
}

const HomeScreen = lazyScreen(() => require('../screens/HomeScreen').default);
const StatsScreen = lazyScreen(() => require('../screens/StatsScreen').default);
const BlockScreen = lazyScreen(() => require('../screens/BlockScreen').default);
const SettingsScreen = lazyScreen(() => require('../screens/SettingsScreen').default);
const EditScheduleScreen = lazyScreen(() => require('../screens/EditScheduleScreen').default);
const MealInfoScreen = lazyScreen(() => require('../screens/MealInfoScreen').default);
const SessionSummaryScreen = lazyScreen(() => require('../screens/SessionSummaryScreen').default);
const PermissionsOnboardingScreen = lazyScreen(() => require('../screens/PermissionsOnboardingScreen').default);
const BlockerScreen = lazyScreen(() => require('../screens/BlockerScreen').default);
const NotificationHelpScreen = lazyScreen(() => require('../screens/NotificationHelpScreen').default);
const LockSetupConfirmScreen = lazyScreen(() => require('../screens/LockSetupConfirmScreen').default);
const MealSessionActiveScreen = lazyScreen(() => require('../screens/MealSessionActiveScreen').default);
const AuthScreen = lazyScreen(() => require('../screens/auth/AuthScreen').default);
const PlannerScreen = lazyScreen(() => require('../screens/PlannerScreen').default);
const ProfileScreen = lazyScreen(() => require('../screens/Profile/ProfileScreen').default);
const CalorieSettingScreen = lazyScreen(() => require('../screens/CalorieSettingScreen').default);
const MacroBalanceSettingScreen = lazyScreen(() => require('../screens/MacroBalanceSettingScreen').default);
const DietSelectionScreen = lazyScreen(() => require('../screens/DietSelectionScreen').default);
const MealFrequencySettingScreen = lazyScreen(() => require('../screens/MealFrequencySettingScreen').default);
const LanguageSelectionScreen = lazyScreen(() => require('../screens/LanguageSelectionScreen').default);
const StreakDetailsScreen = lazyScreen(() => require('../screens/StreakDetailsScreen').default);
const StreakAchievementScreen = lazyScreen(() => require('../screens/StreakAchievementScreen').default);
const TadlockIntroScreen = lazyScreen(() => require('../screens/TadlockIntroScreen').default);
const PreScanCameraScreen = lazyScreen(() => require('../screens/PreScanCameraScreen').default);
const PostScanCameraScreen = lazyScreen(() => require('../screens/PostScanCameraScreen').default);

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const TAB_ITEMS: Array<{
  routeName: 'HomeTab' | 'StatsTab' | 'BlockTab';
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}> = [
  { routeName: 'HomeTab', label: 'Home', icon: 'home' },
  { routeName: 'StatsTab', label: 'Progress', icon: 'bar-chart' },
  { routeName: 'BlockTab', label: 'Blocks', icon: 'grid-view' },
];

function TabNavigator({ navigation: rootNavigation }: any) {
  const { theme, themeName } = useTheme();
  const { settings } = useAppState();
  const lightHaptic = () => triggerLightHaptic(settings.app.hapticsEnabled);
  const isLight = themeName === 'Light';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: { backgroundColor: theme.background },
        tabBarStyle: {
          borderTopWidth: 0,
          backgroundColor: theme.background,
          elevation: 0,
          height: 116,
        },
      }}
      tabBar={({ state, navigation }) => {
        const openCamera = () => {
          lightHaptic();
          rootNavigation.navigate('PreScanCamera');
        };

        return (
          <View style={[styles.tabShell, { backgroundColor: theme.background }]}>
            <View
              style={[
                styles.tabPill,
                {
                  backgroundColor: theme.card,
                  borderColor: withAlpha(theme.text, isLight ? 0.06 : 0.05),
                  shadowColor: withAlpha(theme.text, 0.18),
                },
              ]}
            >
              {TAB_ITEMS.map((item) => {
                const routeIndex = state.routes.findIndex((route) => route.name === item.routeName);
                if (routeIndex === -1) return null;

                const route = state.routes[routeIndex];
                const focused = state.index === routeIndex;

                const onPress = () => {
                  lightHaptic();
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                };

                return (
                  <TouchableOpacity
                    key={item.routeName}
                    style={[styles.tabItem, focused && [styles.tabItemActive, { backgroundColor: theme.surfaceElevated }]]}
                    onPress={onPress}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: focused }}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={24}
                      color={focused ? theme.primary : theme.tabBarInactive}
                    />
                    <Text style={[styles.tabLabel, { color: focused ? theme.primary : theme.tabBarInactive, fontWeight: focused ? '700' : '600' }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.scanFab, { backgroundColor: theme.primary, shadowColor: withAlpha(theme.text, 0.22) }]}
              onPress={openCamera}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Open meal scanner"
            >
              <MaterialIcons name="lock" size={34} color={theme.onPrimary} />
            </TouchableOpacity>
          </View>
        );
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} />
      <Tab.Screen name="StatsTab" component={StatsScreen} />
      <Tab.Screen name="BlockTab" component={BlockScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme, themeName } = useTheme();

  const navTheme = {
    dark: themeName !== 'Light',
    colors: {
      primary: theme.primary,
      background: theme.background,
      card: theme.card,
      text: theme.text,
      border: theme.border,
      notification: theme.primary,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '700' as const },
      heavy: { fontFamily: 'System', fontWeight: '900' as const },
    },
  };

  const linking = {
    prefixes: ['tadlock://'],
    config: {
      screens: {
        Auth: 'auth',
      },
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <RootStack.Navigator
        initialRouteName="TadlockIntro"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          animationDuration: 260,
          statusBarAnimation: 'fade',
          statusBarTranslucent: false,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          animationMatchesGesture: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <RootStack.Screen
          name="TadlockIntro"
          component={TadlockIntroScreen}
          options={{ animation: 'none', gestureEnabled: false, statusBarAnimation: 'none' }}
        />
        <RootStack.Screen
          name="Main"
          component={TabNavigator}
          options={{ animation: 'none', statusBarAnimation: 'none' }}
        />
        <RootStack.Screen name="Settings" component={SettingsScreen} />
        <RootStack.Screen name="CalorieSetting" component={CalorieSettingScreen} />
        <RootStack.Screen name="MacroBalanceSetting" component={MacroBalanceSettingScreen} />
        <RootStack.Screen name="DietSelection" component={DietSelectionScreen} />
        <RootStack.Screen name="MealFrequencySetting" component={MealFrequencySettingScreen} />
        <RootStack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
        <RootStack.Screen name="StreakDetails" component={StreakDetailsScreen} />
        <RootStack.Screen name="StreakAchievement" component={StreakAchievementScreen} />
        <RootStack.Screen name="Planner" component={PlannerScreen} />
        <RootStack.Screen name="Profile" component={ProfileScreen} />
        <RootStack.Screen
          name="EditSchedule"
          component={EditScheduleScreen}
          options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: theme.background } }}
        />
        <RootStack.Screen name="MealInfo" component={MealInfoScreen} />
        <RootStack.Group
          screenOptions={{
            animation: 'slide_from_right',
            presentation: 'card',
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <RootStack.Screen
            name="PreScanCamera"
            component={PreScanCameraScreen}
            options={{ gestureEnabled: false }}
          />
          <RootStack.Screen
            name="LockSetupConfirm"
            component={LockSetupConfirmScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <RootStack.Screen
            name="MealSessionActive"
            component={MealSessionActiveScreen}
            options={{ animation: 'slide_from_right', gestureEnabled: false }}
          />
          <RootStack.Screen
            name="PostScanCamera"
            component={PostScanCameraScreen}
            options={{ gestureEnabled: false }}
          />
        </RootStack.Group>
        <RootStack.Screen
          name="SessionSummary"
          component={SessionSummaryScreen}
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <RootStack.Screen
          name="PermissionsOnboarding"
          component={PermissionsOnboardingScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <RootStack.Screen
          name="Blocker"
          component={BlockerScreen}
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <RootStack.Screen
          name="NotificationHelp"
          component={NotificationHelpScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <RootStack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabPill: {
    flex: 1,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabItemActive: {
    borderRadius: 35,
  },
  tabLabel: {
    fontSize: 12,
  },
  scanFab: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
});
