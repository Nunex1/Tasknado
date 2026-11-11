import { connection } from "next/server";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/i18n/provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { themeColors, themeScript } from "@/lib/theme";
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
  // One entry per system scheme; an explicit Light or Dark choice rewrites
  // both from applyTheme().
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
  colorScheme: "light dark",
  // The on-screen keyboard shrinks the layout instead of covering the bottom
  // of sheets and forms (honoured by Chromium and Firefox on Android).
  interactiveWidget: "resizes-content",
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    // The script below sets data-theme before React hydrates.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
