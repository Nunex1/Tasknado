"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Home,
  Folder,
  ListTodo,
  Search,
  MoreHorizontal,
  UserRound,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  LockKeyhole,
  NotebookPen,
  Settings,
  LogOut,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  Workspace,
  Activity,
  SearchResult,
  workspaceCategories,
} from "@/lib/domain";
import { workspacePath, View } from "@/lib/navigation";
import { BrandSymbol, BrandWordmark } from "./brand";
import { ProfileMenu } from "./profile-menu";
import { HeaderSearch } from "./header-search";

export const workspaceTabs: { view: View; label: string }[] = [
  { view: "dashboard", label: "Visão geral" },
  { view: "activities", label: "Atividades" },
  { view: "observations", label: "Observações" },
  { view: "history", label: "Histórico" },
  { view: "matrix", label: "Matriz de Eisenhower" },
];
export function DesktopShell({
  user,
  workspaces,
  workspace,
  activities,
  view,
  canLeave,
  go,
  onCreate,
  onResult,
  onSignOut,
  children,
}: {
  user: User;
  workspaces: Workspace[];
  workspace?: Workspace;
  activities: Activity[];
  view: View;
  canLeave: () => boolean;
  go: (path: string) => void;
  onCreate: () => void;
  onResult: (result: SearchResult) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const { t, locale, setLocale, storageError } = useI18n();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false),
    [more, setMore] = useState(false);
  const moreRoot = useRef<HTMLDivElement>(null),
    moreTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setCollapsed(
        localStorage.getItem(`tasknado.panel:${user.id}`) === "collapsed",
      );
    } catch {}
  }, [user.id]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!moreRoot.current?.contains(e.target as Node)) setMore(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && more) {
        setMore(false);
        moreTrigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [more]);
  function collapse() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(
          `tasknado.panel:${user.id}`,
          v ? "expanded" : "collapsed",
        );
      } catch {}
      return !v;
    });
  }
  const contextual = path.startsWith("/workspaces");
  const guard = (event: { preventDefault: () => void }) => {
    if (!canLeave()) event.preventDefault();
  };
  return (
    <div
      className={`desktop-app ${contextual && !collapsed ? "with-context" : ""}`}
    >
      <a href="#main" className="skip-link">
        {t("Ir para o conteúdo")}
      </a>
      <header className="global-header">
        <div className="brand brand--sm brand--horizontal">
          <Link
            href="/"
            className="brand-home-link brand-home-symbol"
            aria-label={t("Tubarão-martelo — Visão geral")}
            onNavigate={guard}
          >
            <BrandSymbol size="sm" decorative />
          </Link>
          <Link
            href="/"
            className="brand-home-link brand-home-wordmark"
            aria-label={t("TASKNADO — Visão geral")}
            onNavigate={guard}
          >
            <BrandWordmark size="sm" tone="blue" decorative />
          </Link>
        </div>
        <div className="header-center">
          <HeaderSearch workspaces={workspaces} onOpen={onResult} />
          <label className="header-language">
            <Globe size={16} aria-hidden="true" />
            <select
              aria-label={t("Idioma da interface")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as "pt-BR" | "en-US")}
            >
              <option value="pt-BR">PT</option>
              <option value="en-US">EN</option>
            </select>
          </label>
        </div>
        <div className="header-account">
          <span className="private-label">
            <LockKeyhole size={13} />
            {t("Pessoal e privado")}
          </span>
          <ProfileMenu user={user} canNavigate={canLeave} />
        </div>
      </header>
      {storageError && (
        <div className="preference-error" role="alert">
          {t(
            "Não foi possível sincronizar o idioma. Tente novamente nas configurações.",
          )}
        </div>
      )}
      <nav className="primary-rail" aria-label={t("Navegação principal")}>
        {[
          { href: "/", label: "Início", icon: Home },
          { href: "/workspaces", label: "Workspaces", icon: Folder },
          { href: "/activities", label: "Atividades", icon: ListTodo },
          { href: "/search", label: "Pesquisar", icon: Search },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onNavigate={guard}
            className={`rail-item ${path === href || (href === "/workspaces" && contextual) ? "active" : ""}`}
            aria-current={
              path === href || (href === "/workspaces" && contextual)
                ? "page"
                : undefined
            }
          >
            <Icon size={20} />
            <span>{t(label)}</span>
          </Link>
        ))}
        <div
          className="more-root"
          ref={moreRoot}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMore(false);
          }}
        >
          <button
            ref={moreTrigger}
            className="rail-item"
            aria-expanded={more}
            aria-controls="more-navigation"
            onClick={() => setMore((v) => !v)}
          >
            <MoreHorizontal size={20} />
            <span>{t("Mais")}</span>
          </button>
          {more && (
            <div className="more-popover" id="more-navigation">
              <Link
                href={
                  workspace ? workspacePath(workspace.id, "notes") : "/notes"
                }
                onNavigate={(e) => {
                  guard(e);
                  setMore(false);
                }}
              >
                <NotebookPen size={17} />
                {t("Bloco de notas")}
              </Link>
              <Link
                href="/settings"
                onNavigate={(e) => {
                  guard(e);
                  setMore(false);
                }}
              >
                <Settings size={17} />
                {t("Configurações")}
              </Link>
              <button
                onClick={() => {
                  setMore(false);
                  onSignOut();
                }}
              >
                <LogOut size={17} />
                {t("Sair")}
              </button>
            </div>
          )}
        </div>
        <Link
          href="/perfil"
          onNavigate={guard}
          className={`rail-item rail-profile ${path === "/perfil" ? "active" : ""}`}
          aria-current={path === "/perfil" ? "page" : undefined}
        >
          <UserRound size={20} />
          <span>{t("Perfil")}</span>
        </Link>
      </nav>
      {contextual && (
        <button
          className="context-toggle icon-button"
          aria-label={t(collapsed ? "Expandir painel" : "Recolher painel")}
          aria-expanded={!collapsed}
          aria-controls="workspace-context"
          onClick={collapse}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      )}
      {contextual && !collapsed && (
        <aside
          className="context-panel"
          id="workspace-context"
          aria-label={t("Contexto do Workspace")}
        >
          <div className="context-heading">
            <h2>{t("Workspaces")}</h2>
            <button
              className="icon-button"
              aria-label={t("Criar workspace")}
              onClick={onCreate}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="context-workspaces">
            {workspaces
              .filter((w) => !w.archived || w.id === workspace?.id)
              .map((w) => (
                <Link
                  href={workspacePath(w.id)}
                  onNavigate={guard}
                  key={w.id}
                  aria-current={w.id === workspace?.id ? "page" : undefined}
                  className={`context-workspace ${w.id === workspace?.id ? "selected" : ""}`}
                >
                  <Folder size={16} />
                  <span>{w.name}</span>
                </Link>
              ))}
          </div>
          <button className="text-button context-create" onClick={onCreate}>
            <Plus size={14} />
            {t("Criar workspace")}
          </button>
          {workspace && (
            <>
              <div className="context-category">
                {t(workspaceCategories[workspace.category])}
              </div>
              <nav aria-label={t("Navegação do Workspace")}>
                {workspaceTabs
                  .filter(
                    (tab) =>
                      tab.view !== "matrix" || workspace.category === "work",
                  )
                  .map((tab) => (
                    <Link
                      key={tab.view}
                      href={workspacePath(workspace.id, tab.view)}
                      onNavigate={guard}
                      className={`context-link ${view === tab.view ? "active" : ""}`}
                    >
                      {t(tab.label)}
                    </Link>
                  ))}
                <Link
                  className={`context-link ${view === "notes" ? "active" : ""}`}
                  href={workspacePath(workspace.id, "notes")}
                  onNavigate={guard}
                >
                  {t("Bloco de notas")}
                </Link>
              </nav>
              <div className="context-category">{t("Conteúdos recentes")}</div>
              {activities
                .slice()
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                .slice(0, 3)
                .map((a) => (
                  <button
                    key={a.id}
                    className="context-recent"
                    onClick={() =>
                      go(workspacePath(workspace.id, "activities", a.id))
                    }
                  >
                    {a.title}
                  </button>
                ))}
              <Link
                href={workspacePath(workspace.id, "settings")}
                className="context-link context-settings"
                onNavigate={guard}
              >
                <Settings size={15} />
                {t("Configurações")}
              </Link>
            </>
          )}
        </aside>
      )}
      <div className="desktop-content">{children}</div>
    </div>
  );
}
