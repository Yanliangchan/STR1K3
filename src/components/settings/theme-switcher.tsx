"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, parseTheme, type ThemeSetting } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeSetting; label: string; Icon: typeof Sun }[] = [
  { value: "auto", label: "Auto", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeSetting>("auto");
  useEffect(() => setTheme(parseTheme(document.documentElement.dataset.theme)), []);
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn("grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1", compact && "max-w-xs")}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => {
            setTheme(value);
            applyTheme(value);
          }}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium",
            theme === value ? "bg-surface text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
          data-testid={`theme-${value}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
