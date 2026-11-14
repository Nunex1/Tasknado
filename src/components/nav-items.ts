import {
  Folder,
  BriefcaseBusiness,
  TrendingUp,
  Grid2x2,
  History,
  Home,
  LayoutDashboard,
  ListTodo,
  MessageSquareText,
  NotebookPen,
  Search,
} from "lucide-react";
import type { View } from "@/lib/navigation";

/** Matrix and professional plans exist only in the Work category. */
export const workspaceTabs: { view: View; label: string }[] = [
  { view: "dashboard", label: "Visão geral" },
  { view: "activities", label: "Tarefas" },
  { view: "observations", label: "Observações" },
  { view: "history", label: "Histórico" },
  { view: "matrix", label: "Matriz de Eisenhower" },
  { view: "notes", label: "Notas" },
  { view: "development", label: "Plano de Desenvolvimento Individual" },
  { view: "career", label: "Plano de Carreira" },
];
export const tabIcons: Partial<Record<View, typeof Folder>> = {
  dashboard: LayoutDashboard,
  activities: ListTodo,
  observations: MessageSquareText,
  history: History,
  matrix: Grid2x2,
  notes: NotebookPen,
  development: TrendingUp,
  career: BriefcaseBusiness,
};
/**
 * Destinations that span every workspace, in the order every layout shows
 * them. The phone drawer lists them all; the top bar leaves the search page
 * to the search control beside it.
 */
export const primaryNav = [
  { href: "/", label: "Início", icon: Home },
  { href: "/workspaces", label: "Workspaces", icon: Folder },
  { href: "/activities", label: "Tarefas", icon: ListTodo },
  { href: "/notes", label: "Notas", icon: NotebookPen },
  { href: "/search", label: "Pesquisar", icon: Search },
];
export const barNav = primaryNav.filter((item) => item.href !== "/search");
/** Whether a global destination is the current place. */
export function isCurrentSection(href: string, path: string) {
  return (
    path === href || (href === "/workspaces" && path.startsWith("/workspaces/"))
  );
}
export function tabsFor(category: string) {
  return workspaceTabs.filter(
    (tab) =>
      !["matrix", "development", "career"].includes(tab.view) ||
      category === "work",
  );
}
