import { useLayoutEffect } from "react";

/** Proměnná CSS s výškou hlavičky webu, ze které počítají lepící prvky algo (index.css). */
const VAR = "--site-header-h";
/**
 * Místo, které hlavička zabírá v toku stránky (sticky – i schovaná ho dál zabírá). Z něj se počítá
 * výška kostry modulu na jednu obrazovku: kdyby rostla se schováním hlavičky (--site-header-h = 0),
 * stránka by se o výšku hlavičky posouvala.
 */
const SPACE_VAR = "--algo-site-header-space";

/** Kolik místa nahoře zabírá hlavička webu: viditelná = její výška, schovaná (auto-hide) = 0. */
export function siteHeaderOffset(height: number, hidden: boolean): number {
  return hidden ? 0 : height;
}

/**
 * Drží `--site-header-h` na <html> podle hlavičky webu (.site-header): sleduje její
 * výšku (zalomení navigace na úzké obrazovce) i schování při posunu dolů
 * (třída site-header--hidden). Po odchodu ze stránky proměnnou odstraní.
 */
export function useSiteHeaderOffset(): void {
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    const root = document.documentElement;
    const update = () => {
      const offset = siteHeaderOffset(
        header.offsetHeight,
        header.classList.contains("site-header--hidden"),
      );
      root.style.setProperty(VAR, `${offset}px`);
      root.style.setProperty(SPACE_VAR, `${header.offsetHeight}px`);
    };
    update();

    const classes = new MutationObserver(update);
    classes.observe(header, { attributes: true, attributeFilter: ["class"] });
    const size =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    size?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      classes.disconnect();
      size?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(VAR);
      root.style.removeProperty(SPACE_VAR);
    };
  }, []);
}
