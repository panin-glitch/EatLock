import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useAuth } from '../state/AuthContext';
import { supabase } from '../services/supabaseClient';
import ScreenHeader from '../components/common/ScreenHeader';

type Group = {
  id: string;
  name: string;
  join_code: string;
  avatar_url: string | null;
  owner_id: string;
  role: 'member' | 'admin';
};

type GroupMember = {
  user_id: string;
  role: 'member' | 'admin';
  username: string;
  avatar_url: string | null;
  xp: number;
};

type StatsPayload = {
  meals_completed?: number;
  focus_minutes?: number;
  calories_logged?: number;
};

const XP_RANKS = [
  { min: 0, label: 'Bronze', color: '#CD7F32', icon: 'military-tech' as const },
  { min: 100, label: 'Silver', color: '#C0C0C0', icon: 'military-tech' as const },
  { min: 300, label: 'Gold', color: '#FFD700', icon: 'emoji-events' as const },
  { min: 600, label: 'Platinum', color: '#00CED1', icon: 'emoji-events' as const },
  { min: 1000, label: 'Diamond', color: '#B9F2FF', icon: 'diamond' as const },
];

function getRank(xp: number) {
  for (let i = XP_RANKS.length - 1; i >= 0; i -= 1) {
    if (xp >= XP_RANKS[i].min) return XP_RANKS[i];
  }
  return XP_RANKS[0];
}

