"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Layers, Plus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Workspace } from "@/lib/domain";
import { switchWorkspacePath, View } from "@/lib/navigation";
import { WorkspaceIcon } from "./workspace-icon";

type Guard = (event: { preventDefault: () => void }) => void;

/**
 * The workspaces this account can open, as links. The list comes from the
 * rows the database returned for the signed-in user; nothing here widens it.
 * Choosing one keeps the current module when the target has it.
 */
export function WorkspaceOptions({
  workspaces,
  workspace,
  view,
  guard,
  onCreate,
  onPick,
}: {
  workspaces: Workspace[];
  workspace?: Workspace;
  view: View;
  guard: Guard;
  onCreate: () => void;
  onPick?: () => void;
}) {
  const { t } = useI18n();
  const visible = workspaces.filter(
    (w) => !w.archived || w.id === workspace?.id,
  );
  return (
    <div className="workspace-options">
      <Link
        href={switchWorkspacePath(view, null)}
        onNavigate={guard}
        onClick={onPick}
        className={`workspace-option ${workspace ? "" : "selected"}`}
        aria-current={workspace ? undefined : "true"}
      >
        <Layers size={16} aria-hidden="true" />
        <span>{t("Todos os workspaces")}</span>
        {!workspace && <Check size={15} aria-hidden="true" />}
      </Link>
      {visible.map((w) => {
        const selected = w.id === workspace?.id;
        return (
          <Link
            key={w.id}
            href={switchWorkspacePath(view, w)}
            onNavigate={guard}
            onClick={onPick}
            className={`workspace-option ${selected ? "selected" : ""}`}
            aria-current={selected ? "true" : undefined}
          >
            <WorkspaceIcon icon={w.icon} />
            <span>{w.name}</span>
            {selected && <Check size={15} aria-hidden="true" />}
          </Link>
        );
      })}
      {!visible.length && (
        <p className="workspace-options-empty">
          {t("Você ainda não tem workspaces.")}
        </p>
      )}
      <button
        type="button"
        className="workspace-option workspace-option-create"
        onClick={() => {
          onPick?.();
          onCreate();
        }}
      >
        <Plus size={16} aria-hidden="true" />
        <span>{t("Criar workspace")}</span>
      </button>
    </div>
  );
}

/** Header control: shows the active workspace and opens the list. */
export function WorkspaceSwitcher(props: {
  workspaces: Workspace[];
  workspace?: Workspace;
  view: View;
  guard: Guard;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const { workspace } = props;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const pathname = usePathname();
  const name = workspace?.name ?? t("Todos os workspaces");

  useEffect(() => setOpen(false), [pathname]);

  const items = () =>
    Array.from(
      popover.current?.querySelectorAll<HTMLElement>(".workspace-option") ?? [],
    );

  useEffect(() => {
    if (!open) return;
    const all = items();
    (
      all.find((item) => item.getAttribute("aria-current") === "true") ?? all[0]
    )?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
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
      className="workspace-switcher"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-switch"
        aria-label={t("Trocar workspace. Ativo: {{name}}", { name })}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {workspace ? (
          <WorkspaceIcon icon={workspace.icon} />
        ) : (
          <Layers size={16} aria-hidden="true" />
        )}
        <span>{name}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popover}
          id={popoverId}
          className="workspace-popover"
          role="group"
          aria-label={t("Workspaces")}
          onKeyDown={(event) => {
            const all = items();
            const current = all.indexOf(document.activeElement as HTMLElement);
            const next =
              event.key === "ArrowDown"
                ? current + 1
                : event.key === "ArrowUp"
                  ? current - 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? all.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            all[(next + all.length) % all.length]?.focus();
          }}
        >
          <WorkspaceOptions {...props} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
