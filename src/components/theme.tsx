"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { ThemeMode } from "@/lib/theme";
import { useTheme } from "@/lib/theme-provider";

export const themeOptions: {
  mode: ThemeMode;
  label: string;
  icon: typeof Sun;
}[] = [
  { mode: "light", label: "Claro", icon: Sun },
  { mode: "dark", label: "Escuro", icon: Moon },
  { mode: "system", label: "Sistema", icon: Monitor },
];

/** Light / Dark / System as a group of radio buttons. */
export function ThemeControl({ name = "theme" }: { name?: string }) {
  const { t } = useI18n();
  const { mode, setMode } = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label={t("Aparência")}>
      {themeOptions.map(({ mode: value, label, icon: Icon }) => (
        <label key={value} className="segmented-option">
          <input
            type="radio"
            name={name}
            value={value}
            checked={mode === value}
            onChange={() => setMode(value)}
          />
          <span>
            <Icon size={15} aria-hidden="true" />
            {t(label)}
          </span>
        </label>
      ))}
    </div>
  );
}

export function ThemeSettings() {
  const { t } = useI18n();
  const { mode, resolved, storageError } = useTheme();
  return (
    <section className="panel settings-panel" aria-labelledby="theme-heading">
      <h2 id="theme-heading">{t("Aparência")}</h2>
      <p className="muted">
        {t(
          "Escolha o tema claro, o escuro ou acompanhe a configuração do seu dispositivo.",
        )}
      </p>
      <div className="theme-setting">
        <ThemeControl name="theme-settings" />
      </div>
      <p className={storageError ? "error" : "hint"} role="status">
        {t(
          storageError
            ? "Não foi possível salvar a aparência neste navegador. Ela permanece ativa nesta sessão."
            : mode === "system"
              ? resolved === "dark"
                ? "Seguindo o dispositivo: tema escuro."
                : "Seguindo o dispositivo: tema claro."
              : "Preferência salva neste navegador.",
        )}
      </p>
    </section>
  );
}
