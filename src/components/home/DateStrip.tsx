/**
 * DateStrip — horizontal row of 7 circular day-pills (BiteWise-style).
 * Current day highlighted. Tap to filter Today's Meals list.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  dates: Date[];
  selectedDate: Date;
  onSelect: (d: Date) => void;
  /** Optional dot indicators (e.g. dates that have sessions) */
  dotDates?: Set<string>;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DateStrip({ dates, selectedDate, onSelect, dotDates }: Props) {
  const { theme } = useTheme();
  const today = new Date();

  return (
    <View style={styles.row}>
      {dates.map((d) => {
        const isSelected = sameDay(d, selectedDate);
        const isToday = sameDay(d, today);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const hasDot = dotDates?.has(dayKey);

        return (
          <TouchableOpacity
            key={d.toISOString()}
            style={[
              styles.pill,
              isSelected && { backgroundColor: theme.primary },
              !isSelected && { backgroundColor: theme.surface },
            ]}
            onPress={() => onSelect(d)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dayLabel,
                { color: isSelected ? '#FFF' : theme.textMuted },
              ]}
            >
              {DAY_LABELS[d.getDay()]}
            </Text>
            <Text
              style={[
                styles.dayNum,
                { color: isSelected ? '#FFF' : theme.text },
                isToday && !isSelected && { color: theme.primary },
              ]}
            >
              {d.getDate()}
            </Text>
            {hasDot && !isSelected && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 10,
  },
  pill: {
    width: 38,
    height: 56,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayLabel: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 16, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
