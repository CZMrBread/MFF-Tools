# Kód, stack, konvence

## Stack

- Vite + React + TypeScript (`strict: true`), správce balíčků `npm`
- Routing: mezi stránkami žádný router – čtyři samostatné vstupní HTML v `app/`
  (`index.html`, `kalkulačka/index.html`, `specializace/index.html`,
  `algo/index.html`), mezi stránkami obyčejné relativní odkazy (`pageHref()`).
  `react-router-dom` (^7) se smí používat **jen uvnitř stránky algo**
  (`src/algo/`, `HashRouter` – staré odkazy `~smolad/algo/#/…`); jinde ne (viz
  `docs/migrace.md`, Rozhodnutí z kroku 1 a krok 8)
- D3 v7 pro mapu (npm, ne CDN)
- Styly: obyčejné CSS moduly (`*.module.css`) + globální `src/styles/global.css`
  převedený ze `styles.css` (barvy a font MFF UK). Žádný Tailwind ani UI
  knihovna bez domluvy.
- Stav: `useState` / `useReducer` + context. Žádný Redux/Zustand bez domluvy.
- Testy: Vitest (+ `@testing-library/react` jen tam, kde je UI test nutný)
- Lint: ESLint z Vite šablony; formátování Prettier (default)

## Cílová struktura

Vstupní HTML v `app/` načítají `app/main.ts` (ten importuje `src/main.tsx`).
Skript musí ležet uvnitř `app/` (kořen Vite) – odkaz přímo na `../src/main.tsx`
projde buildem, ale `npm run dev` ho nenajde a stránka je prázdná. Hlídá to
`src/entries.test.ts`.

```
src/
├── main.tsx            # mount; stránku vybírá data-page ze vstupního HTML
├── App.tsx             # hlavička webu + jedna líně načtená stránka
├── lib/
│   ├── types.ts        # typy uzlů/hran/požadavků (viz docs/data.md)
│   ├── data.ts         # načtení years/fields/nodes/links + validace
│   ├── credits.ts      # čistá výpočetní logika kalkulačky (viz docs/algo.md)
│   ├── schedule.ts     # logika záložky Rozvrh (přechody stavu, souhrn)
│   ├── map.ts          # čistá logika mapy (filtr, barvy, tooltipy, popover)
│   ├── storage.ts      # localStorage klíče (viz docs/kalkulacka.md)
│   └── __fixtures__/   # záznamy staré kalkulačky, known-data-problems.json
├── shared/             # pages.ts (odkazy, URL dat), useStudyData, YearSelect,
│                       # FieldSelect, SiteHeader, SiteFooter
├── calculator/         # Kalkulačka + Rozvrh
├── map/                # Mapa předmětů
├── guide/              # Průvodce prváka
├── legacy/             # původní HTML stránky – jen reference testů shody (nelintuje se)
├── algo/               # Vizualizace algoritmů (stránka /algo/; dřívější samostatný projekt
│   │                   #   algo/ v kořeni repa je smazaný 8. 11. 2026; popis v docs/vizualizace.md)
│   ├── AlgoPage.tsx    # stránka: .algo-root + ErrorBoundary + App (HashRouter)
│   ├── App.tsx         # kostra: levá lišta s moduly, přehled, routy modulů
│   ├── registry.ts     # 51 modulů v 11 skupinách, vzory cest, zdroje, hledání
│   ├── siteHeader.ts   # --site-header-h pro lepící prvky pod hlavičkou webu
│   ├── core/           # přehrávač kroků, ovládání, pseudokód, URL parametry, téma
│   ├── views/          # ArrayView, TreeView, GraphView, BoxListView, TextStripView,
│   │                   #   AutomatonView, CircuitView/CircuitEditor, ComparatorView,
│   │                   #   UnitCircleView, ButterflyNetView… (SVG) + čistá geometrie *Layout.ts
│   ├── algos/          # moduly (sorting, structures, trees, graphs, hashing, strings,
│   │                   #   parallel, fourier, flows, dp, geometry…); *.preview.tsx = náhled na
│   │                   #   úvodní stránce, *Views.tsx = kresby sdílené stránkou a náhledem
│   └── index.css       # styly jen pod .algo-root, proměnné --algo-*
└── styles/
public/
└── data/               # kopie data/ (obsah 1:1)
```

## Konvence

- Výpočetní a datová logika v `src/lib/` jsou čisté funkce bez Reactu a bez
  DOM – komponenty je jen volají. Každá funkce v `lib/` má test.
- Komponenty malé, pojmenované česky nebo anglicky konzistentně v rámci
  modulu (stávající kód mísí obojí – v novém kódu používej **anglické
  identifikátory, české texty v UI**).
