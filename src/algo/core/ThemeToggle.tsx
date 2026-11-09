import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "algo-theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Přepínač světlý / tmavý / podle systému. Nastavuje data-theme na <html>; volbu drží v localStorage „algo-theme“. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* soukromé okno apod. */
    }
  }, [theme]);

  const opts: { v: Theme; label: string; title: string }[] = [
    { v: "light", label: "☀ světlý", title: "Světlé téma" },
    { v: "system", label: "auto", title: "Podle nastavení systému" },
    { v: "dark", label: "☾ tmavý", title: "Tmavé téma" },
  ];
  return (
    // skupina přepínacích tlačítek (aria-pressed): každé je vlastní zastávka tabulátoru – role radio by
    // slibovala šipky a jedinou zastávku (roving tabindex), které tu nejsou
    <div className="theme-toggle" role="group" aria-label="Barevné téma">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          className={theme === o.v ? "on" : ""}
          onClick={() => setTheme(o.v)}
          title={o.title}
          aria-pressed={theme === o.v}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
