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
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../state/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { saveUsername, isValidUsername } from '../../services/profileService';
import { signOut, updateEmail } from '../../services/authService';

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Email change state
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const isAnonymous = !user?.email;

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

  const saveProfile = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const result = await saveUsername(user.id, username);
      if (!result.ok) {
        Alert.alert('Save failed', result.message);
        return;
      }

      setInitialUsername(result.username);
      setUsername(result.username);
      Alert.alert('Saved', 'Profile updated.');
    } catch (error: any) {
      Alert.alert('Save failed', error?.message ?? 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, username]);

  const handleEmailChange = useCallback(async () => {
    const trimmed = emailInput.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setEmailSaving(true);
    try {
      await updateEmail(trimmed);
      Alert.alert('Check your inbox', 'A confirmation link has been sent to your new email address.');
      setEmailInput('');
    } catch (error: any) {
      Alert.alert('Email update failed', error?.message ?? 'Could not update email.');
    } finally {
      setEmailSaving(false);
    }
  }, [emailInput]);

  const hasChanges = username.trim() !== initialUsername.trim();
  const showUsernameHint = username.trim().length > 0 && !isValidUsername(username);
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
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            value={username}
            onChangeText={setUsername}
            maxLength={20}
            placeholder="Username"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {showUsernameHint ? (
            <Text style={[styles.helperText, { color: theme.warning }]}>
              3–20 chars, letters/numbers/underscore only
            </Text>
          ) : null}

          <Text style={styles.emailLabel}>{user?.email ?? 'Anonymous account'}</Text>

          <Text style={[styles.label, { marginTop: 4 }]}>{isAnonymous ? 'Add email' : 'Change email'}</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder={isAnonymous ? 'your@email.com' : 'New email address'}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={[
              styles.emailBtn,
              { backgroundColor: emailInput.trim() ? theme.primary : theme.inputBg },
            ]}
            onPress={handleEmailChange}
            disabled={!emailInput.trim() || emailSaving}
          >
            {emailSaving ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Text style={[styles.emailBtnText, { color: emailInput.trim() ? theme.background : theme.textMuted }]}>
                {isAnonymous ? 'Add email' : 'Change email'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  onPress: () => signOut(),
                },
              ]);
            }}
          >
            <MaterialIcons name="logout" size={18} color={theme.textSecondary} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: hasChanges ? theme.primary : theme.inputBg },
            ]}
            onPress={saveProfile}
            disabled={!hasChanges || isSaving || !isValidUsername(username)}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Text style={[styles.saveBtnText, { color: hasChanges && isValidUsername(username) ? theme.background : theme.textMuted }]}>Save changes</Text>
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
    helperText: { fontSize: 12, marginBottom: 10 },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      paddingVertical: 11,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    signOutText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
    emailBtn: {
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      marginBottom: 10,
    },
    emailBtnText: { fontSize: 14, fontWeight: '700' },
    saveBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 15, fontWeight: '700' },
  });
