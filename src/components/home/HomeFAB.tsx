/**
 * HomeFAB — single-action floating button that opens the camera scanner.
 *
 * Tap → fires onPress immediately. No expand menu.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { withAlpha } from '../../theme/colorUtils';

interface Props {
  onPress: () => void;
}

export default function HomeFAB({ onPress }: Props) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: theme.surface,
          borderColor: withAlpha(theme.primary, 0.22),
          shadowColor: withAlpha(theme.text, 0.35),
        },
      ]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Scan meal"
    >
      <MaterialIcons name="photo-camera" size={20} color={theme.primary} />
      <Text style={[styles.label, { color: theme.text }]}>Scan meal</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 34,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  label: { fontSize: 14, fontWeight: '700' },
});
