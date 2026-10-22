"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import {
  createI18n,
  defaultLocale,
  formatBytes,
  formatDate,
  isLocale,
  preferenceKey,
  readLocale,
  type Locale,
} from "./core";

const Preferences = createContext<{
  setLocale: (locale: Locale) => void;
  setAccount: (id: string | null) => void;
  storageError: boolean;
} | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // A separate instance per provider also keeps server renders isolated.
  const [instance] = useState(() => createI18n());
  const [storageError, setStorageError] = useState(false);
  const account = useRef<string | null>(null);
  const pathname = usePathname();

  const setAccount = useCallback(
    (id: string | null) => {
      account.current = id;
      setStorageError(false);
      let locale = defaultLocale;
      try {
        locale = readLocale(window.localStorage, id);
      } catch {
        /* Storage can be disabled. */
      }
      void instance.changeLanguage(locale);
    },
    [instance],
  );

  const setLocale = useCallback(
    (locale: Locale) => {
      if (!isLocale(locale)) return;
      void instance.changeLanguage(locale);
      try {
        window.localStorage.setItem(preferenceKey(account.current), locale);
        // The signed-out screen uses the last language on this browser. An account
        // with no saved preference still starts in pt-BR, independently of this key.
        if (account.current)
          window.localStorage.setItem(preferenceKey(null), locale);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    },
    [instance],
  );

  useEffect(() => {
    setAccount(account.current);
    const sync = (event: StorageEvent) => {
      if (event.key === preferenceKey(account.current) || event.key === null) {
        void instance.changeLanguage(
          isLocale(event.newValue) ? event.newValue : defaultLocale,
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [instance, setAccount]);

  useEffect(() => {
    const updateDocument = () => {
      document.documentElement.lang = instance.language;
      document.title =
        pathname === "/perfil"
          ? `${instance.t("Perfil")} · Tasknado`
          : instance.t("Tasknado · Sua memória operacional");
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute(
          "content",
          instance.t(
            "Atividades, contexto e conhecimento em um espaço pessoal.",
          ),
        );
    };
    updateDocument();
    instance.on("languageChanged", updateDocument);
    return () => {
      instance.off("languageChanged", updateDocument);
    };
  }, [instance, pathname]);

  useEffect(() => {
    type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const owned = new Set<Control>();
    const localizeValidation = (control: Control) => {
      control.setCustomValidity("");
      const validity = control.validity;
      let message = "";
      if (validity.valueMissing) message = instance.t("Campo obrigatório.");
      else if (
        validity.typeMismatch &&
        control instanceof HTMLInputElement &&
        control.type === "email"
      )
        message = instance.t("Informe um endereço de e-mail válido.");
      else if (validity.tooShort && "minLength" in control)
        message = instance.t("Informe pelo menos {{count}} caracteres.", {
          count: control.minLength,
        });
      else if (validity.tooLong && "maxLength" in control)
        message = instance.t("Use no máximo {{count}} caracteres.", {
          count: control.maxLength,
        });
      else if (!validity.valid)
        message = instance.t("Confira o valor informado.");
      control.setCustomValidity(message);
      if (message) owned.add(control);
      else owned.delete(control);
    };
    const onInvalid = (event: Event) => {
      const control = event.target;
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      )
        localizeValidation(control);
    };
    const onInput = (event: Event) => {
      const control = event.target as Control;
      if (owned.has(control)) {
        control.setCustomValidity("");
        owned.delete(control);
      }
    };
    const updateValidation = () => {
      for (const control of owned) {
        if (control.isConnected) localizeValidation(control);
        else owned.delete(control);
      }
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onInput, true);
    instance.on("languageChanged", updateValidation);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onInput, true);
      instance.off("languageChanged", updateValidation);
      for (const control of owned) control.setCustomValidity("");
    };
  }, [instance]);

  return (
    <I18nextProvider i18n={instance}>
      <Preferences.Provider value={{ setLocale, setAccount, storageError }}>
        {children}
      </Preferences.Provider>
    </I18nextProvider>
  );
}

export function useI18n() {
  const { t, i18n } = useTranslation();
  const preferences = useContext(Preferences);
  if (!preferences) throw new Error("LanguageProvider is required");
  const locale = isLocale(i18n.language) ? i18n.language : defaultLocale;
  return {
    t,
    locale,
    ...preferences,
    date: (value: string) => formatDate(value, locale),
    bytes: (value: number) => formatBytes(value, locale),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
  };
}
