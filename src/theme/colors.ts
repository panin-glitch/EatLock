export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryDim: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  card: string;
  tabBarBg: string;
  tabBarInactive: string;
  inputBg: string;
  chipBg: string;
  chipSelectedBg: string;
  overlay: string;
}

export const DarkGreenTheme: ThemeColors = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',
  primary: '#34C759',
  primaryDim: 'rgba(52,199,89,0.15)',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: '#2C2C2C',
  danger: '#FF453A',
  success: '#34C759',
  warning: '#FFD60A',
  card: '#1C1C1E',
  tabBarBg: '#111111',
  tabBarInactive: '#6B6B6B',
  inputBg: '#2C2C2E',
  chipBg: '#2C2C2E',
  chipSelectedBg: 'rgba(52,199,89,0.2)',
  overlay: 'rgba(0,0,0,0.7)',
};

export const DarkBlueTheme: ThemeColors = {
  background: '#0A0E1A',
  surface: '#141A2E',
  surfaceElevated: '#1E2642',
  primary: '#4A9EFF',
  primaryDim: 'rgba(74,158,255,0.15)',
  text: '#FFFFFF',
  textSecondary: '#8E9AB8',
  textMuted: '#556080',
  border: '#1E2642',
  danger: '#FF453A',
  success: '#34C759',
  warning: '#FFD60A',
  card: '#141A2E',
  tabBarBg: '#0A0E1A',
  tabBarInactive: '#556080',
  inputBg: '#1E2642',
  chipBg: '#1E2642',
  chipSelectedBg: 'rgba(74,158,255,0.2)',
  overlay: 'rgba(0,0,0,0.7)',
};

export const LightTheme: ThemeColors = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#34C759',
  primaryDim: 'rgba(52,199,89,0.12)',
  text: '#000000',
  textSecondary: '#6B6B6B',
  textMuted: '#AEAEB2',
  border: '#E5E5EA',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  card: '#FFFFFF',
  tabBarBg: '#FFFFFF',
  tabBarInactive: '#999999',
  inputBg: '#E5E5EA',
  chipBg: '#E5E5EA',
  chipSelectedBg: 'rgba(52,199,89,0.15)',
  overlay: 'rgba(0,0,0,0.4)',
};

export const themes = {
  'Dark': DarkGreenTheme,
  'Light': LightTheme,
} as const;

export type ThemeName = keyof typeof themes;
