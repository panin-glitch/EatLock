import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MealSchedule, MealType, DayOfWeek } from '../types/models';

const ALL_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Custom'];

export default function EditScheduleScreen() {
  const { theme } = useTheme();
  const { schedules, addSchedule, updateSchedule, deleteSchedule } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const scheduleId = route.params?.scheduleId;
  const existing = schedules.find((s) => s.id === scheduleId);
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name || '');
  const [mealType, setMealType] = useState<MealType>(existing?.mealType || 'Lunch');

  // Build initial Date from existing timeOfDay or default 12:00
  const buildTimeDate = (timeStr?: string) => {
    const d = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    } else {
      d.setHours(12, 0, 0, 0);
    }
    return d;
  };
  const [timeDate, setTimeDate] = useState(buildTimeDate(existing?.timeOfDay));
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios'); // always visible on iOS

  const [repeatDays, setRepeatDays] = useState<DayOfWeek[]>(
    existing?.repeatDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  );
  const [notificationEnabled, setNotificationEnabled] = useState(
    existing?.notificationEnabled ?? true
  );
  const [reminderMessage, setReminderMessage] = useState(existing?.reminderMessage || '');

  const toggleDay = (day: DayOfWeek) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const formatTimeDisplay = (d: Date) => {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const handleSave = () => {
    const timeOfDay = formatTimeDisplay(timeDate);
    const schedule: MealSchedule = {
      id: existing?.id || Date.now().toString(),
      name: name || mealType,
      mealType,
      timeOfDay,
      repeatDays,
      enabled: existing?.enabled ?? true,
      notificationEnabled,
      reminderMessage: reminderMessage || `Time for ${(name || mealType).toLowerCase()}!`,
    };

    if (isEditing) {
      updateSchedule(schedule);
    } else {
      addSchedule(schedule);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert('Delete Meal', 'Are you sure you want to delete this meal schedule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSchedule(scheduleId);
          navigation.goBack();
        },
      },
    ]);
  };

  const onTimeChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      setTimeDate(selectedDate);
    }
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Meal' : 'New Meal'}
        </Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveBtn}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meal name */}
        <Text style={styles.label}>Meal Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Breakfast"
          placeholderTextColor={theme.textMuted}
        />

        {/* Meal type */}
        <Text style={styles.label}>Meal Type</Text>
        <View style={styles.chipRow}>
          {MEAL_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.chip, mealType === type && styles.chipSelected]}
              onPress={() => {
                setMealType(type);
                if (!name) setName(type);
              }}
            >
              <Text
                style={[styles.chipText, mealType === type && styles.chipTextSelected]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Time picker — scroll wheel */}
        <Text style={styles.label}>Time</Text>
        {Platform.OS === 'android' && !showPicker && (
          <TouchableOpacity
            style={styles.timeDisplayBtn}
            onPress={() => setShowPicker(true)}
          >
            <MaterialIcons name="access-time" size={22} color={theme.primary} />
            <Text style={styles.timeDisplayText}>{formatTimeDisplay(timeDate)}</Text>
            <Text style={styles.timeDisplayHint}>Tap to change</Text>
          </TouchableOpacity>
        )}
        {showPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={timeDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
              onChange={onTimeChange}
              themeVariant="dark"
              textColor={theme.text}
              style={styles.picker}
            />
          </View>
        )}

        {/* Repeat days */}
        <Text style={styles.label}>Repeat Days</Text>
        <View style={styles.daysRow}>
          {ALL_DAYS.map((day) => (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayChip,
                repeatDays.includes(day) && styles.dayChipSelected,
              ]}
              onPress={() => toggleDay(day)}
            >
              <Text
                style={[
                  styles.dayChipText,
                  repeatDays.includes(day) && styles.dayChipTextSelected,
                ]}
              >
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notification toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Notification</Text>
            <Text style={styles.toggleHint}>Get reminded at meal time</Text>
          </View>
          <Switch
            value={notificationEnabled}
            onValueChange={setNotificationEnabled}
            trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
            thumbColor={notificationEnabled ? theme.primary : theme.textMuted}
          />
        </View>

        {/* Reminder message */}
        <Text style={styles.label}>Reminder Message (optional)</Text>
        <TextInput
          style={styles.input}
          value={reminderMessage}
          onChangeText={setReminderMessage}
          placeholder="Custom notification message"
          placeholderTextColor={theme.textMuted}
        />

        {isEditing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <MaterialIcons name="delete" size={18} color={theme.danger} />
            <Text style={styles.deleteBtnText}>Delete Meal</Text>
          </TouchableOpacity>
        )}
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
    headerTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
    saveBtn: { fontSize: 16, fontWeight: '600', color: theme.primary },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      marginTop: 20,
      marginBottom: 8,
    },
    input: {
      backgroundColor: theme.inputBg,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: theme.text,
      fontSize: 16,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.chipBg,
    },
    chipSelected: {
      backgroundColor: theme.chipSelectedBg,
      borderColor: theme.primary,
      borderWidth: 1,
    },
    chipText: { fontSize: 14, color: theme.textSecondary },
    chipTextSelected: { color: theme.primary, fontWeight: '600' },
    timeDisplayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    timeDisplayText: {
      fontSize: 24,
      fontWeight: '600',
      color: theme.text,
    },
    timeDisplayHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginLeft: 'auto',
    },
    pickerContainer: {
      backgroundColor: theme.card,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    picker: {
      height: 180,
    },
    daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dayChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.chipBg,
    },
    dayChipSelected: {
      backgroundColor: theme.primaryDim,
      borderColor: theme.primary,
      borderWidth: 1,
    },
    dayChipText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
    dayChipTextSelected: { color: theme.primary, fontWeight: '600' },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      marginTop: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    toggleLabel: { fontSize: 16, fontWeight: '500', color: theme.text },
    toggleHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 32,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.danger,
    },
    deleteBtnText: { color: theme.danger, fontSize: 15, fontWeight: '500' },
  });
