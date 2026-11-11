import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/i18n/provider";
import ptBR from "@/i18n/pt-BR.json";

// Self-hosted at build time: no request leaves for a font server at runtime.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: ptBR["Tasknado · Menos caos. Mais execução."],
  description:
    ptBR[
      "Organize suas tarefas, estabeleça prioridades e transforme planejamento em resultados."
    ],
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
