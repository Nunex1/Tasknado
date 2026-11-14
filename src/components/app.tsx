"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/provider";
import { Auth } from "./auth";
import { BrandLogo } from "./brand";
const AuthenticatedApp = dynamic(() => import("./authenticated-app").then(m => m.AuthenticatedApp), { loading: () => <SessionLoading /> });
function SessionLoading() {
  const {t} = useI18n();
  return <main className="setup" role="status"><BrandLogo tone="blue" /><p>{t("Abrindo seu espaço…")}</p></main>;
}
export function App() {
  const {user, setUser, ready, recovery, setRecovery, generation} = useSession();
  const {setAccount} = useI18n();
  useEffect(() => { if (ready) setAccount(user?.id ?? null, user?.user_metadata?.preferred_language); }, [ready, user?.id, user?.user_metadata?.preferred_language, setAccount]);
  // Public markup is safe while identity is confirmed; private queries mount only after authentication.
  if (!ready || !user || recovery) return <Auth recovery={recovery} pending={!ready} onRecovered={() => setRecovery(false)} />;
  return <AuthenticatedApp key={`${user.id}:${generation}`} user={user} setUser={setUser} />;
}
