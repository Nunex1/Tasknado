import { infiniteQueryOptions } from "@tanstack/react-query";
import { client, check } from "./supabase";
import { columns } from "./data-queries";

export type TimeCursor = { created_at: string; id: string };
export function timeCursor(cursor: TimeCursor, newest: boolean) {
  const op = newest ? "lt" : "gt";
  return `created_at.${op}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${op}.${cursor.id})`;
}
export function eventPages(
  activityId: string,
  onlyObservations: boolean,
  newest: boolean,
) {
  return infiniteQueryOptions({
    queryKey: ["events", activityId, onlyObservations, newest],
    initialPageParam: null as TimeCursor | null,
    queryFn: async ({ signal, pageParam }) => {
      let q = client()
        .from("activity_events")
        .select(columns.events)
        .eq("activity_id", activityId)
        .order("created_at", { ascending: !newest })
        .order("id", { ascending: !newest })
        .limit(51);
      if (onlyObservations) q = q.eq("type", "observation");
      if (pageParam) q = q.or(timeCursor(pageParam, newest));
      const data = check(await q.abortSignal(signal)),
        rows = data.slice(0, 50);
      return { rows, next: data.length > 50 ? rows.at(-1) : undefined };
    },
    getNextPageParam: (p) => p.next,
  });
}
export function observationPages(
  workspaceId: string,
  query: string,
  newest: boolean,
) {
  return infiniteQueryOptions({
    queryKey: ["observations", workspaceId, query, newest],
    initialPageParam: null as TimeCursor | null,
    queryFn: async ({ signal, pageParam }) => {
      let q = client()
        .from("workspace_observations")
        .select(columns.observations)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: !newest })
        .order("id", { ascending: !newest })
        .limit(51);
      if (query.trim())
        q = q.ilike("content", `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`);
      if (pageParam) q = q.or(timeCursor(pageParam, newest));
      const data = check(await q.abortSignal(signal)),
        rows = data.slice(0, 50);
      return { rows, next: data.length > 50 ? rows.at(-1) : undefined };
    },
    getNextPageParam: (p) => p.next,
  });
}
