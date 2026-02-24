/**
 * SwipeableRow — smooth swipe-to-reveal-delete with velocity-based snap.
 * Full swipe auto-deletes. Uses native driver for 60fps.
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ACTION_WIDTH = 80;
const FULL_SWIPE_THRESHOLD = -160;
const VELOCITY_THRESHOLD = -0.5;

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  deleteColor?: string;
}

export function SwipeableRow({ children, onDelete, deleteColor = '#FF453A' }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openAmount = useRef(0);

  const snapTo = useCallback(
    (toValue: number, callback?: () => void) => {
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }).start(callback);
      openAmount.current = toValue;
    },
    [translateX],
  );

  const handleDelete = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onDelete();
  }, [onDelete]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy * 1.5),
      onPanResponderGrant: () => {
        translateX.setOffset(openAmount.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        const raw = gs.dx;
        // Clamp: don't go right of 0, add rubber-band past full swipe
        const clamped = Math.min(0, raw);
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        translateX.flattenOffset();
        const current = openAmount.current + gs.dx;
        const vx = gs.vx;

        if (current < FULL_SWIPE_THRESHOLD || vx < -1.5) {
          // Full swipe → auto-delete
          Animated.timing(translateX, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => handleDelete());
          openAmount.current = -400;
          return;
        }

        if (current < -ACTION_WIDTH / 2 || vx < VELOCITY_THRESHOLD) {
          snapTo(-ACTION_WIDTH);
        } else {
          snapTo(0);
        }
      },
    }),
  ).current;

  const close = useCallback(() => snapTo(0), [snapTo]);

  return (
    <View style={styles.container}>
      {/* Delete button behind */}
      <View style={[styles.deleteWrap, { backgroundColor: deleteColor }]}>
        <TouchableOpacity
          onPress={() => {
            close();
            setTimeout(handleDelete, 200);
          }}
          style={styles.deleteBtn}
          activeOpacity={0.7}
        >
          <MaterialIcons name="delete" size={22} color="#FFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground content */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 10,
    borderRadius: 16,
  },
  deleteWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
