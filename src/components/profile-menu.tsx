"use client";
import { useI18n } from "@/i18n/provider";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LogOut, Settings, UserRound } from "lucide-react";
import { userProfile, avatarForeground } from "@/lib/user-profile";
import { useTheme } from "@/lib/theme-provider";
import { themeOptions } from "./theme";

const links = [
  { href: "/perfil", label: "Editar perfil", icon: UserRound },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function ProfileMenu({
  user,
  canNavigate,
  onSignOut,
}: {
  user: User;
  canNavigate: () => boolean;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();
  const triggerId = useId();
  const pathname = usePathname();
  const { initial, color, displayName, email } = userProfile(user);
  // Links, the three appearance options, then Sign Out.
  const count = links.length + themeOptions.length + 1;
  function focusItem(index: number) {
    items.current[(index + count) % count]?.focus();
  }

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="profile-menu"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className="avatar small-avatar profile-menu-trigger"
        style={{ background: color, color: avatarForeground(color) }}
        aria-label={t("Menu do usuário")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            items.current[0]?.focus();
          }
        }}
      >
        <span aria-hidden="true">{initial || <UserRound size={15} />}</span>
      </button>
      {open && (
        <div className="profile-dropdown">
          {(displayName || email) && (
            <div className="profile-dropdown-header">
              <strong>{displayName}</strong>
              {email && email !== displayName && <small>{email}</small>}
            </div>
          )}
          <div
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            onKeyDown={(event) => {
              const current = items.current.findIndex(
                (item) => item === document.activeElement,
              );
              if (event.key === "ArrowDown" || event.key === "ArrowRight")
                focusItem(current + 1);
              else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                focusItem(current - 1);
              else if (event.key === "Home") focusItem(0);
              else if (event.key === "End") focusItem(count - 1);
              else if (event.key === "Tab") {
                // Resume the normal tab order from the menu button.
                trigger.current?.focus();
                setOpen(false);
                return;
              } else return;
              event.preventDefault();
            }}
          >
            {links.map(({ href, label, icon: Icon }, index) => (
              <Link
                key={href}
                ref={(element) => {
                  items.current[index] = element;
                }}
                href={href}
                role="menuitem"
                tabIndex={-1}
                className="profile-menu-item"
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    event.currentTarget.click();
                  }
                }}
                onNavigate={(event) => {
                  if (!canNavigate() || pathname === href) {
                    event.preventDefault();
                    trigger.current?.focus();
                  }
                  setOpen(false);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                {t(label)}
              </Link>
            ))}
            <div className="profile-menu-separator" role="separator" />
            <div role="group" aria-labelledby={`${menuId}-theme`}>
              <div className="profile-menu-label" id={`${menuId}-theme`}>
                {t("Aparência")}
              </div>
              <div className="profile-menu-theme">
                {themeOptions.map(
                  ({ mode: value, label, icon: Icon }, index) => (
                    <button
                      key={value}
                      ref={(element) => {
                        items.current[links.length + index] = element;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === value}
                      tabIndex={-1}
                      className="profile-theme-option"
                      onClick={() => setMode(value)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {t(label)}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="profile-menu-separator" role="separator" />
            <button
              ref={(element) => {
                items.current[links.length + themeOptions.length] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="profile-menu-item"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              {t("Sair")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
