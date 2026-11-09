/**
 * Společný tvar „příkladu z knihy“ pro stránky datových struktur a stromů (čistá data, bez UI).
 * Stránka ho nabídne v rozbalovacím seznamu „Příklady z knihy“: build() dá výchozí stav přesně podle
 * obrázku a ops je operace z téhož obrázku (v pořadí, jak je kniha provádí).
 */
export interface BookExample<S, O> {
  /** stabilní id (do adresy a jako klíč seznamu), např. „obr-4-2“ */
  id: string;
  /** číslo obrázku („4.2“) nebo snímku přednášky („L03/4“) */
  figure: string;
  /** text položky v nabídce, např. „Příklad z knihy: Obr. 4.2 – vkládání do haldy“ */
  label: string;
  /** odkud příklad je (kniha / přednáška) */
  source: string;
  /** tištěné číslo strany knihy, u přednášky číslo snímku */
  page: number;
  /** upozornění, co v předloze chybí a bylo doplněno (null = nic) */
  note: string | null;
  /** stav struktury přesně podle obrázku (vždy nová kopie) */
  build: () => S;
  /** operace z obrázku; prázdné = obrázek ukazuje jen strukturu */
  ops: readonly O[];
}

export const PRUVODCE = "Průvodce labyrintem algoritmů (Mareš, Valla)";

/** „Příklad z knihy: Obr. 4.2 – vkládání do haldy“ */
export const bookLabel = (figure: string, caption: string) =>
  `Příklad z knihy: Obr. ${figure} – ${caption}`;

/** Příklad podle id (undefined = neznámé id, např. ze starého odkazu). */
export function bookExampleById<E extends { id: string }>(
  list: readonly E[],
  id: string | null,
): E | undefined {
  return id === null ? undefined : list.find((e) => e.id === id);
}
