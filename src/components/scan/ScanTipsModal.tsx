import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: any;
}

export function ScanTipsModal({ visible, onClose, theme }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Scan tips</Text>

          <View style={styles.tipRow}>
            <MaterialIcons name="wb-sunny" size={18} color={theme.warning} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>Use good lighting</Text>
          </View>
          <View style={styles.tipRow}>
            <MaterialIcons name="pan-tool" size={18} color={theme.primary} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>Hold steady while capturing</Text>
          </View>
          <View style={styles.tipRow}>
            <MaterialIcons name="restaurant" size={18} color={theme.success} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>Keep the plate in frame</Text>
          </View>

          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.primary }]} onPress={onClose}>
            <Text style={styles.closeText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeBtn: {
    marginTop: 8,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
