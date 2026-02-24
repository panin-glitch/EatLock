/**
 * AuthScreen — sign in / create account.
 *
 * Supports email + password. Google sign-in shown as "Coming soon".
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { signIn, signUp, resetPassword } from '../../services/authService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'Auth'>;

export default function AuthScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isValid = email.includes('@') && password.length >= 6;

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        Alert.alert('Account created', 'Check your email to confirm your account, then sign in.');
        setMode('signin');
        setLoading(false);
        return;
      }
      // Success — go back to previous screen
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong');
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.includes('@')) {
      Alert.alert('Enter your email', 'Type your email above, then tap "Forgot password".');
      return;
    }
    try {
      await resetPassword(email.trim());
      Alert.alert('Check your email', 'A password reset link has been sent.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong');
    }
  };

  const s = makeStyles(theme);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Logo area */}
        <MaterialIcons name="restaurant" size={48} color={theme.primary} />
        <Text style={s.logoText}>EatLock</Text>

        {/* Email */}
        <View style={s.inputWrap}>
          <MaterialIcons name="email" size={20} color={theme.textMuted} />
          <TextInput
            style={s.input}
            placeholder="Email address"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* Password */}
        <View style={s.inputWrap}>
          <MaterialIcons name="lock" size={20} color={theme.textMuted} />
          <TextInput
            style={s.input}
            placeholder="Password (min 6 chars)"
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <MaterialIcons
              name={showPassword ? 'visibility' : 'visibility-off'}
              size={20}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Forgot password */}
        {mode === 'signin' && (
          <TouchableOpacity onPress={handleForgotPassword} style={s.forgotBtn}>
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, !isValid && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={s.submitText}>
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Toggle mode */}
        <TouchableOpacity
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={s.toggleBtn}
        >
          <Text style={s.toggleText}>
            {mode === 'signin'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        {/* Google (Coming soon) */}
        <View style={s.divider}>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={s.dividerText}>OR</Text>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <TouchableOpacity
          style={s.googleBtn}
          onPress={() => Alert.alert('Coming soon', 'Google sign-in will be available in a future update.')}
          activeOpacity={0.7}
        >
          <MaterialIcons name="account-circle" size={20} color={theme.text} />
          <Text style={s.googleText}>Continue with Google</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    content: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingTop: 32,
      paddingBottom: 40,
    },
    logoText: {
      fontSize: 22,
      fontWeight: '800',
      color: c.text,
      marginTop: 8,
      marginBottom: 32,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.inputBg,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 50,
      width: '100%',
      marginBottom: 12,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: c.text,
    },
    forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
    forgotText: { fontSize: 13, color: c.primary },
    submitBtn: {
      width: '100%',
      height: 50,
      borderRadius: 14,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    toggleBtn: { marginTop: 16 },
    toggleText: { fontSize: 14, color: c.primary },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginVertical: 24,
    },
    dividerLine: { flex: 1, height: 1 },
    dividerText: { marginHorizontal: 12, color: c.textMuted, fontSize: 12 },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      height: 50,
      borderRadius: 14,
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    googleText: { fontSize: 15, fontWeight: '600', color: c.text },
  });
