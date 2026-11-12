/*
 * Appearance preference: Light, Dark or System.
 *
 * The choice is kept in localStorage, per browser, because it has to be known
 * before the first paint — earlier than the session — and because the right
 * theme depends on the device and its surroundings more than on the account.
 * "System" stores nothing on <html>: the stylesheet follows the operating
 * system through prefers-color-scheme on its own.
 */
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const themeKey = "tasknado.theme";
export const themeModes: ThemeMode[] = ["light", "dark", "system"];
/** Browser chrome colour for each theme; matches --background. */
export const themeColors: Record<ResolvedTheme, string> = {
  light: "#ffffff",
  dark: "#0b1220",
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}

export function readTheme(storage: Pick<Storage, "getItem">): ThemeMode {
  try {
    const value = storage.getItem(themeKey);
    return isThemeMode(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(
  mode: ThemeMode,
  systemDark: boolean,
): ResolvedTheme {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

/** Reflects the preference on the document. Changes nothing else. */
export function applyTheme(mode: ThemeMode, doc: Document) {
  if (mode === "system") doc.documentElement.removeAttribute("data-theme");
  else doc.documentElement.setAttribute("data-theme", mode);
  for (const meta of doc.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = themeColors[mode === "system" ? own : mode];
  }
}

/**
 * Runs in <head> while the HTML is parsed, so an explicit Light or Dark choice
 * is on <html> before anything is painted. Kept dependency-free and tiny.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(themeKey)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
