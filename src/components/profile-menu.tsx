"use client";
import { useI18n } from "@/i18n/provider";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import { userProfile } from "@/lib/user-profile";

export function ProfileMenu({
  user,
  canNavigate,
}: {
  user: User;
  canNavigate: () => boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLAnchorElement>(null);
  const menuId = useId();
  const triggerId = useId();
  const pathname = usePathname();
  const { initial } = userProfile(user);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
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
        aria-label={t("Menu do usuário")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            item.current?.focus();
          }
        }}
      >
        <span aria-hidden="true">{initial || <UserRound size={15} />}</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className="profile-dropdown"
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              item.current?.focus();
            }
            if (event.key === "Tab") {
              // Resume the normal tab order from the menu button.
              trigger.current?.focus();
              setOpen(false);
            }
          }}
        >
          <Link
            ref={item}
            href="/perfil"
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
              if (!canNavigate() || pathname === "/perfil") {
                event.preventDefault();
                trigger.current?.focus();
              }
              setOpen(false);
            }}
          >
            <UserRound size={17} aria-hidden="true" />
            {t("Perfil")}
          </Link>
        </div>
      )}
    </div>
  );
}
