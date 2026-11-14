"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Search, Plus, Globe, Menu } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { isLocale } from "@/i18n/core";
import { Workspace, Activity, SearchResult } from "@/lib/domain";
import type { View } from "@/lib/navigation";
import { BrandSymbol, BrandWordmark } from "./brand";
import { ProfileMenu } from "./profile-menu";
import { HeaderSearch } from "./header-search";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NavDrawer } from "./nav-drawer";
import { barNav, isCurrentSection, workspaceTabs } from "./nav-items";
export { workspaceTabs };

/*
 * One bar at the top of every authenticated screen. There is no side
 * navigation at any width; the layout is chosen by the space available,
 * never by the user agent:
 *   phone   (up to 767px)   brand, current place and a menu button at the
 *                           right edge; navigation waits in a drawer that
 *                           slides in from the right
 *   compact (768–1279px)    full bar; search rests as an icon and, below
 *                           1024px, the wordmark gives way to the symbol
 *   full    (1280px and up) full bar with the search field in place
 * Only the phone boundary needs JavaScript (bar or drawer); the rest is CSS.
 * Keep the query in sync with the 767px rules in shell.css and tokens.css.
 */
const phoneQuery = "(max-width: 767px)";
function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
const sectionTitles: Record<string, string> = {
  "/": "Início",
  "/workspaces": "Workspaces",
  "/activities": "Tarefas",
  "/search": "Pesquisar",
  "/notes": "Notas",
  "/settings": "Configurações",
  "/perfil": "Perfil",
};
export function DesktopShell({
  user,
  workspaces,
  workspace,
  activities,
  view,
  action,
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
  /** The main action of the current screen, shown in the phone header. */
  action?: { label: string; run: () => void };
  canLeave: () => boolean;
  go: (path: string) => void;
  onCreate: () => void;
  onResult: (result: SearchResult) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const { t, locale, setLocale, storageError } = useI18n();
  const path = usePathname();
  const phone = useMedia(phoneQuery);
  const menu = useRef<HTMLButtonElement>(null);
  const [drawer, setDrawer] = useState(false);
  const contextual = path.startsWith("/workspaces");
  // A drawer never outlives the page or the layout it was opened on.
  useEffect(() => setDrawer(false), [path, phone]);
  // Tells assistive technology that the context changed after a switch.
  const [announcement, setAnnouncement] = useState("");
  const lastWorkspace = useRef<string | undefined>(undefined);
  const workspaceName = workspace?.name;
  useEffect(() => {
    const current = workspace?.id ?? (contextual ? undefined : "all");
    if (current === undefined) return;
    if (lastWorkspace.current && lastWorkspace.current !== current)
      setAnnouncement(
        t("Workspace ativo: {{name}}", {
          name: workspaceName ?? t("Todos os workspaces"),
        }),
      );
    lastWorkspace.current = current;
  }, [workspace?.id, workspaceName, contextual, t]);
  const guard = (event: { preventDefault: () => void }) => {
    if (!canLeave()) event.preventDefault();
  };
  const moduleLabel =
    view === "settings"
      ? "Configurações"
      : (workspaceTabs.find((tab) => tab.view === view)?.label ??
        "Visão geral");
  const title = workspace
    ? workspace.name
    : t(sectionTitles[path] ?? "Workspaces");
  return (
    <div className={phone ? "desktop-app phone" : "desktop-app"}>
      <a href="#main" className="skip-link">
        {t("Ir para o conteúdo")}
      </a>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      {phone ? (
        <header className="global-header">
          <div className="header-inner">
            <Link
              href="/"
              className="brand-home-link header-home"
              aria-label={t("Tubarão-martelo — Visão geral")}
              onNavigate={guard}
            >
              <BrandSymbol size="sm" decorative />
            </Link>
            <div className="header-title">
              <strong>{title}</strong>
              {workspace && <span>{t(moduleLabel)}</span>}
            </div>
            <div className="header-actions">
              <Link
                href="/search"
                onNavigate={guard}
                className="icon-button"
                aria-label={t("Pesquisar")}
                aria-current={path === "/search" ? "page" : undefined}
              >
                <Search size={20} aria-hidden="true" />
              </Link>
              {action && (
                <button
                  type="button"
                  className="header-action"
                  aria-label={t(action.label)}
                  onClick={action.run}
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              )}
              {/* Last in the bar: the top right corner of the screen. */}
              <button
                ref={menu}
                type="button"
                className="icon-button header-menu"
                aria-label={t("Abrir menu")}
                aria-haspopup="dialog"
                aria-expanded={drawer}
                aria-controls={drawer ? "nav-drawer" : undefined}
                onClick={() => setDrawer(true)}
              >
                <Menu size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="global-header">
          <div className="header-inner">
            <div className="header-start">
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
              <WorkspaceSwitcher
                workspaces={workspaces}
                workspace={workspace}
                activities={activities}
                view={view}
                guard={guard}
                go={go}
                onCreate={onCreate}
              />
            </div>
            <nav className="top-nav" aria-label={t("Navegação principal")}>
              {barNav.map(({ href, label }) => {
                const active = isCurrentSection(href, path);
                return (
                  <Link
                    key={href}
                    href={href}
                    onNavigate={guard}
                    className="top-nav-link"
                    aria-current={active ? "page" : undefined}
                  >
                    {t(label)}
                  </Link>
                );
              })}
            </nav>
            <div className="header-end">
              <HeaderSearch
                workspaces={workspaces}
                onOpen={onResult}
                guard={guard}
              />
              <label className="header-language">
                <Globe size={16} aria-hidden="true" />
                <select
                  aria-label={t("Idioma da interface")}
                  value={locale}
                  onChange={(e) => {
                    if (isLocale(e.target.value)) setLocale(e.target.value);
                  }}
                >
                  <option value="pt-BR">PT</option>
                  <option value="en-US">EN</option>
                </select>
              </label>
              <ProfileMenu
                user={user}
                canNavigate={canLeave}
                onSignOut={onSignOut}
              />
            </div>
          </div>
        </header>
      )}
      {storageError && (
        <div className="preference-error" role="alert">
          {t(
            "Não foi possível sincronizar o idioma. Tente novamente nas configurações.",
          )}
        </div>
      )}
      {phone && (
        <NavDrawer
          open={drawer}
          onOpenChange={setDrawer}
          returnFocusRef={menu}
          user={user}
          workspaces={workspaces}
          workspace={workspace}
          activities={activities}
          view={view}
          guard={guard}
          go={go}
          onCreate={onCreate}
          onSignOut={onSignOut}
        />
      )}
      <div className="desktop-content">{children}</div>
    </div>
  );
}
