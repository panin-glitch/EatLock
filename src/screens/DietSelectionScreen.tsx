import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';

const DIETS = [
  { name: 'Balanced', subtitle: 'Standard nutritional mix', icon: 'restaurant' as const },
  { name: 'Vegetarian', subtitle: 'No meat, includes dairy/eggs', icon: 'eco' as const },
  { name: 'Vegan', subtitle: 'Plant-based only', icon: 'grass' as const },
  { name: 'Paleo', subtitle: 'Whole foods, hunter-gatherer style', icon: 'terrain' as const },
  { name: 'Ketogenic', subtitle: 'High fat, very low carb', icon: 'bolt' as const },
  { name: 'High protein', subtitle: 'Muscle growth focused', icon: 'fitness-center' as const },
  { name: 'Low carb', subtitle: 'Reduced sugar and grain intake', icon: 'bakery-dining' as const },
];

export default function DietSelectionScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const [selected, setSelected] = useState('High protein');

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
        <Text style={s.headerTitle}>Diet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {DIETS.map((diet) => {
          const isSelected = selected === diet.name;
          return (
            <TouchableOpacity
              key={diet.name}
              style={[s.row, isSelected && s.rowSelected]}
              onPress={() => setSelected(diet.name)}
            >
              <View style={[s.iconWrap, isSelected && s.iconWrapSelected]}>
                <MaterialIcons name={diet.icon} size={22} color={isSelected ? theme.onPrimary : theme.textSecondary} />
              </View>
              <View style={s.textCol}>
                <Text style={[s.name, isSelected && s.nameSelected]}>{diet.name}</Text>
                <Text style={[s.subtitle, isSelected && s.subtitleSelected]}>{diet.subtitle}</Text>
              </View>
              {isSelected ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={s.doneText}>Done</Text>
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
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 21, fontWeight: '800', color: theme.text },
    content: { paddingHorizontal: 16, paddingBottom: 120 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    rowSelected: {
      borderColor: theme.primary,
      borderWidth: 2,
      backgroundColor: `${theme.primary}14`,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapSelected: { backgroundColor: theme.primary },
    textCol: { flex: 1 },
    name: { fontSize: 16, fontWeight: '700', color: theme.text },
    nameSelected: { color: theme.text },
    subtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    subtitleSelected: { color: theme.textSecondary },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 32,
    },
    doneBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneText: { color: theme.onPrimary, fontSize: 18, fontWeight: '800' },
  });
