import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (no request to Google at runtime).
const publicSans = Public_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "JobRadar", template: "%s · JobRadar" },
  description: "Agrégateur d'offres new grad",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#10161d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${publicSans.variable}`}>
      <body className="min-h-dvh font-sans text-[13px] leading-[1.45]">{children}</body>
    </html>
  );
}
