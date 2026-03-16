import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { triggerLightHaptic } from '../services/haptics';

import StatsScreen from '../screens/StatsScreen';
import BlockScreen from '../screens/BlockScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditScheduleScreen from '../screens/EditScheduleScreen';
import MealInfoScreen from '../screens/MealInfoScreen';
import SessionSummaryScreen from '../screens/SessionSummaryScreen';
import PermissionsOnboardingScreen from '../screens/PermissionsOnboardingScreen';
import BlockerScreen from '../screens/BlockerScreen';
import NotificationHelpScreen from '../screens/NotificationHelpScreen';
import LockSetupConfirmScreen from '../screens/LockSetupConfirmScreen';
import MealSessionActiveScreen from '../screens/MealSessionActiveScreen';
import AuthScreen from '../screens/auth/AuthScreen';
import PlannerScreen from '../screens/PlannerScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import CalorieSettingScreen from '../screens/CalorieSettingScreen';
import MacroBalanceSettingScreen from '../screens/MacroBalanceSettingScreen';
import DietSelectionScreen from '../screens/DietSelectionScreen';
import MealFrequencySettingScreen from '../screens/MealFrequencySettingScreen';
import LanguageSelectionScreen from '../screens/LanguageSelectionScreen';
import StreakDetailsScreen from '../screens/StreakDetailsScreen';
import StreakAchievementScreen from '../screens/StreakAchievementScreen';
import TadlockIntroScreen from '../screens/TadlockIntroScreen';

const HomeScreen = require('../screens/HomeScreen').default;
const PreScanCameraScreen = require('../screens/PreScanCameraScreen').default;
const PostScanCameraScreen = require('../screens/PostScanCameraScreen').default;

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
      detachInactiveScreens={false}
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
                  borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)',
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
              style={[styles.scanFab, { backgroundColor: theme.primary }]}
              onPress={openCamera}
              activeOpacity={0.9}
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
          freezeOnBlur: false,
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
    shadowColor: '#000',
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
});
