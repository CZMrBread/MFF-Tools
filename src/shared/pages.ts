/** Stránky webu. Každá má vlastní vstupní HTML v app/ a tím i vlastní URL. */
/** `short` = popisek v hlavičce na úzkém displeji (na 390 px se pak odkazy vejdou na jeden řádek). */
export const PAGES = [
  { id: "guide", title: "Průvodce prváka", short: "Průvodce", path: "" },
  {
    id: "calculator",
    title: "Kalkulačka kreditů",
    short: "Kredity",
    path: "kalkulačka/",
  },
  { id: "map", title: "Mapa předmětů", short: "Mapa", path: "specializace/" },
  { id: "algo", title: "Algoritmy", short: "Algoritmy", path: "algo/" },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

/**
 * Přístupné jméno odkazu v hlavičce: plné jméno, a když v něm krátký popisek (telefon) není
 * obsažený, ještě krátký v závorce – hlasové ovládání („klikni Kredity“) odkaz najde na každé šířce
 * (WCAG 2.5.3 Label in Name).
 */
export function navLabel(page: { title: string; short: string }): string {
  const has = page.title
    .toLocaleLowerCase("cs")
    .includes(page.short.toLocaleLowerCase("cs"));
  return has ? page.title : `${page.title} (${page.short})`;
}

export function isPageId(value: unknown): value is PageId {
  return PAGES.some((page) => page.id === value);
}

/**
 * Relativní cesta z aktuální stránky do kořene webu ("./" nebo "../").
 * Web běží pod podcestou ~smolad/, proto nikde nepoužíváme absolutní cesty –
 * hodnotu dodává atribut data-site-root na <html> ve vstupním HTML.
 */
export function siteRoot(): string {
  const root = document.documentElement.dataset.siteRoot ?? "./";
  return root.endsWith("/") ? root : `${root}/`;
}

/** Odkaz na stránku webu relativně k aktuální stránce. */
export function pageHref(id: PageId): string {
  const page = PAGES.find((candidate) => candidate.id === id);
  return siteRoot() + (page?.path ?? "");
}

/** URL složky s daty (public/data/), relativně k aktuální stránce, s lomítkem na konci. */
export function dataBaseUrl(): string {
  return `${siteRoot()}data/`;
}
