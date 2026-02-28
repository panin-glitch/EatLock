import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { supabase } from '../../services/supabaseClient';

type Stats = {
  meals_completed: number;
  focus_minutes: number;
  calories_logged: number;
  avg_distraction: number;
};

export default function MemberStatsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId, groupId } = route.params as { userId: string; groupId: string };

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();

      const statsPromise = supabase.rpc('get_group_member_stats', {
        p_group_id: groupId,
        p_user_id: userId,
      });

      const [{ data: profile }, { data: statData, error: statError }] = await Promise.all([
        profilePromise,
        statsPromise,
      ]);

      if (statError) throw statError;

      setName(profile?.username || 'User');
      setAvatarUrl(profile?.avatar_url || null);
      setStats(statData as Stats);
    } catch (error: any) {
      Alert.alert('Unavailable', error?.message ?? 'Could not load user stats.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [groupId, navigation, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const s = makeStyles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Member profile</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={s.loaderWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: theme.surface }]}>
                <MaterialIcons name="person" size={38} color={theme.textMuted} />
              </View>
            )}
            <Text style={s.name}>{name}</Text>
          </View>

          <View style={[s.card, { backgroundColor: theme.surface }]}> 
            <Text style={s.cardTitle}>Weekly stats</Text>
            <Row label="Meals completed" value={String(stats?.meals_completed ?? 0)} />
            <Row label="Focus minutes" value={String(Math.round(stats?.focus_minutes ?? 0))} />
            <Row label="Calories logged" value={String(stats?.calories_logged ?? 0)} />
            <Row
              label="Avg distraction"
              value={(stats?.avg_distraction ?? 0).toFixed(1)}
              noBorder
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  noBorder,
}: {
  label: string;
  value: string;
  noBorder?: boolean;
}) {
  return (
    <View style={[styles.row, noBorder && { borderBottomWidth: 0 }]}> 
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: { color: '#C9CCD4', fontSize: 14 },
  rowValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    avatarWrap: { alignItems: 'center', marginBottom: 16 },
    avatarImage: { width: 88, height: 88, borderRadius: 44 },
    avatarFallback: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
    name: { marginTop: 10, color: theme.text, fontWeight: '800', fontSize: 20 },
    card: { borderRadius: 16, padding: 14 },
    cardTitle: { color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 4 },
  });
