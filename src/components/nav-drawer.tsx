"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import type { User } from "@supabase/supabase-js";
import {
  ChevronDown,
  Folder,
  Layers,
  LogOut,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Activity, Workspace, workspaceCategories } from "@/lib/domain";
import { workspacePath, View } from "@/lib/navigation";
import { avatarForeground, userProfile } from "@/lib/user-profile";
import { BrandLogo } from "./brand";
import { primaryNav, tabIcons, tabsFor } from "./nav-items";
import { ThemeControl } from "./theme";
import { WorkspaceIcon } from "./workspace-icon";
import { WorkspaceOptions } from "./workspace-switcher";

/**
 * Navigation for phones. Hidden until the menu button asks for it, then laid
 * over the content as a modal dialog: Radix traps focus inside, closes on
 * Escape or a tap outside, locks page scrolling, hides the rest of the page
 * from assistive technology and returns focus to the control that opened it.
 */
export function NavDrawer({
  open,
  onOpenChange,
  returnFocusRef,
  user,
  workspaces,
  workspace,
  activities,
  view,
  guard,
  go,
  onCreate,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opened the drawer; focus goes back to it on close. */
  returnFocusRef: React.RefObject<HTMLElement | null>;
  user: User;
  workspaces: Workspace[];
  workspace?: Workspace;
  activities: Activity[];
  view: View;
  guard: (event: { preventDefault: () => void }) => void;
  go: (path: string) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const path = usePathname();
  const [choosing, setChoosing] = useState(false);
  const listId = useId();
  const { initial, color, displayName, email } = userProfile(user);
  const close = () => onOpenChange(false);
  // Following a link to the page already open changes no route, so the drawer
  // closes here; a refused navigation (unsaved changes) keeps it open.
  const follow = (href: string) => (event: { preventDefault: () => void }) => {
    let refused = false;
    guard({
      preventDefault() {
        refused = true;
        event.preventDefault();
      },
    });
    if (!refused && href === path) close();
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setChoosing(false);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          id="nav-drawer"
          className="nav-drawer"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <div className="nav-drawer-head">
            <BrandLogo size="sm" tone="blue" />
            <Dialog.Title className="visually-hidden">
              {t("Menu de navegação")}
            </Dialog.Title>
            <Dialog.Close className="icon-button" aria-label={t("Fechar menu")}>
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="nav-drawer-body">
            <section aria-label={t("Workspace ativo")}>
              <button
                type="button"
                className="drawer-workspace"
                aria-expanded={choosing}
                aria-controls={choosing ? listId : undefined}
                onClick={() => setChoosing((value) => !value)}
              >
                <span className="drawer-workspace-icon" aria-hidden="true">
                  {workspace ? (
                    <WorkspaceIcon icon={workspace.icon} size={18} />
                  ) : (
                    <Layers size={18} />
                  )}
                </span>
                <span className="drawer-workspace-text">
                  <small>{t("Workspace ativo")}</small>
                  <strong>{workspace?.name ?? t("Todos os workspaces")}</strong>
                </span>
                <span className="visually-hidden">{t("Trocar workspace")}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {choosing && (
                <div id={listId} className="drawer-workspace-list">
                  <WorkspaceOptions
                    workspaces={workspaces}
                    workspace={workspace}
                    view={view}
                    guard={guard}
                    onCreate={() => {
                      close();
                      onCreate();
                    }}
                    onPick={() => setChoosing(false)}
                  />
                </div>
              )}
            </section>
            {workspace && (
              <>
                <nav aria-label={t("Navegação do Workspace")}>
                  <h2 className="context-category">
                    {t(workspaceCategories[workspace.category])}
                  </h2>
                  {tabsFor(workspace.category).map((tab) => {
                    const Icon = tabIcons[tab.view] ?? Folder;
                    const href = workspacePath(workspace.id, tab.view);
                    const active = view === tab.view;
                    return (
                      <Link
                        key={tab.view}
                        href={href}
                        onNavigate={follow(href)}
                        className={`context-link ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={18} aria-hidden="true" />
                        {t(tab.label)}
                      </Link>
                    );
                  })}
                </nav>
                {activities.length > 0 && (
                  <section aria-labelledby={`${listId}-recent`}>
                    <h2 className="context-category" id={`${listId}-recent`}>
                      {t("Conteúdos recentes")}
                    </h2>
                    {activities
                      .slice()
                      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                      .slice(0, 3)
                      .map((a) => (
                        <button
                          key={a.id}
                          className="context-recent"
                          onClick={() => {
                            close();
                            go(workspacePath(workspace.id, "activities", a.id));
                          }}
                        >
                          {a.title}
                        </button>
                      ))}
                  </section>
                )}
              </>
            )}
            <nav aria-label={t("Navegação principal")}>
              <h2 className="context-category">{t("Geral")}</h2>
              {primaryNav.map(({ href, label, icon: Icon }) => {
                const active = path === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onNavigate={follow(href)}
                    className={`context-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {t(label)}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="nav-drawer-foot">
            <div className="drawer-appearance">
              <span className="context-category" aria-hidden="true">
                {t("Aparência")}
              </span>
              <ThemeControl name="theme-drawer" />
            </div>
            <Link
              href="/perfil"
              onNavigate={follow("/perfil")}
              className={`drawer-account ${path === "/perfil" ? "active" : ""}`}
              aria-current={path === "/perfil" ? "page" : undefined}
            >
              <span
                className="avatar small-avatar"
                style={{ background: color, color: avatarForeground(color) }}
                aria-hidden="true"
              >
                {initial || <UserRound size={15} />}
              </span>
              <span className="drawer-account-text">
                <strong>{displayName || t("Perfil")}</strong>
                <small>
                  {email && email !== displayName ? email : t("Editar perfil")}
                </small>
              </span>
            </Link>
            <Link
              href="/settings"
              onNavigate={follow("/settings")}
              className={`context-link ${path === "/settings" ? "active" : ""}`}
              aria-current={path === "/settings" ? "page" : undefined}
            >
              <Settings size={18} aria-hidden="true" />
              {t("Configurações")}
            </Link>
            <button
              type="button"
              className="context-link"
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              <LogOut size={18} aria-hidden="true" />
              {t("Sair")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
