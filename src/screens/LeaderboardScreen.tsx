import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
  meals_completed: number;
  focus_minutes: number;
  calories_logged: number;
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
  const navigation = useNavigation<any>();

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalTab, setGroupModalTab] = useState<'create' | 'join'>('create');
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
          const stats = (statsData || {}) as StatsPayload;
          const meals_completed = Number(stats.meals_completed || 0);
          const focus_minutes = Math.round(Number(stats.focus_minutes || 0));
          const calories_logged = Number(stats.calories_logged || 0);
          const xp = toXp(stats);
          return { ...member, xp, meals_completed, focus_minutes, calories_logged } as GroupMember;
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

      const { error: memberInsertError } = await supabase.from('group_members').insert({
        group_id: created.id,
        user_id: user.id,
        role: 'admin',
      });

      if (memberInsertError) {
        await supabase.from('groups').delete().eq('id', created.id).eq('owner_id', user.id);
        throw memberInsertError;
      }

      setShowGroupModal(false);
      setGroupModalTab('create');
      setNewGroupName('');
      setJoinCode('');
      setSnackbar({
        visible: true,
        message: 'Group created',
        code: created.join_code,
      });

      await loadGroups();
    } catch {
      setSnackbar({
        visible: true,
        message: 'Could not create group',
        code: '',
      });
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
    setShowGroupModal(false);
    setGroupModalTab('create');
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
    const isAdmin = selectedGroup.owner_id === user?.id || selectedGroup.role === 'admin';
    const yourMember = members.find((member) => member.user_id === user?.id) || null;
    const yourXp = yourMember?.xp ?? 0;
    const rank = getRank(yourXp);
    const totalMeals = members.reduce((sum, member) => sum + member.meals_completed, 0);
    const totalFocusMinutes = members.reduce((sum, member) => sum + member.focus_minutes, 0);
    const totalCalories = members.reduce((sum, member) => sum + member.calories_logged, 0);
    const hasAnyActivity = members.some(
      (member) => member.xp > 0 || member.meals_completed > 0 || member.focus_minutes > 0 || member.calories_logged > 0,
    );
    const objectives = [
      {
        label: 'Group meals',
        value: totalMeals,
        target: 21,
        suffix: '',
      },
      {
        label: 'Focus minutes',
        value: totalFocusMinutes,
        target: 300,
        suffix: 'm',
      },
      {
        label: 'Calories logged',
        value: totalCalories,
        target: 7000,
        suffix: '',
      },
    ];

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
            ) : !hasAnyActivity ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No activity yet</Text>
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Weekly objectives</Text>
            {objectives.map((objective) => {
              const ratio = Math.min(objective.value / objective.target, 1);
              return (
                <View key={objective.label} style={styles.objectiveRow}>
                  <View style={styles.objectiveHeader}>
                    <Text style={styles.objectiveLabel}>{objective.label}</Text>
                    <Text style={styles.objectiveValue}>
                      {objective.value}
                      {objective.suffix}/{objective.target}
                    </Text>
                  </View>
                  <View style={styles.objectiveTrack}>
                    <View style={[styles.objectiveFill, { width: `${ratio * 100}%`, backgroundColor: theme.primary }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <ScreenHeader
        title="Leaderboard"
        rightActions={[
          <TouchableOpacity
            key="add-group"
            style={styles.headerIconBtn}
            onPress={() => {
              lightHaptic();
              setGroupModalTab('create');
              setShowGroupModal(true);
            }}
          >
            <MaterialIcons name="add" size={20} color={theme.textSecondary} />
          </TouchableOpacity>,
        ]}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {loadingGroups ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="groups" size={36} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to create or join a group.</Text>
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

      <Modal
        visible={showGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowGroupModal(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
            <View style={styles.modalTabs}>
              <TouchableOpacity
                style={[styles.modalTab, groupModalTab === 'create' && { backgroundColor: theme.primaryDim }]}
                onPress={() => setGroupModalTab('create')}
              >
                <Text style={[styles.modalTabText, { color: groupModalTab === 'create' ? theme.primary : theme.textSecondary }]}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, groupModalTab === 'join' && { backgroundColor: theme.primaryDim }]}
                onPress={() => setGroupModalTab('join')}
              >
                <Text style={[styles.modalTabText, { color: groupModalTab === 'join' ? theme.primary : theme.textSecondary }]}>Join</Text>
              </TouchableOpacity>
            </View>

            {groupModalTab === 'create' ? (
              <>
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
                  <Text style={[styles.submitBtnText, { color: theme.background }]}>{busy ? 'Creating...' : 'Create group'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
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
                  <Text style={[styles.submitBtnText, { color: theme.background }]}>{busy ? 'Joining...' : 'Join group'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {snackbar.visible && (
        <View style={[styles.snackbar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.snackbarTitle}>{snackbar.message}</Text>
            {snackbar.code ? <Text style={styles.snackbarCode}>Code: {snackbar.code}</Text> : null}
          </View>
          {snackbar.code ? (
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
          ) : null}
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
      marginTop: 12,
    },
    emptyTitle: { color: theme.text, fontWeight: '700', fontSize: 16 },
    emptySubtitle: { color: theme.textSecondary, fontSize: 13 },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      padding: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 12,
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
    emptyInline: {
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyInlineText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    objectiveRow: { marginBottom: 12 },
    objectiveHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    objectiveLabel: { color: theme.text, fontWeight: '600', fontSize: 13 },
    objectiveValue: { color: theme.textSecondary, fontWeight: '700', fontSize: 12 },
    objectiveTrack: {
      height: 8,
      borderRadius: 8,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    objectiveFill: { height: 8, borderRadius: 8 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
    },
    modalTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    modalTab: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: theme.surface,
    },
    modalTabText: {
      fontSize: 13,
      fontWeight: '700',
    },
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
