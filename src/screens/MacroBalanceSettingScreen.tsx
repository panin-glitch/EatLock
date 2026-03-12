import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';

function normalizeSplit(values: { carbs: number; fat: number; protein: number }) {
  const total = Math.max(1, values.carbs + values.fat + values.protein);
  const carbs = Math.round((values.carbs / total) * 100);
  const fat = Math.round((values.fat / total) * 100);
  const protein = Math.max(0, 100 - carbs - fat);
  return { carbs, fat, protein };
}

export default function MacroBalanceSettingScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const { settings, updateSettings } = useAppState();
  const dailyCalories = Math.max(1, settings.nutritionGoals.dailyCalorieGoal || 2000);

  const [split, setSplit] = useState(() => ({
    carbs: Math.round(settings.nutritionGoals.macroSplit.carbsPct * 100),
    fat: Math.round(settings.nutritionGoals.macroSplit.fatPct * 100),
    protein: Math.round(settings.nutritionGoals.macroSplit.proteinPct * 100),
  }));

  const normalized = useMemo(() => normalizeSplit(split), [split]);

  const gramsAndCalories = useMemo(() => {
    const carbsKcal = Math.round((normalized.carbs / 100) * dailyCalories);
    const fatKcal = Math.round((normalized.fat / 100) * dailyCalories);
    const proteinKcal = Math.max(0, dailyCalories - carbsKcal - fatKcal);

    return {
      carbs: { kcal: carbsKcal, grams: Math.round(carbsKcal / 4) },
      fat: { kcal: fatKcal, grams: Math.round(fatKcal / 9) },
      protein: { kcal: proteinKcal, grams: Math.round(proteinKcal / 4) },
    };
  }, [dailyCalories, normalized.carbs, normalized.fat]);

  const applyDelta = (key: 'carbs' | 'fat' | 'protein', delta: number) => {
    setSplit((prev) => {
      const next = { ...prev, [key]: Math.max(5, Math.min(80, prev[key] + delta)) };
      return normalizeSplit(next);
    });
  };

  const handleSave = async () => {
    await updateSettings({
      ...settings,
      nutritionGoals: {
        ...settings.nutritionGoals,
        macroSplit: {
          carbsPct: normalized.carbs / 100,
          fatPct: normalized.fat / 100,
          proteinPct: normalized.protein / 100,
        },
      },
    });
    navigation.goBack();
  };

  const size = 210;
  const radius = 80;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  const carbsLen = (normalized.carbs / 100) * circumference;
  const fatLen = (normalized.fat / 100) * circumference;
  const proteinLen = circumference - carbsLen - fatLen;

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
        <Text style={s.headerTitle}>Macro balance</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.main}>
        <View style={s.chartWrap}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.chipBg} strokeWidth={stroke} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#06B6D4"
              strokeWidth={stroke}
              strokeDasharray={`${carbsLen} ${circumference}`}
              strokeDashoffset={0}
              fill="none"
              strokeLinecap="round"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#F59E0B"
              strokeWidth={stroke}
              strokeDasharray={`${fatLen} ${circumference}`}
              strokeDashoffset={-carbsLen}
              fill="none"
              strokeLinecap="round"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.primary}
              strokeWidth={stroke}
              strokeDasharray={`${proteinLen} ${circumference}`}
              strokeDashoffset={-(carbsLen + fatLen)}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
          <View style={s.chartCenter}>
            <Text style={s.totalText}>100%</Text>
            <Text style={s.totalSub}>Daily Total</Text>
            <Text style={s.totalKcal}>{dailyCalories} kcal/day</Text>
          </View>
        </View>

        <View style={s.legendRow}>
          <LegendDot label="Carbs" color="#06B6D4" />
          <LegendDot label="Fats" color="#F59E0B" />
          <LegendDot label="Protein" color={theme.primary} />
        </View>

        <View style={s.rows}>
          <MacroRow
            label="Carbs"
            color="#06B6D4"
            value={normalized.carbs}
            grams={gramsAndCalories.carbs.grams}
            kcal={gramsAndCalories.carbs.kcal}
            onInc={() => applyDelta('carbs', 1)}
            onDec={() => applyDelta('carbs', -1)}
          />
          <MacroRow
            label="Fats"
            color="#F59E0B"
            value={normalized.fat}
            grams={gramsAndCalories.fat.grams}
            kcal={gramsAndCalories.fat.kcal}
            onInc={() => applyDelta('fat', 1)}
            onDec={() => applyDelta('fat', -1)}
          />
          <MacroRow
            label="Proteins"
            color={theme.primary}
            value={normalized.protein}
            grams={gramsAndCalories.protein.grams}
            kcal={gramsAndCalories.protein.kcal}
            onInc={() => applyDelta('protein', 1)}
            onDec={() => applyDelta('protein', -1)}
          />
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <MaterialIcons name="lock" size={20} color="#0F172A" />
          <Text style={s.saveText}>Update macro balance</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MacroRow({
  label,
  color,
  value,
  grams,
  kcal,
  onInc,
  onDec,
}: {
  label: string;
  color: string;
  value: number;
  grams: number;
  kcal: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.7 }}>
            {label}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 15, fontWeight: '600', color: '#334155' }}>
            {value}% <Text style={{ color: '#94A3B8', fontWeight: '500' }}>({grams}g, {kcal} kcal)</Text>
          </Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: `${color}33`, overflow: 'hidden' }}>
        <View style={{ width: `${value}%`, height: '100%', backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <TouchableOpacity onPress={onDec} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: `${color}66`, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="remove" size={16} color={color} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onInc} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: `${color}66`, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="add" size={16} color={color} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>{label}</Text>
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
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 21, fontWeight: '800', color: theme.text },
    main: { flex: 1, paddingHorizontal: 24 },
    chartWrap: { marginTop: 20, alignItems: 'center', justifyContent: 'center' },
    chartCenter: { position: 'absolute', alignItems: 'center' },
    totalText: { fontSize: 36, fontWeight: '800', color: theme.text },
    totalSub: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    totalKcal: { marginTop: 4, fontSize: 11, color: theme.textSecondary, fontWeight: '600' },
    legendRow: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
    },
    rows: { marginTop: 30 },
    footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 30 },
    saveBtn: {
      height: 58,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    saveText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  });
