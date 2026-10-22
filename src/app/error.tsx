"use client";
import { useI18n } from "@/i18n/provider";
import { BrandLogo } from "@/components/brand";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="setup">
      <BrandLogo layout="vertical" />
      <h1>{t("Não foi possível abrir esta página")}</h1>
      <p>{t("Seus registros continuam no servidor.")}</p>
      <button className="button primary" onClick={reset}>
        {t("Tentar novamente")}
      </button>
    </main>
  );
}