function toXp(stats: StatsPayload) {
  const meals = Number(stats.meals_completed || 0);
  const focus = Number(stats.focus_minutes || 0);
  const calories = Number(stats.calories_logged || 0);
  return meals * 10 + Math.round(focus * 0.5) + Math.round(calories / 100);
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { sessions } = useAppState();
  const navigation = useNavigation<any>();

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; code: string }>({
    visible: false,
    message: '',
    code: '',
  });
  const lightHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const yourXp = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekSessions = sessions.filter((item) => new Date(item.startedAt) >= weekStart);
    const meals = weekSessions.filter((item) => item.status === 'VERIFIED' || item.status === 'PARTIAL').length;
    const focusMinutes = weekSessions.reduce((acc, item) => {
      if (!(item.status === 'VERIFIED' || item.status === 'PARTIAL')) return acc;
      if (!item.endedAt) return acc;
      return acc + Math.max(0, Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000));
    }, 0);
    const calories = weekSessions.reduce((acc, item) => acc + Math.max(0, Math.round(item.preNutrition?.estimated_calories || 0)), 0);

    return meals * 10 + Math.round(focusMinutes * 0.5) + Math.round(calories / 100);
  }, [sessions]);

  const loadGroups = useCallback(async () => {
    if (!user?.id) {
      setGroups([]);
      setLoadingGroups(false);
      return;
    }

    setLoadingGroups(true);
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, role, groups(id, name, join_code, avatar_url, owner_id)')
      .eq('user_id', user.id);

    if (error) {
      setLoadingGroups(false);
      return;
    }

    const parsed = ((data || []) as any[])
      .map((row) => {
        const groupData = Array.isArray(row.groups) ? row.groups[0] : row.groups;
        if (!groupData?.id) return null;
        return {
          id: groupData.id,
          name: groupData.name,
          join_code: groupData.join_code,
          avatar_url: groupData.avatar_url,
          owner_id: groupData.owner_id,
          role: row.role === 'admin' ? 'admin' : 'member',
        } as Group;
      })
      .filter(Boolean) as Group[];

    setGroups(parsed);
    setLoadingGroups(false);
  }, [user?.id]);

  const loadMembers = useCallback(
    async (group: Group) => {
      setLoadingMembers(true);

      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, profiles(username, avatar_url)')
        .eq('group_id', group.id);

      if (error) {
        setMembers([]);
        setLoadingMembers(false);
        return;
      }

      const baseMembers = ((data || []) as any[]).map((row) => ({
        user_id: row.user_id,
        role: row.role === 'admin' ? 'admin' : 'member',
        username: row.profiles?.username || 'User',
        avatar_url: row.profiles?.avatar_url || null,
      }));

      const resolved = await Promise.all(
        baseMembers.map(async (member) => {
          const { data: statsData } = await supabase.rpc('get_group_member_stats', {
            p_group_id: group.id,
            p_user_id: member.user_id,
          });
          const xp = toXp((statsData || {}) as StatsPayload);
          return { ...member, xp } as GroupMember;
        }),
      );

      resolved.sort((a, b) => b.xp - a.xp);
      setMembers(resolved);
      setLoadingMembers(false);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadGroups();
      setSnackbar((prev) => ({ ...prev, visible: false }));
    }, [loadGroups]),
  );

  const openGroup = useCallback(
    async (group: Group) => {
      setSelectedGroup(group);
      await loadMembers(group);
    },
    [loadMembers],
  );

  const handleCreateGroup = useCallback(async () => {
    if (!user?.id || !newGroupName.trim() || busy) return;
    setBusy(true);

    try {
      let created: any = null;
      let insertError: any = null;
      let code = '';

      for (let i = 0; i < 5; i += 1) {
        code = generateJoinCode();
        const result = await supabase
          .from('groups')
          .insert({
            owner_id: user.id,
            name: newGroupName.trim(),
            join_code: code,
          })
          .select('id, name, join_code, avatar_url, owner_id')
          .single();

        if (!result.error) {
          created = result.data;
          insertError = null;
          break;
        }
        insertError = result.error;
      }

      if (insertError || !created) {
        throw insertError || new Error('Could not create group.');
      }

      await supabase.from('group_members').insert({
        group_id: created.id,
        user_id: user.id,
        role: 'admin',
      });

      setShowCreate(false);
      setNewGroupName('');
      setSnackbar({
        visible: true,
        message: 'Group created',
        code: created.join_code,
      });

      await loadGroups();
    } catch {
      Alert.alert('Could not create group', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, loadGroups, newGroupName, user?.id]);

  const handleJoinGroup = useCallback(async () => {
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('join_group_by_code', {
      p_join_code: joinCode.trim().toUpperCase(),
    });

    if (error) {
      Alert.alert('Could not join', error.message || 'Please check the code and try again.');
      setBusy(false);
      return;
    }

    setJoinCode('');
    setShowJoin(false);
    await loadGroups();
    setBusy(false);
  }, [busy, joinCode, loadGroups]);

  const handleDeleteGroup = useCallback(async () => {
    if (!selectedGroup) return;

    Alert.alert('Delete group?', `This will permanently delete ${selectedGroup.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('groups').delete().eq('id', selectedGroup.id);
          if (!error) {
            setSelectedGroup(null);
            setMembers([]);
            await loadGroups();
          }
        },
      },
    ]);
  }, [loadGroups, selectedGroup]);

  const handleGroupImage = useCallback(async () => {
    if (!selectedGroup || busy) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to upload group image.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (picked.canceled || !picked.assets?.length) return;

    setBusy(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 600, height: 600 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
      );

      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const objectPath = `${selectedGroup.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage.from('group-avatars').upload(objectPath, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('group-avatars').getPublicUrl(objectPath);
      const avatarUrl = publicData.publicUrl;

      const { error: updateError } = await supabase.from('groups').update({ avatar_url: avatarUrl }).eq('id', selectedGroup.id);
      if (updateError) throw updateError;

      const updated = { ...selectedGroup, avatar_url: avatarUrl };
      setSelectedGroup(updated);
      setGroups((prev) => prev.map((group) => (group.id === updated.id ? updated : group)));
    } catch {
      Alert.alert('Upload failed', 'Could not update group image right now.');
    } finally {
      setBusy(false);
    }
  }, [busy, selectedGroup]);

  const styles = makeStyles(theme);

  if (selectedGroup) {
    const rank = getRank(yourXp);
    const isAdmin = selectedGroup.owner_id === user?.id || selectedGroup.role === 'admin';

    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <ScreenHeader
          title={selectedGroup.name}
          rightActions={[
            <TouchableOpacity key="back" style={styles.headerIconBtn} onPress={() => setSelectedGroup(null)}>
              <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
            </TouchableOpacity>,
          ]}
        />

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.groupTopCard}>
            <View style={styles.groupTopLeft}>
              {selectedGroup.avatar_url ? (
                <Image source={{ uri: selectedGroup.avatar_url }} style={styles.groupAvatar} />
              ) : (
                <View style={[styles.groupAvatar, { backgroundColor: theme.surface }]}> 
                  <MaterialIcons name="groups" size={24} color={theme.textMuted} />
                </View>
              )}
              <View>
                <Text style={styles.groupName}>{selectedGroup.name}</Text>
                <Text style={styles.groupCode}>Join code: {selectedGroup.join_code}</Text>
              </View>
            </View>
            <View style={styles.groupTopActions}>
              <TouchableOpacity style={styles.smallAction} onPress={() => {
                lightHaptic();
                Clipboard.setStringAsync(selectedGroup.join_code);
              }}>
                <MaterialIcons name="content-copy" size={16} color={theme.text} />
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity style={styles.smallAction} onPress={handleGroupImage}>
                  <MaterialIcons name="photo-camera" size={16} color={theme.text} />
                </TouchableOpacity>
              )}
              {isAdmin && (
                <TouchableOpacity style={styles.smallAction} onPress={handleDeleteGroup}>
                  <MaterialIcons name="delete-outline" size={16} color={theme.danger} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.xpCard, { backgroundColor: theme.primaryDim }]}> 
            <MaterialIcons name={rank.icon} size={24} color={rank.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.xpCardTitle}>{yourXp} XP this week</Text>
              <Text style={styles.xpCardSub}>Rank: {rank.label}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Leaderboard</Text>
            {loadingMembers ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : (
              members.map((member, index) => {
                const memberRank = getRank(member.xp);
                const isYou = member.user_id === user?.id;
                return (
                  <TouchableOpacity
                    key={member.user_id}
                    style={[styles.memberRow, isYou && { backgroundColor: theme.primaryDim }]}
                    onPress={() => {
                      lightHaptic();
                      navigation.navigate('MemberStats', { userId: member.user_id, groupId: selectedGroup.id });
                    }}
                  >
                    <Text style={styles.rankNum}>#{index + 1}</Text>
                    {member.avatar_url ? (
                      <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
                    ) : (
                      <View style={[styles.memberAvatar, { backgroundColor: theme.surface }]}> 
                        <MaterialIcons name="person" size={14} color={theme.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{member.username}{isYou ? ' (You)' : ''}</Text>
                      <View style={styles.rankBadge}>
                        <MaterialIcons name={memberRank.icon} size={12} color={memberRank.color} />
                        <Text style={[styles.rankLabel, { color: memberRank.color }]}>{memberRank.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.xpText}>{member.xp} XP</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <ScreenHeader title="Leaderboard" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.xpCard, { backgroundColor: theme.primaryDim }]}> 
          <MaterialIcons name={getRank(yourXp).icon} size={24} color={getRank(yourXp).color} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.xpCardTitle}>{yourXp} XP this week</Text>
            <Text style={styles.xpCardSub}>Rank: {getRank(yourXp).label}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            onPress={() => {
              lightHaptic();
              setShowCreate(true);
              setShowJoin(false);
            }}
          >
            <MaterialIcons name="add" size={18} color={theme.background} />
            <Text style={[styles.actionBtnText, { color: theme.background }]}>Create group</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.surface }]}
            onPress={() => {
              lightHaptic();
              setShowJoin(true);
              setShowCreate(false);
            }}
          >
            <MaterialIcons name="login" size={18} color={theme.text} />
            <Text style={[styles.actionBtnText, { color: theme.text }]}>Join with code</Text>
          </TouchableOpacity>
        </View>

        {showCreate && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New group</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group name"
              placeholderTextColor={theme.textMuted}
              maxLength={24}
            />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: theme.primary }]} onPress={() => {
              lightHaptic();
              handleCreateGroup();
            }}>
              <Text style={[styles.submitBtnText, { color: theme.background }]}>{busy ? 'Creating...' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {showJoin && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join a group</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="6-character join code"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: theme.primary }]} onPress={() => {
              lightHaptic();
              handleJoinGroup();
            }}>
              <Text style={[styles.submitBtnText, { color: theme.background }]}>{busy ? 'Joining...' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionLabel}>Your groups</Text>
        {loadingGroups ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="groups" size={36} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: theme.primary }]} onPress={() => {
              lightHaptic();
              setShowCreate(true);
            }}>
              <Text style={[styles.submitBtnText, { color: theme.background }]}>Create group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groups.map((group) => (
            <TouchableOpacity key={group.id} style={styles.groupRow} onPress={() => {
              lightHaptic();
              openGroup(group);
            }}>
              {group.avatar_url ? (
                <Image source={{ uri: group.avatar_url }} style={styles.groupRowAvatar} />
              ) : (
                <View style={[styles.groupRowAvatar, { backgroundColor: theme.surface }]}> 
                  <MaterialIcons name="groups" size={18} color={theme.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.groupRowTitle}>{group.name}</Text>
                <Text style={styles.groupRowSub}>Code: {group.join_code}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {snackbar.visible && (
        <View style={[styles.snackbar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.snackbarTitle}>{snackbar.message}</Text>
            <Text style={styles.snackbarCode}>Code: {snackbar.code}</Text>
          </View>
          <TouchableOpacity
            style={[styles.copyBtn, { backgroundColor: theme.primaryDim }]}
            onPress={() => {
              lightHaptic();
              Clipboard.setStringAsync(snackbar.code);
            }}
          >
            <MaterialIcons name="content-copy" size={16} color={theme.primary} />
            <Text style={[styles.copyBtnText, { color: theme.primary }]}>Copy</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 16, paddingBottom: 120 },
    headerIconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    xpCard: {
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    xpCardTitle: { color: theme.text, fontWeight: '800', fontSize: 16 },
    xpCardSub: { color: theme.textSecondary, marginTop: 2, fontSize: 12 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    actionBtnText: { fontWeight: '700', fontSize: 13 },
    card: {
      marginTop: 12,
      borderRadius: 16,
      padding: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardTitle: { color: theme.text, fontWeight: '700', fontSize: 15, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      backgroundColor: theme.background,
    },
    submitBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: { fontWeight: '700', fontSize: 14 },
    sectionLabel: { color: theme.textSecondary, fontWeight: '600', fontSize: 12, marginTop: 14, marginBottom: 8 },
    loaderWrap: { paddingVertical: 16, alignItems: 'center' },
    emptyCard: {
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 8,
    },
    emptyTitle: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 8 },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      padding: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
    },
    groupRowAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    groupRowTitle: { color: theme.text, fontWeight: '700', fontSize: 15 },
    groupRowSub: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
    groupTopCard: {
      marginTop: 12,
      borderRadius: 16,
      padding: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    groupTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    groupAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    groupName: { color: theme.text, fontWeight: '800', fontSize: 16 },
    groupCode: { color: theme.textSecondary, marginTop: 2, fontSize: 12 },
    groupTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    smallAction: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      gap: 10,
      borderRadius: 8,
      paddingHorizontal: 6,
    },
    rankNum: { color: theme.textSecondary, fontSize: 13, width: 32, fontWeight: '700' },
    memberAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    memberName: { color: theme.text, fontWeight: '700', fontSize: 14 },
    rankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    rankLabel: { fontSize: 11, fontWeight: '700' },
    xpText: { color: theme.primary, fontWeight: '800', fontSize: 13 },
    snackbar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 90,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    snackbarTitle: { color: theme.text, fontWeight: '800', fontSize: 13 },
    snackbarCode: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
    copyBtn: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    copyBtnText: { fontSize: 12, fontWeight: '700' },
  });
