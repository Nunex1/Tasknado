"use client";
import { useI18n } from "@/i18n/provider";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  LockKeyhole,
  Layers,
  History,
  NotebookPen,
  Waves,
} from "lucide-react";
import { db, client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { BrandLogo, BrandSymbol } from "./brand";
export function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "password">(
    recovery ? "password" : "login",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
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
    <div className="auth-layout">
      <div className="ocean-scenery" aria-hidden="true" />
      <section className="auth-story">
        <BrandLogo size="lg" />
        <div className="auth-story-content">
          <span className="ocean-kicker">
            <span /> {t("SEU ESPAÇO. SEU RITMO.")}
          </span>
          <h1>
            {t("Um mar de ideias.")}
            <br />
            <em>{t("Um rumo claro.")}</em>
          </h1>
          <p>
            {t(
              "Encontre tranquilidade para focar. Organize suas atividades, guarde suas ideias e retome de onde parou — com todo o contexto.",
            )}
          </p>
          <div className="story-features">
            <span>
              <Layers />
              <span>
                <strong>{t("Seu universo")}</strong>
                <small>{t("Workspaces pessoais")}</small>
              </span>
            </span>
            <span>
              <History />
              <span>
                <strong>{t("Cada movimento")}</strong>
                <small>{t("Histórico preservado")}</small>
              </span>
            </span>
            <span>
              <NotebookPen />
              <span>
                <strong>{t("Ideias à vista")}</strong>
                <small>{t("Notas e referências")}</small>
              </span>
            </span>
          </div>
        </div>
        <div className="ocean-signature">
          <Waves size={18} />
          <span>
            {t("Encontre seu fluxo.")}
            <br />
            <strong>{t("Continue no seu ritmo.")}</strong>
          </span>
          <div className="ocean-rule" />
          <BrandSymbol decorative className="signature-shark" />
        </div>
      </section>
      <section className="auth-form">
        <div className="auth-form-overline">
          <LockKeyhole size={13} />{" "}
          {t("PESSOAL POR NATUREZA. PRIVADO POR PRINCÍPIO.")}
        </div>
        <div className="auth-box">
          <div className="auth-card-heading">
            <span className="auth-card-symbol">
              <BrandSymbol decorative size="sm" />
            </span>
            <span className="eyebrow">{t("SEU ESPAÇO PESSOAL")}</span>
          </div>
          <h2>
            {mode === "login"
              ? t("Volte ao seu fluxo.")
              : mode === "signup"
                ? t("Comece seu novo espaço")
                : mode === "reset"
                  ? t("Recupere seu acesso")
                  : t("Defina sua nova senha")}
          </h2>
          <p className="muted">
            {mode === "login"
              ? t("Entre na sua conta para acessar seus workspaces.")
              : t("Sua organização começa com um espaço só seu.")}
          </p>
          {!db && (
            <p className="connection-notice" role="status">
              {t(
                "Seu espaço está sendo preparado. O acesso será liberado assim que a conexão estiver configurada.",
              )}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            {mode !== "password" && (
              <label>
                {t("E-mail")}
                <input
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
                <Check size={18} />
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
              <ArrowRight size={17} />
            </Button>
          </form>
          {mode === "login" && (
            <Button
              variant="ghost"
              className="full"
              onClick={() => {
                setMode("reset");
                setError("");
                setMessage("");
              }}
            >
              {t("Esqueci minha senha")}
            </Button>
          )}
          {mode !== "password" && (
            <div className="auth-switch">
              {mode === "login"
                ? t("Ainda não tem conta?")
                : t("Já tem uma conta?")}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setMessage("");
                }}
              >
                {mode === "login" ? t("Criar conta") : t("Entrar")}
              </button>
            </div>
          )}
          <div className="privacy-note">
            <LockKeyhole size={15} />{" "}
            {t("Seus workspaces são privados e individuais.")}
          </div>
        </div>
        <span className="auth-form-caption">
          {t("Menos ruído. Mais espaço para o que importa.")}
        </span>
      </section>
    </div>
  );
}
