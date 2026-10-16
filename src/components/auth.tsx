"use client";
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
            <span /> SEU ESPAÇO. SEU RITMO.
          </span>
          <h1>
            Um mar de ideias.
            <br />
            <em>Um rumo claro.</em>
          </h1>
          <p>
            Encontre tranquilidade para focar. Organize suas atividades, guarde
            suas ideias e retome de onde parou — com todo o contexto.
          </p>
          <div className="story-features">
            <span>
              <Layers />
              <span>
                <strong>Seu universo</strong>
                <small>Workspaces pessoais</small>
              </span>
            </span>
            <span>
              <History />
              <span>
                <strong>Cada movimento</strong>
                <small>Histórico preservado</small>
              </span>
            </span>
            <span>
              <NotebookPen />
              <span>
                <strong>Ideias à vista</strong>
                <small>Notas e referências</small>
              </span>
            </span>
          </div>
        </div>
        <div className="ocean-signature">
          <Waves size={18} />
          <span>
            Encontre seu fluxo.
            <br />
            <strong>Continue no seu ritmo.</strong>
          </span>
          <div className="ocean-rule" />
          <BrandSymbol decorative className="signature-shark" />
        </div>
      </section>
      <section className="auth-form">
        <div className="auth-form-overline">
          <LockKeyhole size={13} /> PESSOAL POR NATUREZA. PRIVADO POR PRINCÍPIO.
        </div>
        <div className="auth-box">
          <div className="auth-card-heading">
            <span className="auth-card-symbol">
              <BrandSymbol decorative size="sm" />
            </span>
            <span className="eyebrow">SEU ESPAÇO PESSOAL</span>
          </div>
          <h2>
            {mode === "login"
              ? "Volte ao seu fluxo."
              : mode === "signup"
                ? "Comece seu novo espaço"
                : mode === "reset"
                  ? "Recupere seu acesso"
                  : "Defina sua nova senha"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Entre na sua conta para acessar seus workspaces."
              : "Sua organização começa com um espaço só seu."}
          </p>
          {!db && (
            <p className="connection-notice" role="status">
              Seu espaço está sendo preparado. O acesso será liberado assim que
              a conexão estiver configurada.
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
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Pelo menos 8 caracteres"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="success">
                <Check size={18} />
                {message}
              </p>
            )}
            <Button disabled={busy || !db} className="full">
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Entrar na minha conta"
                  : mode === "signup"
                    ? "Criar conta"
                    : mode === "reset"
                      ? "Enviar link de recuperação"
                      : "Salvar nova senha"}
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
              Esqueci minha senha
            </Button>
          )}
          {mode !== "password" && (
            <div className="auth-switch">
              {mode === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setMessage("");
                }}
              >
                {mode === "login" ? "Criar conta" : "Entrar"}
              </button>
            </div>
          )}
          <div className="privacy-note">
            <LockKeyhole size={15} /> Seus workspaces são privados e
            individuais.
          </div>
        </div>
        <span className="auth-form-caption">
          Menos ruído. Mais espaço para o que importa.
        </span>
      </section>
    </div>
  );
}
