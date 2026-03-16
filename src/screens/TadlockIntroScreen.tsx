import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Image,
  ImageSourcePropType,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';

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

export default function TadlockIntroScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
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

  const stageAsset = getStageAsset(stage);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
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
          <View style={styles.heroFrame}>
            <Image
              source={stageAsset}
              style={styles.hero}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pressable: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  heroFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
});