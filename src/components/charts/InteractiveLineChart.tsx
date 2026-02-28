import React, { useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, PanResponder, StyleProp, ViewStyle } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../../theme/ThemeProvider';

export interface InteractiveLineChartProps {
  data: {
    labels: string[];
    datasets: { data: number[] }[];
  };
  width: number;
  height: number;
  chartConfig: any;
  style?: StyleProp<ViewStyle>;
  segments?: number;
  formatYLabel?: (v: string) => string;
  yAxisSuffix?: string;
  fromZero?: boolean;
  bezier?: boolean;
  metricLabel: string; // 'meals', 'cal', 'min'
}

interface Point {
  x: number;
  y: number;
  value: number;
  label: string;
}

export default function InteractiveLineChart(props: InteractiveLineChartProps) {
  const { data, metricLabel } = props;
  const { theme } = useTheme();
  
  const [tooltipPos, setTooltipPos] = useState<Point | null>(null);
  const pointsRef = useRef<Point[]>([]);

  // We capture the x,y coordinates of each point
  const handleRenderDotContent = ({ x, y, index, indexData }: any) => {
    // Save to ref if not saved (assuming only 1 dataset and order is guaranteed)
    if (pointsRef.current.length !== data.labels.length) {
      if (index === 0) pointsRef.current = []; // reset on new render
      pointsRef.current[index] = {
        x,
        y,
        value: indexData,
        label: data.labels[index] || '',
      };
    }
    return null; // We don't render standard dot text
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          updateTooltip(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt) => {
          updateTooltip(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          // keep it visible, or hide? 
          // let's hide or keep it? User said "User can press/hold to move... updates live"
          // We can set it to null to hide after drag
          setTooltipPos(null);
        },
      }),
    []
  );

  const updateTooltip = (touchX: number) => {
    if (!pointsRef.current.length) return;
    let closest = pointsRef.current[0];
    let minDiff = Math.abs(touchX - closest.x);
    for (const p of pointsRef.current) {
      const diff = Math.abs(touchX - p.x);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    setTooltipPos(closest);
  };

  return (
    <View style={props.style} {...panResponder.panHandlers}>
      <View pointerEvents="none">
        <LineChart
          {...props}
          renderDotContent={handleRenderDotContent}
          style={{ margin: 0, padding: 0 }}
        />
      </View>

      {/* TOOLTIP OVERLAY */}
      {tooltipPos && (
        <View
          style={[
            styles.tooltipContainer,
            { left: tooltipPos.x, top: tooltipPos.y },
          ]}
          pointerEvents="none"
        >
          {/* vertical line indicator */}
          <View style={[styles.indicatorLine, { height: props.height, top: -tooltipPos.y }]} />

          {/* tooltip box */}
          <View style={[styles.tooltipBox, { backgroundColor: theme.text }]}>
            <Text style={[styles.tooltipLabel, { color: theme.background }]}>{tooltipPos.label}</Text>
            <Text style={[styles.tooltipValue, { color: theme.background }]}>
              {tooltipPos.value} {metricLabel}
            </Text>
          </View>
          
          {/* active point dot */}
          <View style={[styles.activeDot, { backgroundColor: theme.background, borderColor: props.chartConfig.color() }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipContainer: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  indicatorLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tooltipBox: {
    position: 'absolute',
    bottom: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    minWidth: 80,
  },
  tooltipLabel: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.8,
    marginBottom: 2,
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    position: 'absolute',
  },
});
