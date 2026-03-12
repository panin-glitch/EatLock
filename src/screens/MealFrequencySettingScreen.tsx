import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';

const ITEM_HEIGHT = 72;
const MAX_FREQUENCY = 6;

export default function MealFrequencySettingScreen() {
  const navigation = useNavigation<any>();
  const { theme, themeName } = useTheme();
  const [frequency, setFrequency] = useState(3);
  const listRef = useRef<FlatList<number>>(null);

  const options = useMemo(() => Array.from({ length: MAX_FREQUENCY }, (_, index) => index + 1), []);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: (frequency - 1) * ITEM_HEIGHT,
        animated: false,
      });
    });
  }, [frequency]);

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
        <Text style={s.headerTitle}>Meal Frequency</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.main}>
        <Text style={s.helpText}>We will send you notifications based on your frequency</Text>

        <View style={s.pickerWrap}>
          <FlatList
            ref={listRef}
            data={options}
            keyExtractor={(item) => String(item)}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            onMomentumScrollEnd={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              const nearestIndex = Math.round(offsetY / ITEM_HEIGHT);
              const safeIndex = Math.max(0, Math.min(options.length - 1, nearestIndex));
              setFrequency(options[safeIndex]);
            }}
            renderItem={({ item }) => {
              const selected = item === frequency;
              return (
                <TouchableOpacity
                  style={[s.numberRow, selected && s.numberSelectedRow]}
                  onPress={() => {
                    setFrequency(item);
                    listRef.current?.scrollToOffset({
                      offset: (item - 1) * ITEM_HEIGHT,
                      animated: true,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.numberText, selected && s.numberSelectedText]}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />
          <View pointerEvents="none" style={s.selectionOverlay} />
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="check-circle" size={20} color="#0F172A" />
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
    headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
    main: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
    helpText: { fontSize: 16, lineHeight: 22, color: theme.textSecondary, textAlign: 'center', marginBottom: 24 },
    pickerWrap: {
      alignItems: 'center',
      marginBottom: 20,
      height: ITEM_HEIGHT * 5,
      justifyContent: 'center',
      position: 'relative',
    },
    list: { width: 220, flexGrow: 0 },
    listContent: {
      paddingVertical: ITEM_HEIGHT * 2,
    },
    numberRow: {
      width: 200,
      borderRadius: 14,
      height: ITEM_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.55,
    },
    numberSelectedRow: {
      backgroundColor: `${theme.primary}10`,
      borderWidth: 1,
      borderColor: `${theme.primary}44`,
      opacity: 1,
    },
    numberText: { fontSize: 36, fontWeight: '700', color: theme.textMuted },
    numberSelectedText: { fontSize: 60, fontWeight: '800', color: theme.text },
    selectionOverlay: {
      position: 'absolute',
      width: 200,
      height: ITEM_HEIGHT,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${theme.primary}22`,
    },
    footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
    doneBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    doneText: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  });
