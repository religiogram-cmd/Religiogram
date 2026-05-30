'use client';
import { createContext, useContext, ReactNode } from 'react';

interface ThemeContextType {
  religion: string;
  setReligion: (r: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  religion: 'all',
  setReligion: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ religion: 'all', setReligion: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
