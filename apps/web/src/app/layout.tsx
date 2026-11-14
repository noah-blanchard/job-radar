import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { MODE_COOKIE, PALETTE_COOKIE, parseMode, parsePalette, THEME_SCRIPT } from "@/lib/theme";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f141b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const palette = parsePalette(jar.get(PALETTE_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  // "auto" renders dark; the inline script corrects it before paint when the device is light.
  const dark = mode !== "light";
  return (
    <html
      lang="fr"
      data-palette={palette}
      data-mode={mode}
      className={`${dark ? "dark " : ""}${publicSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans text-[13px] leading-[1.45]">{children}</body>
    </html>
  );
}
