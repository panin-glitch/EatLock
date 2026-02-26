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
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);

  const snapTo = useCallback(
    (toValue: number, callback?: () => void) => {
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        stiffness: 210,
        damping: 22,
        mass: 0.8,
      }).start(callback);
    },
    [translateX],
  );

  const close = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    snapTo(0);
  }, [snapTo]);

  const handleDelete = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onDelete();
  }, [onDelete]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        // If already open and user starts a new gesture, close first
        if (isOpenRef.current) {
          isOpenRef.current = false;
          setIsOpen(false);
          snapTo(0);
        }
      },
      onPanResponderMove: (_, gs) => {
        const next = Math.min(0, gs.dx);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -ACTION_WIDTH * 0.5) {
          isOpenRef.current = true;
          setIsOpen(true);
          snapTo(-ACTION_WIDTH);
        } else {
          isOpenRef.current = false;
          setIsOpen(false);
          snapTo(0);
        }
      },
      onPanResponderTerminate: () => {
        isOpenRef.current = false;
        setIsOpen(false);
        snapTo(0);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  return (
    <View style={[styles.container, { backgroundColor: rowBackgroundColor }]}>
      {isOpen && (
        <View style={[styles.deleteWrap, { backgroundColor: deleteColor }]}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => {
              close();
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
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            if (isOpenRef.current) close();
          }}
          disabled={!isOpenRef.current}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 14,
    marginBottom: 8,
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
