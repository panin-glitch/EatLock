import type { FoodCheckResult, CompareResult, SessionStatus, NutritionEstimate } from '../services/vision/types';

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Custom';
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export { SessionStatus } from '../services/vision/types';

/** Maps app-side MealType to Supabase enum value */
export function mealTypeToDb(t: MealType): string {
  return t.toLowerCase();
}

/** Maps Supabase enum value to app-side MealType */
export function dbToMealType(s: string): MealType {
  const map: Record<string, MealType> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    custom: 'Custom',
  };
  return map[s] ?? 'Custom';
}

export interface MealSchedule {
  id: string;
  name: string;
  mealType: MealType;
  timeOfDay: string; // HH:mm format
  repeatDays: DayOfWeek[];
  enabled: boolean;
  reminderMessage: string;
  notificationEnabled: boolean;
}

export interface BlockConfig {
  blockedApps: AppInfo[];
  blockShortsFlags: {
    ytShorts: boolean;
    igReels: boolean;
    snapSpotlight: boolean;
    fbReels: boolean;
  };
  blockWebsites: string[];
  blockNotificationsEnabled: boolean;
  protections: {
    blockUninstall: boolean;
    blockSplitScreen: boolean;
    blockFloatingWindow: boolean;
  };
}

export interface AppInfo {
  id: string;
  name: string;
  icon: string; // icon name from MaterialIcons or similar
  dailyLimitMinutes?: number;
}

/** Verification data collected during the meal session */
export interface SessionVerification {
  preCheck?: FoodCheckResult;
  postCheck?: FoodCheckResult;
  compareResult?: CompareResult;
}

export interface MealSession {
  id: string;
  startedAt: string; // ISO string — when session began
  endedAt?: string;  // ISO string — when session ended
  mealType: MealType;
  foodName?: string;
  note: string;
  strictMode: boolean;

  /** Local file URIs for before/after photos */
  preImageUri?: string;
  postImageUri?: string;

  /** On-device vision verification data */
  verification: SessionVerification;

  /** Session lifecycle status */
  status: SessionStatus;

  /** Pre-scan nutrition estimate (calories + macros) */
  preNutrition?: NutritionEstimate;

  /** Roast or praise message from vision comparison */
  roastMessage?: string;

  /** User tapped override to skip verification */
  overrideUsed: boolean;

  /** Snapshot of blocked app names when session started */
  blockedAppsAtTime: string[];

  // ── Legacy fields (kept for backward compat) ──
  distractionRating?: number; // 1-5
  estimatedDistractionMinutes?: number;
  /** @deprecated Use preImageUri */
  beforePhotoPath?: string;
  /** @deprecated Use postImageUri */
  afterPhotoPath?: string;
  /** @deprecated Server-based flow key */
  beforeR2Key?: string;
  /** @deprecated Use roastMessage */
  roast?: string;
}

export interface TruthBombSettings {
  enabled: boolean;
  categories: {
    mindfulEating: boolean;
    nutritionBasics: boolean;
    motivation: boolean;
  };
}

export interface HomeWidgetSettings {
  showWhatEating: boolean;
  showNextMeal: boolean;
  showLockedApps: boolean;
  showTruthBomb: boolean;
}

export interface UserSettings {
  truthBomb: TruthBombSettings;
  homeWidgets: HomeWidgetSettings;
}

export const DEFAULT_BLOCK_CONFIG: BlockConfig = {
  blockedApps: [
    { id: 'instagram', name: 'Instagram', icon: 'camera' },
    { id: 'tiktok', name: 'TikTok', icon: 'music-note' },
    { id: 'youtube', name: 'YouTube', icon: 'play-circle-outline' },
    { id: 'snapchat', name: 'Snapchat', icon: 'chat-bubble' },
    { id: 'twitter', name: 'X (Twitter)', icon: 'tag' },
  ],
  blockShortsFlags: {
    ytShorts: false,
    igReels: false,
    snapSpotlight: false,
    fbReels: false,
  },
  blockWebsites: [],
  blockNotificationsEnabled: false,
  protections: {
    blockUninstall: false,
    blockSplitScreen: false,
    blockFloatingWindow: false,
  },
};

export const DEFAULT_MEAL_SCHEDULES: MealSchedule[] = [
  {
    id: 'default-breakfast',
    name: 'Breakfast',
    mealType: 'Breakfast',
    timeOfDay: '08:00',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    reminderMessage: 'Time for breakfast! 🍳',
    notificationEnabled: true,
  },
  {
    id: 'default-lunch',
    name: 'Lunch',
    mealType: 'Lunch',
    timeOfDay: '14:00',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    reminderMessage: 'Lunch time! 🥗',
    notificationEnabled: true,
  },
  {
    id: 'default-snack',
    name: 'Snack',
    mealType: 'Snack',
    timeOfDay: '17:00',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    reminderMessage: 'Snack time! 🍎',
    notificationEnabled: true,
  },
  {
    id: 'default-dinner',
    name: 'Dinner',
    mealType: 'Dinner',
    timeOfDay: '20:00',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    reminderMessage: 'Dinner is served! 🍽️',
    notificationEnabled: true,
  },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  truthBomb: {
    enabled: true,
    categories: {
      mindfulEating: true,
      nutritionBasics: true,
      motivation: true,
    },
  },
  homeWidgets: {
    showWhatEating: true,
    showNextMeal: true,
    showLockedApps: true,
    showTruthBomb: true,
  },
};

export const AVAILABLE_APPS: AppInfo[] = [
  { id: 'instagram', name: 'Instagram', icon: 'camera' },
  { id: 'tiktok', name: 'TikTok', icon: 'music-note' },
  { id: 'youtube', name: 'YouTube', icon: 'play-circle-outline' },
  { id: 'snapchat', name: 'Snapchat', icon: 'chat-bubble' },
  { id: 'twitter', name: 'X (Twitter)', icon: 'tag' },
  { id: 'facebook', name: 'Facebook', icon: 'people' },
  { id: 'reddit', name: 'Reddit', icon: 'forum' },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'message' },
  { id: 'telegram', name: 'Telegram', icon: 'send' },
  { id: 'discord', name: 'Discord', icon: 'headset' },
  { id: 'netflix', name: 'Netflix', icon: 'movie' },
  { id: 'twitch', name: 'Twitch', icon: 'videocam' },
  { id: 'pinterest', name: 'Pinterest', icon: 'push-pin' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'work' },
  { id: 'gmail', name: 'Gmail', icon: 'email' },
];
