import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MealSchedule,
  MealSession,
  BlockConfig,
  UserSettings,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_MEAL_SCHEDULES,
  DEFAULT_USER_SETTINGS,
} from '../types/models';

const KEYS = {
  MEAL_SCHEDULES: 'eatlock_meal_schedules',
  MEAL_SESSIONS: 'eatlock_meal_sessions',
  BLOCK_CONFIG: 'eatlock_block_config',
  USER_SETTINGS: 'eatlock_user_settings',
  ACTIVE_SESSION: 'eatlock_active_session',
  INITIALIZED: 'eatlock_initialized',
};

// ===== INITIALIZATION =====
export async function initializeStorage(): Promise<void> {
  const initialized = await AsyncStorage.getItem(KEYS.INITIALIZED);
  if (!initialized) {
    await AsyncStorage.setItem(KEYS.MEAL_SCHEDULES, JSON.stringify(DEFAULT_MEAL_SCHEDULES));
    await AsyncStorage.setItem(KEYS.BLOCK_CONFIG, JSON.stringify(DEFAULT_BLOCK_CONFIG));
    await AsyncStorage.setItem(KEYS.USER_SETTINGS, JSON.stringify(DEFAULT_USER_SETTINGS));
    await AsyncStorage.setItem(KEYS.MEAL_SESSIONS, JSON.stringify([]));
    await AsyncStorage.setItem(KEYS.INITIALIZED, 'true');
  }
}

// ===== MEAL SCHEDULES =====
export async function getMealSchedules(): Promise<MealSchedule[]> {
  const data = await AsyncStorage.getItem(KEYS.MEAL_SCHEDULES);
  return data ? JSON.parse(data) : DEFAULT_MEAL_SCHEDULES;
}

export async function saveMealSchedules(schedules: MealSchedule[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.MEAL_SCHEDULES, JSON.stringify(schedules));
}

export async function addMealSchedule(schedule: MealSchedule): Promise<void> {
  const schedules = await getMealSchedules();
  schedules.push(schedule);
  await saveMealSchedules(schedules);
}

export async function updateMealSchedule(schedule: MealSchedule): Promise<void> {
  const schedules = await getMealSchedules();
  const index = schedules.findIndex((s) => s.id === schedule.id);
  if (index >= 0) {
    schedules[index] = schedule;
    await saveMealSchedules(schedules);
  }
}

export async function deleteMealSchedule(id: string): Promise<void> {
  const schedules = await getMealSchedules();
  await saveMealSchedules(schedules.filter((s) => s.id !== id));
}

// ===== MEAL SESSIONS =====
export async function getMealSessions(): Promise<MealSession[]> {
  const data = await AsyncStorage.getItem(KEYS.MEAL_SESSIONS);
  return data ? JSON.parse(data) : [];
}

export async function saveMealSession(session: MealSession): Promise<void> {
  const sessions = await getMealSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  await AsyncStorage.setItem(KEYS.MEAL_SESSIONS, JSON.stringify(sessions));
}

export async function deleteMealSession(id: string): Promise<void> {
  const sessions = await getMealSessions();
  await AsyncStorage.setItem(
    KEYS.MEAL_SESSIONS,
    JSON.stringify(sessions.filter((session) => session.id !== id)),
  );
}

export async function getActiveSession(): Promise<MealSession | null> {
  const data = await AsyncStorage.getItem(KEYS.ACTIVE_SESSION);
  return data ? JSON.parse(data) : null;
}

export async function setActiveSession(session: MealSession | null): Promise<void> {
  if (session) {
    await AsyncStorage.setItem(KEYS.ACTIVE_SESSION, JSON.stringify(session));
  } else {
    await AsyncStorage.removeItem(KEYS.ACTIVE_SESSION);
  }
}

// ===== BLOCK CONFIG =====
export async function getBlockConfig(): Promise<BlockConfig> {
  const data = await AsyncStorage.getItem(KEYS.BLOCK_CONFIG);
  return data ? JSON.parse(data) : DEFAULT_BLOCK_CONFIG;
}

export async function saveBlockConfig(config: BlockConfig): Promise<void> {
  await AsyncStorage.setItem(KEYS.BLOCK_CONFIG, JSON.stringify(config));
}

// ===== USER SETTINGS =====
export async function getUserSettings(): Promise<UserSettings> {
  const data = await AsyncStorage.getItem(KEYS.USER_SETTINGS);
  return data ? JSON.parse(data) : DEFAULT_USER_SETTINGS;
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_SETTINGS, JSON.stringify(settings));
}

// ===== CLEAR ALL =====
export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
