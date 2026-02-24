import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, ThemeName, themes, DarkGreenTheme } from './colors';

interface ThemeContextType {
  theme: ThemeColors;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DarkGreenTheme,
  themeName: 'Dark',
  setThemeName: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('Dark');

  useEffect(() => {
    AsyncStorage.getItem('eatlock_theme').then((val) => {
      if (val && val in themes) {
        setThemeNameState(val as ThemeName);
      } else if (val === 'Dark Green' || val === 'Dark Blue') {
        // Migrate legacy theme names
        setThemeNameState('Dark');
        AsyncStorage.setItem('eatlock_theme', 'Dark');
      }
    });
  }, []);

  const setThemeName = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem('eatlock_theme', name);
  };

  return (
    <ThemeContext.Provider value={{ theme: themes[themeName], themeName, setThemeName }}>
      {children}
    </ThemeContext.Provider>
  );
}
