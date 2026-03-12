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
  FORFEIT_ALLOWANCE: 'eatlock_forfeit_allowance',
  INITIALIZED: 'eatlock_initialized',
};

const META_KEYS = {
  LAST_AUTH_NAMESPACE: 'eatlock_last_auth_namespace',
};

type StorageKey = keyof typeof KEYS;

interface DailyForfeitAllowance {
  dayKey: string;
  used: number;
}

let storageNamespace = 'global';

function normalizeNamespace(userId: string | null | undefined): string {
  const safe = (userId || 'anonymous').trim();
  return safe.length > 0 ? safe : 'anonymous';
}

function buildNamespacedKey(namespace: string, key: StorageKey): string {
  return `${namespace}:${KEYS[key]}`;
}

function namespacedKey(key: StorageKey): string {
  return `${storageNamespace}:${KEYS[key]}`;
}

function allNamespacedKeys(): string[] {
  return (Object.keys(KEYS) as StorageKey[]).map((k) => namespacedKey(k));
}

function getTodayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getDailyForfeitAllowance(): Promise<DailyForfeitAllowance> {
  const todayKey = getTodayKey();
  const raw = await AsyncStorage.getItem(namespacedKey('FORFEIT_ALLOWANCE'));

  if (!raw) {
    return { dayKey: todayKey, used: 0 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DailyForfeitAllowance>;
    const used = Math.max(0, Math.floor(Number(parsed.used ?? 0)));
    if (parsed.dayKey === todayKey) {
      return { dayKey: todayKey, used };
    }
  } catch {
    // Fall through to reset invalid payloads.
  }

  return { dayKey: todayKey, used: 0 };
}

async function saveDailyForfeitAllowance(allowance: DailyForfeitAllowance): Promise<void> {
  await AsyncStorage.setItem(namespacedKey('FORFEIT_ALLOWANCE'), JSON.stringify(allowance));
}

export function setStorageNamespace(userId: string | null | undefined): void {
  storageNamespace = normalizeNamespace(userId);
}

export async function setLastAuthNamespaceInfo(
  namespace: string,
  isAnonymous: boolean,
): Promise<void> {
  const payload = JSON.stringify({ namespace, isAnonymous, updatedAt: Date.now() });
  await AsyncStorage.setItem(META_KEYS.LAST_AUTH_NAMESPACE, payload);
}

export async function getLastAuthNamespaceInfo(): Promise<{ namespace: string; isAnonymous: boolean } | null> {
  const raw = await AsyncStorage.getItem(META_KEYS.LAST_AUTH_NAMESPACE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { namespace?: string; isAnonymous?: boolean };
    if (!parsed?.namespace) return null;
    return {
      namespace: String(parsed.namespace),
      isAnonymous: !!parsed.isAnonymous,
    };
  } catch {
    return null;
  }
}

async function hasLegacyData(): Promise<boolean> {
  const [sessions, activeSession] = await Promise.all([
    AsyncStorage.getItem(KEYS.MEAL_SESSIONS),
    AsyncStorage.getItem(KEYS.ACTIVE_SESSION),
  ]);
  try {
    const parsed = sessions ? JSON.parse(sessions) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return true;
  } catch {
    // ignore parse issues and continue fallback checks
  }
  return !!activeSession;
}

async function hasNamespaceData(namespace: string): Promise<boolean> {
  const [sessions, activeSession] = await Promise.all([
    AsyncStorage.getItem(buildNamespacedKey(namespace, 'MEAL_SESSIONS')),
    AsyncStorage.getItem(buildNamespacedKey(namespace, 'ACTIVE_SESSION')),
  ]);
  try {
    const parsed = sessions ? JSON.parse(sessions) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return true;
  } catch {
    // ignore parse issues and continue fallback checks
  }
  return !!activeSession;
}

export async function migrateLegacyToNamespace(userId: string | null | undefined): Promise<boolean> {
  const namespace = normalizeNamespace(userId);
  const targetHasData = await hasNamespaceData(namespace);
  if (targetHasData) return false;

  const legacyHasData = await hasLegacyData();
  if (!legacyHasData) return false;

  const entries = await Promise.all(
    (Object.keys(KEYS) as StorageKey[]).map(async (key) => ({
      key,
      value: await AsyncStorage.getItem(KEYS[key]),
    })),
  );

  const writes = entries
    .filter((entry) => entry.value != null)
    .map((entry) => AsyncStorage.setItem(buildNamespacedKey(namespace, entry.key), entry.value as string));

  if (writes.length > 0) {
    await Promise.all(writes);
    return true;
  }
  return false;
}

export async function migrateNamespaceData(
  fromUserId: string | null | undefined,
  toUserId: string | null | undefined,
): Promise<boolean> {
  const fromNamespace = normalizeNamespace(fromUserId);
  const toNamespace = normalizeNamespace(toUserId);
  if (fromNamespace === toNamespace) return false;

  const [fromHasData, toHasData] = await Promise.all([
    hasNamespaceData(fromNamespace),
    hasNamespaceData(toNamespace),
  ]);

  if (!fromHasData || toHasData) return false;

  const entries = await Promise.all(
    (Object.keys(KEYS) as StorageKey[]).map(async (key) => ({
      key,
      value: await AsyncStorage.getItem(buildNamespacedKey(fromNamespace, key)),
    })),
  );

  const writes = entries
    .filter((entry) => entry.value != null)
    .map((entry) => AsyncStorage.setItem(buildNamespacedKey(toNamespace, entry.key), entry.value as string));

  if (writes.length > 0) {
    await Promise.all(writes);
    return true;
  }
  return false;
}

// ===== INITIALIZATION =====
export async function initializeStorage(): Promise<void> {
  const initialized = await AsyncStorage.getItem(namespacedKey('INITIALIZED'));
  if (!initialized) {
    await AsyncStorage.setItem(namespacedKey('MEAL_SCHEDULES'), JSON.stringify(DEFAULT_MEAL_SCHEDULES));
    await AsyncStorage.setItem(namespacedKey('BLOCK_CONFIG'), JSON.stringify(DEFAULT_BLOCK_CONFIG));
    await AsyncStorage.setItem(namespacedKey('USER_SETTINGS'), JSON.stringify(DEFAULT_USER_SETTINGS));
    await AsyncStorage.setItem(namespacedKey('MEAL_SESSIONS'), JSON.stringify([]));
    await AsyncStorage.setItem(namespacedKey('INITIALIZED'), 'true');
  }
}

// ===== MEAL SCHEDULES =====
export async function getMealSchedules(): Promise<MealSchedule[]> {
  const data = await AsyncStorage.getItem(namespacedKey('MEAL_SCHEDULES'));
  return data ? JSON.parse(data) : DEFAULT_MEAL_SCHEDULES;
}

export async function saveMealSchedules(schedules: MealSchedule[]): Promise<void> {
  await AsyncStorage.setItem(namespacedKey('MEAL_SCHEDULES'), JSON.stringify(schedules));
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
  const data = await AsyncStorage.getItem(namespacedKey('MEAL_SESSIONS'));
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
  await AsyncStorage.setItem(namespacedKey('MEAL_SESSIONS'), JSON.stringify(sessions));
}

export async function deleteMealSession(id: string): Promise<void> {
  const sessions = await getMealSessions();
  await AsyncStorage.setItem(
    namespacedKey('MEAL_SESSIONS'),
    JSON.stringify(sessions.filter((session) => session.id !== id)),
  );
}

export async function getActiveSession(): Promise<MealSession | null> {
  const data = await AsyncStorage.getItem(namespacedKey('ACTIVE_SESSION'));
  return data ? JSON.parse(data) : null;
}

export async function setActiveSession(session: MealSession | null): Promise<void> {
  if (session) {
    await AsyncStorage.setItem(namespacedKey('ACTIVE_SESSION'), JSON.stringify(session));
  } else {
    await AsyncStorage.removeItem(namespacedKey('ACTIVE_SESSION'));
  }
}

// ===== BLOCK CONFIG =====
export async function getBlockConfig(): Promise<BlockConfig> {
  const data = await AsyncStorage.getItem(namespacedKey('BLOCK_CONFIG'));
  return data ? JSON.parse(data) : DEFAULT_BLOCK_CONFIG;
}

export async function saveBlockConfig(config: BlockConfig): Promise<void> {
  await AsyncStorage.setItem(namespacedKey('BLOCK_CONFIG'), JSON.stringify(config));
}

// ===== USER SETTINGS =====
export async function getUserSettings(): Promise<UserSettings> {
  const data = await AsyncStorage.getItem(namespacedKey('USER_SETTINGS'));
  if (!data) return DEFAULT_USER_SETTINGS;

  const parsed = JSON.parse(data) as Partial<UserSettings>;
  return {
    ...DEFAULT_USER_SETTINGS,
    ...parsed,
    app: {
      ...DEFAULT_USER_SETTINGS.app,
      ...(parsed.app ?? {}),
    },
    truthBomb: {
      ...DEFAULT_USER_SETTINGS.truthBomb,
      ...(parsed.truthBomb ?? {}),
      categories: {
        ...DEFAULT_USER_SETTINGS.truthBomb.categories,
        ...(parsed.truthBomb?.categories ?? {}),
      },
    },
    homeWidgets: {
      ...DEFAULT_USER_SETTINGS.homeWidgets,
      ...(parsed.homeWidgets ?? {}),
    },
    nutritionGoals: {
      ...DEFAULT_USER_SETTINGS.nutritionGoals,
      ...(parsed.nutritionGoals ?? {}),
      macroSplit: {
        ...DEFAULT_USER_SETTINGS.nutritionGoals.macroSplit,
        ...(parsed.nutritionGoals?.macroSplit ?? {}),
      },
    },
    streak: {
      ...DEFAULT_USER_SETTINGS.streak,
      ...(parsed.streak ?? {}),
    },
  };
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(namespacedKey('USER_SETTINGS'), JSON.stringify(settings));
}

export async function getRemainingForfeitsToday(limit: number): Promise<number> {
  const allowance = await getDailyForfeitAllowance();
  return Math.max(0, limit - allowance.used);
}

export async function consumeForfeitToday(limit: number): Promise<{
  allowed: boolean;
  remaining: number;
  used: number;
}> {
  const allowance = await getDailyForfeitAllowance();

  if (allowance.used >= limit) {
    return {
      allowed: false,
      remaining: 0,
      used: allowance.used,
    };
  }

  const next = {
    dayKey: allowance.dayKey,
    used: allowance.used + 1,
  };

  await saveDailyForfeitAllowance(next);

  return {
    allowed: true,
    remaining: Math.max(0, limit - next.used),
    used: next.used,
  };
}

// ===== CLEAR ALL =====
export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(allNamespacedKeys());
}
