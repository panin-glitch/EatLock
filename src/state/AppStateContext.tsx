import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  MealSchedule,
  MealSession,
  BlockConfig,
  UserSettings,
  MealType,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_USER_SETTINGS,
} from '../types/models';
import type { FoodCheckResult, NutritionEstimate, SessionStatus } from '../services/vision/types';
import * as Storage from '../services/storage';
import { blockingEngine } from '../services/blockingEngine';
import { scheduleAllMealNotifications } from '../services/notifications';
import { ensureAuth } from '../services/authService';

interface AppState {
  schedules: MealSchedule[];
  sessions: MealSession[];
  blockConfig: BlockConfig;
  settings: UserSettings;
  activeSession: MealSession | null;
  isLoading: boolean;
  // Actions
  loadAll: () => Promise<void>;
  addSchedule: (s: MealSchedule) => Promise<void>;
  updateSchedule: (s: MealSchedule) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleSchedule: (id: string) => Promise<void>;
  startSession: (mealType: MealType, note: string, strictMode: boolean, preImageUri?: string, foodName?: string, preCheck?: FoodCheckResult, preNutrition?: NutritionEstimate) => Promise<void>;
  endSession: (status: SessionStatus, roastMessage?: string) => Promise<void>;
  updateActiveSession: (updates: Partial<MealSession>) => Promise<void>;
  updateBlockConfig: (config: BlockConfig) => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
  clearAll: () => Promise<void>;
}

const AppContext = createContext<AppState>({} as AppState);
export const useAppState = () => useContext(AppContext);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [schedules, setSchedules] = useState<MealSchedule[]>([]);
  const [sessions, setSessions] = useState<MealSession[]>([]);
  const [blockConfig, setBlockConfig] = useState<BlockConfig>(DEFAULT_BLOCK_CONFIG);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [activeSession, setActiveSession] = useState<MealSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Storage.initializeStorage();
      // Ensure user has a Supabase session (anonymous sign-in if needed)
      await ensureAuth();
      const [s, sess, bc, us, as_] = await Promise.all([
        Storage.getMealSchedules(),
        Storage.getMealSessions(),
        Storage.getBlockConfig(),
        Storage.getUserSettings(),
        Storage.getActiveSession(),
      ]);
      setSchedules(s);
      setSessions(sess);
      setBlockConfig(bc);
      setSettings(us);
      setActiveSession(as_);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addSchedule = async (schedule: MealSchedule) => {
    await Storage.addMealSchedule(schedule);
    const updated = await Storage.getMealSchedules();
    setSchedules(updated);
    scheduleAllMealNotifications(updated).catch(console.error);
  };

  const updateSchedule = async (schedule: MealSchedule) => {
    await Storage.updateMealSchedule(schedule);
    const updated = await Storage.getMealSchedules();
    setSchedules(updated);
    scheduleAllMealNotifications(updated).catch(console.error);
  };

  const deleteSchedule = async (id: string) => {
    await Storage.deleteMealSchedule(id);
    const updated = await Storage.getMealSchedules();
    setSchedules(updated);
    scheduleAllMealNotifications(updated).catch(console.error);
  };

  const toggleSchedule = async (id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    if (schedule) {
      await updateSchedule({ ...schedule, enabled: !schedule.enabled });
    }
  };

  const startSession = async (mealType: MealType, note: string, strictMode: boolean, preImageUri?: string, foodName?: string, preCheck?: FoodCheckResult, preNutrition?: NutritionEstimate) => {
    const session: MealSession = {
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      mealType,
      foodName,
      note,
      strictMode,
      preImageUri,
      preNutrition,
      verification: preCheck ? { preCheck } : {},
      status: 'ACTIVE',
      overrideUsed: false,
      blockedAppsAtTime: strictMode ? blockConfig.blockedApps.map((a) => a.name) : [],
    };
    setActiveSession(session);
    await Storage.setActiveSession(session);

    if (strictMode) {
      await blockingEngine.startBlocking(blockConfig.blockedApps.map((a) => a.name));
    }
  };

  const endSession = async (status: SessionStatus, roastMessage?: string) => {
    if (!activeSession) return;
    const completed: MealSession = {
      ...activeSession,
      endedAt: new Date().toISOString(),
      status,
      roastMessage: roastMessage || activeSession.roastMessage,
    };
    await Storage.saveMealSession(completed);
    await Storage.setActiveSession(null);
    setActiveSession(null);

    if (completed.strictMode) {
      await blockingEngine.stopBlocking();
    }

    const updated = await Storage.getMealSessions();
    setSessions(updated);
  };

  const updateActiveSession = async (updates: Partial<MealSession>) => {
    if (!activeSession) return;
    const updated = { ...activeSession, ...updates };
    setActiveSession(updated);
    await Storage.setActiveSession(updated);
  };

  const updateBlockConfig = async (config: BlockConfig) => {
    await Storage.saveBlockConfig(config);
    setBlockConfig(config);
  };

  const updateSettings = async (s: UserSettings) => {
    await Storage.saveUserSettings(s);
    setSettings(s);
  };

  const clearAll = async () => {
    await Storage.clearAllData();
    await loadAll();
  };

  return (
    <AppContext.Provider
      value={{
        schedules,
        sessions,
        blockConfig,
        settings,
        activeSession,
        isLoading,
        loadAll,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        toggleSchedule,
        startSession,
        endSession,
        updateActiveSession,
        updateBlockConfig,
        updateSettings,
        clearAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
