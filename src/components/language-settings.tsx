"use client";

import { useI18n } from "@/i18n/provider";
import { isLocale } from "@/i18n/core";

export function LanguageSettings() {
  const { t, locale, setLocale, storageError } = useI18n();
  return (
    <section
      className="panel settings-panel"
      aria-labelledby="language-heading"
    >
      <h2 id="language-heading">{t("Idioma e região")}</h2>
      <p className="muted">
        {t(
          "Escolha o idioma da interface. Seus conteúdos permanecem como foram registrados.",
        )}
      </p>
      <label className="language-select">
        {t("Idioma da interface")}
        <select
          value={locale}
          onChange={(event) => {
            if (isLocale(event.target.value)) setLocale(event.target.value);
          }}
        >
          <option value="pt-BR" lang="pt-BR">
            🇧🇷 Português (Brasil)
          </option>
          <option value="en-US" lang="en-US">
            🇺🇸 English (US)
          </option>
        </select>
      </label>
      <p className={storageError ? "error" : "hint"} role="status">
        {t(
          storageError
            ? "Não foi possível salvar a preferência neste navegador. O idioma permanece ativo nesta sessão."
            : "Preferência salva neste navegador para sua conta.",
        )}
      </p>
    </section>
  );
}
