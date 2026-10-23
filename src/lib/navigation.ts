export type View =
  | "dashboard"
  | "workspaces"
  | "activities"
  | "observations"
  | "history"
  | "matrix"
  | "notes"
  | "search"
  | "settings";
const views = new Set<View>([
  "activities",
  "observations",
  "history",
  "matrix",
  "notes",
  "search",
  "settings",
]);
export function routeState(path: string) {
  const parts = path.split("/").filter(Boolean);
  const workspaceId = parts[0] === "workspaces" && parts[1] ? parts[1] : null;
  const section = workspaceId ? parts[2] : parts[0];
  const view: View =
    !workspaceId && section === "workspaces"
      ? "workspaces"
      : views.has(section as View)
        ? (section as View)
        : "dashboard";
  return {
    workspaceId,
    view,
    activityId: workspaceId && view === "activities" ? parts[3] || null : null,
    noteId: workspaceId && view === "notes" ? parts[3] || null : null,
  };
}
export function workspacePath(
  id: string,
  view: View = "dashboard",
  item?: string | null,
) {
  return `/workspaces/${id}${view === "dashboard" ? "" : `/${view}`}${item ? `/${item}` : ""}`;
}
