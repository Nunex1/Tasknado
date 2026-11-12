"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  applyTheme,
  isThemeMode,
  readTheme,
  resolveTheme,
  themeKey,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";

const Theme = createContext<{
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  storageError: boolean;
} | null>(null);

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline script in <head> has already applied the stored choice; this
  // state starts from the same source so both always agree.
  const [mode, setModeState] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "system" : readTheme(window.localStorage),
  );
  const [storageError, setStorageError] = useState(false);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(darkQuery).matches,
    () => false,
  );

  // Also restores the attribute after the development-only remount.
  useLayoutEffect(() => applyTheme(mode, document), [mode]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null)
        setModeState(isThemeMode(event.newValue) ? event.newValue : "system");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    if (!isThemeMode(next)) return;
    // Colours change in one repaint: without this, elements that animate
    // their background would fade while everything else had already switched.
    const root = document.documentElement;
    root.setAttribute("data-theme-switching", "");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.removeAttribute("data-theme-switching")),
    );
    setModeState(next);
    try {
      window.localStorage.setItem(themeKey, next);
      setStorageError(false);
    } catch {
      // The theme still applies to this page; it just will not be remembered.
      setStorageError(true);
    }
  }, []);

  return (
    <Theme.Provider
      value={{
        mode,
        resolved: resolveTheme(mode, systemDark),
        setMode,
        storageError,
      }}
    >
      {children}
    </Theme.Provider>
  );
}

export function useTheme() {
  const theme = useContext(Theme);
  if (!theme) throw new Error("ThemeProvider is required");
  return theme;
}
