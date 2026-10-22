import type { Locale } from "./core";

export function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateFromValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return dateValue(date) === value ? date : null;
}
export function inputDate(value: string, locale: Locale) {
  const date = dateFromValue(value);
  return date
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date)
    : "";
}
export function parseInputDate(value: string, locale: Locale): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, first, second, year] = match;
  const month = locale === "en-US" ? first : second;
  const day = locale === "en-US" ? second : first;
  const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return dateFromValue(result) ? result : null;
}
