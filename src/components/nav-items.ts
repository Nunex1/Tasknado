import {
  Folder,
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

/** Modules inside a workspace. The matrix exists only in the Work category. */
export const workspaceTabs: { view: View; label: string }[] = [
  { view: "dashboard", label: "Visão geral" },
  { view: "activities", label: "Tarefas" },
  { view: "observations", label: "Observações" },
  { view: "history", label: "Histórico" },
  { view: "matrix", label: "Matriz de Eisenhower" },
  { view: "notes", label: "Notas" },
];
export const tabIcons: Partial<Record<View, typeof Folder>> = {
  dashboard: LayoutDashboard,
  activities: ListTodo,
  observations: MessageSquareText,
  history: History,
  matrix: Grid2x2,
  notes: NotebookPen,
};
/** Destinations that span every workspace. */
export const primaryNav = [
  { href: "/", label: "Início", icon: Home },
  { href: "/workspaces", label: "Workspaces", icon: Folder },
  { href: "/activities", label: "Tarefas", icon: ListTodo },
  { href: "/search", label: "Pesquisar", icon: Search },
  { href: "/notes", label: "Notas", icon: NotebookPen },
];
export function tabsFor(category: string) {
  return workspaceTabs.filter(
    (tab) => tab.view !== "matrix" || category === "work",
  );
}
