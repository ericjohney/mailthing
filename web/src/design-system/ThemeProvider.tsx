import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
const storageKey = 'mailthing-theme';
const mediaQuery = '(prefers-color-scheme: dark)';

function normalizePreference(value: string | null): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}
function readPreference(): ThemePreference {
  try {
    return normalizePreference(localStorage.getItem(storageKey));
  } catch {
    return 'light';
  }
}
function systemTheme(): Theme {
  return window.matchMedia?.(mediaQuery).matches ? 'dark' : 'light';
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Resolve appearance before React renders to avoid a flash of the wrong palette. */
export function initializeTheme() {
  const preference = readPreference();
  applyTheme(preference === 'system' ? systemTheme() : preference);
}

type ThemeContextValue = {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [system, setSystem] = useState(systemTheme);
  const theme = preference === 'system' ? system : preference;

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia?.(mediaQuery);
    const update = () => setSystem(systemTheme());
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreferenceState(readPreference());
    };
    media?.addEventListener('change', update);
    window.addEventListener('storage', storage);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('storage', storage);
    };
  }, []);

  function setPreference(value: ThemePreference) {
    setPreferenceState(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* Appearance still works when storage is unavailable. */
    }
  }
  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
