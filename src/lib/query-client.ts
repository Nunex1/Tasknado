import { QueryClient } from "@tanstack/react-query";
import { ServiceError } from "./supabase";

export function retryRead(failureCount: number, error: unknown) {
  if (
    error instanceof ServiceError &&
    (["PGRST202", "42883", "42P01", "42501", "PGRST301", "PGRST302"].includes(
      error.code ?? "",
    ) ||
      (error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)))
  )
    return false;
  return failureCount < 1;
}

/** One instance per authenticated session; never persisted or shared on the server. */
export function createPrivateQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: retryRead,
        refetchOnWindowFocus: true,
        refetchOnReconnect: "always",
      },
      mutations: { retry: false },
    },
  });
}
