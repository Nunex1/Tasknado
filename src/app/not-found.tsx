"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { useI18n } from "@/i18n/provider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="setup">
      <BrandLogo layout="vertical" />
      <h1>{t("Página não encontrada")}</h1>
      <p>{t("Esta página não existe ou foi movida.")}</p>
      <Link href="/" className="button primary">
        {t("Voltar à Visão geral")}
      </Link>
    </main>
  );
}
