import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, type ViewStyle, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeProvider';

interface ScreenHeaderProps {
  title: string;
  rightActions?: React.ReactNode[];
}

export const HEADER_HORIZONTAL_PADDING = 20;
export const HEADER_BOTTOM_PADDING = 12;

export default function ScreenHeader({ title, rightActions = [] }: ScreenHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    React.useCallback(() => {
      titleOpacity.setValue(0);
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
      return () => {};
    }, [titleOpacity]),
  );

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 8,
          paddingHorizontal: HEADER_HORIZONTAL_PADDING,
          paddingBottom: HEADER_BOTTOM_PADDING,
        } as ViewStyle,
      ]}
    >
      <Animated.Text style={[styles.title, { color: theme.text, opacity: titleOpacity } as TextStyle]}>
        {title}
      </Animated.Text>
      <View style={styles.actionsRow}>
        {rightActions.map((action, index) => (
          <View key={`header-action-${index}`}>{action}</View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
