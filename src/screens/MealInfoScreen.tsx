import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { useNavigation } from '@react-navigation/native';
import { MealType } from '../types/models';

const MEAL_TYPES: { type: MealType; icon: string; label: string }[] = [
  { type: 'Breakfast', icon: 'free-breakfast', label: 'Breakfast' },
  { type: 'Lunch', icon: 'lunch-dining', label: 'Lunch' },
  { type: 'Dinner', icon: 'dinner-dining', label: 'Dinner' },
  { type: 'Snack', icon: 'cookie', label: 'Snack' },
];

export default function MealInfoScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [mealType, setMealType] = useState<MealType>('Lunch');
  const [foodName, setFoodName] = useState('');

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('PreScanCamera');
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Meal</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Meal type selector */}
          <Text style={styles.sectionTitle}>What type of meal?</Text>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((mt) => (
              <TouchableOpacity
                key={mt.type}
                style={[
                  styles.chip,
                  mealType === mt.type && styles.chipSelected,
                ]}
                onPress={() => setMealType(mt.type)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={mt.icon as any}
                  size={20}
                  color={mealType === mt.type ? theme.primary : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.chipText,
                    mealType === mt.type && styles.chipTextSelected,
                  ]}
                >
                  {mt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Food name input */}
          <Text style={styles.sectionTitle}>What are you eating?</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Chicken bowl, Sandwich, Ramen"
            placeholderTextColor={theme.textMuted}
            value={foodName}
            onChangeText={setFoodName}
            maxLength={80}
            returnKeyType="done"
            autoCapitalize="sentences"
          />

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.continueBtn, !foodName.trim() && styles.continueBtnDim]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.hintText}>
            Next: Take a photo of your meal before eating
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
    headerTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
    content: {
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 60,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 16,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 36,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 24,
      backgroundColor: theme.surfaceElevated,
      borderWidth: 1.5,
      borderColor: theme.border,
    },
    chipSelected: {
      backgroundColor: theme.primaryDim,
      borderColor: theme.primary,
    },
    chipText: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.textSecondary,
    },
    chipTextSelected: {
      color: theme.primary,
      fontWeight: '600',
    },
    input: {
      backgroundColor: theme.inputBg,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 16,
      color: theme.text,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 36,
    },
    continueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 16,
      marginBottom: 12,
    },
    continueBtnDim: {
      opacity: 0.7,
    },
    continueBtnText: {
      color: '#FFF',
      fontSize: 17,
      fontWeight: '600',
    },
    hintText: {
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: 13,
    },
  });
