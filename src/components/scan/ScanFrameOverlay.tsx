import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

interface Props {
  hintText?: string;
  shape?: 'corners' | 'circle';
}

export function ScanFrameOverlay({ hintText, shape = 'corners' }: Props) {
  const { width, height } = useWindowDimensions();
  const [overlaySize, setOverlaySize] = useState({ width, height });
  const isCircle = shape === 'circle';
  const overlayWidth = overlaySize.width || width;
  const overlayHeight = overlaySize.height || height;
  const circleSize = Math.min(overlayWidth * 0.76, overlayHeight * 0.52);
  const circleX = (overlayWidth - circleSize) / 2;
  const circleY = overlayHeight * 0.22;
  const circleRadius = circleSize / 2;
  const maskId = 'scanCircleMask';

  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        const nextHeight = event.nativeEvent.layout.height;

        if (nextWidth <= 0 || nextHeight <= 0) return;
        if (overlaySize.width === nextWidth && overlaySize.height === nextHeight) return;

        setOverlaySize({ width: nextWidth, height: nextHeight });
      }}
    >
      {isCircle ? (
        <>
          <Svg width={overlayWidth} height={overlayHeight} style={StyleSheet.absoluteFill}>
            <Defs>
              <Mask
                id={maskId}
                x={0}
                y={0}
                width={overlayWidth}
                height={overlayHeight}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <Rect x="0" y="0" width={overlayWidth} height={overlayHeight} fill="#FFF" />
                <Circle cx={circleX + circleRadius} cy={circleY + circleRadius} r={circleRadius} fill="#000" />
              </Mask>
            </Defs>

            <Rect
              x="0"
              y="0"
              width={overlayWidth}
              height={overlayHeight}
              fill="rgba(0,0,0,0.45)"
              mask={`url(#${maskId})`}
            />

            <Circle
              cx={circleX + circleRadius}
              cy={circleY + circleRadius}
              r={circleRadius}
              fill="none"
              stroke="rgba(255,255,255,0.72)"
              strokeWidth={2.5}
            />
          </Svg>

          {hintText ? (
            <Text style={[styles.hint, { top: circleY + circleSize + 14 }]}>{hintText}</Text>
          ) : null}
        </>
      ) : (
        <View style={styles.frame}>
          <View style={[styles.bracket, styles.topLeft]} />
          <View style={[styles.bracket, styles.topRight]} />
          <View style={[styles.bracket, styles.bottomLeft]} />
          <View style={[styles.bracket, styles.bottomRight]} />
          {hintText ? <Text style={styles.cornerHint}>{hintText}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
  },
  frame: {
    position: 'absolute',
    top: '26%',
    left: '15%',
    width: '70%',
    aspectRatio: 1,
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
  cornerHint: {
    position: 'absolute',
    bottom: -30,
    width: '100%',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '500',
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '500',
  },
});
