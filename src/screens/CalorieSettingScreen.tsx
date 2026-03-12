import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { languageToLocale } from '../utils/locale';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

export default function CalorieSettingScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const { settings, updateSettings } = useAppState();
  const localeTag = useMemo(() => languageToLocale(settings.language), [settings.language]);
  const [value, setValue] = useState(String(settings.nutritionGoals.dailyCalorieGoal));

  useEffect(() => {
    setValue(String(settings.nutritionGoals.dailyCalorieGoal));
  }, [settings.nutritionGoals.dailyCalorieGoal]);

  const displayValue = useMemo(() => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '0';
    return Math.round(parsed).toLocaleString(localeTag);
  }, [localeTag, value]);

  const onKeyPress = (key: (typeof KEYS)[number]) => {
    if (key === 'back') {
      setValue((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '.') return;
    setValue((prev) => {
      const next = `${prev}${key}`.replace(/^0+(\d)/, '$1');
      return next.slice(0, 5);
    });
  };

  const handleUpdate = async () => {
    const next = Math.max(1, Math.round(Number(value) || settings.nutritionGoals.dailyCalorieGoal));
    await updateSettings({
      ...settings,
      nutritionGoals: {
        ...settings.nutritionGoals,
        dailyCalorieGoal: next,
      },
    });
    navigation.goBack();
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
        <Text style={s.headerTitle}>Calories</Text>
        <View style={s.spacer} />
      </View>

      <View style={s.main}>
        <Text style={s.kcalLabel}>ENTER KCAL AMOUNT</Text>
        <Text style={s.valueText}>{displayValue}</Text>

        <View style={s.keypad}>
          {KEYS.map((key) => (
            <TouchableOpacity key={key} style={s.key} onPress={() => onKeyPress(key)}>
              {key === 'back' ? (
                <MaterialIcons name="backspace" size={24} color={theme.textSecondary} />
              ) : (
                <Text style={s.keyText}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.updateBtn} onPress={handleUpdate}>
          <MaterialIcons name="lock" size={20} color="#0F172A" />
          <Text style={s.updateBtnText}>Update calories</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 54,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    spacer: { width: 40 },
    main: { flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
    kcalLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: 10,
    },
    valueText: { fontSize: 64, fontWeight: '900', color: theme.text, marginBottom: 30 },
    keypad: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 6,
    },
    key: {
      width: '32%',
      borderRadius: 14,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyText: { fontSize: 28, fontWeight: '600', color: theme.textSecondary },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 34,
      backgroundColor: theme.background,
    },
    updateBtn: {
      height: 58,
      borderRadius: 16,
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    updateBtnText: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  });
