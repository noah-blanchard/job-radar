/**
 * Appearance: an ink (palette) and a mode. Stored in cookies so the server renders the right
 * attributes on <html> (no flash); "auto" follows the device and is resolved before paint by
 * a tiny inline script, then kept in sync on the client.
 */
export const PALETTES = [
  { value: "bleu", label: "Encre bleue" },
  { value: "violet", label: "Encre violette" },
] as const;
export type Palette = (typeof PALETTES)[number]["value"];

export const MODES = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
] as const;
export type Mode = (typeof MODES)[number]["value"];

export const PALETTE_COOKIE = "jr-palette";
export const MODE_COOKIE = "jr-mode";

export function parsePalette(v: string | undefined): Palette {
  return v === "violet" ? "violet" : "bleu";
}
export function parseMode(v: string | undefined): Mode {
  return v === "light" || v === "dark" ? v : "auto";
}

/** Inline, before paint: resolve "auto" against the device and follow its changes. */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement;if(d.dataset.mode!=="auto")return;var q=matchMedia("(prefers-color-scheme: dark)");var f=function(){if(document.documentElement.dataset.mode==="auto")document.documentElement.classList.toggle("dark",q.matches)};f();q.addEventListener("change",f)}catch(e){}})()`;
