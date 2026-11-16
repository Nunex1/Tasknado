"use client";
import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  activityPages,
  activityQuery,
  columns,
  invalidateActivity,
  invalidateNotes,
  notePages,
  recentQuery,
  workspacesQuery,
  type ActivityFilters,
} from "@/lib/data-queries";
import { client, check, errorMessage } from "@/lib/supabase";
import type { View } from "@/lib/navigation";
import type { Activity, Note } from "@/lib/domain";

export function useDebounced<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
export function localMinute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}
export function useAppData({
  workspaceId,
  activityId,
  noteId,
  view,
  filters,
  sort,
  noteSearch,
  noteSort,
}: {
  workspaceId: string | null;
  activityId: string | null;
  noteId: string | null;
  view: View;
  filters: ActivityFilters;
  sort: string;
  noteSearch: string;
  noteSort: string;
}) {
  const cache = useQueryClient();
  const spaces = useQuery(workspacesQuery());
  const workspaces = spaces.data ?? [];
  const workspaceMap = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w])),
    [spaces.data],
  );
  const workspace = workspaceMap.get(workspaceId || "");
  filters = {
    ...filters,
    canvas: workspace?.category === "university" ? filters.canvas : "",
    schedule: workspace?.category === "work" ? filters.schedule : "",
    from: workspace?.category === "work" ? filters.from : "",
    to: workspace?.category === "work" ? filters.to : "",
  };
  const list = useInfiniteQuery({
    ...activityPages(workspaceId, filters, sort),
    enabled: view === "activities" && !activityId,
  });
  const recent = useQuery({
    ...recentQuery(workspaceId),
    enabled: !!workspaceId || view === "dashboard",
  });
  const detail = useQuery(activityQuery(workspaceId, activityId));
  const noteList = useInfiniteQuery({
    ...notePages(workspaceId, noteSearch, noteSort),
    enabled: view === "notes",
  });
  const note = useQuery({
    queryKey: ["note", noteId],
    enabled: view === "notes" && !!noteId,
    queryFn: async ({ signal }) =>
      check(
        await client()
          .from("notes")
          .select(columns.notes)
          .eq("id", noteId!)
          .eq("workspace_id", workspaceId!)
          .abortSignal(signal)
          .maybeSingle(),
      ),
  });
  const summary = useQuery({
    queryKey: ["summary", workspaceId],
    enabled: view === "dashboard",
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_summary", { p_workspace: workspaceId })
          .abortSignal(signal),
      )[0],
  });
  const total = useQuery({
    queryKey: ["activity-total", workspaceId, filters],
    enabled: view === "activities" && !activityId,
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_total", {
            p_workspace: workspaceId,
            p_filters: filters,
          })
          .abortSignal(signal),
      ),
  });
  const activities = useMemo(() => {
    const rows =
      view === "dashboard"
        ? (recent.data ?? [])
        : (list.data?.pages.flatMap((p) => p.rows) ?? []);
    return [...new Map(rows.map((a) => [a.id, a])).values()];
  }, [view, recent.data, list.data]);
  const notes = useMemo(() => {
    const rows: Note[] = noteList.data?.pages.flatMap((p) => p.rows) ?? [];
    return note.data && !rows.some((n) => n.id === note.data.id)
      ? [note.data, ...rows]
      : rows;
  }, [noteList.data, note.data]);
  const activityMap = useMemo(
    () =>
      new Map<string, Activity>(
        [
          ...(recent.data ?? []),
          ...activities,
          ...(detail.data ? [detail.data] : []),
        ].map((a) => [a.id, a]),
      ),
    [activities, recent.data, detail.data],
  );
  const ids = activities.map((a) => a.id);
  // Each bounded batch has a separate cache entry. Appending a page never recounts old pages.
  const counts = useQuery({
    queryKey: ["observation-counts", ids],
    enabled:
      ids.length > 0 &&
      (view === "dashboard" || (view === "activities" && !activityId)),
    queryFn: async ({ signal }) => {
      const values: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const rows = await cache.fetchQuery({
          queryKey: ["observation-counts", batch, "batch"],
          queryFn: async () =>
            check(
              await client()
                .rpc("observation_counts_for", { p_activities: batch })
                .abortSignal(signal),
            ),
        });
        for (const r of rows) values[r.activity_id] = r.total;
      }
      return values;
    },
  });
  const relevant = [
    spaces,
    ...(view === "activities"
      ? [activityId ? detail : list, ...(!activityId ? [total, counts] : [])]
      : []),
    ...(view === "dashboard" ? [summary, recent, counts] : []),
    ...(view === "notes" ? [noteList, ...(noteId ? [note] : [])] : []),
  ];
  return {
    reads: {
      spaces,
      summary,
      total,
      counts,
      list: view === "dashboard" ? recent : list,
      noteList,
      note,
      detail,
    },
    cache,
    workspace,
    workspaceMap,
    activityMap,
    workspaces,
    activities,
    notes,
    recent: recent.data ?? [],
    selected: detail.data,
    noteMissing: !!noteId && note.isSuccess && !note.data,
    observationCounts: counts.data ?? {},
    counts: summary.data,
    total: total.data,
    hasMore: !!list.hasNextPage,
    noteMore: !!noteList.hasNextPage,
    loading: relevant.some((r) => r.isFetching),
    initialLoading: relevant.some((r) => r.isLoading),
    loadError: relevant.find((r) => r.error)?.error
      ? errorMessage(relevant.find((r) => r.error)!.error)
      : "",
    loadMore: () => list.fetchNextPage(),
    loadMoreNotes: () => noteList.fetchNextPage(),
    loadingMore: list.isFetchingNextPage,
    loadingMoreNotes: noteList.isFetchingNextPage,
    retry: async () => {
      await Promise.all(
        relevant.filter((r) => r.error).map((r) => r.refetch()),
      );
    },
    refreshActivity: (id?: string) =>
      invalidateActivity(cache, workspaceId, id ?? activityId ?? undefined),
    refreshNotes: (deletedId?: string) =>
      invalidateNotes(cache, workspaceId, deletedId),
    refreshWorkspaces: async () => {
      await cache.invalidateQueries({ queryKey: ["workspaces"] });
    },
  };
}
