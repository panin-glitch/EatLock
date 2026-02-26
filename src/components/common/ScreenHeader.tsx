import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      <Text style={[styles.title, { color: theme.text } as TextStyle]}>{title}</Text>
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
