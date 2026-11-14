"use client";
import Link from "next/link";
import { Folder, Settings } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Activity, Workspace, workspaceCategories } from "@/lib/domain";
import { workspacePath, View } from "@/lib/navigation";
import { tabIcons, tabsFor } from "./nav-items";

type Follow = (href: string) => (event: { preventDefault: () => void }) => void;

/*
 * The inside of a workspace, shared by the menu under the top bar and by the
 * phone drawer so both always offer the same modules for a category.
 */

/** Modules of the active workspace; Work also has the matrix and the plans. */
export function WorkspaceModules({
  workspace,
  view,
  follow,
  settings = false,
  iconSize = 16,
}: {
  workspace: Workspace;
  view: View;
  /** Builds the navigation handler of a link: guards, then closes its menu. */
  follow: Follow;
  /** Also offers the settings reached from inside the workspace. */
  settings?: boolean;
  iconSize?: number;
}) {
  const { t } = useI18n();
  const settingsHref = workspacePath(workspace.id, "settings");
  return (
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
            <Icon size={iconSize} aria-hidden="true" />
            {t(tab.label)}
          </Link>
        );
      })}
      {settings && (
        <Link
          href={settingsHref}
          onNavigate={follow(settingsHref)}
          className={`context-link context-settings ${view === "settings" ? "active" : ""}`}
          aria-current={view === "settings" ? "page" : undefined}
        >
          <Settings size={iconSize} aria-hidden="true" />
          {t("Configurações")}
        </Link>
      )}
    </nav>
  );
}

/** The three tasks of the workspace that changed last. Reads nothing new. */
export function RecentActivities({
  workspace,
  activities,
  onOpen,
  headingId,
}: {
  workspace: Workspace;
  activities: Activity[];
  onOpen: (path: string) => void;
  headingId: string;
}) {
  const { t } = useI18n();
  if (!activities.length) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 className="context-category" id={headingId}>
        {t("Conteúdos recentes")}
      </h2>
      {activities
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 3)
        .map((a) => (
          <button
            key={a.id}
            type="button"
            className="context-recent"
            onClick={() =>
              onOpen(workspacePath(workspace.id, "activities", a.id))
            }
          >
            {a.title}
          </button>
        ))}
    </section>
  );
}
