import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getMessages, getT } from "@/i18n/server";
import { MODE_COOKIE, PALETTE_COOKIE, parseMode, parsePalette, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted at build time by next/font (no request to Google at runtime).
const publicSans = Public_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-public-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "JobRadar", template: "%s · JobRadar" },
    description: t("meta.description"),
    robots: { index: false, follow: false },
  };
}

const CHROME = {
  bleu: { light: "#f7f8fa", dark: "#0f141b" },
  violet: { light: "#f8f7fb", dark: "#121219" },
} as const;

/** Browser chrome follows the chosen ink and mode. */
export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const c = CHROME[parsePalette(jar.get(PALETTE_COOKIE)?.value)];
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  return {
    themeColor:
      mode === "auto"
        ? [
            { media: "(prefers-color-scheme: light)", color: c.light },
            { media: "(prefers-color-scheme: dark)", color: c.dark },
          ]
        : c[mode],
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const palette = parsePalette(jar.get(PALETTE_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  // "auto" renders dark; the inline script corrects it before paint when the device is light.
  const dark = mode !== "light";
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html
      lang={locale}
      data-palette={palette}
      data-mode={mode}
      className={`${dark ? "dark " : ""}${publicSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans text-[13px] leading-[1.45]">
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
