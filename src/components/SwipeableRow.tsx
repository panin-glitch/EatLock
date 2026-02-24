import React, { useCallback, useRef, useState } from 'react';
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

const ACTION_WIDTH = 84;
const FULL_SWIPE_THRESHOLD = -150;

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  deleteColor?: string;
  disabled?: boolean;
  rowBackgroundColor?: string;
}

export function SwipeableRow({
  children,
  onDelete,
  deleteColor = '#FF453A',
  disabled = false,
  rowBackgroundColor = '#1C1C1E',
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [isUnderlayVisible, setIsUnderlayVisible] = useState(false);

  const snapTo = useCallback((toValue: number, callback?: () => void) => {
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      stiffness: 210,
      damping: 22,
      mass: 0.8,
    }).start(callback);
  }, [translateX]);

  const handleDelete = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onDelete();
  }, [onDelete]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => !disabled && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        if (disabled) return;
        const next = Math.min(0, gs.dx);
        setIsUnderlayVisible(next < -2);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        if (disabled) {
          setIsUnderlayVisible(false);
          snapTo(0);
          return;
        }

        if (gs.dx < FULL_SWIPE_THRESHOLD || gs.vx < -1.4) {
          setIsUnderlayVisible(true);
          Animated.timing(translateX, {
            toValue: -360,
            duration: 180,
            useNativeDriver: true,
          }).start(handleDelete);
          return;
        }

        if (gs.dx < -ACTION_WIDTH / 2 || gs.vx < -0.45) {
          setIsUnderlayVisible(true);
          snapTo(-ACTION_WIDTH);
        } else {
          setIsUnderlayVisible(false);
          snapTo(0);
        }
      },
      onPanResponderTerminate: () => {
        setIsUnderlayVisible(false);
        snapTo(0);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  return (
    <View style={[styles.container, { backgroundColor: rowBackgroundColor }]}> 
      {!disabled && isUnderlayVisible && (
        <View style={[styles.deleteWrap, { backgroundColor: deleteColor }]}> 
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => {
              setIsUnderlayVisible(false);
              snapTo(0);
              setTimeout(handleDelete, 140);
            }}
            activeOpacity={0.72}
          >
            <MaterialIcons name="delete" size={22} color="#FFF" />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View
        style={{ transform: [{ translateX: disabled ? 0 : translateX }] }}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 16,
    marginBottom: 10,
  },
  deleteWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
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
