import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../state/AuthContext';
import { useAppState } from '../../state/AppStateContext';
import { useRevenueCat } from '../../state/RevenueCatContext';
import { saveUsername, isValidUsername } from '../../services/profileService';
import { deleteCurrentAccountRemote, signOut, updateEmail } from '../../services/authService';
import { hasTadLockProEntitlement } from '../../services/revenueCat';
import { getDisplayName } from '../../utils/displayName';

export default function ProfileScreen() {
  const { theme, themeName } = useTheme();
  const { user, profile, displayName, refreshProfile } = useAuth();
  const { clearAll } = useAppState();
  const {
    isSupported: subscriptionsSupported,
    isLoading: subscriptionsLoading,
    isPro,
    restorePurchases,
    presentCustomerCenter,
    presentPaywall,
  } = useRevenueCat();
  const navigation = useNavigation<any>();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Email change state
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [subscriptionAction, setSubscriptionAction] = useState<'paywall' | 'restore' | 'manage' | null>(null);
  const isAnonymous = !user?.email;

  const loadProfile = useCallback(async (): Promise<string | null> => {
    if (!user?.id) return null;
    const nextProfile = await refreshProfile();
    setAvatarUrl(nextProfile?.avatar_url ?? null);
    const loadedUsername = getDisplayName(user, nextProfile ?? profile);
    setUsername(loadedUsername);
    setInitialUsername(loadedUsername);
    return loadedUsername;
  }, [profile, refreshProfile, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const saveProfile = useCallback(async () => {
    if (!user?.id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const result = await saveUsername(user.id, username);
      if (!result.ok) {
        setSaveError(result.message);
        return;
      }

      // Optional: refresh cached profile, but don't fail the save if read-back is slow/blocked
      await refreshProfile().catch(() => undefined);

      setInitialUsername(result.username);
      setUsername(result.username);
      setSaveError(null);
    } catch (error: any) {
      setSaveError(error?.message ?? 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  }, [refreshProfile, user?.id, username]);

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

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        onPress: async () => {
          try {
            await signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          } catch (error: any) {
            Alert.alert('Sign out failed', error?.message ?? 'Could not sign out.');
          }
        },
      },
    ]);
  }, [navigation]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and cloud data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCurrentAccountRemote();
              await clearAll();
              await signOut('local').catch(() => undefined);
              Alert.alert('Account deleted', 'Your account and cloud data were deleted.');
              navigation.reset({
                index: 0,
                routes: [{ name: 'Auth' }],
              });
            } catch (error: any) {
              Alert.alert('Delete failed', error?.message ?? 'Could not delete your account.');
            }
          },
        },
      ],
    );
  }, [clearAll, navigation]);

  const routeToAuth = useCallback(() => {
    navigation.navigate('Auth');
  }, [navigation]);

  const handleUpgradeToPro = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'TadLock Pro subscriptions are currently available on iOS development builds.');
      return;
    }

    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before purchasing TadLock Pro.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }

    setSubscriptionAction('paywall');
    try {
      const result = await presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED) {
        Alert.alert('Welcome to TadLock Pro', 'Your subscription is active.');
      } else if (result === PAYWALL_RESULT.RESTORED) {
        Alert.alert('Purchases restored', 'Your TadLock Pro access has been restored.');
      }
    } catch (error: any) {
      Alert.alert('Subscription unavailable', error?.message ?? 'Could not open the TadLock Pro paywall.');
    } finally {
      setSubscriptionAction(null);
    }
  }, [isAnonymous, navigation, presentPaywall, routeToAuth, subscriptionsSupported]);

  const handleRestorePurchases = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'Purchase restoration is currently available on iOS development builds.');
      return;
    }

    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before restoring purchases.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }

    setSubscriptionAction('restore');
    try {
      const restored = await restorePurchases();
      if (hasTadLockProEntitlement(restored)) {
        Alert.alert('TadLock Pro restored', 'Your subscription is active on this account.');
      } else {
        Alert.alert('No purchases found', 'No TadLock Pro purchases were found for this App Store account.');
      }
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message ?? 'Could not restore purchases.');
    } finally {
      setSubscriptionAction(null);
    }
  }, [isAnonymous, restorePurchases, routeToAuth, subscriptionsSupported]);

  const handleManageSubscription = useCallback(async () => {
    if (!subscriptionsSupported) {
      Alert.alert('iOS only for now', 'Subscription management is currently available on iOS development builds.');
      return;
    }

    if (isAnonymous) {
      Alert.alert('Create account required', 'Sign in or create a TadLock account before managing subscriptions.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: routeToAuth },
      ]);
      return;
    }

    setSubscriptionAction('manage');
    try {
      await presentCustomerCenter();
    } catch (error: any) {
      Alert.alert(
        'Customer Center unavailable',
        error?.message ?? 'Open App Store subscriptions to manage your plan, or restore purchases here.',
      );
    } finally {
      setSubscriptionAction(null);
    }
  }, [isAnonymous, presentCustomerCenter, routeToAuth, subscriptionsSupported]);

  const hasChanges = username.trim() !== initialUsername.trim();
  const showUsernameHint = username.trim().length > 0 && !isValidUsername(username);
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />
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
              3-20 chars, letters/numbers/underscore only
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
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Text style={[styles.emailBtnText, { color: emailInput.trim() ? theme.onPrimary : theme.textMuted }]}>
                {isAnonymous ? 'Add email' : 'Change email'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={[styles.subscriptionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.subscriptionHeader}>
              <Text style={styles.subscriptionTitle}>TadLock Pro</Text>
              <View
                style={[
                  styles.subscriptionBadge,
                  { backgroundColor: isPro ? '#DCFCE7' : subscriptionsSupported ? '#FEF3C7' : '#E2E8F0' },
                ]}
              >
                <Text
                  style={[
                    styles.subscriptionBadgeText,
                    { color: isPro ? '#166534' : subscriptionsSupported ? '#92400E' : theme.textSecondary },
                  ]}
                >
                  {isPro ? 'Active' : subscriptionsSupported ? 'Inactive' : 'iOS only'}
                </Text>
              </View>
            </View>
            <Text style={styles.subscriptionCopy}>
              {isAnonymous
                ? 'Create an account before purchasing or restoring TadLock Pro.'
                : isPro
                  ? 'Manage your active TadLock Pro subscription.'
                  : 'Unlock personalized insights and advanced tracking.'}
            </Text>

            <TouchableOpacity
              style={[styles.proBtn, { backgroundColor: theme.primary }]}
              onPress={isPro ? handleManageSubscription : handleUpgradeToPro}
              disabled={subscriptionAction === 'paywall' || subscriptionAction === 'manage' || subscriptionsLoading}
            >
              {subscriptionAction === 'paywall' || subscriptionAction === 'manage' || subscriptionsLoading ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <Text style={styles.proBtnText}>
                  {isAnonymous ? 'Create account to upgrade' : isPro ? 'Manage subscription' : 'Upgrade to Pro'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondarySubBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
              onPress={handleRestorePurchases}
              disabled={subscriptionAction === 'restore'}
            >
              {subscriptionAction === 'restore' ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Text style={[styles.secondarySubBtnText, { color: theme.text }]}>Restore purchases</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
          >
            <MaterialIcons name="logout" size={18} color={theme.textSecondary} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteAccount}
          >
            <MaterialIcons name="delete-forever" size={18} color="#DC2626" />
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>

          {isAnonymous ? (
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => navigation.navigate('Auth')}
            >
              <MaterialIcons name="login" size={18} color={theme.onPrimary} />
              <Text style={styles.signInText}>Sign in / Create account</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: hasChanges ? theme.primary : theme.inputBg },
            ]}
            onPress={saveProfile}
            disabled={!hasChanges || isSaving || !isValidUsername(username)}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Text style={[styles.saveBtnText, { color: hasChanges && isValidUsername(username) ? theme.onPrimary : theme.textMuted }]}>Save changes</Text>
            )}
          </TouchableOpacity>

          {saveError ? (
            <Text style={[styles.helperText, { color: theme.warning, marginTop: 8 }]}>{saveError}</Text>
          ) : null}
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
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      paddingVertical: 11,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#FECACA',
      backgroundColor: '#FEF2F2',
    },
    deleteText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
    signInBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      paddingVertical: 11,
      marginBottom: 10,
      backgroundColor: theme.primary,
    },
    signInText: { fontSize: 14, fontWeight: '700', color: theme.onPrimary },
    emailBtn: {
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      marginBottom: 10,
    },
    emailBtnText: { fontSize: 14, fontWeight: '700' },
    subscriptionCard: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    subscriptionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    subscriptionTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
    subscriptionBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    subscriptionBadgeText: { fontSize: 11, fontWeight: '800' },
    subscriptionCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textSecondary,
      marginBottom: 10,
    },
    proBtn: {
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      marginBottom: 8,
    },
    proBtnText: { fontSize: 14, fontWeight: '700', color: theme.onPrimary },
    secondarySubBtn: {
      borderRadius: 12,
      borderWidth: 1,
      paddingVertical: 11,
      alignItems: 'center',
    },
    secondarySubBtnText: { fontSize: 14, fontWeight: '700' },
    saveBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 15, fontWeight: '700' },
  });
