"use client";
import { BrandLogo } from "@/components/brand";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <BrandLogo layout="vertical" />
      <h1>Não foi possível abrir esta página</h1>
      <p>Seus registros continuam no servidor.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
