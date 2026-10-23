"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { userProfile, avatarForeground } from "@/lib/user-profile";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";

const colors = [
  "#0353a4",
  "#0466c8",
  "#023e7d",
  "#33415c",
  "#52796f",
  "#7d8597",
];
export function Profile({
  user,
  onSaved,
  report,
  onDirty,
}: {
  user: User;
  onSaved: (user: User) => void;
  report: (message: string) => void;
  onDirty: (id: string, value: boolean) => void;
}) {
  const { t } = useI18n();
  const profile = userProfile(user);
  const [name, setName] = useState(profile.name || "");
  const [nickname, setNickname] = useState(profile.nickname);
  const [initial, setInitial] = useState(
    user.user_metadata?.avatar_initial || "",
  );
  const [color, setColor] = useState(profile.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed =
    name !== (profile.name || "") ||
    nickname !== profile.nickname ||
    initial !== (user.user_metadata?.avatar_initial || "") ||
    color !== profile.color;
  useEffect(() => {
    onDirty("profile", changed);
    return () => onDirty("profile", false);
  }, [changed, onDirty]);
  const preview = userProfile({
    ...user,
    user_metadata: {
      ...user.user_metadata,
      full_name: name,
      nickname,
      avatar_initial: initial,
      avatar_color: color,
    },
  });
  function reset() {
    setName(profile.name || "");
    setNickname(profile.nickname);
    setInitial(user.user_metadata?.avatar_initial || "");
    setColor(profile.color);
    setError("");
  }
  async function save() {
    const letter = initial.trim().normalize("NFC").toLocaleUpperCase("pt-BR");
    if (letter && !/^\p{L}$/u.test(letter)) {
      setError("Escolha uma única letra para o avatar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = check(
        await client().auth.updateUser({
          data: {
            full_name: name.trim(),
            nickname: nickname.trim(),
            avatar_initial: letter,
            avatar_color: color,
          },
        }),
      );
      setName(name.trim());
      setNickname(nickname.trim());
      setInitial(letter);
      if (!data.user) throw Error("Sessão expirada");
      onSaved(data.user);
      onDirty("profile", false);
      report("Salvo com sucesso.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("Editar perfil")}</h1>
          <p>{t("Personalize como você aparece no seu espaço.")}</p>
        </div>
      </div>
      <section className="profile-panel panel">
        <div
          className="profile-summary"
          role="group"
          aria-label={t("Prévia do avatar")}
        >
          <span
            className="avatar profile-avatar"
            style={{ background: color, color: avatarForeground(color) }}
          >
            {preview.initial || "?"}
          </span>
          <div>
            <h2>{preview.displayName || t("Minha conta")}</h2>
            <p>{user.email}</p>
            <small>{t("Prévia. As alterações são aplicadas ao salvar.")}</small>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="form-grid">
            <label>
              {t("Nome")}
              <input
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                autoComplete="name"
              />
            </label>
            <label>
              {t("Apelido")}
              <input
                value={nickname}
                disabled={busy}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={80}
                autoComplete="nickname"
              />
            </label>
          </div>
          <label>
            {t("Inicial do avatar")}
            <input
              value={initial}
              disabled={busy}
              onChange={(e) =>
                setInitial(
                  e.target.value.normalize("NFC").toLocaleUpperCase("pt-BR"),
                )
              }
              maxLength={2}
              aria-describedby="initial-help"
              className="initial-input"
              aria-label={t("Inicial do avatar")}
            />
            <small id="initial-help">
              {t(
                "Uma letra. Deixe vazio para usar a inicial do apelido ou nome.",
              )}
            </small>
          </label>
          <fieldset>
            <legend>{t("Cor do avatar")}</legend>
            <div className="color-options">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  className="color-swatch"
                  style={{ background: c }}
                  aria-label={t("Usar cor {{color}}", { color: c })}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                >
                  {color === c ? (
                    <span style={{ color: avatarForeground(c) }}>✓</span>
                  ) : null}
                </button>
              ))}
              <label className="custom-color">
                {t("Cor personalizada")}
                <input
                  type="color"
                  disabled={busy}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
          <div className="row">
            <Button disabled={busy || !changed}>
              {t(busy ? "Salvando…" : "Salvar alterações")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !changed}
              onClick={reset}
            >
              {t("Cancelar")}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
