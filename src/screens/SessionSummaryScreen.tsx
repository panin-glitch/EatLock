import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useNavigation } from '@react-navigation/native';
import { formatDuration } from '../utils/helpers';

export default function SessionSummaryScreen() {
  const { theme } = useTheme();
  const { sessions, updateCompletedSessionFeedback } = useAppState();
  const navigation = useNavigation<any>();

  // Grab the most recently completed session
  const session = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  const duration = session
    ? new Date(session.endedAt ?? session.startedAt).getTime() - new Date(session.startedAt).getTime()
    : 0;

  const verdict = session?.verification?.compareResult?.verdict;
  const roast = session?.roastMessage;
  const foodChangeScore = session?.verification?.compareResult?.foodChangeScore;

  const verdictIcon =
    verdict === 'EATEN' ? 'emoji-events' :
    verdict === 'PARTIAL' ? 'pie-chart' :
    verdict === 'UNCHANGED' ? 'sentiment-dissatisfied' :
    'help-outline';

  const verdictColor =
    verdict === 'EATEN' ? theme.success :
    verdict === 'PARTIAL' ? theme.warning :
    verdict === 'UNCHANGED' ? theme.danger :
    theme.textSecondary;

  const verdictLabel =
    verdict === 'EATEN' ? 'Meal Finished!' :
    verdict === 'PARTIAL' ? 'Partially Eaten' :
    verdict === 'UNCHANGED' ? 'Not Eaten' :
    session?.status === 'INCOMPLETE' ? 'Session Ended' :
    'Meal Complete';

  const statusBadgeText =
    session?.status === 'VERIFIED' ? 'Verified' :
    session?.status === 'PARTIAL' ? 'Partial' :
    session?.status === 'FAILED' ? 'Failed' :
    session?.status === 'INCOMPLETE' ? 'Incomplete' :
    'Done';

  const [distractionRating, setDistractionRating] = useState<number>(session?.distractionRating ?? 0);
  const [distractionMinutes, setDistractionMinutes] = useState<number>(session?.estimatedDistractionMinutes ?? 0);

  const minuteOptions = useMemo(() => [0, 5, 10, 15, 20], []);

  const handleDone = async () => {
    if (session && distractionRating > 0) {
      await updateCompletedSessionFeedback(session.id, distractionRating, distractionMinutes);
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  const s = makeStyles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Verdict icon */}
        <MaterialIcons name={verdictIcon as any} size={72} color={verdictColor} />
        <Text style={[s.title, { color: verdictColor }]}>{verdictLabel}</Text>

        {/* Status badge */}
        <View style={[s.badge, { backgroundColor: verdictColor + '22' }]}>
          <Text style={[s.badgeText, { color: verdictColor }]}>{statusBadgeText}</Text>
          {foodChangeScore != null && (
            <Text style={[s.badgeText, { color: verdictColor }]}> — {Math.round(foodChangeScore * 100)}% eaten</Text>
          )}
        </View>

        {/* Roast / praise */}
        {roast ? (
          <View style={[s.roastCard, { borderColor: verdictColor + '44' }]}>
            <Text style={s.roastText}>"{roast}"</Text>
          </View>
        ) : null}

        {/* Before / After thumbnails */}
        {(session?.preImageUri || session?.postImageUri) && (
          <View style={s.photoRow}>
            {session?.preImageUri && (
              <View style={s.photoWrap}>
                <Text style={s.photoLabel}>Before</Text>
                <Image source={{ uri: session.preImageUri }} style={s.photoThumb} />
              </View>
            )}
            {session?.postImageUri && (
              <View style={s.photoWrap}>
                <Text style={s.photoLabel}>After</Text>
                <Image source={{ uri: session.postImageUri }} style={s.photoThumb} />
              </View>
            )}
          </View>
        )}

        {/* Stats */}
        <View style={s.statCard}>
          <View style={s.statRow}>
            <MaterialIcons name="timer" size={22} color={theme.primary} />
            <View>
              <Text style={s.statLabel}>Duration</Text>
              <Text style={s.statValue}>{formatDuration(duration)}</Text>
            </View>
          </View>
        </View>

        <View style={s.statCard}>
          <View style={s.statRow}>
            <MaterialIcons name="lock" size={22} color={theme.primary} />
            <View>
              <Text style={s.statLabel}>Apps Blocked</Text>
              <Text style={s.statValue}>{session?.blockedAppsAtTime?.length ?? 0}</Text>
            </View>
          </View>
        </View>

        <View style={s.statCard}>
          <View style={s.statRow}>
            <MaterialIcons name="restaurant" size={22} color={theme.primary} />
            <View>
              <Text style={s.statLabel}>Meal Type</Text>
              <Text style={s.statValue}>{session?.mealType ?? '—'}</Text>
            </View>
          </View>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Distraction Rating</Text>
          <View style={s.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setDistractionRating(n)}>
                <MaterialIcons
                  name={n <= distractionRating ? 'star' : 'star-border'}
                  size={26}
                  color={n <= distractionRating ? '#FF9500' : theme.textMuted}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.statLabel, { marginTop: 12 }]}>Estimated distraction time</Text>
          <View style={s.minutesRow}>
            {minuteOptions.map((m) => {
              const selectedMinutes = distractionMinutes === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDistractionMinutes(m)}
                  style={[
                    s.minuteChip,
                    {
                      backgroundColor: selectedMinutes ? theme.primary + '22' : theme.surfaceElevated,
                      borderColor: selectedMinutes ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedMinutes ? theme.primary : theme.textSecondary,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {m} min
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {session?.overrideUsed && (
          <View style={[s.overrideBadge, { backgroundColor: theme.warning + '22' }]}>
            <MaterialIcons name="warning" size={16} color={theme.warning} />
            <Text style={[s.overrideText, { color: theme.warning }]}>
              Verification was skipped
            </Text>
          </View>
        )}

        {/* Done button */}
        <TouchableOpacity style={[s.doneBtn, { backgroundColor: theme.primary }]} onPress={handleDone}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingTop: 60,
      paddingBottom: 40,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      marginTop: 16,
      marginBottom: 8,
    },
    badge: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 16,
      marginBottom: 20,
    },
    badgeText: { fontSize: 14, fontWeight: '600' },
    roastCard: {
      width: '100%',
      backgroundColor: c.primaryDim,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      alignItems: 'center',
      borderWidth: 1,
    },
    roastText: {
      color: c.text,
      fontSize: 15,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 22,
    },
    photoRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
      width: '100%',
      justifyContent: 'center',
    },
    photoWrap: { alignItems: 'center' },
    photoLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 4 },
    photoThumb: { width: 100, height: 100, borderRadius: 12 },
    statCard: {
      width: '100%',
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    statRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    ratingRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    minutesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    minuteChip: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    statLabel: { fontSize: 13, color: c.textSecondary },
    statValue: { fontSize: 20, fontWeight: '700', color: c.text },
    overrideBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      marginBottom: 20,
    },
    overrideText: { fontSize: 13, fontWeight: '600' },
    doneBtn: {
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 56,
      marginTop: 12,
    },
    doneBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  });
