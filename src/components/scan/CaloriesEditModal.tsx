/**
 * CaloriesEditModal — small modal for manual calorie override.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { ThemeColors } from '../../theme/colors';

const { width: SW } = Dimensions.get('window');

interface Props {
  visible: boolean;
  theme: ThemeColors;
  initial?: number;
  onSave: (cal: number) => void;
  onCancel: () => void;
}

export function CaloriesEditModal({ visible, theme, initial, onSave, onCancel }: Props) {
  const [value, setValue] = useState(String(initial ?? ''));

  const handleSave = () => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) onSave(num);
  };

  const s = makeStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.card}>
          <Text style={s.title}>Edit Calories</Text>
          <TextInput
            style={s.input}
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            placeholder="e.g. 540"
            placeholderTextColor={theme.textMuted}
            autoFocus
            selectTextOnFocus
            maxLength={5}
          />
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, { backgroundColor: theme.surfaceElevated }]} onPress={onCancel}>
              <Text style={[s.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: theme.primary }]} onPress={handleSave}>
              <Text style={s.btnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: SW * 0.75,
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 24,
    },
    title: {
      color: c.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 16,
      textAlign: 'center',
    },
    input: {
      backgroundColor: c.inputBg,
      color: c.text,
      fontSize: 28,
      fontWeight: '700',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      textAlign: 'center',
      marginBottom: 16,
    },
    btnRow: { flexDirection: 'row', gap: 10 },
    btn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    btnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  });
