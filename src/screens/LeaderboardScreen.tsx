import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import ScreenHeader from '../components/common/ScreenHeader';

//  Types 
type GroupMember = { name: string; xp: number; isYou?: boolean };
type Group = { id: string; name: string; code: string; members: GroupMember[] };

//  XP ranks (Duolingo-style) 
const XP_RANKS = [
  { min: 0, label: 'Bronze', color: '#CD7F32', icon: 'military-tech' as const },
  { min: 100, label: 'Silver', color: '#C0C0C0', icon: 'military-tech' as const },
  { min: 300, label: 'Gold', color: '#FFD700', icon: 'emoji-events' as const },
  { min: 600, label: 'Platinum', color: '#00CED1', icon: 'emoji-events' as const },
  { min: 1000, label: 'Diamond', color: '#B9F2FF', icon: 'diamond' as const },
];

function getRank(xp: number) {
  for (let i = XP_RANKS.length - 1; i >= 0; i--) {
    if (xp >= XP_RANKS[i].min) return XP_RANKS[i];
  }
  return XP_RANKS[0];
}

//  Weekly objectives 
type Objective = { id: string; title: string; goal: number; progress: number };

const OBJECTIVE_CATALOG = [
  { id: 'obj-1', title: 'Complete 10 meals this week', goal: 10 },
  { id: 'obj-2', title: 'Log 5 meals with calories', goal: 5 },
  { id: 'obj-3', title: '3 low-distraction meals (1-2)', goal: 3 },
  { id: 'obj-4', title: 'Finish 6 meals on first try', goal: 6 },
  { id: 'obj-5', title: 'Track 7 meal sessions', goal: 7 },
];

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

