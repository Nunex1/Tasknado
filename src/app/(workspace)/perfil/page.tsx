import type { Metadata } from "next";
import ptBR from "@/i18n/pt-BR.json";

export const metadata: Metadata = { title: `${ptBR.Perfil} · Tasknado` };

export default function ProfilePage() {
  // The shared App renders the profile only after its authentication check.
  return null;
}
