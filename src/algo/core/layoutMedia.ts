/**
 * Rozložení stránky modulu na jednu obrazovku (index.css, blok „STRÁNKA MODULU NA JEDNU OBRAZOVKU“):
 * plátno, akce, přehrávání a pseudokód mají pevné místo v okně a stránka se neposouvá. Stejný dotaz
 * musí stát v index.css (hlídá cssScope.test.ts).
 */
export const FIT_MEDIA = "(min-width: 1100px) and (min-height: 600px)";

/** Platí dotaz `query` v tomto okně? (bez matchMedia – testy, SSR – ne) */
export function mediaMatches(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}
