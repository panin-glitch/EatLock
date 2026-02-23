/**
 * MiniCards — row of 3 compact stat cards (BiteWise macro-card style).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';

interface MiniCardData {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  label: string;
  value: string;
}

interface Props {
  cards: [MiniCardData, MiniCardData, MiniCardData];
}

export default function MiniCards({ cards }: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      {cards.map((c, i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={[styles.iconCircle, { backgroundColor: c.iconBg + '22' }]}>
            <MaterialIcons name={c.icon} size={16} color={c.iconBg} />
          </View>
          <Text style={[styles.value, { color: theme.text }]}>{c.value}</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 10,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  value: { fontSize: 16, fontWeight: '700', marginBottom: 1 },
  label: { fontSize: 11, fontWeight: '500' },
});
