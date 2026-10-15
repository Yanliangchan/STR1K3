export const THEME_COOKIE = "str1k3_theme";
export type ThemeSetting = "auto" | "light" | "dark";

export function parseTheme(v: string | undefined | null): ThemeSetting {
  return v === "light" || v === "dark" ? v : "auto";
}

/** Apply a theme setting in the browser immediately and remember it for a year. */
export function applyTheme(t: ThemeSetting) {
  const html = document.documentElement;
  html.dataset.theme = t;
  html.classList.toggle("dark", t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
