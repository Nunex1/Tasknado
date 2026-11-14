"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!db) { setReady(true); return; }
    // INITIAL_SESSION is supplied by the SDK. A second getSession request is unnecessary.
    const { data } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setGeneration(n => n + 1);
      setUser(session?.user ?? null);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, setUser, ready, recovery, setRecovery, generation };
}
