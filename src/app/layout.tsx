import type { Metadata } from "next";
import "./globals.css";
import "./ocean.css";
export const metadata: Metadata = {
  title: "Tasknado · Sua memória operacional",
  description: "Atividades, contexto e conhecimento em um espaço pessoal.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
