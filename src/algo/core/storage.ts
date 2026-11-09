/**
 * localStorage, nebo null – když není (SSR, testy v node), nebo když už samotný přístup k němu
 * vyhodí výjimku (zakázané cookies / data webu). Sdílí ho player.ts (`algo-speed`) a
 * landing/recent.ts (`algo-recent`); zápisy a čtení si dál hlídá volající v try/catch.
 */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
