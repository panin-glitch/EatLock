import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../state/AuthContext';
import { supabase } from '../../services/supabaseClient';

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fallbackName = useMemo(() => user?.email?.split('@')[0] ?? 'User', [user?.email]);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url, username')
      .eq('user_id', user.id)
      .maybeSingle();

    setAvatarUrl(data?.avatar_url ?? null);
    const loadedUsername = data?.username ?? fallbackName;
    setUsername(loadedUsername);
    setInitialUsername(loadedUsername);
  }, [user?.id, fallbackName]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const uploadAvatar = useCallback(async () => {
    if (!user?.id) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to upload your avatar.');
      return;
    }

    const picker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (picker.canceled || !picker.assets?.length) return;

    setIsUploading(true);
    try {
      const source = picker.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        source.uri,
        [{ resize: { width: 600, height: 600 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
      );

      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const objectPath = `${user.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectPath, blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(objectPath);
      const nextUrl = publicData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, avatar_url: nextUrl, username: username.trim() || fallbackName });

      if (updateError) throw updateError;

      setAvatarUrl(nextUrl);
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message ?? 'Could not upload avatar right now.');
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, username, fallbackName]);

  const saveProfile = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const safeName = (username || '').trim() || fallbackName;
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, username: safeName, avatar_url: avatarUrl });
      if (error) throw error;
      setInitialUsername(safeName);
      setUsername(safeName);
      Alert.alert('Saved', 'Profile updated.');
    } catch (error: any) {
      Alert.alert('Save failed', error?.message ?? 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, username, fallbackName, avatarUrl]);

  const hasChanges = username.trim() !== initialUsername.trim();
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarBlock}>
          <View style={[styles.avatar, { backgroundColor: theme.surface }]}> 
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <MaterialIcons name="person" size={46} color={theme.textMuted} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.changeBtn, { backgroundColor: theme.primary }]}
            onPress={uploadAvatar}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <>
                <MaterialIcons name="photo-camera" size={16} color={theme.background} />
                <Text style={[styles.changeBtnText, { color: theme.background }]}>Change photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            value={username}
            onChangeText={setUsername}
            maxLength={24}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.emailLabel}>{user?.email ?? 'Anonymous account'}</Text>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: hasChanges ? theme.primary : theme.inputBg },
            ]}
            onPress={saveProfile}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Text style={[styles.saveBtnText, { color: hasChanges ? theme.background : theme.textMuted }]}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

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
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    avatarBlock: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
    avatar: {
      width: 110,
      height: 110,
      borderRadius: 55,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    changeBtn: {
      marginTop: 14,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    changeBtnText: { fontSize: 13, fontWeight: '700' },
    card: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
    },
    label: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 10,
    },
    emailLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 14 },
    saveBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 15, fontWeight: '700' },
  });
