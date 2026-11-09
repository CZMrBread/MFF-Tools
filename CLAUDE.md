# MFF-Tools

Webové nástroje pro studenty MFF UK: Průvodce prváka, Kalkulačka kreditů, Mapa
předmětů, Vizualizace algoritmů (`/algo/`). Data o studijních plánech jsou v `data/<rok>/<obor>/`. Živě na
`https://www.ms.mff.cuni.cz/~smolad/` (podsložka `~smolad/`, ne kořen domény).

Projekt se **přepisuje z vanilla HTML/JS na Vite + React + TypeScript**, stále bez
backendu. Stav migrace a co se smí/nesmí sahat je v `docs/migrace.md` – čti vždy.

Odpovídej česky. Před změnou formátu dat, architektury nebo před mazáním starých
souborů napiš plán a počkej na potvrzení.

## Dokumentace – čti podle toho, na čem pracuješ

- `docs/migrace.md` – stav a pravidla migrace, pořadí kroků (**vždy**)
- `docs/data.md` – formát `nodes.json` / `links.json` / `fields.json` / `years.json`
- `docs/kalkulacka.md` – modul Kalkulačka kreditů (+ záložka Rozvrh)
- `docs/mapa.md` – modul Mapa předmětů (D3 graf)
- `docs/pruvodce.md` – modul Průvodce prváka (statický obsah)
- `docs/vizualizace.md` – modul Vizualizace algoritmů (`/algo/`, `src/algo/`):
  zadávání dat, předvolby z knihy, testy
- `docs/kod.md` – stack, struktura `src/`, konvence, jak ověřit změny
- `docs/algo.md` – popis výpočetních algoritmů; při změně výpočtu aktualizuj

@docs/migrace.md
