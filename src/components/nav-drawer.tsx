"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import type { User } from "@supabase/supabase-js";
import {
  ChevronDown,
  Layers,
  LogOut,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/core";
import { Activity, Workspace } from "@/lib/domain";
import type { View } from "@/lib/navigation";
import { avatarForeground, userProfile } from "@/lib/user-profile";
import { BrandLogo } from "./brand";
import { isCurrentSection, primaryNav } from "./nav-items";
import { ThemeControl } from "./theme";
import { WorkspaceIcon } from "./workspace-icon";
import { RecentActivities, WorkspaceModules } from "./workspace-nav";
import { WorkspaceOptions } from "./workspace-switcher";

// Each language is named in its own language, whatever the interface shows.
const languages: { locale: Locale; label: string }[] = [
  { locale: "pt-BR", label: "Português" },
  { locale: "en-US", label: "English" },
];

/**
 * Navigation for phones. Hidden until the menu button in the top right corner
 * asks for it, then slid in from the right edge over the content as a modal
 * dialog: Radix traps focus inside, closes on Escape or a tap outside, locks
 * page scrolling, hides the rest of the page from assistive technology and
 * returns focus to the control that opened it.
 *
 * Three groups, in this order: the places that span every workspace, the
 * active workspace with its modules, and the account with its preferences.
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
  const { t, locale, setLocale } = useI18n();
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
            <nav aria-label={t("Navegação principal")}>
              {primaryNav.map(({ href, label, icon: Icon }) => {
                // Inside a workspace its own group marks the place.
                const active = workspace ? false : isCurrentSection(href, path);
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
            <section className="drawer-group" aria-label={t("Workspace ativo")}>
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
              {workspace && (
                <>
                  <WorkspaceModules
                    workspace={workspace}
                    view={view}
                    follow={follow}
                    iconSize={18}
                  />
                  <RecentActivities
                    workspace={workspace}
                    activities={activities}
                    headingId={`${listId}-recent`}
                    onOpen={(target) => {
                      close();
                      go(target);
                    }}
                  />
                </>
              )}
            </section>
            <section
              className="drawer-group"
              aria-labelledby={`${listId}-account`}
            >
              <h2 className="context-category" id={`${listId}-account`}>
                {t("Conta e preferências")}
              </h2>
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
                    {email && email !== displayName
                      ? email
                      : t("Editar perfil")}
                  </small>
                </span>
              </Link>
              <div className="drawer-preference">
                <span className="context-category" aria-hidden="true">
                  {t("Idioma da interface")}
                </span>
                <div
                  className="segmented"
                  role="radiogroup"
                  aria-label={t("Idioma da interface")}
                >
                  {languages.map((language) => (
                    <label key={language.locale} className="segmented-option">
                      <input
                        type="radio"
                        name="language-drawer"
                        value={language.locale}
                        checked={locale === language.locale}
                        onChange={() => setLocale(language.locale)}
                      />
                      <span lang={language.locale}>{language.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="drawer-preference">
                <span className="context-category" aria-hidden="true">
                  {t("Aparência")}
                </span>
                <ThemeControl name="theme-drawer" />
              </div>
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
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
