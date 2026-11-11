"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { db, client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand";
import { Landing } from "./landing";

export type AuthMode = "login" | "signup" | "reset" | "password";

/**
 * Signed-out experience: the landing page with the access card in its hero,
 * or the card alone while a password recovery is being completed.
 */
export function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(recovery ? "password" : "login");
  if (recovery)
    return (
      <main className="auth-focus">
        <BrandLogo tone="blue" />
        <AuthCard
          mode={mode}
          onMode={setMode}
          onRecovered={onRecovered}
          heading="h1"
        />
      </main>
    );
  return (
    <Landing
      onAccess={(next) => {
        setMode(next);
        // The anchor scrolls to the card; focus follows without a second jump.
        requestAnimationFrame(() =>
          document.getElementById("auth-email")?.focus({ preventScroll: true }),
        );
      }}
    >
      <AuthCard mode={mode} onMode={setMode} onRecovered={onRecovered} />
    </Landing>
  );
}

function AuthCard({
  mode,
  onMode,
  onRecovered,
  heading: Heading = "h2",
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  onRecovered: () => void;
  heading?: "h1" | "h2";
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  // Feedback belongs to the form that produced it.
  useEffect(() => {
    setError("");
    setMessage("");
  }, [mode]);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const email = String(form.get("email") || ""),
        password = String(form.get("password") || "");
      const redirect = window.location.origin;
      if (mode === "login")
        check(await client().auth.signInWithPassword({ email, password }));
      if (mode === "signup") {
        check(
          await client().auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirect },
          }),
        );
        setMessage(
          "Conta criada. Confira seu e-mail para confirmar o cadastro.",
        );
      }
      if (mode === "reset") {
        check(
          await client().auth.resetPasswordForEmail(email, {
            redirectTo: redirect,
          }),
        );
        setMessage(
          "Se houver uma conta, você receberá um link para redefinir a senha.",
        );
      }
      if (mode === "password") {
        check(await client().auth.updateUser({ password }));
        onRecovered();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-box">
      <Heading className="auth-title" id="auth-title">
        {mode === "login"
          ? t("Entre na sua conta")
          : mode === "signup"
            ? t("Crie sua conta")
            : mode === "reset"
              ? t("Recupere seu acesso")
              : t("Defina sua nova senha")}
      </Heading>
      <p className="muted">
        {mode === "login"
          ? t("Entre na sua conta para acessar seus workspaces.")
          : mode === "signup"
            ? t("Sua organização começa com um espaço só seu.")
            : mode === "reset"
              ? t("Informe seu e-mail para receber o link de recuperação.")
              : t("Escolha uma senha com pelo menos 8 caracteres.")}
      </p>
      {!db && (
        <p className="connection-notice" role="status">
          {t(
            "Seu espaço está sendo preparado. O acesso será liberado assim que a conexão estiver configurada.",
          )}
        </p>
      )}
      <form
        aria-labelledby="auth-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        {mode !== "password" && (
          <label>
            {t("E-mail")}
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("voce@exemplo.com")}
              required
              maxLength={254}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            {t("Senha")}
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder={t("Pelo menos 8 caracteres")}
              required
              minLength={8}
              maxLength={128}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {t(error)}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            <Check size={18} aria-hidden="true" />
            {t(message)}
          </p>
        )}
        <Button disabled={busy || !db} className="full">
          {busy
            ? t("Aguarde…")
            : mode === "login"
              ? t("Entrar na minha conta")
              : mode === "signup"
                ? t("Criar conta")
                : mode === "reset"
                  ? t("Enviar link de recuperação")
                  : t("Salvar nova senha")}
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </form>
      {mode === "login" && (
        <Button
          variant="ghost"
          className="full"
          onClick={() => onMode("reset")}
        >
          {t("Esqueci minha senha")}
        </Button>
      )}
      {mode !== "password" && (
        <div className="auth-switch">
          {mode === "login"
            ? t("Ainda não tem conta?")
            : t("Já tem uma conta?")}{" "}
          <button onClick={() => onMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? t("Criar conta") : t("Entrar")}
          </button>
        </div>
      )}
      <p className="privacy-note">
        <LockKeyhole size={14} aria-hidden="true" />
        {t("Seus workspaces são privados e individuais.")}
      </p>
    </div>
  );
}
