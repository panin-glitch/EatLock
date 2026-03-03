import React from 'react';
import { Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import ScreenHeader from '../components/common/ScreenHeader';

const BG_GIF = require('../../assets/tadlock leaderboard.gif');

export default function LeaderboardScreen() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <Image source={BG_GIF} style={styles.bg} resizeMode="cover" />
      <View style={styles.overlay} />

      <View style={styles.headerWrap}>
        <ScreenHeader title="Leaderboard" />
      </View>

      <View style={styles.center}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Coming Soon</Text>
        </View>
        <Text style={styles.subtext}>Leaderboards are being rebuilt.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  headerWrap: {
    position: 'relative',
    zIndex: 2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
  },
  pillText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  subtext: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 10,
  },
});
