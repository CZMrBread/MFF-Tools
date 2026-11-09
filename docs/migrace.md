# Migrace na Vite + React + TypeScript

## Cíl

Tři stávající stránky (`index.html`, `kalkulačka/index.html`, `specializace/index.html`)
přepsat na jednu React aplikaci buildovanou Vitem. Výstup `npm run build` musí být
**čistě statický** – hostuje se na školním serveru jako soubory, bez serveru,
bez API.

## Co se nesmí dělat bez souhlasu

- **Nemazat ani neupravovat staré soubory** (`index.html`, `kalkulačka/`,
  `specializace/`, `styles.css`). Jsou referencí chování a běží živě. Odstraní
  se až po mém výslovném odsouhlasení, když nová verze dělá totéž.
- **Neměnit formát dat** v `data/`. Nová aplikace čte stejné JSON soubory 1:1
  (viz `docs/data.md`). Pokud by změna formátu výrazně pomohla, navrhni ji
  zvlášť a počkej.
- **Neměnit klíče v `localStorage`** – uživatelé mají uložený postup; nová
  verze musí jejich data přečíst (klíče viz `docs/kalkulacka.md`).
- Nezavádět nové závislosti nad rámec `docs/kod.md` bez domluvy.

## Zachovat při migraci

- URL stránek: `/`, `/kalkulačka/`, `/specializace/` (včetně diakritiky v
  `kalkulačka` – odkazy na ni kolují mezi studenty) a `/algo/` včetně odkazů
  za hashem (`~smolad/algo/#/sort/quick?a=…`, `#/graph/dfs?g=…`).
- Web běží pod podcestou `~smolad/` → Vite `base` musí být relativní (`'./'`)
  nebo nastavená podle prostředí. Žádné absolutní cesty začínající `/`.
- Vzhled: barvy a font MFF UK ze `styles.css`, Bootstrap Icons.
- Vše funguje bez backendu – data se načítají `fetch`em z `data/` (zkopírované do
  `public/data/`, obsah beze změny).

## Postup (po krocích, po každém se zastav a shrň stav)

1. **Scaffold** – `npm create vite@latest` (react-ts), ESLint, Vitest; `public/data/`
   = kopie `data/`; `npm run build` projde. Staré soubory zůstávají.
2. **Datová vrstva** – `src/lib/types.ts` (typy odvozené z reálných JSON),
   `src/lib/data.ts` (načtení roků, oborů, nodes/links + validace). Testy nad
   skutečnými daty v repu.
3. **Výpočet kreditů** – `src/lib/credits.ts` jako čisté funkce (`planFor`,
   `planTotals`, `effMin`, …) přepsané ze staré kalkulačky. Testy porovnávají
   výsledky se starou verzí.
4. **Kalkulačka** – UI (výběr roku/oboru/stupně/specializace, odškrtávání,
   souhrn) + záložka Rozvrh. Kompatibilní `localStorage`.
5. **Mapa předmětů** – D3 graf v React komponentě.
6. **Průvodce prváka** – přenést statický obsah.
7. **Úklid** – po odsouhlasení smazat staré soubory, aktualizovat README.
8. **Sloučení algo** – vizualizace algoritmů (dřív samostatný projekt `algo/`)
   jako čtvrtá stránka `/algo/` hlavní aplikace (plán schválen 6. 11. 2026,
   podkroky A–G; popis hotového modulu je v `docs/vizualizace.md`).

## Rozhodnutí z kroku 1

- **Umístění projektu:** Vite projekt je v kořeni repa (`package.json`,
  `vite.config.ts`, `src/`, `public/`). Protože staré `index.html`,
  `kalkulačka/` a `specializace/` v kořeni zůstávají netknuté, jsou vstupní
  HTML nové aplikace ve složce `app/` (Vite `root: app/`), build jde do `dist/`.
- **Routing: samostatné vstupy, ne hash router.** `app/index.html`,
  `app/kalkulačka/index.html` a `app/specializace/index.html` se buildí na
  `dist/index.html`, `dist/kalkulačka/index.html`, `dist/specializace/index.html`
  – URL zůstávají stejné a není potřeba serverový rewrite. Mezi stránkami se
  přechází obyčejnými relativními odkazy, takže `react-router` není potřeba a
  **není nainstalovaný**. (Od kroku 8 je `react-router-dom` jen **uvnitř**
  stránky algo – její `HashRouter` drží staré odkazy `#/…`; mezi stránkami
  webu se dál přechází obyčejnými odkazy.)
