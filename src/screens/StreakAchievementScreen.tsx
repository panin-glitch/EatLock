import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const ACHIEVEMENT_THEME = {
  background: '#FFFDF5',
  text: '#0F172A',
  muted: '#64748B',
  border: '#F6E7B0',
  surface: '#FEF3C7',
  primary: '#FACC15',
  accent: '#F97316',
};

export default function StreakAchievementScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const days = Math.max(1, Number(route.params?.days ?? 1));
  const styles = makeStyles(ACHIEVEMENT_THEME);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ACHIEVEMENT_THEME.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color="#94A3B8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Achievement</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.main}>
        <View style={styles.flameWrap}>
          <MaterialIcons name="local-fire-department" size={112} color="#F97316" />
        </View>
        <Text style={styles.bigNumber}>{days}</Text>
        <Text style={styles.subtitle}>day streak!</Text>

        <Text style={styles.note}>Incredible work! You're building a powerful habit.</Text>

        <View style={styles.weekRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => {
            const active = idx < Math.min(6, days);
            return (
              <View key={`${d}-${idx}`} style={styles.weekCell}>
                <Text style={styles.dayText}>{d}</Text>
                <View style={[styles.dot, active && styles.dotActive]}>
                  {active ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 54,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    main: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    flameWrap: {
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: '#FFE8D7',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    bigNumber: { fontSize: 96, fontWeight: '900', color: theme.text, lineHeight: 100 },
    subtitle: { fontSize: 30, fontWeight: '700', color: theme.text, marginTop: -8 },
    note: { marginTop: 16, color: theme.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
    weekRow: { flexDirection: 'row', gap: 8, marginTop: 28 },
    weekCell: { alignItems: 'center', gap: 6 },
    dayText: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
    dot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    dotActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    footer: { paddingHorizontal: 24, paddingBottom: 34 },
    continueBtn: {
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    continueText: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  });