- Žádné `any`; typy dat odvoď z reálných JSON, ne z domněnek.
- Všechny cesty k datům a assetům relativní – web běží pod `~smolad/`.
  Vite `base: './'`. URL dat jen přes `dataBaseUrl()`, odkazy na stránky jen
  přes `pageHref()` (`src/shared/pages.ts`).
- Zachovej `site.webmanifest`, favicony a `LICENSE` (GPLv3).
- `src/algo/`: styly jen pod `.algo-root` a proměnné s prefixem `--algo-`
  (hlídá `src/algo/core/cssScope.test.ts`); mimo něj jen proměnné témat na
  `:root`, `body` a tmavá varianta hlavičky webu. Lepící/pevné prvky počítají
  s `var(--site-header-h, 0px)` a mají `z-index` < 1000 (hlavička). Téma
  algoritmů: `data-theme` na `<html>`, klíč `algo-theme`; rychlost `algo-speed`;
  naposledy otevřené moduly úvodní stránky `algo-recent` (JSON pole cest).
  Přístup k `localStorage` jen přes `safeLocalStorage()` (`src/algo/core/storage.ts`).
- `src/algo/`: čistá logika stránky modulu v `*PageModel.ts` / `*Actions.ts`
  (testy v node), `*Page.tsx` jen tenká vrstva; zadávání přes `ActionMenu`
  a přímou manipulaci na plátně, knižní předvolby s testem proti
  `book.fixtures.ts` – viz `docs/vizualizace.md`.
- `src/algo/`: dotaz v adrese jen přes `useUrlParam`, `useLinkSearchParams`
  nebo `readableSearch` (`core/linkParams.ts` – čitelné `a=4,2,8`; přímé
  `useSearchParams` hlídá `core/readableLinksGuard.test.ts`). Zobrazená čísla
  přes `formatNum` (`core/format.tsx`, desetinná čárka); FFT `formatNumPoint`;
  do adresy dál `String(x)` s tečkou.
- `src/algo/`: tah prvku na kresbě (myš, pero, prst) jen přes
  `core/usePointerDrag.ts` + čisté funkce `core/dragMath.ts` (práh 4 px,
  úchop ≥ 22 / 44 px, posun z uchopení, meze, `separateFrom`); během tahu
  se rozložení kresby nepřepočítává (zmrazí se při stisku) – viz „Tažení
  bodů“ v `docs/vizualizace.md`.
- Build: sdílené kresby `src/algo/views` jsou ve vlastním chunku
  `algo-views` (`vite.config.ts`, `codeSplitting` s
  `includeDependenciesRecursively: false` – jinak by chunk stáhl React
  a načítaly by ho i ostatní stránky webu). Stránky modulů se načítají líně
  (`lazyPage` v `App.tsx`); náhledy na úvodní stránce (`landing/`, chunk
  `AlgoPage`) proto **nesmí importovat `*Page.tsx`** – kresbu sdílenou se
  stránkou dej do `*Views.tsx` (jinak build hlásí `INEFFECTIVE_DYNAMIC_IMPORT`
  a chunk `AlgoPage` přeroste 500 kB).
- `src/algo/` má **dočasně** vlastní `tsconfig.algo.json` bez
  `noUncheckedIndexedAccess` (dluh, viz `docs/migrace.md`); nové soubory tam
  piš tak, aby prošly i s ním.
- DOM testy: `// @vitest-environment jsdom` na prvním řádku; nikdy dynamický
  import jsdom, který by test potichu přeskočil.

## Jak ověřit změny

- `npm run dev` – vývoj; zkontroluj konzoli prohlížeče (bez chyb).
- `npx tsc -b` (nebo `npx tsc --noEmit -p tsconfig.app.json`) – musí projít.
- `npm run lint`
- `npm test` – Vitest; testy čtou skutečná data z `data/` a pokrývají každý
  rok × obor z `years.json` / `fields.json`. Fixture
  `src/lib/__fixtures__/credits-legacy.json` generuje
  `node scripts/gen-credits-fixture.mjs` ze staré kalkulačky – po změně dat
  ji přegeneruj.
- `npm run build && npm run preview` – ověř, že funguje načtení dat
  z `public/data/` a že odkazy fungují pod podcestou (např. otevři
  `http://localhost:4173/` i s nastaveným `base`).
- Před commitem: staré soubory netknuté (pokud nebyl odsouhlasen úklid).

## Nasazení

Repo leží na serveru mimo `~/WWW` (např. `~/mff-tools`); `bash ~/mff-tools/scripts/deploy.sh`
udělá `git pull --ff-only`, `npm ci`, `npm run build`, zkontroluje, že `dist/` obsahuje všechny
stránky, a zkopíruje obsah `dist/` do `~/WWW` (cesty mění proměnné `REPO_DIR` / `WWW_DIR`).
Při chybě se nic nekopíruje. Potřeba Node 20.19+ nebo 22.12+.
