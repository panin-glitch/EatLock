import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  hintText?: string;
}

export function ScanFrameOverlay({ hintText }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.bracket, styles.topLeft]} />
      <View style={[styles.bracket, styles.topRight]} />
      <View style={[styles.bracket, styles.bottomLeft]} />
      <View style={[styles.bracket, styles.bottomRight]} />
      {hintText ? <Text style={styles.hint}>{hintText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '26%',
    left: '15%',
    width: '70%',
    aspectRatio: 1,
    zIndex: 9,
  },
  bracket: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderColor: 'rgba(255,255,255,0.55)',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  hint: {
    position: 'absolute',
    bottom: -30,
    width: '100%',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '500',
  },
});
