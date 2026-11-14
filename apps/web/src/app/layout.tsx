import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JobRadar", template: "%s · JobRadar" },
  description: "Agrégateur d'offres new grad",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
