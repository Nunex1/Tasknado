"use client";
import { useQuery } from "@tanstack/react-query";
import { client, check } from "@/lib/supabase";
import { useDebounced } from "./use-app-data";

export function useSearch(query: string, filters: { workspace?: string; kind?: string; status?: string; from?: string; to?: string; mime?: string; offset?: number } = {}, enabled = true) {
  const settled = useDebounced(query.trim(), 250);
  const args = { p_query: settled, p_workspace: filters.workspace || null, p_kind: filters.kind || null,
    p_status: filters.status || null, p_from: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : null,
    p_to: filters.to ? new Date(filters.to + "T23:59:59.999").toISOString() : null, p_mime: filters.mime || null, p_offset: filters.offset || 0 };
  return useQuery({ queryKey: ["search", args], enabled: enabled && !!settled && settled === query.trim(), staleTime: 30_000,
    queryFn: async ({ signal }) => check(await client().rpc("search_all", args).abortSignal(signal)) });
}
