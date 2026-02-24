/**
 * DistractionRatingModal — 1–5 star rating shown after EATEN verdict,
 * before the session is ended and the phone unlocked.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme/colors';

const { width: SW } = Dimensions.get('window');

interface Props {
  visible: boolean;
  theme: ThemeColors;
  onSubmit: (rating: number) => void;
  onSkip: () => void;
}

export function DistractionRatingModal({ visible, theme, onSubmit, onSkip }: Props) {
  const [rating, setRating] = useState(0);

  const handleSubmit = () => {
    if (rating > 0) onSubmit(rating);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>How distracted were you?</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Rate your focus during this meal
          </Text>

          {/* Star row */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                <MaterialIcons
                  name={n <= rating ? 'star' : 'star-border'}
                  size={40}
                  color={n <= rating ? theme.warning : theme.textMuted}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Labels */}
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Focused</Text>
            <Text style={[styles.label, { color: theme.textMuted }]}>Very distracted</Text>
          </View>

          {/* Continue button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: rating > 0 ? theme.primary : theme.surfaceElevated },
            ]}
            onPress={handleSubmit}
            disabled={rating === 0}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.submitText,
                { color: rating > 0 ? '#FFF' : theme.textMuted },
              ]}
            >
              Continue
            </Text>
          </TouchableOpacity>

          {/* Skip link */}
          <TouchableOpacity onPress={onSkip} hitSlop={12} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SW * 0.82,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  label: { fontSize: 11 },
  submitBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '700' },
  skipBtn: { marginTop: 12 },
  skipText: { fontSize: 13 },
});