- Každé vstupní HTML nese `data-page` (který nástroj vykreslit) a
  `data-site-root` (`./` nebo `../` – relativní cesta do kořene webu; z ní se
  skládají odkazy i URL dat, viz `src/shared/pages.ts`). `base: './'`.
- Stránky se načítají přes `React.lazy` → každá má vlastní JS i CSS chunk.
- `public/data/` je kopie `data/`; kopii obnovuje `npm run sync-data`
  (spouští se automaticky před `dev` a `build`). Edituje se jen `data/`.
- TypeScript je `~6.0` (ne 7): `typescript-eslint` zatím TS 7 nepodporuje.
- Ikony Bootstrap Icons zůstávají z CDN jako ve starých stránkách.

Aktuální stav: _(doplňuj sem po každém kroku: „krok N hotov – funguje X, chybí Y")_

- **Pozor – předloha:** migrace zpočátku cílila na zastaralý lokální strom
  (commit `958f57d`, bez oborů). Lokální `main` byl 5. 11. 2026 posunut
  fast-forwardem na `origin/main` (`e0a6ccf`) – ta verze běží živě a popisuje
  ji dokumentace (obory, `fields.json`, rok 2026-2027). Referencí chování jsou
  staré stránky v tomto stavu.
- **Krok 1 hotov** – scaffold (Vite + React + TS, ESLint, Prettier, Vitest),
  tři vstupy, sdílená hlavička/patička a auto-hide hlavičky, `public/` s daty,
  faviconami a manifestem; `npm run build`, `npm run lint`, `npm test` projdou.
  Stránky jsou zatím prázdné kostry.
- **Krok 2 hotov** – `src/lib/types.ts`, `data.ts` (načtení `years.json` →
  `<rok>/fields.json` → `<rok>/<obor>/nodes.json` + `links.json`, validace),
  `storage.ts` (klíče `lsKey` s příponou oboru 1:1 se starou kalkulačkou na
  HEAD, včetně `mff_akademicky_rok` a `mff_obor`), sdílený hook
  `useStudyData` (výběr roku a oboru přes `?rok=` / `?obor=` → localStorage →
  výchozí, bez reloadu přes `history.replaceState`) a komponenty `YearSelect`
  / `FieldSelect`. Testy nad všemi 6 kombinacemi rok × obor. Chybí: nic.
- **Krok 3 hotov** – `src/lib/credits.ts` (`planFor`, `isMandatoryChoice`,
  `includes_groups`, `planTotals`, `effMin`, `degreeHeading`, souhrn) a
  `src/lib/schedule.ts` (logika Rozvrhu). Shoda se starou kalkulačkou ověřená
  záznamem `src/lib/__fixtures__/credits-legacy.json` (546 scénářů, 6 kombinací
  rok × obor; generuje `node scripts/gen-credits-fixture.mjs` spuštěním
  starého skriptu). Chybí: nic.
- **Krok 4 hotov** – `src/calculator/`: výběr roku/oboru, průvodce stupeň →
  specializace, dashboard (kategorie, „bez kreditů“ u Mgr, souhrn, resety,
  „Změnit obor“), záložka Rozvrh (drag & drop, výběr ročníku klepnutím,
  počet ročníků). Ukládá do stejných klíčů jako stará stránka. Ověřeno testy
  v jsdom; **chybí** kontrola v prohlížeči (vzhled, mobilní šířka, skutečné
  HTML5 drag & drop, sticky sloupce, pozice výběru ročníku).
- **Krok 5 hotov** – `src/map/` + `src/lib/map.ts`: D3 graf se stejnými silami,
  filtrem stupně, výběrem specializací, popoverem (SIS/WIKI, „Zobrazit
  specializace“ AND/OR), zoomem a celou obrazovkou. `graph.legacy.test.tsx`
  porovnává krok za krokem se skriptem staré stránky pro všech 6 kombinací.
  Odchylka: uzly `program_req` se nevykreslují (jen filtr „Všechny stupně“
  má mírně jiné polohy předmětů, viz `docs/mapa.md`). **Chybí** kontrola
  v prohlížeči (šipka selectu, `:has()`, přechody, zalamování popisků).
- **Krok 6 hotov** – `src/guide/`: obsah Průvodce prváka včetně sekce
  o stipendiích z HEAD; test porovnává text a odkazy se starou `index.html`.
  **Chybí** vizuální kontrola v prohlížeči.
- **Brána (6. 11. 2026):** `npx tsc -b`, `npm run lint`, `npm test` (14
  souborů, 1810 testů) a `npm run build` projdou bez chyb a varování.
  `dist/` obsahuje `index.html`, `kalkulačka/index.html`,
  `specializace/index.html`, `data/` (shodná s `data/`) a `assets/`, vše
  s relativními URL. Neověřeno: `npm run preview` / běh pod `~smolad/`.
- **Známé problémy v datech:** validátor nehlásí v žádné kombinaci nic.
  Jediná odchylka od pravidla v `docs/data.md` je záměrná značka
  `pv_group = "doporucene"` (doporučený předmět): 2024-2025/informatika 25,
  2025-2026/informatika 28, 2026-2027/fyzika 177, /informatika 27,
  /matematika 159, /ucitelstvi 232 výskytů. Počty hlídá
  `src/lib/__fixtures__/known-data-problems.json` – při úpravě dat je potřeba
  je tam aktualizovat.
- Krok 7 (úklid) nezačal – staré soubory zůstávají.
- **Krok 8A hotov (sloučení algo bez změny chování, 6. 11. 2026)** –
  `algo/src/**` zkopírováno do `src/algo/**` (bez `src/_audit`, jeho obsah je
  v trvalých testech; bez `main.tsx`). Nová stránka `AlgoPage`
  (`src/algo/AlgoPage.tsx` = dřívější `App` s `HashRouter` a `ErrorBoundary`
  v `.algo-root`), vstup `app/algo/index.html` (`data-page="algo"`,
  `data-site-root="../"`, skript proti bliknutí tématu z `algo/app/index.html`,
  favicon `app/algo/favicon.svg`) → `dist/algo/index.html`; v hlavičce položka
  „Algoritmy“ (`PAGES`). Přidán `react-router-dom ^7.18.5` (jen uvnitř stránky
  algo, chunk `AlgoPage`; `npm ls react` = jedna kopie). jsdom testy převedeny
  na `// @vitest-environment jsdom` (žádné tiché přeskočení). CSS: obsah pod
  `.algo-root`, proměnné `--algo-*`, menu/horní lišta/pseudokód/podklad menu
  lepí pod hlavičku přes `--site-header-h` (zapisuje `useSiteHeaderOffset`,
  `src/algo/siteHeader.ts`; schovaná hlavička = 0), tmavá varianta hlavičky
  jen na stránce algo. Klíče `algo-theme`, `algo-speed` beze změny. ESLint
  (6 chyb) opraveny, `src/algo` zformátováno Prettierem. Brána: `npx tsc -b`,
  `npm run lint`, `npm test` (65 souborů, 2532 testů = 1810 + 699 převzatých + 23 nových), `npm run build`;
  snímky 1400 px / 390 px, světlé i tmavé, `#/`, `#/sort/quick`,
  `#/graph/dfs` (+ otevřené menu) se shodují se starým buildem `algo/` až na
  hlavičku webu nad obsahem.
- **Dluh z kroku 8A:** `src/algo` má vlastní projekt `tsconfig.algo.json`
  (kompozitní, odkazovaný z `tsconfig.app.json`) **bez
  `noUncheckedIndexedAccess`** (s ním ~700 chyb, hlavně stromy, k-d strom,
  grafy). Opravy po souborech a odstranění výjimky v kroku G plánu. Staré
  `algo/` bylo živou referencí až do 8. 11. 2026, kdy ho vlastník dovolil
  smazat z repa (nasazené `~/WWW/algo` běží dál do nasazení `dist/algo/`).
- **Krok 8 B–F hotov (6. 11. 2026)** – předvolby z knihy kreslené jako
  obrázky (obr. 5.4, 5.5 „Prasátko“, 5.10, 5.13, 7.1, 7.2; haldy 4.1–4.3,
  4.6; stromy 8.1–8.6; Mgr. moduly z handoutů L01–L05), výsledky algoritmů
  ověřené proti knize (`book.test.ts`: vrstvy obr. 5.8, in/out a třídy hran
  obr. 5.9, kostry obr. 7.x); zadávání po vzoru VisuAlgo ve všech 33
  modulech (`ActionMenu` s argumentem a Enter, „Příklady z knihy“, kreslení
  grafu na plátně, klik na prvek vyplní argument, k-d body a obdélník);
  lišta přehrávání lepí dole. Levá lišta s moduly zůstala. Popis:
  `docs/vizualizace.md` (soubor nahradil `docs/plan-algo.md`).
- **Opravy po validaci (6. 11. 2026)** – tip „Zkuste:“ už nepřekrývá
  legendu; po spuštění akce se plátno posune do záběru (telefon); graf bez
  souřadnic se vejde do šířky telefonu a při kreslení vždy; lišta
  přehrávání je jeden řádek (1366 × 768 nepřekrývá plátno), na telefonu
  dva; Jarník na obr. 7.2 začíná jako kniha v E (`BookPreset.start`);
  stromy se při změně šířky nerozjíždějí (`useTween` s `resetKey`); vrstvy
  BFS: 6→0 obloukem pod kresbou, popisek D= mimo svislou hranu; odkaz se
  ve StrictMode při otevření nepřepisuje; ručně psaný odkaz bez `d=`/`w=`
  má typ grafu staré verze; stránka grafů bez potlačených
  `exhaustive-deps` a s testy, že kreslení ani přesun vrcholu nespustí
  přehrávání. Brána: `npx tsc -b`, `npm run lint` (0/0), `npm test`
  (95 souborů, 2893 testů), `npm run build` (`dist/algo/index.html`);
  snímky 1400 / 1366 / 390 px (`#/graph/dfs` prasátko, `#/graph/bfs`,
  `#/sort/quick`, `#/graph/dijkstra`), světlé i tmavé, pod `/~smolad/`.
- **Krok 8 – autoplay vypnut, rozložení na jednu obrazovku (6.–7. 11. 2026,
  přání vlastníka „vešlo by se to na jednu stranu“, „simulace se nesmí
  pouštět samy“)** – přehrávání se nikdy nespouští samo: po otevření
  stránky, odkazu i po každé operaci stojí přehrávač na kroku 1, rozběhne ho
  jen ▶ / mezerník (`core/player.ts` bez klíče autoplay; hlídají
  `allModules.dom.test.tsx` přes všech 33 modulů a `noAutoplay.test.ts`,
  úvodní texty už neslibují „průběh se přehraje sám“). Stránka modulu se
  na desktopu (od 1100 × 600) vejde na jednu obrazovku: název + popis na
  dva řádky, plátno vyplní výšku, akce a lišta přehrávání pod ním, vpravo
  stav, pseudokód (aspoň ~6 řádků), legenda a sbalená nápověda. Třídění,
  stromy a halda přizpůsobí kresbu výšce plátna (`core/canvasFit.ts`) místo
  zmenšení písma; akce se po provedení sbalí (telefon i desktop na jednu
  obrazovku); tělo akce je v DOM za tlačítky (pořadí tabulátoru); na
  telefonu plátno po operaci nezajede pod hlavičku a široké pohledy mají
  stín u kraje. Levá lišta beze změny. Ruční měření
  `scripts/measure-algo-fit.mjs`: 33/33 modulů bez posuvníku při 1280 × 720,
  1366 × 768 a 1920 × 1080 (i s rozbalenou nápovědou a popisem). Brána:
  `npx tsc -b`, `npm run lint` (0/0), `npm test` (100 souborů, 2971 testů),
  `npm run build`; dev server (`vite`) servíruje `/algo/` i `main.ts`.
  Podrobnosti v `docs/vizualizace.md`.
- **Krok 8 – nová úvodní stránka `/algo/#/` (7. 11. 2026)** – `src/algo/landing/`:
  velké hledání (logika levé lišty) + přepínač Vše / Bc. / Mgr., čipy skupin
  s počtem modulů (posun bez změny adresy), řada „Naposledy otevřené“
  (**nový klíč localStorage `algo-recent`**, JSON pole cest; stávající klíče
  beze změny), karty po skupinách se zdrojem a statickou mini-kresbou
  výchozího příkladu (registr `PREVIEWS`, líné kreslení přes
  IntersectionObserver). Stránky modulů, odkazy `#/…` ani levá lišta se
  nemění. Podrobnosti v `docs/vizualizace.md` („Úvodní stránka“).
- **Zbývá (jen se souhlasem vlastníka):** nasadit `dist/algo/` místo
  `~/WWW/algo` (bezpečná výměna souborů), README; dluh
  `noUncheckedIndexedAccess` pro `src/algo` (krok G). (Staré `algo/` je
  z repa smazané 8. 11. 2026 se souhlasem vlastníka.)
- **Krok 8 – skupiny, zdroje, hlavička (7. 11. 2026, rozhodnutí vlastníka)** –
  moduly algo v tematických skupinách (Třídění · Datové struktury ·
  Vyhledávací stromy · Hešování · Grafy · Textové algoritmy · Paralelní
  algoritmy · Geometrie; cesty i štítek Mgr. beze změny), u každého modulu
  zdroj („Průvodce 9.5, str. 230 · DS I, přednáška 2“); hlavička webu má pod
  600 px zkrácené popisky a na 390 px je na jeden řádek; Topologické
  uspořádání dál začíná obr. 5.13. Viz `docs/vizualizace.md`.
- **Krok 8 – fáze 1 (polish) hotová, čeká na kontrolu vlastníka (7. 11. 2026)** –
  tematické skupiny a zdroje modulů (ověřené proti textu knihy pro všech 33),
  nová úvodní stránka `#/` (klíč `algo-recent`), plynulé přechody mezi kroky
  (délka podle rychlosti, s „omezit pohyb“ vypnuté), zkrácená hlavička pod
  600 px. Opravy po validaci: fokus po mezerníku na ▶ (ne `<body>`), halda ani
  panel výsledku grafu na konci operace neposkočí, výška sloupců se při změně
  rozložení nepřechází, varování „Ignorováno“ zůstane po sbalení akce,
  Kruskal na telefonu nezajede pod hlavičku, náhledy se počítají jednou a HTML
  náhled se vejde, živé oblasti hledání a přístupné jméno „Kredity“; měřicí
  skript spouští skutečnou operaci. Autoplay dál žádný; 33/33 modulů na jednu
  obrazovku při 1280 × 720, 1366 × 768, 1920 × 1080. Odložené body (roving
  tabindex, `xy=` v odkazu grafu, jednotnost akcí, prázdná místa kreseb) viz
  `docs/vizualizace.md`, Otevřené body.
- **Fáze 2 (až po kontrole fáze 1):** nové moduly – KMP, Aho-Corasicková,
  Rabin-Karp (skupina Textové algoritmy), hradlové sítě s editorem kreslení,
  sčítačka (školní vs. paralelní), třídicí sítě, FFT (FFT + násobení
  polynomů). Fáze 3: závěrečný UX test všech modulů.
- **Krok 8 – fáze 2 hotová (7. 11. 2026, integrace)** – 8 nových Bc. modulů
  z kap. 13, 15 a 17, každý s vlastní líně načtenou stránkou, náhledem na
  úvodní stránce, zdrojem (oddíl + strana) a pseudokódem z knihy:
  `#/string/kmp`, `#/string/aho-corasick`, `#/string/rabin-karp` (skupina
  Textové algoritmy; KMP ↔ AC odkazy), `#/parallel/gates` (hradlové sítě
  s kreslicím editorem a textovým importem/exportem), `#/parallel/adder`
  (školní vs. paralelní sčítačka), `#/parallel/sortnet` (bublinka, Sₙ, Bₙ,
  Tₙ, Batcher, 0-1 princip), `#/fft/fft` a `#/fft/net` (nová skupina
  Fourierova transformace). Výsledky testované proti obrázkům a cvičením
  knihy. Dočasná kostra (`StubModulePage`, `stubModule.ts`,
  `landing/stubPreview.tsx`) smazána. Autoplay dál žádný; nové klíče
  localStorage ani změny existujících odkazů žádné (jen nové parametry
  nových cest). Brána: `npx tsc -b`, `npm run lint` (0/0), `npm test`
  (153 souborů, 3722 testů), `npm run build`; `measure-algo-fit` 41/41 při
  1280 × 720, 1366 × 768 a 1920 × 1080 (po skutečné operaci krok 1,
  pozastaveno), 390 × 844 bez zakrytého plátna; dev server (`vite`)
  servíruje `/algo/` i `main.ts`. Popis modulů a otevřené body:
  `docs/vizualizace.md` („Fáze 2“, „Předvolby z knihy“, „Otevřené body“).
  Další: fáze 3 – závěrečný UX test všech modulů.
- **Krok 8 – fáze 2 po validaci (7. 11. 2026)** – opraveny nálezy validace
  i revize kódu (TDD, každá oprava s červeným testem): editor hradlových sítí
  drží výřez (klik = prvek pod kurzorem), fokus po smazání a Ctrl+Z odkudkoli;
  hodnota 1 s tokenem `--algo-c-one` (kontrast v tmavém tématu), popisky bloků
  sortnet a klíče FFT čitelné; šipky sčítačky pevné velikosti; zprávy FFT bez
  `^` a se závorkami součinu, validace `b=`; pseudokódy bez knižních čísel;
  kontrola vstupu ve formuláři (`check` u argumentu i akce – text sítě, počet
  2ᵏ, soudělná P a N) a upozornění na úpravu vstupu (`notice` – mezery,
  duplicity, mod 17); jednořádkový text sítě hlásí „Příkaz k“; výsledek 0-1
  principu na plátně, srozumitelné vrstvy Batchera; AcKonstrukce: zpráva
  sedí na zvýrazněný řádek; pravdivostní tabulka bez `role=button` na řádku;
  strom AC škáluje kroužky a písmo s výškou hladiny; pás textu se na desktopu
  nezmenšuje (posouvá se); stíny posouvání neprosvítají; pseudokód se posouvá
  k aktivnímu řádku správně; klik na volání FFT vyplní FFT(p); tip KMP podle
  příkladu. Žádná nová závislost, nové klíče localStorage ani změny
  existujících odkazů. Odložené body (polohy v odkazu `c=`, desetinná tečka
  ve FFT, volné místo u AC / školní sčítačky) v `docs/vizualizace.md`,
  Otevřené body. Brána: `npx tsc -b`, `npm run lint` (0/0), `npm test`
  (157 souborů, 3774 testů), `npm run build`; `measure-algo-fit` 41/41 při
  1280 × 720, 1366 × 768, 1920 × 1080 a 390 × 844; dev server servíruje
  `/algo/` i `main.ts`. **Fáze 2 je hotová.**
- **Krok 8 – fáze 3 hotová (7. 11. 2026, závěrečný UX test)** – audit všech
  41 modulů (70 nálezů) a opravy po TDD: jednotné akce (Vytvořit první,
  Příklady z knihy hned za ním, „Výchozí příklad“ a „↶ Vrátit operaci“ vždy
  v řádku pod akcemi, „Provést“ bez ▶, otevřená akce po načtení jen tam, kde
  modul čeká na operaci), H1 = titulek z registru, „Kopírovat odkaz“ = aktuální
  stav i u struktur a stromů (formáty parametrů beze změny), konec běhu bez
  účinku ⓘ / s cyklem ⚠ (`Step.outcome`), pseudokód hned po načtení, větší
  a čitelnější kresby (lineární struktury, hluboké stromy, grafy 1 : 1 s cenami
  ≥ 11 px, hešování, k-d, Aho–Corasicková, KMP/RK, sčítačka, FFT), import
  textem vedle kresby, odlišné náhledy na přehledu, hledání i ve zdrojích
  a po Zpět, kontrast ≥ 4,5 : 1 v obou tématech, fokus na telefonu nad lištou
  přehrávání. Autoplay dál žádný; nové závislosti, klíče localStorage ani
  změny formátu odkazů žádné. Brána: `npx tsc -b`, `npm run lint` (0/0),
  `npm test` (170 souborů, 4031 testů), `npm run build` bez varování;
  `measure-algo-fit` (nově i vnitřní přetečení plátna) 41/41 při 1280 × 720,
  1366 × 768, 1920 × 1080 a 390 × 844, po operaci vždy krok 1, pozastaveno;
  dev server servíruje `/algo/` i `main.ts`. Podrobnosti, nedokončené body
  a 9 otázek pro vlastníka: `docs/vizualizace.md` („Fáze 3“, „Otevřené body“).
  **Fáze 3 je hotová.**
- **Rozhodnutí D1–D3 hotová (8. 11. 2026)** – KMP „Postavit automat(ι)“ /
  „Hledat(σ)“; volitelné `xy=` (polohy vrcholů) v odkazu grafů a hradel, staré
  odkazy beze změny; roving tabindex (kresba = jedna zastávka Tabu, šipky po
  prvcích, Enter vybere, mezerník vždy přehrávač, Shift+šipky posun, Esc ven).
  Brána: `npx tsc -b`, `npm run lint` 0/0, `npm test` 176 souborů / 4149
  testů, build bez varování; 41/41 na jednu obrazovku při 1280 × 720,
  1366 × 768, 1920 × 1080 i 390 × 844, krok 1, pozastaveno. Žádný nový klíč
  localStorage ani závislost. Viz `docs/vizualizace.md` („Klávesnice na kresbě“,
  „Grafy – parametry odkazu“, Hradlové sítě).
- **Dávka 2 E1–E7 hotová (8. 11. 2026)** – splay Delete podle obr. 9.7,
  (a,b)-strom s variantou Průvodce 8.3 (`var=kniha`, výchozí přednášková),
  desetinná čárka mimo FFT, náhrobky / umístění kukačky v odkazu `t=`, les
  Union-Find u Kruskala, graf amortizace, stopa sond, větší kresby RK /
  sufixové pole / bezzámkový zásobník, čitelné odkazy bez `%2C` (staré se
  čtou dál). Brána: `npx tsc -b`, lint 0/0, `npm test` 195 souborů / 4321
  testů, build bez varování (sdílené kresby v chunku `algo-views`); 41/41 na
  jednu obrazovku při 1280 × 720, 1366 × 768, 1920 × 1080 i 390 × 844, krok 1,
  pozastaveno. Žádný nový klíč localStorage ani závislost. Zbytky viz
  `docs/vizualizace.md` („Dávka 2“, Otevřené body).
- **Zbytky dávky 2 hotové (8. 11. 2026)** – (a,b)-strom s CanvasFit, hešování
  vyplní plátno po načtení (`.viz-trail`, tabulka Bloomova filtru), sufixové
  pole bez přetečení (omezená tabulka s lepícím záhlavím), les Union-Find
  v barvách komponent, pole cen hran s desetinnou čárkou, CanvasFit zmenší
  i přesah pod 2 px. Brána: `npx tsc -b`, lint 0/0, `npm test` 199 souborů /
  4381 testů, build bez varování; 41/41 na jednu obrazovku při 1280 × 720,
  1366 × 768, 1920 × 1080 i 390 × 844, krok 1, pozastaveno. Beze změny odkazů,
  klíčů localStorage a závislostí.
- **Krok 8 – fáze 4: příprava souběžných stop (8. 11. 2026)** – 10 nových Bc. modulů z knihy
  (toky Ford–Fulkerson a Dinic, Bellman–Ford, Borůvka, mosty a artikulace, SCC Tarjan, editační
  vzdálenost, nejdelší rostoucí podposloupnost, konvexní obal, LLRB) zapsaných v registru (51 modulů,
  nové skupiny „Dynamické programování“ a „Toky v sítích“ v pořadí kapitol), routy, líně načítané
  kostry stránek a náhledů, grafové algoritmy ve vlastních souborech (`algoKit.ts`, `presetKit.ts`,
  varianty `v=` jen u nových cest), `GraphState.edgeText` a `markers` v GraphView, prázdné oddíly CSS.
  Žádná nová závislost, klíč localStorage ani změna existujících odkazů. Vlastnictví souborů a sdílené
  API: `docs/vizualizace.md`, „Fáze 4“. Brána: `npx tsc -b`, `npm run lint` 0/0, `npm test` 203 souborů /
  4454 testů, build bez varování; dev server servíruje `/algo/`.
- **Krok 8 – fáze 4 hotová (8. 11. 2026)** – 10 nových Bc. modulů z Průvodce:
  Ford–Fulkerson (+ párování) a Dinic (skupina „Toky v sítích“), Bellman–Ford,
  Borůvka, mosty a artikulace, komponenty silné souvislosti (Tarjan + přes Gᵀ),
  editační vzdálenost a NRP (skupina „Dynamické programování“), konvexní obal
  (zametání + provázek), LLRB; příklady z knihy ověřené testy, po UX validaci
  a nezávislé kontrole správnosti opravy UX-01…19 (UX-12 zamítnuto) a CR-1…5.
  Kostry smazané; náhledy už neimportují líně načítané stránky (`*Views.tsx`,
  hlídá `lazyPages.test.ts`). Žádná nová závislost, klíč localStorage ani
  změna existujících odkazů. Staré `algo/` je z repa smazané (souhlas
  vlastníka 8. 11. 2026; nasazené `~/WWW/algo` běží do nasazení `dist/algo/`).
  Brána: `npx tsc -b`, lint 0/0, prettier, `npm test` 242 souborů / 4857
  testů, build bez varování (chunk `AlgoPage` 452 kB); 51/51 modulů na jednu
  obrazovku při 1280 × 720, 1366 × 768, 1920 × 1080, 390 × 844 použitelné,
  krok 1, pozastaveno. Popis: `docs/vizualizace.md`, „Fáze 4“.
- **Goldberg a tažení bodů (8. 11. 2026)** – nový modul `#/flow/goldberg` (52 modulů; FF/Dinic ho
  nabízejí v „Jiný alg.“) a jednotný tah bodů (`core/usePointerDrag`, `dragMath`) v grafech, tocích,
  obalu a k-d stromu: větší úchop, práh 4 px, kresba se během tahu ani po puštění nepřeměřuje
  a neposkočí, vrcholy se nepřekryjí, dlouhý stisk maže jen prstem, přesun jde vrátit ↶ / Ctrl+Z.
  Bez nových závislostí, klíčů localStorage a změn formátu odkazů. Brána: `npx tsc -b`, lint 0/0,
  `npm test` 257 souborů / 5021 testů, build bez varování. Viz `docs/vizualizace.md` („Tažení bodů“).
- **Editor toků a párování po ověření (9. 11. 2026)** – husté kresby toků (`GraphView dense`: menší
  okraje a kroužky, obr. 14.7 „obě“ bez překryvu i při 1280 × 720), síť párování vyplní panel
  (`fitAspect`), kresba výšek Goldberga se vejde, ↶ Vrátit operaci a fokus v editoru toků, sloupec
  výsledku grafů zmrazený během úprav; `measure-algo-fit --edit`. Bez nových závislostí, klíčů
  localStorage a změn odkazů. Viz `docs/vizualizace.md` („Toky“, „Otevřené body“).
- **Krok 7 – úklid (9. 11. 2026, se souhlasem vlastníka)** – staré stránky
  v kořeni (`index.html`, `kalkulačka/`, `specializace/`, `styles.css`)
  a duplicitní favicony / `site.webmanifest` (kopie jsou v `public/`) smazány.
  Původní HTML stránek (stav `e0a6ccf`, Průvodce z pracovní kopie) zůstávají jen
  jako reference testů shody v `src/legacy/` (testy kalkulačky, rozvrhu,
  úložiště, mapy a Průvodce i `scripts/gen-credits-fixture.mjs` čtou odtud;
  ESLint ani Prettier je neformátují). `public/data/` je v `.gitignore`
  a generuje ji `sync-data` i před `npm test`. README přepsané na Vite.
  Pravidla „Co se nesmí dělat bez souhlasu“ k starým souborům tím odpadají.
