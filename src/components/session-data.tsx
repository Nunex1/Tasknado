"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createPrivateQueryClient } from "@/lib/query-client";

export function SessionData({ children }: { children: React.ReactNode }) {
  const [cache] = useState(createPrivateQueryClient);
  useEffect(() => () => {
    // Cancels transport before discarding every private query and mutation.
    void cache.cancelQueries();
    cache.clear();
  }, [cache]);
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
