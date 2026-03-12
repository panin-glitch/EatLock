import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Image,
  ImageSourcePropType,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';

type IntroStage = 'phone' | 'swipe' | 'slapped' | 'stare';

const tadlockPhoneGif = require('../../Onboarding/tadlock phone.gif');
const tadlockPhoneSwipeGif = require('../../Onboarding/Tadlock phone swipe.gif');
const tadlockPhoneSlappedGif = require('../../Onboarding/tadlock phone slapped.gif');
const tadlockPhoneStareGif = require('../../Onboarding/tadlock phone stare.gif');

// Derived from the GIF frame delays so we can swap to the next asset before the encoded loop repeats.
const SLAPPED_GIF_DURATION_MS = 2800;
const TAP_SLOP_PX = 10;
const SWIPE_DISTANCE_PX = 32;

function getStageAsset(stage: IntroStage): ImageSourcePropType {
  switch (stage) {
    case 'phone':
      return tadlockPhoneGif;
    case 'swipe':
      return tadlockPhoneSwipeGif;
    case 'slapped':
      return tadlockPhoneSlappedGif;
    case 'stare':
      return tadlockPhoneStareGif;
  }
}

function getStagePrompt(stage: IntroStage): string {
  switch (stage) {
    case 'phone':
      return 'Tap anywhere to begin';
    case 'swipe':
      return 'Swipe anywhere to continue';
    case 'slapped':
      return '';
    case 'stare':
      return 'Tap anywhere to enter TadLock';
  }
}

export default function TadlockIntroScreen() {
  const { theme, themeName } = useTheme();
  const navigation = useNavigation<any>();
  const [stage, setStage] = useState<IntroStage>('phone');
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (stage !== 'slapped') {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setStage('stare');
    }, SLAPPED_GIF_DURATION_MS);

    return () => clearTimeout(timeoutId);
  }, [stage]);

  const handlePress = () => {
    if (stage === 'phone') {
      setStage('swipe');
      return;
    }

    if (stage === 'stare') {
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 0,
              routes: [{ name: 'HomeTab' }],
            },
          },
        ],
      });
    }
  };

  const handleTouchStart = (event: GestureResponderEvent) => {
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!start) {
      return;
    }

    const dx = event.nativeEvent.pageX - start.x;
    const dy = event.nativeEvent.pageY - start.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));

    if (stage === 'swipe') {
      if (distance >= SWIPE_DISTANCE_PX) {
        setStage('slapped');
      }
      return;
    }

    if (distance <= TAP_SLOP_PX) {
      handlePress();
    }
  };

  const prompt = getStagePrompt(stage);
  const stageAsset = getStageAsset(stage);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />
      <View
        style={styles.pressable}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={() => {
          touchStartRef.current = null;
        }}
      >
        <View style={styles.content}>
          <Image source={stageAsset} style={styles.hero} resizeMode="cover" fadeDuration={0} />
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.title}>TadLock</Text>
            {prompt ? <Text style={styles.prompt}>{prompt}</Text> : null}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressable: {
    flex: 1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  hero: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});