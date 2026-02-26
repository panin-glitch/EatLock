import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

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

const HomeScreen = require('../screens/HomeScreen').default;
const LeaderboardScreen = require('../screens/LeaderboardScreen').default;
const PreScanCameraScreen = require('../screens/PreScanCameraScreen').default;
const PostScanCameraScreen = require('../screens/PostScanCameraScreen').default;

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function TabNavigator({ navigation }: any) {
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
          height: 72,
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
        name="StatsTab"
        component={StatsScreen}
        options={{
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ScanTab"
        component={HomeScreen} // Dummy component
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('PreScanCamera');
          },
        }}
        options={{
          tabBarLabel: 'Scan',
          tabBarButton: () => (
            <TouchableOpacity
              style={{
                top: -14,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => navigation.navigate('PreScanCamera')}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: theme.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 4,
                  borderColor: theme.tabBarBg,
                }}
              >
                <MaterialIcons name="camera-alt" size={26} color={theme.background} />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name="LeaderboardTab"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'Leaderboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="leaderboard" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BlockTab"
        component={BlockScreen}
        options={{
          tabBarLabel: 'Blocks',
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
              name="Planner"
              component={PlannerScreen}
              options={{ animation: 'slide_from_right' }}
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
              <RootStack.Group
                screenOptions={{
                  animation: 'fade',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: '#000' },
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
                options={{ gestureEnabled: false }}
            />
              </RootStack.Group>
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
