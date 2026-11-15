import type { Resource } from "i18next";
import { createInstance } from "i18next";
import ptBR from "./pt-BR.json";

export const locales = ["pt-BR", "en-US"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt-BR";
export const resources = {
  "pt-BR": { translation: ptBR },
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
export function createI18n(
  locale: Locale = defaultLocale,
  catalogs: Resource = resources,
) {
  const instance = createInstance();
  void instance.init({
    resources: catalogs,
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
export async function ensureLocale(
  instance: ReturnType<typeof createI18n>,
  locale: Locale,
) {
  if (
    locale === "en-US" &&
    !instance.hasResourceBundle(locale, "translation")
  ) {
    const catalog = (await import("./en-US.json")).default;
    instance.addResourceBundle(locale, "translation", catalog, true, true);
  }
}
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
export function dateFormatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {},
) {
  const key = locale + JSON.stringify(options);
  let formatter = dateFormats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, formatter);
  }
  return formatter;
}
export function numberFormatter(
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
) {
  const key = locale + JSON.stringify(options);
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, formatter);
  }
  return formatter;
}
export function formatDate(value: string, locale: Locale) {
  return dateFormatter(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export function formatBytes(value: number, locale: Locale) {
  const unit = value < 1024 ? "B" : value < 1048576 ? "KB" : "MB";
  const amount =
    unit === "B" ? value : unit === "KB" ? value / 1024 : value / 1048576;
  return `${numberFormatter(locale, { minimumFractionDigits: unit === "B" ? 0 : 1, maximumFractionDigits: unit === "B" ? 0 : 1 }).format(amount)} ${unit}`;
}
