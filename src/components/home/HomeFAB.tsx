/**
 * HomeFAB — single-action floating button that opens the camera scanner.
 *
 * Tap → fires onPress immediately. No expand menu.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface Props {
  onPress: () => void;
}

export default function HomeFAB({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={onPress}>
      <MaterialIcons name="photo-camera" size={20} color="#FFF" />
      <Text style={styles.label}>Scan meal</Text>
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
    backgroundColor: '#1C1C1E',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  label: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
