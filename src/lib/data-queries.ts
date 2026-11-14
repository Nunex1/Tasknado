import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { client, check } from "./supabase";
import { fetchPages } from "./pagination";
import type { Activity, Note, Workspace } from "./domain";

export const columns = {
  workspaces:
    "id,name,description,icon,category,archived,created_at,updated_at",
  activities:
    "id,workspace_id,title,description,status,archived,category_attributes,created_at,updated_at",
  notes: "id,workspace_id,title,created_at,updated_at",
  entries: "id,note_id,content,revision,created_at,updated_at",
  events: "id,activity_id,type,content,created_at,edited_at",
  observations: "id,workspace_id,content,created_at,updated_at",
} as const;
export type ActivityFilters = {
  status?: string;
  archived?: boolean;
  query?: string;
  canvas?: string;
  schedule?: string;
  from?: string;
  to?: string;
  quadrant?: string;
  focus?: string;
  localNow?: string;
};
export type Cursor = { value: string; id: string };
export type ActivityPageRow = Activity & { cursor_value: string };
export const workspacesQuery = () =>
  queryOptions({
    queryKey: ["workspaces"],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      fetchPages((from, to) =>
        client()
          .from("workspaces")
          .select(columns.workspaces)
          .order("created_at")
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      ),
  });
export function activityPages(
  workspace: string | null,
  filters: ActivityFilters,
  sort = "updated_at",
  size = 50,
) {
  return infiniteQueryOptions({
    queryKey: ["activities", workspace, filters, sort, size],
    initialPageParam: null as Cursor | null,
    queryFn: async ({ signal, pageParam }) => {
      const data = check(
        await client()
          .rpc("activity_page", {
            p_workspace: workspace,
            p_filters: filters,
            p_sort: sort,
            p_after: pageParam,
            p_size: size,
          })
          .abortSignal(signal),
      );
      const rows = data.slice(0, size),
        last = rows.at(-1);
      return {
        rows,
        next:
          data.length > size && last
            ? { value: last.cursor_value, id: last.id }
            : undefined,
      };
    },
    getNextPageParam: (page) => page.next,
  });
}
export function recentQuery(workspace: string | null) {
  return queryOptions({
    queryKey: ["recent", workspace],
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_page", {
            p_workspace: workspace,
            p_filters: { status: "open" },
            p_size: 6,
          })
          .abortSignal(signal),
      ).slice(0, 6),
  });
}
export function activityQuery(workspace: string | null, id: string | null) {
  return queryOptions({
    queryKey: ["activity", workspace, id],
    enabled: !!id,
    queryFn: async ({ signal }) =>
      check(
        await client()
          .from("activities")
          .select(columns.activities)
          .eq("id", id!)
          .eq("workspace_id", workspace!)
          .abortSignal(signal)
          .maybeSingle(),
      ),
  });
}
export function notePages(
  workspace: string | null,
  query = "",
  sort = "updated_at",
) {
  return infiniteQueryOptions({
    queryKey: ["notes", workspace, query, sort],
    initialPageParam: null as Cursor | null,
    queryFn: async ({ signal, pageParam }) => {
      const key =
        sort === "title"
          ? "title"
          : sort === "created_at"
            ? "created_at"
            : "updated_at";
      const asc = key === "title";
      let q = client()
        .from("notes")
        .select(columns.notes)
        .order(key, { ascending: asc })
        .order("id", { ascending: asc })
        .limit(51);
      if (workspace) q = q.eq("workspace_id", workspace);
      if (query.trim())
        q = q.ilike("title", `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`);
      if (pageParam) {
        // Values in the PostgREST grammar must be quoted, including commas and quotes in titles.
        const value =
          '"' +
          pageParam.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') +
          '"';
        q = q.or(
          `${key}.${asc ? "gt" : "lt"}.${value},and(${key}.eq.${value},id.${asc ? "gt" : "lt"}.${pageParam.id})`,
        );
      }
      const data = check(await q.abortSignal(signal)),
        rows = data.slice(0, 50),
        last = rows.at(-1);
      return {
        rows,
        next:
          data.length > 50 && last
            ? { value: last[key], id: last.id }
            : undefined,
      };
    },
    getNextPageParam: (page) => page.next,
  });
}
export async function refreshWorkspace(cache: QueryClient, id: string | null) {
  if (!id) return;
  const row = check(
    await client()
      .from("workspaces")
      .select(columns.workspaces)
      .eq("id", id)
      .maybeSingle(),
  );
  cache.setQueryData<Workspace[]>(["workspaces"], (old) =>
    old?.map((w) => (w.id === id && row ? row : w)),
  );
}
export async function invalidateActivity(
  cache: QueryClient,
  workspace: string | null,
  id?: string,
) {
  const scopeFamilies = new Set([
    "activities",
    "recent",
    "summary",
    "activity-total",
    "focus",
    "history",
  ]);
  const affected = (q: { queryKey: readonly unknown[] }) =>
    (scopeFamilies.has(String(q.queryKey[0])) &&
      (q.queryKey[1] === workspace || q.queryKey[1] === null)) ||
    (q.queryKey[0] === "activity" && (!id || q.queryKey[2] === id)) ||
    (q.queryKey[0] === "observation-counts" &&
      (!id || (q.queryKey[1] as string[]).includes(id))) ||
    q.queryKey[0] === "search";
  await cache.cancelQueries({ predicate: affected });
  // Start a fresh traversal after a mutation changes ordering; do not refetch every visited page.
  for (const q of cache.getQueryCache().findAll({ predicate: affected })) {
    if (q.queryKey[0] === "activities")
      cache.setQueryData(
        q.queryKey,
        (old: { pages: unknown[]; pageParams: unknown[] } | undefined) =>
          old
            ? {
                pages: old.pages.slice(0, 1),
                pageParams: old.pageParams.slice(0, 1),
              }
            : old,
      );
  }
  await Promise.all([
    cache.invalidateQueries({ predicate: affected }),
    refreshWorkspace(cache, workspace),
  ]);
}
export async function invalidateNotes(
  cache: QueryClient,
  workspace: string | null,
  deletedId?: string,
) {
  await cache.cancelQueries({ queryKey: ["notes"] });
  if (deletedId) {
    cache.removeQueries({ queryKey: ["note", deletedId] });
    cache.setQueriesData<{ pages: { rows: Note[] }[] }>(
      { queryKey: ["notes"] },
      (old) =>
        old && {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            rows: p.rows.filter((n) => n.id !== deletedId),
          })),
        },
    );
  }
  await Promise.all([
    cache.invalidateQueries({ queryKey: ["notes"] }),
    cache.invalidateQueries({ queryKey: ["note"] }),
    cache.invalidateQueries({ queryKey: ["search"] }),
    refreshWorkspace(cache, workspace),
  ]);
}
