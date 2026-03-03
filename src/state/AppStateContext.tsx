import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
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
import { fetchRemoteCompletedSessions, logCompletedMeal, updateSessionDistraction } from '../services/mealLogger';
import { supabase } from '../services/supabaseClient';

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
  startSession: (
    mealType: MealType,
    note: string,
    strictMode: boolean,
    preImageUri?: string,
    foodName?: string,
    preCheck?: FoodCheckResult,
    preNutrition?: NutritionEstimate,
    barcode?: string,
    preBarcodeData?: { type: string; data: string },
  ) => Promise<void>;
  endSession: (status: SessionStatus, roastMessage?: string) => Promise<void>;
  updateActiveSession: (updates: Partial<MealSession>) => Promise<void>;
  updateBlockConfig: (config: BlockConfig) => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
  updateCompletedSessionFeedback: (
    sessionId: string,
    distractionRating: number,
    estimatedDistractionMinutes: number,
  ) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
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
  const lastUserIdRef = useRef<string | null>(null);
  const lastUserWasAnonymousRef = useRef<boolean>(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // Ensure user has a Supabase session (anonymous sign-in if needed)
      await ensureAuth();
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user ?? null;
      const currentUserId = currentUser?.id ?? 'anonymous';
      const isAnonymousUser = !currentUser?.email;
      Storage.setStorageNamespace(currentUserId);
      if (!isAnonymousUser) {
        const lastInfo = await Storage.getLastAuthNamespaceInfo();
        if (lastInfo?.isAnonymous && lastInfo.namespace && lastInfo.namespace !== currentUserId) {
          await Storage.migrateNamespaceData(lastInfo.namespace, currentUserId);
        }
        await Storage.migrateLegacyToNamespace(currentUserId);
      }
      await Storage.initializeStorage();
      const [s, sess, bc, us, as_] = await Promise.all([
        Storage.getMealSchedules(),
        Storage.getMealSessions(),
        Storage.getBlockConfig(),
        Storage.getUserSettings(),
        Storage.getActiveSession(),
      ]);

      setSchedules(s);
      setBlockConfig(bc);
      setSettings(us);

      if (isAnonymousUser) {
        setSessions([]);
        setActiveSession(null);
      } else {
        const remoteSessions = await fetchRemoteCompletedSessions();
        if (remoteSessions.length > 0) {
          await Promise.all(remoteSessions.map((remote) => Storage.saveMealSession(remote)));
        }
        const mergedSessions = await Storage.getMealSessions();
        setSessions(mergedSessions.length > 0 ? mergedSessions : sess);
        setActiveSession(as_);
      }

      lastUserIdRef.current = currentUser?.id ?? null;
      lastUserWasAnonymousRef.current = isAnonymousUser;
      await Storage.setLastAuthNamespaceInfo(currentUserId, isAnonymousUser);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const previousUserId = lastUserIdRef.current;
      const previousWasAnonymous = lastUserWasAnonymousRef.current;
      const nextUserId = session?.user?.id ?? null;
      const nextIsAnonymous = !session?.user?.email;

      let migrationSourceUserId = previousUserId;
      let migrationSourceIsAnonymous = previousWasAnonymous;

      if (!migrationSourceUserId) {
        const lastInfo = await Storage.getLastAuthNamespaceInfo();
        if (lastInfo?.namespace) {
          migrationSourceUserId = lastInfo.namespace;
          migrationSourceIsAnonymous = lastInfo.isAnonymous;
        }
      }

      if (
        event === 'SIGNED_IN' &&
        migrationSourceIsAnonymous &&
        migrationSourceUserId &&
        nextUserId &&
        migrationSourceUserId !== nextUserId
      ) {
        try {
          await Storage.migrateNamespaceData(migrationSourceUserId, nextUserId);
        } catch (error) {
          console.warn('[AppState] Failed to migrate anonymous data to signed-in user:', error);
        }
      }

      lastUserIdRef.current = nextUserId;
      lastUserWasAnonymousRef.current = nextIsAnonymous;
      await Storage.setLastAuthNamespaceInfo(nextUserId ?? 'anonymous', nextIsAnonymous);
      loadAll();
    });

    return () => subscription.unsubscribe();
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

  const startSession = async (
    mealType: MealType,
    note: string,
    strictMode: boolean,
    preImageUri?: string,
    foodName?: string,
    preCheck?: FoodCheckResult,
    preNutrition?: NutritionEstimate,
    barcode?: string,
    preBarcodeData?: { type: string; data: string },
  ) => {
    const session: MealSession = {
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      mealType,
      foodName,
      note,
      strictMode,
      preImageUri,
      preNutrition,
      barcode,
      preBarcodeData,
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

    // Log to Supabase (async, non-blocking)
    logCompletedMeal(completed).catch((e) =>
      console.warn('[AppState] Supabase meal log failed:', e?.message),
    );

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

  const updateCompletedSessionFeedback = async (
    sessionId: string,
    distractionRating: number,
    estimatedDistractionMinutes: number,
  ) => {
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing) return;

    const updated: MealSession = {
      ...existing,
      distractionRating,
      estimatedDistractionMinutes,
    };

    await Storage.saveMealSession(updated);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));

    updateSessionDistraction(sessionId, distractionRating, estimatedDistractionMinutes).catch((e) =>
      console.warn('[AppState] updateSessionDistraction failed:', e?.message),
    );
  };

  const deleteSession = async (sessionId: string) => {
    await Storage.deleteMealSession(sessionId);
    if (activeSession?.id === sessionId) {
      await Storage.setActiveSession(null);
      setActiveSession(null);
    }
    const updated = await Storage.getMealSessions();
    setSessions(updated);
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
        updateCompletedSessionFeedback,
        deleteSession,
        clearAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
