import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, ThemeName, themes, LightTheme } from './colors';

interface ThemeContextType {
  theme: ThemeColors;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: LightTheme,
  themeName: 'Light',
  setThemeName: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('Light');

  useEffect(() => {
    AsyncStorage.getItem('eatlock_theme').then((val) => {
      if (val === 'Light' || val === 'Dark' || val === 'Blue') {
        setThemeNameState(val);
      } else {
        setThemeNameState('Light');
        AsyncStorage.setItem('eatlock_theme', 'Light');
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
