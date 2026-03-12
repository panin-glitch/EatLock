export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryDim: string;
  onPrimary: string;
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

export const DarkTheme: ThemeColors = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',
  primary: '#FACC15',
  primaryDim: 'rgba(250,204,21,0.22)',
  onPrimary: '#0F172A',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: '#2C2C2C',
  danger: '#FF453A',
  success: '#CA8A04',
  warning: '#F59E0B',
  card: '#1C1C1E',
  tabBarBg: '#111111',
  tabBarInactive: '#6B6B6B',
  inputBg: '#2C2C2E',
  chipBg: '#2C2C2E',
  chipSelectedBg: 'rgba(250,204,21,0.28)',
  overlay: 'rgba(0,0,0,0.7)',
};

export const DarkBlueTheme: ThemeColors = {
  background: '#0A0E1A',
  surface: '#141A2E',
  surfaceElevated: '#1E2642',
  primary: '#4A9EFF',
  primaryDim: 'rgba(74,158,255,0.15)',
  onPrimary: '#FFFFFF',
  text: '#FFFFFF',
  textSecondary: '#8E9AB8',
  textMuted: '#556080',
  border: '#1E2642',
  danger: '#FF453A',
  success: '#CA8A04',
  warning: '#F59E0B',
  card: '#141A2E',
  tabBarBg: '#0A0E1A',
  tabBarInactive: '#556080',
  inputBg: '#1E2642',
  chipBg: '#1E2642',
  chipSelectedBg: 'rgba(74,158,255,0.2)',
  overlay: 'rgba(0,0,0,0.7)',
};

export const LightTheme: ThemeColors = {
  background: '#FFFDF5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#FACC15',
  primaryDim: 'rgba(250,204,21,0.18)',
  onPrimary: '#0F172A',
  text: '#111827',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#F6E7B0',
  danger: '#FF3B30',
  success: '#CA8A04',
  warning: '#F59E0B',
  card: '#FFFFFF',
  tabBarBg: 'rgba(255,255,255,0.95)',
  tabBarInactive: '#999999',
  inputBg: '#FEF3C7',
  chipBg: '#FEF3C7',
  chipSelectedBg: 'rgba(250,204,21,0.22)',
  overlay: 'rgba(0,0,0,0.35)',
};

export const themes = {
  'Dark': DarkTheme,
  'Light': LightTheme,
  'Blue': DarkBlueTheme,
} as const;

export type ThemeName = keyof typeof themes;
