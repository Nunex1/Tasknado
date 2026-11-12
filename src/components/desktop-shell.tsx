"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Folder,
  Search,
  UserRound,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  LockKeyhole,
  Menu,
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
import { WorkspaceIcon } from "./workspace-icon";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NavDrawer } from "./nav-drawer";
import { primaryNav, tabIcons, tabsFor, workspaceTabs } from "./nav-items";
export { workspaceTabs };

/*
 * Three layouts, chosen by the space available — never by the user agent:
 *   phone   (up to 767px)  header with a menu button; navigation in a drawer
 *   tablet  (768–899px)    icon rail; the workspace panel opens over content
 *   desktop (900px and up) icon rail and a collapsible workspace panel
 * Keep the two queries in sync with the 767px and 899px rules in shell.css.
 */
const phoneQuery = "(max-width: 767px)";
const compactQuery = "(max-width: 899px)";
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
  const compact = useMedia(compactQuery);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(
        localStorage.getItem(`tasknado.panel:${user.id}`) === "collapsed",
      );
    } catch {}
  }, [user.id]);
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
  // A drawer never outlives the page or the layout it was opened on.
  useEffect(() => setDrawer(false), [path, compact, phone]);
  const panelOpen = !phone && contextual && (compact ? drawer : !collapsed);
  useEffect(() => {
    if (phone || !compact || !drawer) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [phone, compact, drawer]);
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
    <div
      className={[
        "desktop-app",
        phone ? "phone" : "",
        contextual ? "contextual" : "",
        panelOpen ? (compact ? "drawer-open" : "with-context") : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a href="#main" className="skip-link">
        {t("Ir para o conteúdo")}
      </a>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      {phone ? (
        <header className="global-header">
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
          </div>
        </header>
      ) : (
        <header className="global-header">
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
              view={view}
              guard={guard}
              onCreate={onCreate}
            />
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
              <LockKeyhole size={13} aria-hidden="true" />
              {t("Pessoal e privado")}
            </span>
            <ProfileMenu
              user={user}
              canNavigate={canLeave}
              onSignOut={onSignOut}
            />
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
      {phone ? (
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
      ) : (
        <nav className="primary-rail" aria-label={t("Navegação principal")}>
          {[
            ...primaryNav,
            {
              href: "/settings",
              label: "Configurações",
              icon: Settings,
            },
          ].map(({ href, label, icon: Icon }) => {
            const active =
              path === href || (href === "/workspaces" && contextual);
            return (
              <Link
                key={href}
                href={href}
                onNavigate={guard}
                className={`rail-item ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{t(label)}</span>
              </Link>
            );
          })}
          <Link
            href="/perfil"
            onNavigate={guard}
            className={`rail-item rail-profile ${path === "/perfil" ? "active" : ""}`}
            aria-current={path === "/perfil" ? "page" : undefined}
          >
            <UserRound size={20} aria-hidden="true" />
            <span>{t("Perfil")}</span>
          </Link>
          <button className="rail-item rail-signout" onClick={onSignOut}>
            <LogOut size={20} aria-hidden="true" />
            <span>{t("Sair")}</span>
          </button>
        </nav>
      )}
      {contextual && !phone && (
        <button
          ref={toggle}
          className="context-toggle icon-button"
          aria-label={t(panelOpen ? "Recolher painel" : "Expandir painel")}
          aria-expanded={panelOpen}
          aria-controls="workspace-context"
          onClick={() => (compact ? setDrawer((v) => !v) : collapse())}
        >
          {panelOpen ? (
            <PanelLeftClose size={18} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={18} aria-hidden="true" />
          )}
        </button>
      )}
      {panelOpen && compact && (
        <div
          className="context-scrim"
          aria-hidden="true"
          onClick={() => setDrawer(false)}
        />
      )}
      {panelOpen && (
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
              <Plus size={17} aria-hidden="true" />
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
                  <WorkspaceIcon icon={w.icon} />
                  <span>{w.name}</span>
                </Link>
              ))}
          </div>
          <button className="text-button context-create" onClick={onCreate}>
            <Plus size={14} aria-hidden="true" />
            {t("Criar workspace")}
          </button>
          {workspace && (
            <>
              <div className="context-category">
                {t(workspaceCategories[workspace.category])}
              </div>
              <nav aria-label={t("Navegação do Workspace")}>
                {tabsFor(workspace.category).map((tab) => {
                  const Icon = tabIcons[tab.view] ?? Folder;
                  return (
                    <Link
                      key={tab.view}
                      href={workspacePath(workspace.id, tab.view)}
                      onNavigate={guard}
                      className={`context-link ${view === tab.view ? "active" : ""}`}
                      aria-current={view === tab.view ? "page" : undefined}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {t(tab.label)}
                    </Link>
                  );
                })}
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
                <Settings size={16} aria-hidden="true" />
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