//  Component 
export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const { sessions } = useAppState();
  const [groups, setGroups] = useState<Group[]>([
    {
      id: '1',
      name: 'Tad Squad',
      code: 'TAD42X',
      members: [
        { name: 'Ava', xp: 340 },
        { name: 'Leo', xp: 210 },
        { name: 'Mina', xp: 120 },
      ],
    },
  ]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const thisWeekSessions = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return sessions.filter((s) => new Date(s.startedAt) >= start);
  }, [sessions]);

  const yourXp = useMemo(() => {
    const completedMeals = thisWeekSessions.filter(
      (s) => s.status === 'VERIFIED' || s.status === 'PARTIAL',
    ).length;
    const lowDistraction = thisWeekSessions.filter((s) => (s.distractionRating ?? 5) <= 2).length;
    const caloriesLogged = thisWeekSessions.filter(
      (s) => (s.preNutrition?.estimated_calories ?? 0) > 0,
    ).length;
    return completedMeals * 10 + lowDistraction * 5 + caloriesLogged * 3;
  }, [thisWeekSessions]);

  const weeklyObjectives: Objective[] = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekKey = Math.floor(dayOfYear / 7);
    const offset = weekKey % OBJECTIVE_CATALOG.length;
    const picked = [
      OBJECTIVE_CATALOG[offset % OBJECTIVE_CATALOG.length],
      OBJECTIVE_CATALOG[(offset + 1) % OBJECTIVE_CATALOG.length],
      OBJECTIVE_CATALOG[(offset + 2) % OBJECTIVE_CATALOG.length],
    ];
    const completedMeals = thisWeekSessions.filter(
      (s) => s.status === 'VERIFIED' || s.status === 'PARTIAL',
    ).length;
    const withCalories = thisWeekSessions.filter(
      (s) => (s.preNutrition?.estimated_calories ?? 0) > 0,
    ).length;
    const lowDistraction = thisWeekSessions.filter((s) => (s.distractionRating ?? 5) <= 2).length;
    const firstTry = thisWeekSessions.filter((s) => s.status === 'VERIFIED').length;
    return picked.map((item) => {
      let progress = completedMeals;
      if (item.id === 'obj-2') progress = withCalories;
      if (item.id === 'obj-3') progress = lowDistraction;
      if (item.id === 'obj-4') progress = firstTry;
      return { ...item, progress: Math.min(progress, item.goal) };
    });
  }, [thisWeekSessions]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const handleCreateGroup = useCallback(() => {
    if (!newGroupName.trim()) return;
    const code = generateCode();
    const newGroup: Group = {
      id: String(Date.now()),
      name: newGroupName.trim(),
      code,
      members: [],
    };
    setGroups((prev) => [...prev, newGroup]);
    Alert.alert('Group created!', `Share code: ${code}`);
    setNewGroupName('');
    setShowCreate(false);
  }, [newGroupName]);

  const handleJoinGroup = useCallback(() => {
    const upper = joinCode.trim().toUpperCase();
    if (upper.length !== 6) {
      Alert.alert('Invalid code', 'Enter a 6-character group code.');
      return;
    }
    const match = groups.find((g) => g.code === upper);
    if (!match) {
      Alert.alert('Not found', 'No group matches that code.');
      return;
    }
    Alert.alert('Already in group', `You are already a member of ${match.name}`);
    setJoinCode('');
    setShowJoin(false);
  }, [joinCode, groups]);

  const s = makeStyles(theme);

  // Inside a group view
  if (selectedGroup) {
    const allMembers: GroupMember[] = [
      { name: 'You', xp: yourXp, isYou: true },
      ...selectedGroup.members,
    ].sort((a, b) => b.xp - a.xp);

    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <ScreenHeader
          title={selectedGroup.name}
          rightActions={[
            <TouchableOpacity key="back" style={s.headerIconBtn} onPress={() => setSelectedGroupId(null)}>
              <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
            </TouchableOpacity>,
          ]}
        />
        <ScrollView contentContainerStyle={s.content}>
          <View style={[s.codePill, { backgroundColor: theme.surface }]}>
            <MaterialIcons name="vpn-key" size={16} color={theme.primary} />
            <Text style={[s.codeText, { color: theme.text }]}>
              Invite code: {selectedGroup.code}
            </Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Rankings</Text>
            {allMembers.map((m, i) => {
              const rank = getRank(m.xp);
              return (
                <View
                  key={m.name + i}
                  style={[s.memberRow, m.isYou && { backgroundColor: 'rgba(52,199,89,0.08)' }]}
                >
                  <Text style={[s.rankNum, { color: i < 3 ? theme.primary : theme.textSecondary }]}>
                    #{i + 1}
                  </Text>
                  <View style={s.memberInfo}>
                    <Text style={[s.memberName, { color: theme.text }]}>
                      {m.name} {m.isYou ? '(You)' : ''}
                    </Text>
                    <View style={s.rankBadge}>
                      <MaterialIcons name={rank.icon} size={13} color={rank.color} />
                      <Text style={[s.rankLabel, { color: rank.color }]}>{rank.label}</Text>
                    </View>
                  </View>
                  <Text style={[s.xpText, { color: theme.primary }]}>{m.xp} XP</Text>
                </View>
              );
            })}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Weekly objectives</Text>
            {weeklyObjectives.map((obj) => {
              const ratio = Math.min(obj.progress / obj.goal, 1);
              return (
                <View key={obj.id} style={s.objectiveItem}>
                  <View style={s.objectiveHeader}>
                    <Text style={s.objectiveTitle}>{obj.title}</Text>
                    <Text style={s.objectiveCount}>
                      {obj.progress}/{obj.goal}
                    </Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View
                      style={[s.progressFill, { width: `${ratio * 100}%`, backgroundColor: theme.primary }]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // Group list view
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <ScreenHeader title="Leaderboard" />

      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.xpCard, { backgroundColor: theme.primaryDim }]}>
          <MaterialIcons name={getRank(yourXp).icon} size={28} color={getRank(yourXp).color} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[s.xpCardTitle, { color: theme.text }]}>
              {yourXp} XP this week
            </Text>
            <Text style={[s.xpCardSub, { color: theme.textSecondary }]}>
              Rank: {getRank(yourXp).label}
            </Text>
          </View>
        </View>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: theme.primary }]}
            onPress={() => { setShowCreate(true); setShowJoin(false); }}
          >
            <MaterialIcons name="add" size={18} color={theme.background} />
            <Text style={[s.actionBtnText, { color: theme.background }]}>Create group</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: theme.surface }]}
            onPress={() => { setShowJoin(true); setShowCreate(false); }}
          >
            <MaterialIcons name="login" size={18} color={theme.text} />
            <Text style={[s.actionBtnText, { color: theme.text }]}>Join with code</Text>
          </TouchableOpacity>
        </View>

        {showCreate && (
          <View style={s.card}>
            <Text style={s.cardTitle}>New group</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Group name"
              placeholderTextColor={theme.textMuted}
              value={newGroupName}
              onChangeText={setNewGroupName}
              maxLength={24}
            />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: theme.primary }]}
              onPress={handleCreateGroup}
            >
              <Text style={[s.submitBtnText, { color: theme.background }]}>Create</Text>
            </TouchableOpacity>
          </View>
        )}

        {showJoin && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Join a group</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="6-character code"
              placeholderTextColor={theme.textMuted}
              value={joinCode}
              onChangeText={setJoinCode}
              maxLength={6}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: theme.primary }]}
              onPress={handleJoinGroup}
            >
              <Text style={[s.submitBtnText, { color: theme.background }]}>Join</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>Your groups</Text>
        {groups.length === 0 ? (
          <View style={s.emptyCard}>
            <MaterialIcons name="groups" size={36} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>
              Create or join a group to compete with friends
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[s.groupRow, { backgroundColor: theme.surface }]}
              onPress={() => setSelectedGroupId(g.id)}
            >
              <View style={[s.groupAvatar, { backgroundColor: theme.primaryDim }]}>
                <Text style={[s.groupAvatarText, { color: theme.primary }]}>
                  {g.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.groupName, { color: theme.text }]}>{g.name}</Text>
                <Text style={[s.groupMeta, { color: theme.textSecondary }]}>
                  {g.members.length + 1} members
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          ))
        )}

        <View style={[s.card, { marginTop: 16 }]}>
          <Text style={s.cardTitle}>Weekly objectives</Text>
          {weeklyObjectives.map((obj) => {
            const ratio = Math.min(obj.progress / obj.goal, 1);
            return (
              <View key={obj.id} style={s.objectiveItem}>
                <View style={s.objectiveHeader}>
                  <Text style={s.objectiveTitle}>{obj.title}</Text>
                  <Text style={s.objectiveCount}>
                    {obj.progress}/{obj.goal}
                  </Text>
                </View>
                <View style={s.progressTrack}>
                  <View
                    style={[s.progressFill, { width: `${ratio * 100}%`, backgroundColor: theme.primary }]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, paddingBottom: 32, gap: 12 },
    headerIconBtn: {
      width: 32, height: 32, borderRadius: 16,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: theme.surface,
    },
    xpCard: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 16, padding: 16, borderWidth: 1,
      borderColor: 'rgba(52,199,89,0.2)',
    },
    xpCardTitle: { fontSize: 18, fontWeight: '800' },
    xpCardSub: { fontSize: 13, marginTop: 2 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12,
    },
    actionBtnText: { fontWeight: '700', fontSize: 14 },
    card: { backgroundColor: theme.surface, borderRadius: 16, padding: 14 },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 15, marginBottom: 10,
    },
    submitBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    submitBtnText: { fontWeight: '700', fontSize: 15 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', marginTop: 4,
      textTransform: 'uppercase', letterSpacing: 1,
    },
    groupRow: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 16, padding: 14, gap: 12,
    },
    groupAvatar: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
    },
    groupAvatarText: { fontSize: 18, fontWeight: '800' },
    groupName: { fontSize: 15, fontWeight: '700' },
    groupMeta: { fontSize: 12, marginTop: 2 },
    emptyCard: { alignItems: 'center', paddingVertical: 30 },
    emptyText: { fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 220 },
    codePill: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    codeText: { fontSize: 13, fontWeight: '600' },
    memberRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, paddingHorizontal: 8,
      borderRadius: 10, marginBottom: 4,
    },
    rankNum: { width: 32, fontWeight: '800', fontSize: 15 },
    memberInfo: { flex: 1 },
    memberName: { fontWeight: '700', fontSize: 14 },
    rankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    rankLabel: { fontSize: 11, fontWeight: '700' },
    xpText: { fontWeight: '800', fontSize: 15 },
    objectiveItem: { marginBottom: 12 },
    objectiveHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    objectiveTitle: { color: theme.text, fontSize: 13, flex: 1, marginRight: 8 },
    objectiveCount: { color: theme.textSecondary, fontWeight: '700' },
    progressTrack: { height: 8, borderRadius: 8, backgroundColor: theme.card, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 8 },
  });
