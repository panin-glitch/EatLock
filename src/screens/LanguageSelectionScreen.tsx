import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import type { LanguageOption } from '../types/models';

const LANGUAGES: LanguageOption[] = ['Deutsch', 'English', 'Español', 'Français', 'Italiano', 'Português'];

export default function LanguageSelectionScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const { settings, updateSettings } = useAppState();
  const [selected, setSelected] = useState<LanguageOption>(settings.language);

  useEffect(() => {
    setSelected(settings.language);
  }, [settings.language]);

  const selectLanguage = async (language: LanguageOption) => {
    setSelected(language);
    await updateSettings({
      ...settings,
      language,
    });
  };

  const s = makeStyles(theme);

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Language</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>SELECT LANGUAGE</Text>

        {LANGUAGES.map((language) => {
          const isSelected = selected === language;
          return (
            <TouchableOpacity
              key={language}
              style={[s.row, isSelected && s.rowSelected]}
              onPress={() => {
                selectLanguage(language).catch(() => undefined);
              }}
            >
              <Text style={[s.rowText, isSelected && s.rowTextSelected]}>{language}</Text>
              {isSelected ? (
                <MaterialIcons name="check-circle" size={22} color={theme.primary} />
              ) : (
                <View style={s.radio} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 54,
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 21, fontWeight: '800', color: theme.text },
    content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 30 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.textMuted,
      letterSpacing: 1,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 16,
      marginBottom: 10,
    },
    rowSelected: {
      borderColor: theme.primary,
      borderWidth: 2,
      backgroundColor: `${theme.primary}12`,
    },
    rowText: { fontSize: 16, color: theme.text, fontWeight: '600' },
    rowTextSelected: { color: theme.primary },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
  });
