import { QueryClient } from "@tanstack/react-query";

/** One instance per authenticated session; never persisted or shared on the server. */
export function createPrivateQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: "always",
      },
      mutations: { retry: false },
    },
  });
}
