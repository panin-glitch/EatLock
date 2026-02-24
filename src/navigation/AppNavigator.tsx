import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

import HomeScreen from '../screens/HomeScreen';
import PlannerScreen from '../screens/PlannerScreen';
import StatsScreen from '../screens/StatsScreen';
import BlockScreen from '../screens/BlockScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditScheduleScreen from '../screens/EditScheduleScreen';
import MealInfoScreen from '../screens/MealInfoScreen';
import SessionSummaryScreen from '../screens/SessionSummaryScreen';
import PermissionsOnboardingScreen from '../screens/PermissionsOnboardingScreen';
import BlockerScreen from '../screens/BlockerScreen';
import NotificationHelpScreen from '../screens/NotificationHelpScreen';
import PreScanCameraScreen from '../screens/PreScanCameraScreen';
import PostScanCameraScreen from '../screens/PostScanCameraScreen';
import LockSetupConfirmScreen from '../screens/LockSetupConfirmScreen';
import MealSessionActiveScreen from '../screens/MealSessionActiveScreen';
import AuthScreen from '../screens/auth/AuthScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function TabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PlannerTab"
        component={PlannerScreen}
        options={{
          tabBarLabel: 'Planner',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="calendar-today" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="StatsTab"
        component={StatsScreen}
        options={{
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BlockTab"
        component={BlockScreen}
        options={{
          tabBarLabel: 'Block',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="lock" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();

  const navTheme = {
    dark: true,
    colors: {
      primary: theme.primary,
      background: theme.background,
      card: theme.background,
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
    prefixes: ['eatlock://'],
    config: {
      screens: {
        ResetPassword: 'reset-password',
      },
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'fade',
        }}
      >
            <RootStack.Screen name="Main" component={TabNavigator} />
            <RootStack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="EditSchedule"
              component={EditScheduleScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="MealInfo"
              component={MealInfoScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <RootStack.Screen
              name="PreScanCamera"
              component={PreScanCameraScreen}
              options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
            />
            <RootStack.Screen
              name="LockSetupConfirm"
              component={LockSetupConfirmScreen}
              options={{ animation: 'fade' }}
            />
            <RootStack.Screen
              name="MealSessionActive"
              component={MealSessionActiveScreen}
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <RootStack.Screen
              name="PostScanCamera"
              component={PostScanCameraScreen}
              options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
            />
            <RootStack.Screen
              name="SessionSummary"
              component={SessionSummaryScreen}
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <RootStack.Screen
              name="PermissionsOnboarding"
              component={PermissionsOnboardingScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="Blocker"
              component={BlockerScreen}
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <RootStack.Screen
              name="NotificationHelp"
              component={NotificationHelpScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
