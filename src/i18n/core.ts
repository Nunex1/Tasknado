import { createInstance } from "i18next";
import ptBR from "./pt-BR.json";
import enUS from "./en-US.json";

export const locales = ["pt-BR", "en-US"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt-BR";
export const resources = {
  "pt-BR": { translation: ptBR },
  "en-US": { translation: enUS },
};
export function isLocale(value: unknown): value is Locale {
  return value === "pt-BR" || value === "en-US";
}
export function preferenceKey(accountId: string | null) {
  return accountId ? `tasknado.locale:${accountId}` : "tasknado.locale";
}
export function readLocale(
  storage: Pick<Storage, "getItem">,
  accountId: string | null,
): Locale {
  try {
    const value = storage.getItem(preferenceKey(accountId));
    return isLocale(value) ? value : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
export function createI18n(locale: Locale = defaultLocale) {
  const instance = createInstance();
  void instance.init({
    resources,
    lng: locale,
    supportedLngs: [...locales],
    fallbackLng: defaultLocale,
    load: "currentOnly",
    keySeparator: false,
    nsSeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
export function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export function formatBytes(value: number, locale: Locale) {
  const unit = value < 1024 ? "B" : value < 1048576 ? "KB" : "MB";
  const amount =
    unit === "B" ? value : unit === "KB" ? value / 1024 : value / 1048576;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: unit === "B" ? 0 : 1, maximumFractionDigits: unit === "B" ? 0 : 1 }).format(amount)} ${unit}`;
}
