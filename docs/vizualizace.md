# Vizualizace algoritmů (stránka `/algo/`)

Čtvrtá stránka webu: krokované vizualizace algoritmů a datových struktur k
Průvodci labyrintem algoritmů (Mareš, Valla – `docs/pruvodce.pdf`) a
k magisterským přednáškám (handouty L01–L05). Dřív samostatný projekt `algo/`
(živě `~smolad/algo/`); od 6. 11. 2026 je součástí hlavní aplikace v
`src/algo/` (krok 8 v `docs/migrace.md`). Složku `algo/` v kořeni repa vlastník
8. 11. 2026 dovolil smazat; nasazené `~/WWW/algo` běží do nasazení `dist/algo/`.

## Rozhodnutí vlastníka (6. 11. 2026)

- Jedna aplikace: `app/algo/index.html` (`data-page="algo"`,
  `data-site-root="../"`) → `dist/algo/index.html`; živá adresa bude
  `/~smolad/algo/`. Uvnitř stránky zůstává `HashRouter`, takže staré odkazy
  `~smolad/algo/#/sort/quick?a=…` a `#/graph/dfs?g=…` fungují dál.
- `react-router-dom` (^7) jen uvnitř stránky algo; mezi stránkami webu
  obyčejné odkazy (`PAGES` v `src/shared/pages.ts`, položka „Algoritmy“).
- **Rozvržení stránky zůstává** (levá lišta s moduly). Z VisuAlgo se
  převzal hlavně **model zadávání dat**: akce s argumentem + Enter/Provést,
  příklady z knihy, kreslení grafu přímo na plátně. Ne jejich značka, texty
  ani přesný vzhled; barvy a font MFF UK.
- Předvolby z knihy vypadají **jako obrázky v knize** (souřadnice, poměr
  stran, ohnuté hrany).
- Striktně TDD: každá změna chování začíná červeným testem.

## Co stránka obsahuje

51 modulů v 11 skupinách v `src/algo/registry.ts` (vzory cest, hledání v levé liště; 8 modulů
fáze 2 z kap. 13, 15 a 17 popisuje oddíl „Fáze 2“, 10 modulů fáze 4 oddíl „Fáze 4“ níže):

| Skupina | Moduly (cesta za `#`; *Mgr.* = štítek magisterské látky) |
| --- | --- |
| Třídění | `/sort/bubble`, `select`, `insert`, `merge`, `quick`, `heap`, `counting` |
| Datové struktury | `/ds/stack`, `queue`, `list`, `heap` (binární halda), `segtree` (intervalový strom); *Mgr.* `/ds2/array`, `/ds2/counter` (amortizace), `/cache/paging` (LRU/OPT/FIFO) |
| Vyhledávací stromy | `/tree/bst`, `/tree/avl`, `/tree/llrb` (LLRB, fáze 4); *Mgr.* `/tree/bb` (BB[α]), `/tree/splay`, `/tree/ab` ((a,b)-strom) |
| Hešování | *Mgr.* `/hash/chaining`, `/hash/probing`, `/hash/cuckoo`, `/hash/bloom` |
| Grafy | `/graph/bfs`, `dfs`, `bridges` (mosty a artikulace), `topo`, `scc` (Tarjan), `dijkstra`, `bellman-ford`, `jarnik`, `boruvka`, `kruskal` (pořadí oddílů 5.2–7.4) |
| Dynamické programování | `/dp/lis` (nejdelší rostoucí podposloupnost), `/dp/edit` (editační vzdálenost) |
| Textové algoritmy | `/string/kmp`, `/string/aho-corasick`, `/string/rabin-karp`; *Mgr.* `/string/suffix` (sufixové pole + LCP) |
| Toky v sítích | `/flow/ford-fulkerson` (+ párování), `/flow/dinic`, `/flow/goldberg` |
| Paralelní algoritmy | `/parallel/gates` (hradlové sítě), `/parallel/adder` (sčítačka), `/parallel/sortnet` (třídicí sítě); *Mgr.* `/parallel/lockfree` |
| Geometrie | `/geom/hull` (konvexní obal); *Mgr.* `/geom/kdtree` |
| Fourierova transformace | `/fft/fft` (rekurzivní FFT), `/fft/net` (FFT2, motýlková síť obr. 17.4) |

Skupiny jsou tematické (vlastník 7. 11. 2026; dřívější „Datové struktury II
(Mgr.)“ zmizela). **Cesty se při přeskupení nemění** (kolující odkazy) a
štítek Bc./Mgr. zůstává u modulu – hledání „mgr“ najde všech 13 Mgr. modulů.
Skupina „Fourierova transformace“ přibyla s moduly FFT (fáze 2), skupiny „Dynamické
programování“ (kap. 12, za Grafy) a „Toky v sítích“ (kap. 14, za Textovými algoritmy) s fází 4 –
pořadí skupin dál podle kapitol knihy.
Hlídá `registry.test.ts`.

**Zdroj modulu** (`ModuleLink.source`, povinný): `chapter` + `page` = oddíl a
tištěná strana Průvodce (`docs/pruvodce.pdf`), `lecture` = přednáška DS I
(„DS I, přednáška 2“ = handout L02 v `docs/`, „DS I, skripta 6.2“ = oddíl
skript M. Mareše `docs/ds.pdf` u témat bez handoutu). Bc. moduly mají vždy
oddíl i stranu; Mgr. moduly přednášku a ty, které jsou i v knize (amortizace,
BB[α], splay, (a,b), oba hešovací, sufixové pole), i oddíl a stranu.
`formatSource()` z `registry.ts` dělá řádek „Průvodce 9.5, str. 230 · DS I,
přednáška 2“; `App.tsx` ho předá přes `ModuleSourceContext`
(`core/moduleSource.ts`) a `Visualizer` ho ukáže malým písmem za nadpisem
(`.viz-source`, na řádku nadpisu – rozložení na jednu obrazovku se nemění).
Zdroje hlídá `registry.test.ts`: u **všech** modulů s oddílem leží strana
mezi začátkem oddílu a začátkem dalšího podle `src/algo/bookSections.fixture.json`
(nadpisy oddílů a tištěné strany vytažené z textu knihy 7. 11. 2026); vybrané
moduly mají navíc pevný snímek hodnot.

Struktura kódu (`src/algo/`):

- `AlgoPage.tsx` – stránka: `.algo-root` + `ErrorBoundary` + `App`
  (`HashRouter`); `App.tsx` – levá lišta, přehled, routy modulů. Hledání
  v liště: krátký zástupný text „Hledat modul…“, první výsledek označený
  `↵` (`.enter-target`, Enter ho otevře), ↓/↑ mezi výsledky, počet výsledků
  v `role="status"` (`sidebar.dom.test.tsx`).
- Hlavička webu (`src/shared/SiteHeader.tsx`): pod 600 px krátké popisky
  „Průvodce · Kredity · Mapa · Algoritmy“ (`data-short` + CSS); přístupné
  jméno `navLabel()` obsahuje viditelný text na každé šířce („Kalkulačka
  kreditů (Kredity)“ – WCAG 2.5.3). Ověřeno 320–600 px: jeden řádek, bez
  přetečení.
- `core/` – přehrávač kroků (`player.ts`, `usePlayer`), `Visualizer`
  (kostra stránky modulu), `Controls` (lišta přehrávání), `ActionMenu` +
  `actionModel.ts` (nabídka akcí), `structure.ts` / `useStructure`
  (operace nad strukturou, historie, vrácení), `shortcuts.ts`, `useUrlParam`,
  téma (`ThemeToggle`, klíč `algo-theme`).
- `views/` – SVG pohledy (`ArrayView`, `TreeView`, `MultiTreeView`,
  `GraphView`, `BoxListView`; od fáze 2 `TextStripView` – pás textu s okénkem
  a závorkami výskytů, `AutomatonView` – vyhledávací automat KMP / strom
  Aho-Corasickové, `CircuitView` + `CircuitEditor` – hradlová síť a její
  editor, `ComparatorView` – třídicí síť, `UnitCircleView` – ωᵏ na kružnici,
  `ButterflyNetView` – motýlková síť FFT), čistá geometrie (`graphGeometry.ts`,
  `treeLayout.ts`, `arrayLayout.ts`, `textStripLayout.ts`,
  `automatonLayout.ts`, `circuitLayout.ts`, `comparatorLayout.ts`,
  `unitCircleLayout.ts`, `butterflyNetLayout.ts`), úpravy na plátně
  (`graphEdit.ts`, `GraphEditor`, `circuitEdit.ts`, `pointEdit.ts`, `pick.ts`,
  `pointer.ts`), `useWidth`, `useTween`, `useFlip` (přechody viz „Plynulé
  přechody mezi kroky“).
- `algos/<oblast>/` – algoritmy jako generátory kroků + `*PageModel.ts`
  (čistá logika stránky) + `*Page.tsx` (tenká React vrstva).
- `landing/` – úvodní stránka `#/` (viz níže).
- `index.css` – styly jen pod `.algo-root`, proměnné `--algo-*`.

## Fáze 2: moduly z kap. 13, 15 a 17 (7. 11. 2026)

Osm nových Bc. modulů ve čtyřech souběžných stopách (strings, circuits, sortnet,
fourier). Pravidla, která platí dál pro každý nový modul:

- **Routy:** každá cesta má v `ROUTE_PATTERNS` vlastní vzor a v `App.tsx` vlastní
  **líně načtenou** stránku (`lazyPage(() => import(…), (m) => m.XPage)`, vlastní
  chunk; do načtení `Suspense` s `.page-loading` „Načítám modul…“). Dočasná kostra
  (`StubModulePage`, `stubModule.ts`, `landing/stubPreview.tsx`, CSS `.stub-preview`)
  se při integraci smazala – žádná stránka ji už nepoužívala.
- **Náhledy:** každý modul má náhled ve vlastním souboru vedle stránky
  (`algos/strings/kmp.preview.tsx`, `ahoCorasick.preview.tsx`, `rabinKarp.preview.tsx`,
  `algos/parallel/gates.preview.tsx`, `adder.preview.tsx`, `sortNet.preview.tsx`,
  `algos/fourier/fft.preview.tsx`, `fftNet.preview.tsx`; typ `Preview` a
  `THUMB_W/THUMB_H` z `landing/previewTypes.ts`), registr `PREVIEWS` je jen importuje.
  Soubor náhledu **nesmí importovat `*Page.tsx`** (líný chunk by se slil
  s přehledem) – jen pohledy a modely. `previews.dom.test.tsx` hlídá, že všech 41
  modulů má skutečný náhled (ne zástupce).
- **CSS:** na konci `index.css` oddíly `/* === strings === */ … /* === /strings === */`,
  `circuits`, `sortnet`, `fourier` (hlídá `core/cssSections.test.ts`); každý vzorek
  legendy `cls: "sw-…"` použitý v `algos/` nebo `views/` musí mít pravidlo
  `.swatch.sw-…` (tamtéž).
- **Sdílená rozšíření:** `MNode.keyCls` (třída jednotlivých klíčů v `MultiTreeView`, s `hot` se
  spojí; bez něj markup beze změny), `table.cellMarks` v `GraphState.table` / `TableView`
  (klíč `cellKey(ř, s)` z `views/tableCells.ts`, třídy `cell-hot`, `cell-active`, `cell-done`,
  `cell-found`), `ListArgDef.integerOnly: false` (desetinná čísla), vzorky legendy `sw-wire0`
  (0 na vodiči), `sw-wire1` (1), `sw-red`, `sw-green`, `sw-blue`, `sw-purple`, `sw-orange`,
  `sw-teal`.
- Výsledky algoritmů se testují **proti knize** (data obrázků přepsaná z PDF do
  `*.fixtures.ts`), stránky v jsdom (`*Page.dom.test.ts*`), integrace v
  `deepLinks.test.tsx` (odkaz s parametry každého nového modulu: vstup se použije,
  adresa se nepřepíše, stojí na kroku 1) a `allModules.dom.test.tsx`.

| Cesta | Model a pohledy | Odkaz (parametry za `?`) |
| --- | --- | --- |
| `/string/kmp` | `kmp.ts`, `kmpPageModel.ts`, `views/AutomatonView` + `automatonLayout.linearAutomaton` (obr. 13.1), `views/TextStripView` + `textStripLayout.ts` | `j` jehla, `s` seno |
| `/string/aho-corasick` | `ahoCorasick.ts`, `ahoCorasickPageModel.ts`, `AutomatonView` + `trieAutomaton` / `trieSlots` (obr. 13.2), tabulka stavů | `j=ara,bar,…` slovník, `s` seno |
| `/string/rabin-karp` | `rabinKarp.ts`, `rabinKarpPageModel.ts`, `TextStripView` (okénko, kódy, heše) | `j`, `s`, `p` (P), `n` (N) |
| `/parallel/gates` | `circuit.ts`, `circuitText.ts`, `circuitPresets.ts`, `gatesPageModel.ts`, `gatesActions.ts`, `views/CircuitView` (+ pravdivostní tabulka), `views/CircuitEditor`, `circuitLayout.ts`, `circuitEdit.ts` | `net=maj\|or-chain\|or-tree\|xor-nand\|adder` (+ `n`), `c` text sítě, `p` předloha kresby, `in` bity vstupů, `xy` polohy vrcholů (volitelné) |
| `/parallel/adder` | `adder.ts`, `adderPageModel.ts`, `adderViews.tsx` (tabulka obr. 15.4, H ∘ D, krabičky Σ obr. 15.3) | `x`, `y` (bity od nejvyššího řádu), `m=par\|school` (bez = obě), `pq=1` |
| `/parallel/sortnet` | `sortNet.ts`, `sortNetSteps.ts`, `sortNetPageModel.ts`, `views/ComparatorView` + `comparatorLayout.ts` | `net=bubble\|sep\|bitonic\|t\|batcher`, `a` vstup, `n`, `lay=seq`, `x` vynechané komparátory, `o=v\|h` |
| `/fft/fft` | `fft.ts`, `complex.ts`, `field.ts`, `polyMul.ts`, `fftPageModel.ts`, `fftViews.tsx` (strom volání `fftTreeLayout.ts`, `views/UnitCircleView` + `unitCircleLayout.ts`, tabulka) | `p`, `op=ifft` (+ `y=fft`), `op=mul&p=&q=&d=alg\|bf` (+ `b=10`), `f=z17` |
| `/fft/net` | `fft2.ts`, `fft2PageModel.ts`, `views/ButterflyNetView` + `butterflyNetLayout.ts` | `x`, `f=z17`, `d=layer` |

Výchozí příklad dá u všech prázdnou adresu; odkaz se při otevření nepřepisuje a
vadný odkaz ukáže výchozí příklad (nebo platnou část) s hláškou.

### Textové algoritmy (kap. 13)

- **KMP** – příklad z knihy je **jedna sada kroků**: nejdřív KmpKonstrukce, pak
  KmpHledej; pseudokód (str. 322 a 324) se přepíná podle fáze kroku (`st.phase`).
  Akce: Vytvořit ▸ Vlastní / Náhodně / Výchozí příklad; Příklady z knihy (kokos /
  clanekokokosu str. 320–321 = výchozí, barbarossa = obr. 13.1, bananas, anna,
  aaab = cvičení 1, aaaa = zarážka); Postavit automat(ι), Hledat(σ), Přečti znak(x)
  (navazující KmpKrok; klik na znak sena ho vyplní). Plátno: automat jako obr. 13.1
  (zpětné hrany obloukem, hrany do ε slité), pás sena s jehlou posunutou o k − s
  (posun přes `useFlip`), tabulka s / ι[s] / Z[s] a počítadla hran. V nápovědě
  odkaz „stejný automat v Aho-Corasickové →“ – jen pro jehlu bez mezer, čárek a
  středníků (AC jimi odděluje jehly slovníku). Tip „Zkuste…“ se řídí načteným
  příkladem (`kmpTip`). Na desktopu se pás textu nezmenšuje do šířky plátna:
  buňka má aspoň 20 px a delší pás se posouvá vodorovně (stín u kraje).
- **Aho-Corasicková** – stejně jedna sada kroků: AcKonstrukce (vkládání slov,
  fronta F, Zpět/Zkratka po hladinách), pak AcHledej (zpětné hrany, dopředná hrana,
  hlášení Slovo(j) a skoky po zkratkách); pseudokód str. 327–328. Akce: Vytvořit;
  Příklady z knihy (8: obr. 13.2 se senem barbara = výchozí, bara str. 325–326,
  barbarabaraba, cvičení 13.3.1 ve třech částech, barbarossa = obr. 13.1, cvičení
  13.3.2); Postavit automat(slovník), Hledat(S), Přečti znak(x), Přidat slovo(ι),
  Odebrat slovo(ι). Strom obr. 13.2 má polohy a ohyby z obrázku
  (`bookStrings.FIG_13_2_COORDS/BENDS`), jiné slovníky automatické `trieSlots`.
  Přepínače „jména stavů“ a „všechny zpětné hrany“ (nad 16 stavů ve výchozím stavu
  jen hrany, které se týkají kroku). Výška hladin přes `CanvasFit` (26–72 px).
  Klik na seno vyplní Přečti znak, klik na stav Přidat/Odebrat slovo. U jediné
  jehly odkaz „← stejný automat v KMP“. Kroužky stavů a písmo rostou s výškou
  hladiny (poloměr 10–16 px podle `levelH` a rozestupu vrcholů, písmo přes
  `--algo-au-zoom`). AcKonstrukce má vlastní krok pro ř. 4 (Zpět(r) ← ∅,
  Zkratka(r) ← ∅) a prázdná zkratka je samostatný krok na ř. 13 („Zkratka(s) ←
  Zkratka(z) = ∅“) – zpráva vždy popisuje zvýrazněný řádek.
- **Rabin-Karp** – kódování a=1…z=26, P a N v akci Hledat(ι, σ, P, N), výchozí
  P = 31. Předvolby: „bez kolize“ (kokos, N = 101), „falešná shoda“ (N = 17,
  okoko na i = 6), bananas N = 13, nejhorší případ aaa, N = 2; sena z knihy
  (str. 319–320), P a N volené (kniha číselný příklad nemá). Soudělné P, N
  ve formuláři ohlásí formulář (zůstane otevřený, běh se nezmění); v odkazu
  dají jediný chybový krok s výstrahou. Plátno: P, N, P^J mod N, seno s kódy a heši okének,
  rozepsaný přepočet `(31·40 − 15·95 + 19) mod 101 = 36`, závorky ✓ výskytů a ≈
  falešných shod. Klik na znak sena vybere okénko od něj jako jehlu.

### Hradlové sítě (`#/parallel/gates`, kap. 15.1)

- **Model** (`circuit.ts`): vrstvy podle knihy, hloubka = počet neprázdných vrstev
  včetně vstupů a výstupů (s. 384, „hloubka 5 vrstev (S₀…S₄)“), velikost = počet
  hradel; obojí se v editoru počítá živě. Výpočet po taktech: krok = takt, aktivní
  vrstva podbarvená, vodič s 1 silný, s 0 tenký, neznámá hodnota čárkovaně.
  Vstupy se přepínají klikem / Enterem (`aria-pressed`; mezerník patří přehrávači), pravdivostní
  tabulka (do 6 vstupů) zvýrazní aktuální řádek a klik na řádek nastaví vstup.
  Každé přepnutí = nová sada kroků od kroku 1, pozastavená.
- **Kreslicí editor** (`views/CircuitEditor`, logika `views/circuitEdit.ts`;
  režim „Upravit síť“ ↔ „▶ Spočítat“): paleta Vstup, Výstup, AND, OR, NOT, NAND,
  NOR, XOR (klik vybere nástroj a klik do plátna přidá prvek, tah z palety ho
  položí, Enter ho dá na volné místo); vodič tahem z výstupního portu ● na vstupní
  port nebo na hradlo (první volný port), obsazený port se přepojí; **cyklus
  odmítne** s cestou („by vytvořil cyklus A1 → O1 → O2 → A1 …“); výběr a smazání
  (Delete, pravé tlačítko, dlouhý stisk), přesun s přichycením k mřížce 20 px,
  Shift+šipky (o 1 krok mřížky; samotné šipky přesouvají fokus), Ctrl+Z / ↶ Zpět, Uspořádat (po vrstvách), změna funkce vybraného hradla,
  spojení klávesnicí (Enter na zdroji a Enter na cíli). Nezapojené porty jsou
  červeně. Kreslení ani přesun nikdy nespustí přehrávání.
  **Výřez plátna při úpravách drží** (klik = prvek pod kurzorem, dříve položené
  se neposunou): spočítá se při vstupu do úprav, po nové síti a Uspořádat
  (`layoutEpoch` ve stavu editoru), jinak se jen zvětší, když kresba vyjede ven
  (`growBounds`); nový či tažený prvek u okraje se posune dovnitř (`clampInto`).
  Po smazání prvku přejde fokus na obal editoru (ne na `<body>`), klik do
  pozadí ho také fokusuje a Ctrl+Z v režimu úprav funguje odkudkoli mimo
  textová pole. Vstup sítě, ze kterého nic nevede, hlásí varování.
  Pravdivostní tabulka je dál tabulka (řádky bez `role=button`): myší jde
  kliknout na řádek, klávesnicí na tlačítko v první buňce.
- **Textový formát** (`circuitText.ts`; panel „Import / export textem“
  synchronizovaný s kresbou, odkaz `c=`, Vytvořit ▸ Vlastní): jeden příkaz na
  řádek nebo oddělené středníkem, komentář `#` či `//`:

  ```
  in x, y, z            # vstupy (v tomto pořadí se zadávají bity)
  A1 = and(y, x)        # hradlo: jméno = funkce(zdroje portů); _ = nezapojený port
  out q = O2            # výstup a jeho zdroj (out q = nezapojený)
  ```

  Funkce and, or, not, nand, nor, xor (velikost písmen nerozhoduje), pořadí řádků
  libovolné (odkazy dopředu jdou), chyby s číslem řádku – v jednořádkovém zápisu
  s víc příkazy (odkaz `c=`, Vytvořit ▸ Vlastní) s pořadím příkazu („Příkaz 2: …“).
  Komentář platí do konce svého příkazu (`in x # vstup; out q = x` nesmaže
  výstup). Polohy text nenese – při importu je doplní editor (prvky se stejným
  jménem si polohu nechají); do odkazu je nese volitelné `xy=` (níže). Vytvořit ▸ Vlastní hlásí chybu textu u pole hned
  při psaní.
- **Polohy v odkazu `xy=`** (rozhodnutí D2; `circuitPositions.ts`): volitelná
  předpona `d` = tok shora dolů, pak vrcholy oddělené `_` v pořadí vstupy,
  hradla, výstupy (jako text `c=`), každý `x.y` nebo s knižní sběrnicí `x.y.b`;
  celá čísla (nejvýš 6 číslic, |v| ≤ 100 000), záporná s `-`. Znaky
  `0-9 . _ - d` se v adrese nekódují přes `%`. `xy=` se píše jen tehdy, když se
  kresba liší od rozvržení, které dá odkaz bez něj (posunutý výchozí příklad =
  `net=maj&xy=…`); neposunuté sítě mají odkaz jako dřív. Adresa se přepisuje i
  po přesunu vrcholu (v každém kroku mřížky), při otevření ne. Vadné `xy=`
  (nečíslo, jiný počet vrcholů, obří číslo) se ignoruje s poznámkou „Polohy
  vrcholů z odkazu (xy=) k síti nesedí – síť je rozvržená jako bez nich.“
  (poznámka k `in=` má přednost); u neplatné sítě se `xy=` nepoužije. Platné,
  ale extrémní polohy (všechny v jednom bodě, jeden vrchol daleko) se použijí
  tak, jak jsou – kresba se přizpůsobí rozsahu stejně jako po ručním tahu.
- Akce: Spočítat(vstupy), Další vstup (binárně +1), Vytvořit (Náhodně, Or
  řetězcem(n), Or stromem(n), Vlastní, Prázdná – nakreslit), Příklady z knihy.

### Sčítačka (`#/parallel/adder`, kap. 15.2)

- Paralelní sčítačka je HTML tabulka přesně podle obr. 15.4 (sloupce = pozice od
  nejvyššího řádu, bloky jako sloučené buňky 1, 2, 4, 8 sloupců, přenosy nad
  hranicemi sloupců, c₀ a cₙ mimo tabulku) + tabulka skládání H ∘ D (s. 388), která
  zvýrazní buňky použité v kroku. Školní sčítačka je řetěz krabiček Σ jako
  obr. 15.3. Hradlová síť z `CircuitView` by pro n = 16 měla stovky hradel – školní
  sčítačka ze hradel je v Hradlových sítích (`?net=adder`), stránka na ni odkazuje.
- Režimy: „Obě souběžně“ (výchozí; v kroku t hladina t obou sčítaček a shrnutí
  hloubky), „Paralelní“ (úvod + 2·log₂ n + 3 hladin), „Školní“ (c₀, n krabiček,
  zₙ ← cₙ); přepínač „(p, q) u bloků“. Pseudokód česky ze s. 386–390.
- Akce: Sečíst(x, y), Vytvořit (Náhodně n = 4 / 8 / 16, Desítkově 0 … 65535,
  Nejhorší přenos), Příklady z knihy, Režim. Bity se přepínají klikem nebo
  Enterem (nová sada kroků od kroku 1).
- Šipky řetězu Σ mají pevnou velikost (`markerUnits="userSpaceOnUse"`) a barvu
  vodiče (přenos 1 má vlastní modrou šipku), popisek cᵢ leží nad vodičem.
  Hodnota 1 (hradla, tabulky, sčítačka) má token `--algo-c-one` s kontrastem
  ≥ 4,5 : 1 v obou tématech; na podbarveném aktivním hradle barvu textu.

### Třídicí sítě (`#/parallel/sortnet`, kap. 15.3)

- Sítě (`sortNet.ts`): bublinková (obr. 15.6 jak je zapsaná / 15.7 po vrstvách,
  libovolné n), separátor Sₙ (obr. 15.10), bitonická třídička Bₙ (obr. 15.8),
  třídička Tₙ sléváním (obr. 15.9, hloubka Θ(log² n)) a Batcherova síť (cv.
  15.3.7); kromě bublinky n = 2, 4, 8, 16. Kresba `ComparatorView`: svisle jako
  v knize nebo vodorovně (`o=`), komparátory jedné vrstvy, které by se překryly,
  jdou schodovitě, popisky bloků (Sₙ, Mₙ).
- Akce: Vytvořit (Vlastní, Náhodně, Bitonická, Obráceně, Nuly a jedničky), běh
  sítě (`T₈(P)`, `B₈(P)`…), Síť, **Ověřit 0-1 principem** (projde všech 2ⁿ vstupů
  z nul a jedniček; protipříklad načte jako vstup), Vynechat(c) (rozbitá síť pro
  0-1 princip), Příklady z knihy.
- Výsledek ověření 0-1 principem je pod kresbou (`.sn-check`: pruh `<meter>`
  setříděných vstupů a věta, u protipříkladu červeně), dokud se síť či vstup
  nezmění. Vlastní vstup s počtem, který síť neumí (7 čísel pro T₈), ohlásí pole.
  Vrstvy Batchera popisují slévané bloky („slévání dvojic do čtveřic
  s rozestupem 2“), závěr rozbité sítě „síť s vynechaným komparátorem c už
  netřídí“. Pseudokódy sortnet, sčítačky a hradel jsou bez knižních čísel řádků
  (hlídá `sortNetSteps.test.ts`).

### FFT (`#/fft/fft` a `#/fft/net`, kap. 17)

- **`/fft/fft`** – rekurzivní FFT: strom volání (sudé / liché barvou a
  podtržením, `fftTreeLayout.ts`), jednotková kružnice s ωᵏ (`UnitCircleView`,
  obr. 17.1–17.2; aktivní body plné, dvojice ±ωʲ motýlku spojená) a tabulka
  koeficienty → hodnoty. Akce: FFT(p), Inverzní FFT(y) (Zadat y / y = FFT(p)),
  Násobení P · Q (FFT → bodový součin → inverzní FFT; kroky „jen kroky
  algoritmu“ / „i všechny kroky FFT“; tabulka P, Q, P̂, Q̂, R̂, R), Příklady
  z knihy, Náhodně, Výchozí příklad; těleso ℂ (2 desetinná místa,
  ω = e^{2πi/n}) nebo ℤ₁₇ (ω = 2 pro n = 8). n = 4 / 8 / 16 (koeficienty
  doplněné nulami). Klik (Enter) na volání ve stromu otevře FFT(p) s jeho
  koeficienty (jen celočíselný vstup). Odkaz `b=` (základ u násobení čísel)
  platí jen celý 2–16 a s číslicemi menšími než základ, jinak poznámka.
- Zprávy kroků FFT, FFT2 a násobení jsou prostý text: ω = exp(2πi/n), žádné `^`
  (hlídá `fourier/messages.test.ts`), komplexní a záporní činitelé součinu
  v závorkách („(4.41+2.41i) · (9.54+7.54i)“). Komplexní čísla mají
  **desetinnou tečku** – čárka odděluje složky vektorů (samostatná čísla jinde
  v modulech dál s desetinnou čárkou). V ℤ₁₇ formulář předem ukáže, na co se
  hodnoty mimo 0–16 zredukují („⚠ … 20 → 3“).
- **`/fft/net`** – nerekurzivní FFT2 jako motýlková síť obr. 17.4
  (`ButterflyNetView`): vstupy v pořadí bitového zrcadlení, sloupce kroužků „±k“
  po vrstvách, hodnoty na drátech po každé vrstvě, výstupy yₖ; aktivní vrstva
  podbarvená, aktivní blok orámovaný. Akce FFT2(x) s tělesem a podrobností
  („každý motýlek“ / po vrstvách).

## Fáze 4: deset modulů z knihy (8. 11. 2026)

Rozhodnutí vlastníka 8. 11. 2026: deset nových Bc. modulů z Průvodce. Pravidla fáze 2 platí dál
(tenká stránka nad čistou logikou `*PageModel.ts` / `*Actions.ts`, `ActionMenu`, „Příklady z knihy“
testované proti knize, líně načtená stránka, náhled `*.preview.tsx`, zdroj {oddíl, strana}). Moduly
vznikly v šesti souběžných stopách (flows, graphsA, graphsB, dp, hull, llrb) nad připravenou kostrou;
kostry stránek a běhu (`phase4StubPage.tsx`, `graphs/phase4Stub.ts`, `flowPreviewNet.ts`, CSS
`.stub-*`) jsou smazané. Následovala nezávislá UX validace (UX-01…19) a kontrola správnosti proti
vlastním referenčním implementacím (CR-1…5; tisíce náhodných vstupů, žádná chyba výsledku), opravy
po TDD.

| Modul | Cesta | Kniha | Výchozí příklad |
| --- | --- | --- | --- |
| M1 Fordův–Fulkersonův alg. (+ párování) | `#/flow/ford-fulkerson` | 14.2, 14.3 | obr. 14.2 |
| M2 Dinicův algoritmus | `#/flow/dinic` | 14.4 | obr. 14.7 |
| M3 Bellman–Ford | `#/graph/bellman-ford` | 6.3 | vlastní `negative` |
| M4 Borůvka | `#/graph/boruvka` | 7.3 | obr. 7.5 (`mst3`) |
| M5 Mosty a artikulace | `#/graph/bridges` | 5.7 | obr. 5.10 |
| M6 Komponenty silné souvislosti | `#/graph/scc` | 5.10 (+ 5.9) | obr. 5.13 |
| M7 Editační vzdálenost | `#/dp/edit` | 12.3 | obr. 12.5 |
| M8 Nejdelší rostoucí podposloupnost | `#/dp/lis` | 12.2 | obr. 12.3 |
| M9 Konvexní obal | `#/geom/hull` | 16.1 | obr. 16.1 |
| M10 LLRB strom | `#/tree/llrb` | 8.4 | vlastní (2,3)-strom |

Skupiny v pořadí kapitol: „Dynamické programování“ (kap. 12) za Grafy, „Toky v sítích“ (kap. 14) za
Textovými algoritmy; M3–M6 v Grafech (pořadí oddílů 5.2–7.4), M9 v Geometrii, M10 ve Vyhledávacích
stromech. Žádná nová závislost ani klíč localStorage; nové parametry odkazu jen u nových cest
(a `v=` u nových grafových algoritmů).

### Toky v sítích (`#/flow/ford-fulkerson`, `#/flow/dinic`, kap. 14)

Obě stránky jsou tenká vrstva nad `algos/flows/flowPage.tsx` (`FlowModulePage kind`); logika bez
Reactu: `flowNet.ts`, `fordFulkerson.ts`, `dinic.ts`, `flowView.ts`, `flowPageModel.ts`,
`flowPresets.ts`, `flowPreviewData.ts`.

- **Kresba sítě** v `GraphEditor` (orientovaná, kapacita = cena hrany, celá čísla 0–999, bez smyček
  a bez dvou hran stejným směrem).
- **Druhý pohled:** u FF síť rezerv s dvojicemi oblouků a r (obr. 14.4 vpravo); u Dinica pod sítí
  vrstevnatá síť R – vrstvy obtažené, ponechané hrany výrazné (`e-r-live`, v knize černé), šedivé
  (dozadu, uvnitř vrstvy, za s) a tečkované (slepé uličky) zůstávají vidět, smazané vrcholy
  čárkovaně, během blokujícího toku popisek g/r.
- **Přepínač „Kresba“:** obě / jen síť / jen rezervy, výchozí podle sítě a okna (`autoFlowView`, volba
  zvlášť pro síť párování a ostatní sítě). Široká síť (kresby pod sebou) v okně menším než 1600 × 900
  začíná u Dinica (a Goldberga) jen druhou kresbou; R je pak jedna zastávka Tabu a v záhlaví je
  tlačítko „Upravit síť“ (na telefonu se po fokusu posune pod lepící hlavičky). FF na síti párování
  začíná „jen síť“ (síť rezerv obr. 14.6 má 44 oblouků), Dinic a Goldberg „obě“ vedle sebe.
- **Pod sebou, nebo vedle sebe** (`flowStacked`, jednotně FF, Dinic, Goldberg, F-04): podle poměru
  stran kresby ≥ 2,6 (`STACK_ASPECT`) – síť s pevnou kresbou (obr. 14.7 i ve FF), u Dinica i vrstevnatá
  R nulového toku (obr. 14.2: vrstvy z | a b | c d | s). Síť párování nikdy, počet vrcholů nerozhoduje.
  Ve stohu si kresby dělí výšku po odečtení lišt; žádný ořez. Lišta editoru sítě a proměnné kroku jsou
  ve stohu na řádku titulku (vpravo, kompaktní – X-01), kresby tak mají o ~60 px víc.
- **Husté kresby (`GraphView dense`, 9. 11. 2026, X-01/X-04):** všechny kresby toků mají menší okraje
  (`densePads`) a kroužky se zmenší (`denseNodeScale`, nejvýš na 0,62 · 18 ≈ 11 px, písmo ≥ 10 px), když
  by rozestup středů klesl pod 2r + 10 px; řídká kresba zůstává s r = 18. Zmenšení se drží ze stisku
  a z kotvy (tah ani úprava v editoru ho nemění). Obr. 14.7 „obě“ pod sebou se tak vejde bez překryvu
  i při 1280 × 720 (r ≈ 11) a 1366 × 768 (r ≈ 14–17); výchozí „jen R / jen výšky“ v menším okně zůstává.
  Vrstevnatá R má místo pro popisky vrstev nad kresbou vždy (mezi kroky s vrstvami a bez nich
  neposkočí); síť Goldberga s popisky „h 6 · +3“ má boční a spodní okraj jako běžná kresba a místo pro
  nejdelší popisek běhu (`subReserve`) – mezi kroky ani při vstupu do editoru se nepřeměřuje.
- **Telefon (X-09):** široká síť, která by se do šířky panelu nevešla čitelně (obr. 14.7), se místo
  vodorovného posunu roztáhne na výšku (`phoneFitAspect`, poměr až 0,55×) – v editoru se kreslí bez
  posouvání uvnitř panelu.
- **Upravit graf (zrušené UX-02, chyba vlastníka 8. 11. 2026 „při editu zmizí residuální graf“):**
  rozložení, druhá kresba i řádek proměnných zůstanou jako v běhu; druhá kresba a proměnné živě ukazují
  **krok 1 nového běhu** upravené sítě (FF r = c při nulovém toku – u obr. 14.4 tok 16, dokud se síť
  nezmění; Dinic vrstvy R nulového toku ze z; Goldberg h(z) = n, ostatní 0). Přehrávač v editoru stojí
  na kroku 1 a nic ho neposune ani nespustí (`flowEditPlayer.ts`); Hotovo = nový běh na kroku 1,
  pozastaveno. „Jen rezervy / výšky“ se v editoru kreslí jako obě (na síti se kreslí), po Hotovo se
  volba vrátí; přepínač Kresba jde v editoru přepnout. Rozložení (stoh, síť párování) je po dobu úprav
  zmrazené – kresby se při kreslení nepřeskládají. Nápověda a hláška editoru jsou v bočním sloupci
  (desktop na jednu obrazovku) nebo pod kresbami, ne jako třetí sloupec. Neplatná síť (prázdná, z = s…)
  = nápověda `netProblem` v druhém panelu místo kresby; chybí-li z či s, poznámka „Stok s v síti
  chybí – použije se d.“ (`endsNote`). Rozbalený Import / export textem je pod sítí (pole a tlačítko
  vedle sebe, ~7 řádků výšky), ve stohu vpravo vedle sítě; druhou kresbu už neskrývá.
  Po ověření (9. 11. 2026): síť v editoru má popisky jako krok 1 (`0/c`, u párování žádné) – viewBox se
  při vstupu do editoru nemění; síť rezerv FF drží v editoru měřítko jako síť (`GraphView holdLayout`,
  přesun vrcholu ji nepřeměří, X-08); „↶ Vrátit operaci“ v editoru nejdřív zahodí sezení úprav, načtený
  příklad zůstane (X-05, jako G-08 u grafů); fokus po vstupu z „jen rezervy / výšky“ přejde na
  „Upravit graf“ v síti a po Hotovo na „Upravit síť“ (`flowEditFocus.ts`, X-06).
- **Síť párování** (všechny c = 1, `isMatchingNet`, třída rozložení `flow-match`): bez popisků kapacit
  (i v editoru – `editState` GraphEditoru); tok a párování ukáže styl čáry jako obr. 14.6. Dva sloupce
  z | L | R | s **vyplní panel** (`GraphView fitAspect` s mezemi `MATCH_FIT_ASPECT` 0,6–3; souřadnice,
  `displayAspect` i odkaz `xy=` beze změny): v „jen síť“ se sloupce roztáhnou do šířky, vedle druhé
  kresby řádky do výšky. Vrstevnatá R párování se smí na výšku roztáhnout až 2,5× (`layeredFitAspect`)
  a dlouhý řetěz vrstev na konci běhu zmenší kroužky. U Goldberga má kresba výšek (sloupec na každý
  vrchol) vedle sítě párování ~2/3 šířky (CSS `flex 35 : 65`). Změřeno 9. 11. 2026 (obr. 14.6
  a Vytvořit ▸ Párování, ve všech třech modulech, „obě“, „jen síť“, „jen rezervy / výšky“ i v editoru):
  rozestup řádků ≥ 2r + 10 px (1280 × 720 „jen síť“ r ≈ 16, jinak r = 18), žádný překryv ani posun při
  1280 × 720, 1366 × 768 (světlé i tmavé), 1920 × 1080 a 390 × 844 (Goldberg na telefonu r = 10).
- **Akce:** Vytvořit ▸ Náhodně / Prázdná – nakreslit / Párování (dvojice „L R“); Příklady z knihy;
  `FordFulkerson(z, s)` / `Dinic(z, s)`; Kapacity hran; Jiný alg. (tatáž síť ve druhém modulu).
- **Volby FF:** „Hledání cesty: BFS / DFS“ a „Varianta: s rezervami (str. 355) / jen po směru
  (str. 354)“; změna připraví nový běh na kroku 1.
- **Pseudokódy:** FordFulkerson ze str. 355, zlepšování jen po směru podle str. 354, Dinic,
  ČištěníSítě a BlokujícíTok ze str. 363–365 (přepíná se podle procedury kroku, `dinicPseudocode`;
  kniha řádky nečísluje, čísla jsou naše, tipy proto citují text řádku). BlokujícíTok dočišťuje jen
  vrcholy s deg_out = 0 (cv. 14.4.1; poznámka v `dinic.ts`).
- **Konec běhu:** minimální řez E(A, B) jako certifikát maximality; u sítě párování výpis párování.
- **Odkaz:** `ex=<id>` příklad z knihy (výchozí = prázdná adresa), jinak `g=` („u v c“) a `xy=`;
  `z=`, `s=` jen když nejsou výchozí; FF `cesta=bfs|dfs` (jen odlišná od výchozí pro příklad),
  `v=po-smeru`. Vadný odkaz → výchozí příklad a hláška nad plátnem.
- **Příklady z knihy** (`flow.fixtures.ts`, souřadnice z vektorů PDF; testy `flowBook.test.ts`,
  `fordFulkerson.test.ts`, `dinic.test.ts`; `flowReference.test.ts` porovnává FF i Dinica
  s nezávislým Edmondsem–Karpem a kontroluje celý řez na náhodných sítích s nulovými kapacitami):

| Příklad | Modul | Co ukazuje (ověřeno testem) |
| --- | --- | --- |
| obr. 14.2 Síť (str. 352) | výchozí FF, i Dinic | FF s BFS skončí tokem z obr. 14.5 (\|f\| = 18, řez A = {z, a, b, c}); Dinic ℓ = 3 (blokující tok 16), pak ℓ = 5 (zbcads +2) |
| obr. 14.4 Z toku 16 (str. 355) | FF | DFS najde zbcads, rezervy 4, 6, 6, 1, 3, ε = 1; BFS zbcs jako text str. 354 |
| obr. 14.3 Algoritmus v úzkých (str. 354) | FF, Dinic | jen po směru s DFS uvízne na 1 (⚠, maximum 2); s rezervami 2 |
| obr. 14.6 Párování (str. 360) | FF, Dinic | tok 4 = největší párování |
| obr. 14.7 Vrstvy (str. 364) | výchozí Dinic, i FF | vrstvy = sloupce obrázku, po čištění hrany jako na obrázku, F = {g, i, m, n}, pak d; kapacity doplněné (kniha je nemá): fáze ℓ = 5, 6, 7, max. tok 6 |

- **Náhledy:** FF obr. 14.5, Dinic obr. 14.7 po vyčištění (bez popisků a obrysů vrstev); kreslí se
  z dat knihy bez běhu algoritmu, shodu s modulem hlídá `flowPreview.test.ts`.
- **CSS (oddíl `flows`):** `flow-layout`, `flow-panel`, `flow-stack`, `flow-panel-note`, `flow-panel-hint`, `flow-edit-help` (hlídá `flowCss.test.ts`); hrany `e-flow`, `e-sat`,
  `e-path`, `e-path-back`, `e-min`, `e-changed`, `e-cut`, `e-match`, `e-zero`, `e-r-live`,
  `e-r-gray`, `e-r-dead`, `e-r-sat`; vrcholy `n-term`, `n-seen`, `n-cut-a`, `n-gone`; vzorky
  `sw-flow-*`.

### Goldbergův algoritmus (`#/flow/goldberg`, 14.5–14.6, přidán 8. 11. 2026)

Přání vlastníka „chybí Goldbergův algoritmus“. Soubory jen `algos/flows/goldberg*` a `GoldbergPage*`;
síť, editor, náhodná síť, párování a kapacity sdílí s FF/Dinicem (`flowNet.ts`, `flowPageModel.ts`),
FF/Dinic ani `GraphView` se kvůli němu neměnily.

- **Algoritmus** (`goldberg.ts`): pseudokód ze str. 369 (bez čísel řádků, knižní komentáře ◁ za `//`:
  „zdroj ve výšce n, ostatní ve výšce 0“, „všechny hrany ze z na maximum“). Výšky h(z) = n, vlna (hrany
  ze z na maximum), pak Převedení po hraně s r > 0 a h(u) > h(v) (δ = min(přebytek, r), nejdřív
  proti směru – `augmentArc`), jinak Zvednutí o 1. Kniha volbu nechává volnou: **základní** bere první
  vrchol seznamu P (str. 373, nový vrchol na konec), **nejvyšší** (14.6, `v=nejvyssi`) vrchol
  s největší h. Hrany z u v pořadí podle názvu cíle. Krok „výběr vrcholu“ jen při změně u.
- **Kresba:** vlevo síť „vlna / kapacita“ (GraphEditor, u vrcholu „h 1 · +3“, `n-excess`), vpravo
  kresba výšek (`goldbergHeightView.tsx`, vlastní SVG): vrchol ve sloupci podle kresby sítě, svisle h,
  hladina n čárkovaně, odznak +x = přebytek, šipky = oblouky s rezervou dolů (seznamy L(u)), převedení
  oranžově s +δ, zvednutí s původní výškou čárkovaně. Rozsah hladin je pevný pro celý běh
  (`heightMax`) – kresba se mezi kroky nepřeměřuje. Pod sebou podle poměru stran sítě jako FF a Dinic
  (`goldbergStacked` → `flowStacked`, síť párování vedle sebe, kresba výšek ~2/3 šířky); sloupce
  aspoň 22 px, kroužek 10–16 px (`HEIGHT_MIN_COL`, X-02: obr. 14.6 se vejde do 332 px); široká síť v okně menším než
  1600 × 900 začíná „jen výšky“ (`goldbergView`). Kresba výšek se vejde do jakkoli nízkého panelu –
  hladiny se přiblíží a popisuje se jen každá k-tá (`levelLabelEvery`), nikdy se neořízne (F-04).
  V editoru zůstane a ukazuje krok 1 (viz Toky, „Upravit graf“).
- **Příklady:** kniha k Goldbergovi obrázek s příkladem nemá → sítě obr. 14.2 (výchozí, 69 kroků,
  |f| = 18), 14.3, 14.6, 14.7 (obr. 14.4 ne – začíná tokem). Poznámka to říká v nápovědě.
- **Testy:** `goldberg.test.ts` (výsledek = FordFulkerson na příkladech i 40 náhodných sítích,
  invarianty A, S, V v každém kroku, lemma Z a S, volba nejvyššího vrcholu), `goldbergView.test.ts`,
  `goldbergPageModel.test.ts`, `goldbergHeightView.dom.test.tsx`, `GoldbergPage.dom.test.tsx`,
  náhled `goldbergPreview.test.ts`. CSS v oddílu `goldberg` (`gb-*`, `sw-gb-*`).
- **Po validaci (8. 11. 2026):** FF i Dinic nabízejí v „Jiný alg.“ i Goldberga (`switchAlgo("goldberg")`
  → `goldbergParams`); varianta 14.6 „Dokud některý vrchol u ≠ z, s má f^{Δ}(u) > 0, vezmeme nejvyšší
  z nich“; hláška zvednutí skloňuje („rezervu má a→z ve výšce 3“ / „mají … ve výškách …“); čitelná
  šířka sítě na telefonu se po tahu nemění (viz „Tažení bodů“).

### Grafy: Bellman–Ford, Borůvka, mosty, SCC (`/graph/…`)

Čtyři objekty `GraphAlgorithm` na stránce grafů (`GraphPage`; soubory `bellmanFord.ts`,
`boruvka.ts`, `bridges.ts`, `scc.ts` + `*.presets.ts`). Předvolby nových algoritmů mají
`only: [id…]` (`presetKit.ts`) – nabídka Vytvořit je ukáže jen tam, kam patří (UX-07; Dijkstra
nenabízí zápornou hranu, Topologické uspořádání ne kořen jako artikulaci). Vadný odkaz (neznámý
vrchol `s=`, neznámá varianta `v=`) ohlásí hláška nad plátnem a adresa se při otevření nepřepíše.
Popisky pod vrcholem (in/low, in/esc, D=…) se vyhnou incidentním hranám (`subLabelSides`: pod,
vpravo, vlevo – UX-08); popisky křížících se rovných hran se posunou na 1/3 či 2/3 hrany
(`spreadStraightLabels`, UX-04).

- **Bellman–Ford** (6.3, str. 149–153): Relaxace ze str. 150 s „nejstarším otevřeným vrcholem“
  (str. 152), každý řádek zvlášť. Fáze Fᵢ podle definice knihy; tabulka „Fronta otevřených vrcholů
  (nejstarší nahoře)“ (vrchol / h / otevřen ve). Záporný cyklus (cv. 6.3.2): běh skončí, jakmile
  hrany P uzavřou kružnici (vždy záporná, nejpozději ve fázi n) – výsledek ⚠, proměnné cyklus
  a délka cyklu, třídy `e-back`, `n-bad`; pojistka „fáze přesáhly n“ hlásí totéž varování (CR-5).
  Varianty `queue` (výchozí) a `phases` (cv. 6.3.4, `v=phases`). Záporná délka v součtu je
  v závorce („2 + (−3)“, `formatTerm` v `core/format.tsx`). Kniha k 6.3 obrázek nemá: předvolby
  `negative` (výchozí) a `negative-cycle`.
- **Borůvka** (7.3, obr. 7.5): pseudokód z knihy + Výstup. Iterace ukáže tabulku komponenta /
  vrcholy / eᵢ („A→D“) / w, na konci „Kostra T po iteracích“ a mez ⌊log₂ n⌋. Vybraná hrana má
  šipku od komponenty, která ji vybrala (oboustrannou, vybraly-li ji obě – jako C–F v obr. 7.5).
  Komponenty `n-comp*` s popiskem „komp. X“. Shodné váhy rozhoduje pořadí hran (cv. 7.3.1,
  předvolba `equal-triangle`), nesouvislý graf → minimální les. Ověřeno proti `MST3_7_2.boruvka`.
- **Mosty a artikulace** (5.7, obr. 5.10): Mosty / Mosty2 (str. 124–125) a artikulace podle textu
  str. 126 (dva odvozené řádky), poslední krok na řádku Výstup. Pod vrcholem in/low, tabulka
  v | in | low | p, proměnné T, M, A. Most `e-bridge`, artikulace `n-art`. Nesouvislý graf: Mosty2
  z každé komponenty; násobná hrana do otce = zpětná. Předvolba `bridges-root`.
- **Komponenty silné souvislosti** (5.10, obr. 5.13; titulek podle knihy, bez jména autora):
  varianta `tarjan` (KSST se zásobníkem Z a esc, výchozí) a `kosaraju` („přes Gᵀ (5.9)“,
  `v=kosaraju`). Komponenty `n-compK` v pořadí nalezení (opačné topologické), poslední krok na
  řádku Výstup. Předvolba `scc-cross`.
- Náhledy = konec běhu (`previewShare: 1`). CSS v oddílu `graphs-new` (pododdíly graphsA, graphsB):
  `e-bridge`, `n-art`, `sw-bridge`, `sw-art`, šipky Borůvky.

### Dynamické programování (`#/dp/lis`, `#/dp/edit`, kap. 12)

- **NRP** (`lis.ts`, `lisPageModel.ts`, `lisView.ts`, `lisCanvas.tsx`, `LisPage.tsx`): Nrp2
  (str. 303) a výpis řešení po odkazech P (str. 304); krok na ř. 3, 4, každé porovnání ř. 6
  (Σ(n − i)), ř. 7–8 při zlepšení, Výstup a každý vypsaný prvek. Plátno: graf posloupnosti jako
  obr. 12.4 (vrchol i nad sloupcem i) a tabulka i / xᵢ / T[i] / P[i] jako obr. 12.3; na telefonu
  se posouvají spolu. Akce Vytvořit ▸ Náhodně / Rostoucí / Klesající, Příklady z knihy (obr. 12.3,
  12.4, rostoucí 1…8, opakované hodnoty), Nrp2(x₁, …, xₙ) – nejvýš 16 celých čísel −999…999
  (zápor s typografickým minus, CR-2). Odkaz `a=3,14,15`. Obr. 12.4 vyznačil 1, 7, 15, Nrp2 najde
  1, 13, 15 – obě nejdelší (test).
- **Editační vzdálenost** (`editDistance.ts`, `editPageModel.ts`, `editView.ts`, `editCanvas.tsx`,
  `EditDistancePage.tsx`): Edit2 (str. 308) a rekonstrukce úprav (cv. 3, str. 310); ze stejně
  dobrých tahů ↘, ↓, →. Obr. 12.6 vyznačil jinou stejně krátkou cestu (`isOptimalPath` ji ověří).
  Tabulka jako obr. 12.5 se šipkami a tečkou u shody, pod ní zarovnání slov. Velikost buňky
  (`editCellSize`, 22–64 px) počítá i s řádky pod tabulkou, takže ani 12 + 12 znaků při 1280 × 720
  nepřeteče (UX-06). Akce Vytvořit ▸ Překlepy / Různá slova, Příklady z knihy (obr. 12.5 poutník →
  potemník, koule → boule, koule → kdoule, aaaaa → aaaaa), Edit2(x, y) – slova do 12 znaků. Odkaz
  `x=…&y=…`.
- Společné: klik / Enter na buňku ukáže řešení podproblému (`.dp-sel-info`); historie a ↶ přes
  `sorting/inputHistory`; adresa se přepisuje až po první operaci. CSS oddíl `dp` (`dp-cur`,
  `dp-read`, `dp-new`, `dp-min`, `dp-path`, `dp-sel`, `dp-eq`, `dp-empty`, `dp-e-*`, `sw-dp-edge`,
  `sw-dp-eq`, `--algo-dp-cell`).

### Konvexní obal (`#/geom/hull`, 16.1)

`hull.ts` (zametání, provázek, `PC_SWEEP`, `PC_WRAP`), `hullBook.ts` (souřadnice z PDF),
`hullPageModel.ts`, `hullActions.ts`, `views/HullView.tsx`, `views/hullPlaneMap.ts` (rozsah roviny
je literál – výpočet z `PLANE` jiného chunku při načtení modulu dřív rozbil build).

- KonvexníObal (str. 403–404) po řádcích: setřídění, obálky H a D jako zásobníky, test úhlu s det M
  = x₁y₂ − x₂y₁ (záporné činitele v závorce). Doslova podle knihy: H odebírá při det ≥ 0, D jen při
  det < 0 – body na přímce zůstanou v D s úhlem 180° (cv. 16.1.1). Všechny body na jedné přímce:
  závěr „úsečka b₁ → bₙ“ (CR-1).
- Provázkový algoritmus (obr. 16.2): pseudokód sestavený z textu str. 402 a cv. 16.1.7.
- Příklady z knihy: obr. 16.1 jabloňový sad (výchozí, plot = 10 stromů), 16.2, 16.3 (poslední bod
  odebere z H tři body, z D žádný), cv. 16.1.1. Náhodné testy i na mřížce 0–6 (body na přímce, CR-4).
- Rovina (přepracováno 8. 11. 2026 na přání vlastníka „těžké chytit a táhnout“, klik nesmí mazat):
  klik do prázdna = nový bod; klik na bod (do 22 px od středu) = **výběr** (pole x, y akcí Přidat /
  Odebrat bod(x, y), u bodu tlačítko ×); × nebo Delete bod smaže; tah bodu = přesun – bod jde chytit
  i vedle kroužku (myš 22 px, prst 44 px, práh 4 px), jede s ukazatelem o posun z uchopení, čáry
  obálek a obalu s ním, nad ním zaokrouhlené souřadnice; puštění za okrajem = okraj roviny; po
  puštění nový běh od kroku 1 (↶ vrátí). viewBox je pevný, tah ho nepřepočítává. Prst z prázdného
  místa roviny posouvá stránku, prst na bodu ne. Klávesnice: jedna zastávka Tabu, šipky po bodech,
  **Enter = výběr (jako klik)**, Delete = smazat, Shift+šipky posun o 1. Popisky bodů nejméně 11 px
  i v malé rovině (`--algo-hull-k`, UX-18). Logika: `algos/geometry/planeDrag.ts` (čisté funkce –
  cíl pod ukazatelem, úchopy Q, ×), `usePlaneDrag.ts` (nad `core/usePointerDrag`), `PlaneMarks.tsx`;
  CSS v oddílu `hull` (sdílený i pro k-d rovinu: `.plane-hit`, `.plane-del`, `.plane-drag-label`,
  `.kd-q-*`).
- Odkaz `pts=x,y,…` (0–100, nejvýš 40 bodů, `none` = prázdná rovina), `v=wrap`.

### LLRB (`#/tree/llrb`, 8.4)

`LlrbPage.tsx` (tenká), `llrbTree.ts` (typy, `t=`, axiomy, ostrůvky = (2,4)-strom, rozložení – bez
generátorů, aby ho náhled importoval levně), `llrb.ts` (pseudokódy, kroky), `llrbBook.ts`,
`llrbPageModel.ts`, `llrbDefault.ts`.

- Varianta (2,3) (výchozí): LlrbInsert s LlrbFixup (str. 210) a mazání LlrbDelete s MoveRedLeft /
  MoveRedRight, DeleteMin, DeleteMax (str. 212–214). Varianta (2,4): štěpení 4-vrcholů cestou dolů
  (str. 210 doslovně), mazání v ní zakázané s vysvětlením. Rotace a přebarvení mají dva kroky.
- Podmínky ř. 3 a 10 LlrbDelete („ℓ(v) i ℓ(ℓ(v)) existují a jsou černé“) čteme jako v LlrbDeleteMin
  – komentář „// ∅ je černý“; doslovné čtení by porušilo axiom 4 (test).
- Kresba jako obr. 8.11 (barva hrany ve spodním vrcholu); přepínač „(2,4)-strom / (2,3)-strom
  vedle“ (`ab=1`), který se nezmenšuje pod 1 : 1 a posouvá se vodorovně.
- Příklady z knihy (8): obr. 8.11 (zapne (a,b)-strom vedle, předvyplní Insert(10)), str. 209 tři
  případy vkládání, str. 211 MoveRedLeft, str. 213 MoveRedRight (klíče doplněné za písmena).
- Odkaz `t=` (klíče po hladinách, „r“ = červená hrana shora, `t=-` prázdný), `k=` (vložit
  postupně), `v=24`, `ab=1`. Nečitelné `t=`/`k=` či neznámé `v=` → hláška, adresa se při otevření
  nepřepíše.
- Náhled: jen LLRB strom (bez (2,3)-stromu, který by byl v miniatuře nečitelný). CSS oddíl `llrb`.

### Společné opravy po validaci

- `GraphView`: id značek šipek s předponou z `useId` – dva GraphView na stránce (první skrytý) už
  nekreslí síť rezerv bez šipek (UX-01); `edgeText` = `""` = hrana bez popisku.
- Řádek nápovědy ke klávesám na kresbě si modul může přepsat (`Visualizer` `drawingKeys`: tabulka
  DP, rovina obalu, strom LLRB – UX-13).
- **Náhledy nesmí importovat líně načítané stránky** (`lazyPages.test.ts`): kresby sdílené
  stránkou a náhledem jsou v `*Views.tsx` (`AmortizedViews`, `HashViews`, `CuckooBloomViews`,
  `SuffixViews`, `LockFreeViews`, `KdTreeViews`); chunk `AlgoPage` ~452 kB, build bez varování
  (dřív `INEFFECTIVE_DYNAMIC_IMPORT` a chunk nad 500 kB).
- **UX-12 (původně zamítnuto) vyřešeno 8. 11. 2026:** klik na bod v obalu i v k-d stromu bod
  vybere (ne smaže), Enter = totéž co klik (výběr); mazání jen Delete, × u vybraného bodu nebo
  Odebrat bod(x, y).

### Sdílené API (pro další moduly)

- **Grafové algoritmy** žijí na stránce grafů (`/graph/:id` → `GraphPage`) jako `GraphAlgorithm`
  ve vlastních souborech; pomůcky z `algos/graphs/algoKit.ts`: `inputProblem(g, start | null,
  needsWeights)`, `fail(st, msg)`, `L(g, v)`, `LINE`, `DASHED`, `COMP_COLORS`. Volitelné vlastnosti:
  `defaultPreset`; `variants: { id, label, title?, pseudocode? }[]` (přepínač „Varianta“, `v=<id>`
  jen u nevýchozí, neznámá → výchozí s hláškou; testy `phase4Wiring.test.ts`,
  `GraphPage.variants.dom.test.ts`); `markers` (třídy hran s vlastní šipkou); `previewShare`
  (který krok výchozího běhu ukáže náhled). Předvolby v `*.presets.ts` (pomůcky `book()`,
  `rowsGrid()`, `text()`, pole `only` z `presetKit.ts`) se připojí na konec `PRESETS` (indexy
  starých se nemění).
- **GraphView / GraphEditor:** `GraphState.edgeText` (popisek hrany místo ceny), prop `markers`,
  vrstvy přes `groups` (`NodeGroup`), síť rezerv = druhý `Graph` v druhém `GraphView`; kreslení
  sítě `GraphEditor` + `useGraphEdit` s `lockDirected` / `lockWeighted`.
- **Stromy:** `TreeView` umí třídu vrcholu (`TNode.cls`) i hrany (`TEdge.cls`).
- **CSS:** oddíly `flows`, `graphs-new` (pododdíly graphsA, graphsB), `dp`, `hull`, `llrb` na konci
  `index.css` (`core/cssSections.test.ts`); každý vzorek `sw-…` potřebuje `.swatch.sw-…`; barvy jen
  `var(--algo-…)`.
- **Hlídací testy** pokrývají všech 51 modulů: `allModules.dom.test.tsx`,
  `canvasTabStops.dom.test.tsx`, `deepLinks.test.tsx`, `previews.dom.test.tsx`, `noAutoplay.test.ts`,
  `readableLinksGuard.test.ts`, `phase4Lint.test.ts`, `lazyPages.test.ts`.

## Fáze 3: závěrečný UX test (7. 11. 2026)

Audit všech 41 modulů (70 nálezů), opravy po TDD ve třech skupinách souborů,
ověření v headless Edge. Pravidla platí pro všechny moduly a hlídají je
`allModules.dom.test.tsx` (H1 = titulek z `registry.ts`, právě jedno „Výchozí
příklad“ mimo ActionMenu, Vytvořit jako první akce), `deepLinks.test.tsx`,
`noAutoplay.test.ts` a `keyboardFlow.dom.test.tsx`.

**Akce** (jednotné):
- Pořadí: Vytvořit → Příklady z knihy / přednášky → operace → nastavení →
  Jiný algoritmus. Náhodně je varianta Vytvořit (sufixové pole, FFT, FFT2
  s počtem prvků, stránkování).
- „Výchozí příklad“ a „↶ Vrátit operaci“ jsou vždy v řádku historie pod
  akcemi, nikdy ve variantách. Visualizer řádek kreslí ze `structure`, z
  `inputHistory?: { history, canUndo, undo }` (třídění, stránkování, k-d,
  grafy, hradla, AC – `sorting/inputHistory.ts`, `graphs/inputHistory.ts`) nebo
  jen tlačítko z `onRestoreInitial`. Historie je na jednom řádku a ořezává se
  zleva (celá v `title`).
- Po načtení je otevřená akce jen u modulů, které čekají na operaci
  (struktury, stromy a hešování Insert(x), nafukovací pole Insert(x),
  počítadlo Increment); třídění, grafy, řetězce, paralelní moduly a FFT nemají
  otevřené nic – běh je připravený.
- Potvrzení „Provést“ (bez ▶), editor grafu „Hotovo“, FFT „Spočítat FFT“,
  stránkování „Simulovat“. Grafy: Dijkstra „Délky hran“ (ℓ), Jarník a Kruskal
  „Váhy hran“, w(e), „nejlehčí“, „váha T“; popisky „Topo. uspořádání“ a
  „Jiný alg.“ mají plné jméno v `aria-label`.
- Před první operací ukazuje pravý panel pseudokód otevřené / hlavní akce bez
  zvýrazněného řádku; jinak jednotný `CODE_PLACEHOLDER`.

**Odkaz = aktuální stav**: po každé operaci i po ↶ se stav zapíše do adresy
(replace; otevření stránky adresu nepřepíše – `structures/useUrlSync.ts`).
Stromy nesou `k=` po hladinách (BST/AVL/splay dají stejný tvar), BB[α] a
(a,b) jen klíče („odkaz nese klíče, ne přesný tvar“). Prázdnou strukturu
formát zapsat neumí – odkaz otevře výchozí příklad. Kukačka řadí klíče tak,
aby je načtení vložilo do stejných buněk (od dávky 2 případně seznam buněk,
viz „Hešování – parametr `t`“). Výjimka: bezzámkový zásobník (stav
dvou procesů nejde sdílet). Hodnoty se od dávky 2 zapisují čitelně (`,` `:`
`~` nekódované, `core/linkParams.ts`), čtení přijme i starší `%2C`, `%3A`.

**Nové kontrakty jádra**:
- `Step.outcome: "neutral" | "warn"` – konec běhu ⓘ / ⚠ místo ✓
  (`.viz-message.done.neutral`, `.viz-message.warn`, tokeny
  `--algo-info-text`, `--algo-warn-text`); stromy: klíč nenalezen / už je,
  topologické uspořádání s cyklem ⚠.
- `ActionDef.selectedVariant` (`null` = žádná zvýrazněná varianta) – Příklady
  z knihy u grafů zvýrazní jen načtenou předvolbu.
- Argument `list` se `strict: true` – neplatné slovo je chyba, ne poznámka.
- `--algo-controls-h` (výška lišty přehrávání na telefonu) – fokus nezajede
  pod lištu; tlačítka přehrávání na kraji jsou `aria-disabled` a fokus
  neztratí; přepínač tématu je `role="group"` s `aria-pressed`.

**Kresby**:
- Zásobník, fronta, seznam a pole se zalamují a zvětšují až 1,6× (písmo
  ≥ 11 px); hluboké stromy mají menší vrcholy a hladiny (`minRadius`,
  `minLevelHeight`), od hloubky 11 se posouvá plátno; halda nad 15 prvků
  skryje indexy pod polem; intervalový strom ukazuje index vrcholu („5 · ⟨2,4⟩“).
- Grafy se kreslí 1 : 1 podle volné výšky (`views/graphFitHeight.ts`), ceny
  hran ≥ 11 px, viewBox zahrnuje popisky; fronta, zásobník a pořadí jsou
  dlaždice `ol.gtable-tiles`. „Upravit graf“ pozastaví přehrávání a kresba se
  při přepnutí neposune.
- Hešování: buňky 36–72 px, řetězce ve 2–4 sloupcích, Bloom m = 64 ve dvou
  řadách; m = 10 a Vytvořit ▸ Příklady z knihy ▸ Obr. 11.2 (Insert 75, 36,
  14, 42, 24, 95, 17 po jedné, každý čeká na Provést).
- k-d strom: rovina `min(58cqw, 100cqh)` (383 px při 1366, 700 px při 1920),
  strom vedle s užšími vrcholy (popisky ≥ 10 px při 1366); popisek bodu u
  pravého okraje se překlopí doleva; body jdou psát i „(1,2), (3,4)“ a
  „1 2; 3 4“; `q=` otevře připravený RangeQuery.
- Aho–Corasicková: pás σ a „Ohlášeno“ vpravo pod tabulkou stavů (posouvá se
  k aktivnímu stavu), strom má celou výšku (1,6–1,8× plochy).
- KMP, Rabin–Karp, sufixové pole a bezzámkový zásobník rostou s plátnem
  (zvětšení nejvýš 1,6); sčítačka „Obě“ se vejde i s otevřenou akcí, školní
  režim má pod řetězem písemné sčítání; FFT: strom nad tabulkou, kružnice
  vpravo přes obě řady, tabulka se posouvá jen uvnitř sebe.
- Import / export textem (hradla, grafy) je na desktopu pravý sloupec 16rem a
  tabulka výsledku zatím ustoupí (hradla ≥ 0,74 při 1366).
- Splay: obr. 9.4 a 9.5 (Φ 21,791 → 15,077 → 15,077 → 12,299 → 12,077);
  počítadlo: obr. 9.1 a 9.2, součty „Σ skutečná = 33 ≤ 45 = Σ amortizovaná +
  Φ₀ − Φ“.

**Přehled a navigace**: náhledy karet ukazují charakteristický mezistav běhu
(`pickStep`), ve skupině nejsou dvě stejné. Hledání: slova od 4 znaků i
uvnitř slov, kratší a „bc“ / „mgr“ jen od začátku slova, prohledává se i zdroj
(„13.2“) a nové štítky (řetězec, toposort, RMQ, otisk…). Hledaný výraz a filtr
přežijí Zpět (`history.state`, nic do adresy ani localStorage). Levá lišta
posune aktivní modul do záběru jen uvnitř sebe (okno zůstane nahoře).

**Kontrast**: nové tokeny (`--algo-danger-text`, zelená závorek výskytů aj.);
scan v Edge světle i tmavě nenajde text pod 4,5 : 1 kromě zakázaných tlačítek
(WCAG je nevyžaduje). Rozbalený popis má na nízkém okně nejvýš ~4 řádky.

## Dávka 2: rozhodnutí vlastníka E1–E7 (8. 11. 2026)

Rozhodnutí ze 7. 11. 2026 (dřív „K rozhodnutí vlastníka“ v Otevřených
bodech). Autoplay dál žádný, staré odkazy i klíče localStorage beze změny,
žádná nová závislost.

- **E1 – splay Delete podle Průvodce 9.5 (obr. 9.7):** x se vysplayuje do
  kořene a odebere; maximum levého podstromu L se vysplayuje do kořene L
  a připojí se k němu pravý podstrom R (prázdný L → kořenem je R; chybějící
  klíč → splay posledního navštíveného vrcholu). Odebraný kořen zůstává
  v kresbě šedý, Φ je v té fázi Φ(L) + Φ(R), pod odebraným kořenem se
  nekreslí s(v). Nápověda zmiňuje přednáškovou variantu (smazat jako v BST
  a splayovat otce, skripta Mareš 2.2). Předvolby obr. 9.4, 9.5 a nově 9.7
  („Vytvořit ▸ Příklady z knihy“); kroky obr. 9.7 ověřené v prohlížeči proti
  obrázku (5 0 2 1 4 3 6 → 2 v kořeni → L = 0(,1), R = 5(4(3),6) →
  1(0, 5(4(3), 6))). Kód: `splayDelete` v `trees/trees2.ts`.
- **E2 – (a,b)-strom ve variantě Průvodce 8.3** (`trees/abBook.ts`): klíče ve
  vnitřních vrcholech, vnější listy se nekreslí; Insert se štěpením
  m = ⌊(b+1)/2⌋, Delete nahradí klíč z vyšší hladiny následníkem, podtečený
  vrchol si půjčí od bratra nebo se s ním sloučí (přednost levý bratr),
  kořen bez klíčů zmizí. Přepínač v nabídce „Varianta: přednáška /
  Průvodce“ (jde vrátit, strom se postaví ze stejných klíčů). Výchozí zůstává
  přednášková varianta (klíče v listech). Předvolby obr. 8.7a/b, 8.8
  Insert(6), 8.9 Delete(5) – sloučení, 8.10 Delete(5) – půjčka (obr. 8.8–8.10
  jsou v knize výřezy s podstromy a…f – doplněné na nejmenší platný
  (2,3)-strom; u 8.7a přidán Delete(4) kvůli nahrazení následníkem). Koncové
  tvary ověřené v prohlížeči: 8.9 → [7]([2 4],[9]), 8.10 → [3 7]([2],[4],[9]),
  8.8 → štěpení až do kořene (výška +1). Výška = hloubka vnějších listů.
- **E3 – desetinná čárka** ve všech zobrazených číslech kromě FFT
  (`/fft/fft`, `/fft/net` mají dál tečku): `formatNum` v `core/format.tsx`
  (čárka, typografické minus, `−0` → `0`, `∞`), `formatNumPoint` pro FFT;
  `VarsView` čísla formátuje sám (prop `point` = tečka), `describeRange`,
  grafy (`fmtNum`: hlášky, tabulky, popisky, ceny hran; pole ceny v editoru
  čte čárku zpět), stromy (Φ, α, mez α·s; `displayVars`), hešování (`czNum`),
  amortizace (`sumsText`), stránkování (poměr LRU/OPT). Parametry v adrese,
  textový zápis grafu a import/export mají dál tečku (`alpha=0.7`,
  `g=A B 2.5`). Kontrola v prohlížeči: žádný modul mimo FFT neukazuje číslo
  s tečkou (jen čísla obrázků a oddílů „obr. 9.2“, „Průvodce 8.3“).
  Opraveno přitom: řádek součtů amortizace zmizel, když mez nebyla celé
  číslo (pole kapacity 1, Φ₀ = 0,5).
- **E4 – hešování: odkaz drží náhrobky i umístění** (viz „Hešování –
  parametr `t`“ níže); hláška po otevření uvádí počet náhrobků.
- **E5 – Kruskal + les Union-Find** (`views/UnionFindView.tsx`,
  `views/ufForestLayout.ts`, `GraphState.uf`): nad tabulkou hran les keříků
  (šipka syn → otec P(v), u kořenů „H=k“ = hloubka keříku podle Průvodce
  7.4, Union podle hloubky bez komprese cest). Find zvýrazní obě cesty do
  kořenů, Union novou šipku (`is-new`) a připojený kořen, u zahozené hrany
  cesty zůstanou. Kresba je obrázek (`role="img"`, popis pro čtečku), bez
  zastávky Tabu. Rozměry pevné podle největšího lesa běhu; na desktopu les
  lepí nahoře panelu (`position: sticky`) a zvýrazněný řádek tabulky se drží
  v záběru panelu (`keepRowVisible`, posouvá jen panel – platí pro všechny
  grafové tabulky). Ověřeno krok po kroku na výchozím příkladu (obr. 7.2):
  kořeny a cesty Find odpovídají hláškám „Kořen(u) = …“.
- **E6 – volné místo na plátně:**
  - amortizace (`/ds2/array`, `/ds2/counter`): graf jako obr. 9.2 – sloupce =
    skutečná cena operace, křivka = Φ po ní, poslední operace zvýrazněná;
    posledních 64 operací od Vytvořit / Prázdné / Výchozí příklad, jde
    s kroky přehrávače, odkaz ho nenese. Výška přes CanvasFit (97 % plátna
    při 1920 × 1080). Jedna zastávka Tabu, šipky po sloupcích
    (`views/BarChartView.tsx`, `barChartLayout.ts`, `amortized/AmortChart.tsx`);
  - otevřená adresace a kukačka: stopa pod řadou buněk
    (`hashing/TrailView.tsx`, `trail.ts`) – pořadí sond s výsledkem
    (obsazeno / náhrobek / prázdno / nalezeno / smazáno / uloženo) resp. cesta
    vyhazování; řádky 16–32 px podle volné výšky, dlouhá stopa ukáže konec;
    souhrn hromadné operace a přehešování stopu mažou; jen obrázek (roving
    tabindex tabulky beze změny);
  - Rabin–Karp (pás až 2,4×, `rkZoom`), sufixové pole (tabulka 0,7–2,4×,
    `suffixView.ts`; delta CanvasFit se převádí podle změřené výšky tabulky,
    odsazení buněk v em) a bezzámkový zásobník (časová osa prokládání P1/P2
    pod zásobníkem, posledních 24 atomických kroků, `lockfreeTimeline.ts`,
    `LockFreeTraceView.tsx`). Zaplnění plátna při 1920 × 1080: sufixové pole
    73 %, Rabin–Karp 68 %, bezzámkový zásobník 66 % (po scénáři ABA 98 %);
    při 1280 × 720 bez přetečení.
- **E7 – čitelné odkazy** (`core/linkParams.ts`: `readableSearch`,
  `readableHref`, `useLinkSearchParams`): v adrese i ve „Kopírovat odkaz“
  zůstávají nekódované `, : ; / @ ! $ ~ *` (`a=4,2,8`, `t=16:mod:1:3,~,35`);
  kódují se dál `& = + # % ?`, apostrof, mezera (`+`) a znaky mimo ASCII.
  Všechny stránky zapisují dotaz přes `useUrlParam`, `useLinkSearchParams`
  nebo `readableSearch` (hlídá `core/readableLinksGuard.test.ts`). Staré
  odkazy s `%2C` se čtou stejně a při otevření se nepřepisují.
- Sdílené třídy kreseb `.viz-barchart`, `.viz-trail`, `.viz-ufforest`
  (`index.css`, oddíl „sdílené kresby“, hlídá `core/cssShared.test.ts`).
- Integrace: odkaz `#/tree/ab?ex=obr-8-8` předvyplní Insert(6) (dřív nabízený
  nový klíč 35); build dělí sdílené kresby (`src/algo/views`) do chunku
  `algo-views` (`vite.config.ts`, `codeSplitting` bez rekurzivních
  závislostí), aby chunk `AlgoPage` zůstal pod 500 kB – ostatní stránky webu
  ho nenačítají.

### Zbytky dávky 2 (8. 11. 2026)

- **(a,b)-strom s CanvasFit** (obě varianty): `MultiTreeView` prop `fit`,
  `multiTreeLayout(…, { fit: true })` zúží buňky klíčů (nejvýš na šířku
  klíče) a mezery (až 2 px) místo zmenšení písma přes CSS, okraje podle
  krajních vrcholů, bez prázdné hladiny pod listy; vzdálenost hladin
  `multiFitLevelHeight` / `multiLevelFitLimits` (48–200 px). 28 klíčů v (4,7)
  při 1280 × 720 má písmo 12,5 px (dřív 6 px). Náhledy a strom volání FFT
  beze změny.
- **Hešování vyplní plátno už po načtení:** u otevřené adresace a kukačky
  je místo pro stopu vyhrazené předem (přerušovaný rámeček, tečkované
  dráhy, nápověda), výška kresby se během operace nemění; řádky stopy
  16–32 px, kapacita max(délka, 6). Stopa používá sdílenou `.viz-trail`
  (`.hash-trail` zmizela; obsazená sonda neutrální, náhrobek `is-done` „n †“,
  prázdno „n ∅“, nalezeno/uloženo `is-ok`, smazáno `is-fail`, právě probíhající
  krok `is-hot`). Bloomův filtr (desktop, m ≤ 32): bity v jedné řadě
  a tabulka „klíč → bity“ (`bloomMatrix`), řádek probíhající operace
  zvýrazněný. Řetězení: řádky až 56 px, písmo 12–24 px. Při 1920 × 1080
  zaplnění ~90 % (řetězení ~65 %), dřív 8–38 %. Telefon a náhledy beze změny.
- **Sufixové pole bez přetečení:** tabulka se nejdřív zmenšuje (0,7×);
  nestačí-li ani to (dlouhé α, rozbalený popis), dostane `max-height`
  (`saClamp`, minimum se pozná přes `saAtMin`), posouvá se uvnitř s lepícím
  záhlavím a zvýrazněné řádky kroku drží `saKeepRowsVisible`. Jen v režimu
  jedné obrazovky.
- **Sdílené třídy místo inline stylů:** graf amortizace `.viz-barchart`
  (`bc-axis`, `bc-grid` čárkovaně, `bc-line`, `bc-dot.is-hot`).
- **Les Union-Find v barvách komponent:** `UnionFindView` prop `nodeMarks`
  (z `n-compK` vrcholu grafu → `uf-compK`); paleta je v tokenech
  `--algo-comp0…7-fill/-line` a `--algo-comp-text` (`:root`, stejné v obou
  tématech), sdílená s `.graph-node.n-compK`. Cesta Find / připojený kořen
  zůstanou vidět obrysem.
- **Pole Ceny / Délky / Váhy hran** je textový argument (`parseWeights`,
  `formatWeights` v `graphPageModel.ts`): ukazuje desetinnou čárku
  a typografické minus („2,5 −1 4“), bere čárku i tečku, oddělovač mezera,
  středník nebo čárka mimo číslice („4, 2, 7“ funguje, „4,2,7“ zablokuje
  Provést s nápovědou); rozsah ±9999, přebytečná čísla = poznámka. Nově jdou
  i desetinné ceny. Odkaz `g=` a import/export mají dál tečku.
- **CanvasFit:** přesah obsahu plátna (nad 0,1 px) kresbu vždy zmenší
  (`nextDelta`, zaokrouhleno dolů) – dřív se přesah pod 2 px ignoroval
  a sufixové pole při 1920 × 1080 s rozbaleným popisem mělo posuvník plátna
  +2 px.

## Úvodní stránka (`#/`, `landing/`)

Rozcestník modulů (vlastník 7. 11. 2026: „je to hezké, ale něco tomu
chybí“). Na rozdíl od stránek modulů se **smí posouvat**. Levá lišta zůstává.

- Nahoře velké hledání (`matchesQuery` z `registry.ts` – stejné jako levá
  lišta: bez diakritiky, tagy; Enter otevře první výsledek, Esc vymaže;
  počet výsledků v živé oblasti `role="status"`, která je v DOM pořád – jen
  prázdná, jinak by čtečka první výsledek neohlásila) a
  přepínač **Vše / Bc. / Mgr.** (`aria-pressed`; filtruje jen karty a čipy,
  levou lištu ne). Logika: `landing/landingModel.ts`.
- Čipy skupin s počtem modulů (`nav „Skupiny modulů“`): klik posune ke
  skupině přes `scrollIntoView` a dá fokus na její nadpis – **adresa se
  nemění** (v HashRouteru by `#kotva` byla cesta). Id sekce
  `groupAnchorId()` = `skupina-…`.
- **Naposledy otevřené**: poslední 4 otevřené moduly. Nový klíč
  localStorage **`algo-recent`** = JSON pole cest, nejnovější první
  (`landing/recent.ts`); zapisuje ho `Shell` v `App.tsx` při každém otevření
  modulu. Poškozený JSON, neznámé cesty i úložiště, které vyhazuje výjimky,
  stránku neshodí – řada se jen neukáže. Kdo už něco otevřel, místo
  „Kde začít“ vidí tuto řadu. Stávající klíče (`algo-theme`, `algo-speed`)
  beze změny.
- Karty po skupinách: celá karta je odkaz (`aria-labelledby` = název,
  `aria-describedby` = popis + štítek), štítek Bc./Mgr., `desc`, zdroj
  (`formatSource`) a **statická mini-kresba výchozího příkladu**. Mřížka:
  telefon 1 sloupec, 1280 px 3, 1366 px 4, od 1600 px 4 širší (obsah až
  1560 px).
- Náhledy: registr `landing/previews.tsx` (`PREVIEWS`: cesta → `{ render,
  html? }`) kreslí skutečné pohledy modulů (`ArrayView`, `TreeView`,
  `GraphView`, `BoxListView`, `ChainView`, `CacheTable`, `Plane`…) nad
  výchozí strukturou nebo prvním krokem výchozí operace (grafy: výchozí
  předvolba a v₀ jako na stránce; stránkování po 7 požadavcích; sufixy a
  k-d strom hotová stavba). SVG se vepíše do náhledu přes viewBox, HTML
  pohledy (`html: true`) se zmenší `zoom: 0.5`; bez animací a bez ovládání
  (`aria-hidden`, `pointer-events: none`). `ModuleThumb` kreslí **líně**:
  až když je karta do 300 px od záběru (IntersectionObserver; bez něj, např.
  v jsdom, hned); karta, kterou filtr skryje a znovu ukáže, už nečeká
  (pamatuje si cesty). Kresba se spočítá **jednou** na náhled (cache –
  psaní do hledání ani filtr ji nepočítají znovu). HTML náhled se změří a
  zmenší pod 0,5, když by se nevešel (telefon: bezzámkový zásobník). Chyba
  kresby → zástupce. Modul bez náhledu dostane
  neutrálního zástupce skupiny (`placeholderKind` / `placeholderArt`).
  **Nový modul**: přidat řádek do `PREVIEWS` (test
  `previews.dom.test.tsx` hlídá, že ho mají všechny moduly registru).
  Výchozí příklady sdílí náhled se stránkou (`LIST_INITIAL` v
  `structures/list.ts`, `ARR_DEFAULT` / `CNT_DEFAULT` v
  `amortized/amortized.ts`) – nic se neopisuje.
  Pohledy, které stránky dřív měly jako lokální funkce (`ChainView`,
  `ProbeView`, `CuckooView`, `BloomView`, `ArrayCells`, `Bits`,
  `CacheTable`, `SATable`), jsou kvůli tomu exportované.
- Testy: `landing/recent.test.ts`, `landingModel.test.ts` (node),
  `previews.dom.test.tsx` (náhledy, líné kreslení, cache, chyba kresby →
  zástupce, HTML náhled se vejde, sdílené výchozí příklady) a
  `Landing.dom.test.tsx` (karty, filtr, hledání + Esc, živá oblast,
  historie včetně zápisu při otevření modulu, neznámé cesty a poškozeného
  JSON, kotvy).
  Kontrola v prohlížeči (7. 11. 2026, headless Edge přes DevTools
  protokol): 1280 × 720 / 1366 × 768 / 1920 × 1080 / 390 px, světlé i
  tmavé – bez vodorovného posuvníku, po načtení se kreslí jen viditelné
  náhledy (7 z 33 při 1366 × 768), po posunu všech 33, žádná chyba
  v konzoli, první vykreslení ~50–80 ms (lokálně).

## Kostra stránky modulu (`Visualizer`)

**Desktop = jedna obrazovka bez posouvání** (vlastník 6. 11. 2026: „aby se
to vešlo na jednu stranu“; po vzoru VisuAlgo). Platí pro okno
`(min-width: 1100px) and (min-height: 600px)` – ověřeno pro všech 41 modulů (fáze 3; dřív 33)
na 1280 × 720, 1366 × 768, 1440 × 900 a 1920 × 1080
(`documentElement.scrollHeight ≤ innerHeight`).

```
Desktop (≥ 1100 × 600, stránka se neposouvá)       Telefon / menší okno (běžný tok)
┌ název ─────────────────────── Kopírovat odkaz ┐   název, odkaz
│ popis na 2 řádky (…)                     více │   popis 2 řádky … více
├───────────────────────────────┬───────────────┤   PLÁTNO
│ PLÁTNO (vyplní zbytek výšky;  │ Stav: operace,│   stav + řádek kódu
│ SVG se zmenší, poměr stran    │ zpráva        │   Akce (v řádku) + historie
│ zachová; graf | tabulka a     ├───────────────┤   ⏮ ◀ ▶ ▶▶ ⏭ krok (lepí dole)
│ rovina | k-d strom vedle sebe)│ Pseudokód     │   ──●── rychlost
│                               │ (posouvá se   │   Pseudokód
├───────────────────────────────┤ uvnitř)       │   volby · legenda
│ Akce v řádku; otevřená akce   │ volby, legenda│   ▸ 💡 Zkuste… a nápověda
│ (varianty, pole, Provést) pod │ ▸ 💡 Zkuste…  │
├───────────────────────────────┤   a nápověda  │
│ ⏮ ◀ ▶ ▶▶ ⏭  krok n/N ─●─ rychl.│               │
└───────────────────────────────┴───────────────┘
```

- Kostra `.viz` má na desktopu výšku
  `calc(100dvh - var(--algo-site-header-space) - 1.2rem)`; `.viz-main` je
  mřížka s oblastmi `canvas / status / side / actions / controls`. Levý
  sloupec a dok (`.viz-canvas-col`, `.viz-dock`) mají `display: contents` –
  v DOM zůstává pořadí pro telefon (plátno, stav, akce, přehrávání), na
  desktopu je stav vpravo nad pseudokódem.
- **Plátno** (`.viz-canvas`) je flex sloupec s `overflow: auto`: text a
  tabulky se nesmršťují, obaly pohledů (`.view-wrap`, `.graph-editor`,
  `.graph-layout`, `.kd-tree-col`) ano a jejich `<svg>` má
  `width/height: auto; min-height: 0; max-width: 100%` – zmenší se do výšky
  plátna se zachovaným poměrem stran (viewBox; klik a tah dál přepočítává
  `getScreenCTM`). To je ale jen pojistka: **přizpůsobení kresby**
  (`core/canvasFit.ts`) mění místo zmenšení celého SVG (i s písmem) pružné
  rozměry kresby. Visualizer dá v režimu jedné obrazovky (`FIT_MEDIA`
  v `core/layoutMedia.ts`, stejný dotaz jako v CSS) přes `CanvasFitContext`
  prvek plátna, `<CanvasFit limits>{(delta) => …}</CanvasFit>` na stránce
  změří, kolik px výšky obsahu přebývá nebo chybí (SVG zmenšená CSS počítá
  v přirozené výšce), a vrátí deltu; `settleStep` hlídá, aby zaokrouhlení
  nekmitalo. Třídění mění výšku sloupců (`algos/sorting/fit.ts`: hlavní pole
  60–330 px, Z / počítadla si deltu dělí podle výšky), BST/AVL/BB/Splay a
  halda vzdálenost hladin (`fitLevelHeight` v `views/treeLayout.ts`:
  48 px až 1,25 × výchozí). Písmo a vrcholy zůstanou 1 : 1; na velkém
  monitoru kresba úměrně naroste. Ostatní pohledy (grafy, k-d, hešování,
  tabulky) se dál jen zmenšují CSS a nezvětšují nad 1 : 1. Co se nevejde
  ani tak (dlouhé tabulky stránkování/sufixů, rozbalený import grafu),
  posouvá se uvnitř plátna. Grafy s tabulkou výsledku (`.graph-layout:has(.gtable)`) a k-d
  strom (rovina | strom, velikost roviny z jednotek kontejneru `cqw/cqh`)
  jsou na desktopu vedle sebe.
- **Popis** je na každé šířce sbalený na dva řádky (`line-clamp`), tlačítko
  „více“ / „méně“ (`aria-expanded`) ho rozbalí; plátno se pak zmenší a
  rozbalený popis má na desktopu nejvýš `min(22vh, max(5.5em, 100vh − 620px))`
  s vlastním posuvníkem (na 720 px ~4 řádky).
- **Pravý sloupec** (`aside.viz-code`): pseudokód (vlastní posuvník), pod ním
  `options` (přepínače kresby, např. „styl knihy“, „vrstvy V₀…Vₖ“), legenda a
  sbalený `<details class="viz-more">` „💡 Zkuste… a nápověda“ = tip, `notes`
  (doplňující text ke vstupu: zdroj obrázku z knihy, popis grafu, poznámka o
  sdíleném vstupu třídění) a klávesy (`KeyHint` z `Controls.tsx`). Nic se
  neztratilo, jen je sbalené. Prázdný graf má návod přímo na plátně.
  Pseudokód má nejmenší výšku `min(9rem, 100%)` (~6 řádků), rozbalená
  nápověda nejvýš 28vh s vlastním posuvníkem a co se do sloupce nevejde,
  posouvá se uvnitř sloupce (`overflow-y: auto`) – stránka nikdy.
- **ActionMenu** je v řádku (`.am-list` flex-wrap, `role="list"` /
  `"listitem"` výslovně – Safari je u `list-style: none` zahodí). Tělo
  otevřené akce je v DOM **až za seznamem** tlačítek, takže leží pod nimi
  přes celou šířku a pořadí tabulátoru odpovídá pořadí na obrazovce.
- Po provedení akce se tělo **sbalí** na telefonu (`COLLAPSE_MEDIA`) i na
  desktopu na jednu obrazovku (`FIT_MEDIA`) – otevřená akce ubírá výšku
  plátnu, takže kresba po operaci dostane své místo zpět. Fokus se vrátí na
  tlačítko akce (Enter ji znovu otevře, pole si pamatuje hodnotu). Na
  střední šířce (běžný tok stránky) zůstává otevřená.
- Lišta přehrávání je **jeden řádek** (tlačítka, počítadlo, posuvník kroků,
  rychlost); na desktopu pod 1440 px bez slov „Zpět/Další“. Lepí u spodního
  okraje okna (na telefonu dva řádky).
- `--algo-site-header-space` (= výška hlavičky v toku, i když je schovaná;
  zapisuje `siteHeader.ts`) – kdyby kostra počítala s `--site-header-h`
  (schovaná = 0), narostla by o hlavičku a stránka by se o ni posouvala. Ze
  stejného důvodu levá lišta na stránce modulu neanimuje výšku.
- Kontrola v prohlížeči (ruční, není v `npm test`):
  `node scripts/measure-algo-fit.mjs --w 1366 --h 768 [--shots složka]
  [cesty…]` po `npm run build` – statický server nad `dist/` a headless
  Edge/Chrome přes DevTools protokol (bez závislostí). Pro každý modul
  změří stavy načteno / po skutečné operaci (operační akce jako Push,
  Insert, Find, BFS(v₀) – ne Vytvořit / Příklady; když po žádné akci
  přehrávač neukazuje kroky, řádek hlásí „ŽÁDNÁ OPERACE“ a skript skončí
  kódem 1) / s rozbalenou nápovědou /
  s rozbaleným popisem: přetečení okna, nejmenší měřítko SVG, výšku
  pseudokódu, stav přehrávače; na šířce pod 700 px i to, zda plátno po
  operaci nezakrývá hlavička webu a horní lišta. Testy
  `core/cssScope.test.ts` kontrolují jen text CSS pravidel, ne rozložení.
  Stav 7. 11. 2026: 33/33 modulů bez posuvníku při 1280 × 720, 1366 × 768
  a 1920 × 1080 ve všech čtyřech stavech (po integraci fáze 2 41/41, viz „UX
  testy“); při 1366 × 768 je nejmenší
  měřítko po operaci 0,88 (grafy), třídění, stromy a halda 0,94–1.
- Po spuštění akce (nebo „Prázdný – nakreslit“, přestavbě struktury,
  vrácení) se plátno posune do záběru (`scrollIntoView`) – na telefonu leží
  akce pod plátnem. Stránky se strukturou to dělají přes
  `structure.version`, ostatní předávají `runKey` (počítadlo spuštění).
  `scroll-margin-top` plátna je `3.5rem + var(--algo-site-header-space)`:
  posun nahoru hlavičku webu zase ukáže, takže se počítá s její plnou
  výškou (dřív s `--site-header-h`, které je u schované hlavičky 0, a horní
  část plátna pak zajela pod hlavičku a horní lištu).
- Široký pohled, který se na telefonu posouvá do strany (`.view-wrap`,
  `.boxlist-wrap`), má u kraje, kam jde posunout, stín („scroll shadows“
  v pozadí: kryt v barvě plátna jede s obsahem, stín drží okraj).
- **Přehrávání se nikdy nespouští samo** (vlastník 6. 11. 2026). Každá nová
  sada kroků (operace z nabídky, Vytvořit, příklad z knihy, klik na vrchol =
  v₀, Jiný algoritmus, otevření stránky či odkazu, tah v rovině…) znamená
  krok 1 a `playing = false`; simulaci rozběhne jen ▶ (primární tlačítko) nebo
  mezerník. `usePlayer(steps)` pozná novou sadu podle identity pole `steps`
  (`syncPlayer` v `core/player.ts`) – žádný klíč pro automatické přehrání už
  není. Stránky, které chtějí nový běh nad stejným vstupem, vytvoří nové pole
  (třídění `apply(values, restart)`, sufixy `load … restart`, k-d strom
  `start(…, newRun)`). Ruční krokování (Zpět/Další, posuvník) beze změny.
  Hlídají to `allModules.dom.test.tsx` (všech 41 modulů z `registry.ts`: po
  otevření i po první operaci „Přehrát“ a krok 1 / „připraveno“),
  `deepLinks.test.tsx` (sdílené odkazy stojí na kroku 1) a
  `noAutoplay.test.ts` (žádný text ani komentář neslibuje „přehraje sám“;
  `player.play` / `player.toggle` volá jen `core/Controls.tsx`).
- Na telefonu (mimo režim jedné obrazovky) se plátno vyšší než okno nebo
  s horním okrajem pod hlavičkou zarovná **začátkem** (`block: "start"`,
  `scroll-margin-top` počítá s hlavičkou i horní lištou) – „nearest“ by
  u Kruskala s tabulkou nechal horní kus kresby pod hlavičkou. Jinak
  „nearest“.
- Klávesy: mezerník přehrát/pozastavit, ←/→ krok, Home/End, −/+ rychlost
  (v textových polích se nechytají; šipky a Home/End ani na kresbě, viz
  „Klávesnice na kresbě“), Esc zavře nabídku. **Operace Enterem
  a hned mezerník přehraje**: po sbalení akce dostane její tlačítko
  `data-am-ran` (do odchodu fokusu) a `shortcuts.ts` ho bere jako
  `action-ran` – mezerník přehrává, Enter akci znovu otevře. Jinak by
  mezerník na tlačítku (došel na něj fokus klávesnicí) akci znovu otevřel
  a z klávesnice by se přehrát nedalo (`keyboardFlow.dom.test.tsx`). Po
  uvolnění mezerníku přejde fokus na ▶/⏸ (ne na `<body>`), takže další
  mezerník pozastaví a Tab pokračuje ovládáním přehrávání.
- **Klávesnice na kresbě** (roving tabindex, rozhodnutí D3): každá kresba je
  **jedna zastávka Tabu** (`role="group"` s `aria-label`; sčítačka nechává
  `<table>` bez role, ať zůstane sémantika tabulky). Uvnitř šipky přesouvají
  fokus po prvcích podle polohy (vlevo/vpravo v řadě – prvky, jejichž svislé
  rozsahy se překrývají aspoň z poloviny menšího; nahoru/dolů jen ve výseči
  |dx| ≤ 3·dy, bez skoku stranou), Home/End = první/poslední v pořadí čtení;
  u stromů a stromu volání FFT je výchozí zastávkou kořen. **Enter** = totéž
  co klik (vyplní argument akce, v₀, přepne bit…). **Mezerník vždy ovládá
  přehrávač** (i na kresbě; prvek už nevybírá). Šipky/Home/End krokují
  přehrávač jen mimo kresbu a mimo textová pole (`FocusKind` `canvas`
  v `shortcuts.ts` = `[data-canvas-item]` nebo prvek v SVG; `input` uvnitř
  SVG – cena hrany – zůstává textovým polem). **Shift+šipky** posunou vrchol
  grafu (o 0,02) nebo prvek hradlové sítě v editoru (o 1 krok mřížky; dřív
  Shift = 5 kroků). **Esc** pošle fokus na další ovládací prvek za kresbou
  (a klávesu pustí dál – zavře akci či rozdělanou hranu), **Tab** kresbu
  opustí, Shift+Tab se vrátí na poslední prvek. Zmizí-li prvek s fokusem
  (krok, přestavba automatu), fokus přejde na novou zastávku téže kresby;
  když kresbu opustil uživatel, hook ho nebere.
  Kód: `core/rovingFocus.ts` (čistá navigace), `core/useRovingFocus.ts`
  (hook: `rove.group` na kontejner, `rove.item(key)` za `pickProps` na prvek;
  atributy `data-rove-group`, `data-rove-key`, `data-canvas-item`),
  `views/pick.ts` (jen Enter). Převedeny všechny kresby: ArrayView, TreeView,
  MultiTreeView, GraphView/GraphEditor, CircuitView/CircuitEditor,
  BoxListView, TextStripView, AutomatonView, ComparatorView, ButterflyNetView,
  HashPage, CuckooBloomPage (vč. `BloomKeys`), adderViews, CallTree ve
  fftViews. Odkaz „Přeskočit na obsah“ zůstal; kroužek fokusu dávají stávající
  styly `:focus-visible` (bez nového CSS). Texty: KeyHint ve sbalené nápovědě
  („Kresba: Tab na ni, šipky pohyb po prvcích, Enter vybrat, Shift+šipky posun
  vrcholu, Esc ven“), „Klávesy:“ na úvodní stránce, nápovědy editorů („tah
  nebo Shift+šipky = přesun“), `aria-label` vrcholů a hradel („Shift+šipky =
  posun“). Hlídá `canvasTabStops.dom.test.tsx` (41 modulů po otevření i s
  otevřenou akcí: nejvýš jedna zastávka v kresbě), `keyboardFlow.dom.test.tsx`
  (BFS, Bubblesort), `core/rovingFocus.test.ts`,
  `core/useRovingFocus.dom.test.tsx`, `views/pick.dom.test.ts`.
  Známé drobnosti: u pole se zápornými hodnotami tvoří sloupce pod osou druhou
  řadu (Home/End je berou až po kladných); KMP před hledáním a AC před stavbou
  mají skupinu bez vybíratelných prvků (nic vybrat nejde, zastávka Tabu
  žádná); ▶ i mezerník fungují i v režimu úprav grafu a sítě (jako dřív klik
  na ▶); od „Přeskočit“ ke kresbě jsou 4 Taby, k akcím kvůli levé liště
  desítky.
- Varianty akce (`.am-variants`) jsou `role="toolbar"` s jednou zastávkou
  tabulátoru (zvolená varianta, `aria-pressed`); ←/→/↑/↓, Home, End jen
  přesouvají fokus – varianta bez argumentu se provede hned, takže vzor
  radiogroup (výběr šipkou) by spouštěl operace.
- Hláška neplatného pole je při psaní `role="status"` (čtečka nepřerušuje),
  `role="alert"` až po pokusu o provedení. Zahozené položky seznamu
  („Ignorováno: …“) jsou varování `.am-msg.warn` s ⚠; po provedení a
  sbalení akce zůstane varování pod akcemi (`.am-ran-note`, živá oblast
  v DOM pořád), dokud uživatel nepíše, neotevře akci nebo neprovede další
  operaci (`ranNote` v `useActionMenu`).
- Lepící prvky počítají s `var(--site-header-h, 0px)` (výška hlavičky webu,
  zapisuje `siteHeader.ts`; schovaná hlavička = 0) a mají `z-index` < 1000.

## Plynulé přechody mezi kroky

Vlastník 7. 11. 2026: přechody ve všech pohledech, délka podle rychlosti
přehrávače, s „omezit pohyb“ vypnuté. Přechody jen čtou stav přehrávače –
**nikdy ho nespouštějí**.

- **Druh posunu** (`core/motion.ts`, čisté funkce): `usePlayer` si u každé
  akce zapamatuje `player.motion` – `play` (tick při přehrávání), `step`
  (Další/Zpět, ←/→), `jump` (posuvník – i o jediný krok –, Home/End, ▶ od
  konce); nová sada kroků = `undefined`. Beze změny kroku (pauza) zůstává
  předchozí druh, běžící přechod se neutne.
- **Délka** `stepTransitionMs(motion, delay, reduced)`: skok, nová sada a
  `prefers-reduced-motion: reduce` = 0 ms; ruční krok `MANUAL_MS` = 200 ms;
  přehrávání 0,6 × interval, nejvýš 600 ms, pod 40 ms → 0 (0,25× a 0,5× =
  600 ms, 1× = 300, 2× = 150, 4× = 72, 8× = 0). Barvy
  `colorTransitionMs` = min(délka, 250 ms).
- **Předání pohledům** (`core/stepTransition.ts`): Visualizer nastaví na
  `.viz-canvas` CSS proměnné `--algo-step-ms` a `--algo-step-color-ms`
  (výchozí 0 ms na `.algo-root` – mimo plátno modulu se nic neanimuje) a
  kontext `StepTransitionContext` (`useStepMs(fallback)`); „omezit pohyb“
  sleduje `useReducedMotion()`, jednorázově `prefersReducedMotion()` (posun
  plátna, kotvy úvodní stránky, `useTween`) – jediné místo dotazu.
- **Pohyb**: stromy (TreeView, MultiTreeView – BST/AVL/BB/Splay, halda,
  intervalový a k-d strom, (a,b)) dál `useTween` (JS interpolace, hrany jedou
  s vrcholy), délka teď z kontextu (stránky už nepředávají
  `moveMs`; `moveMs` zůstal jen jako ruční přebití, `moveDuration` je
  pryč).
  Sloupce pole (ArrayView – třídění, halda), krabičky (BoxListView –
  zásobník, fronta, seznam) a buňky amortizace: `views/useFlip.ts` – FLIP
  přes Web Animations (`el.animate` z předchozí polohy do nové, `data-flip`),
  protože React při prohození přesune uzel v DOM a prohlížeč tím zruší CSS
  přechod (druhý z prohozených sloupců by skočil). Pořadí v DOM (tabulátor)
  zůstává podle indexu; změna šířky plátna se neanimuje. Výška sloupců se
  při změně rozložení (canvasFit, okno) nepřechází – `useRelayoutFreeze`
  dá SVG na dva snímky třídu `.relayout` (CSS `transition: none`). Halda
  drží řádek proměnných n/i/o po celou operaci (`VarsView reserve`), takže
  na posledním kroku kresba neposkočí. Ukazatele krabiček CSS přechodem
  `transform var(--algo-step-ms)`.
- **Barvy** vrcholů a hran grafů, stromů, krabiček, sloupců, buněk tabulek
  (výsledky grafů, hešování, sufixy, stránkování), k-d bodů a dělení:
  CSS `transition: fill/stroke/background-color var(--algo-step-color-ms)`.
  Poloha vrcholů grafu se nepřechází (tah v GraphEditoru a k-d bodů je
  okamžitý).
- **Objevení / odchod**: nové prvky (`.bar`, `.box`, `.tree-node`,
  `.mtree-node`, `.lf-node`, `.hc-key`, `.kd-pt` na plátně) animace
  `algo-enter` (průhlednost); odebrané sloupce, krabičky a vrcholy stromu
  ještě `ms` doznívají (`useLeaving` → třída `.leaving`, animace
  `algo-leave`, `pointer-events: none`, `aria-hidden`).
- Testy: `core/motion.test.ts` (druh posunu, délky pro všech 6 rychlostí),
  `core/stepTransition.dom.test.ts` (ruční krok = 200 ms a vrchol vyjede
  z dosavadní polohy, posuvník i o 1 krok / Na konec / omezit pohyb =
  okamžitě, odchod krabiček, vrcholů a sloupců, přehrávač stojí),
  `views/useFlip.dom.test.ts`, `core/motionCss.test.ts` (CSS bere délky
  z proměnných, žádná pevná délka transformace). Ruční kontrola v headless
  Edge (7. 11. 2026, zpomalení přes `Animation.setPlaybackRate` a čas rAF):
  mezisnímek ruční krok Bubblesort (prohození), AVL Insert(30), halda
  Insert(1) leží mezi výchozí a cílovou polohou; Quicksort n = 50 při 1×,
  4× i 8× 241 snímků / 4 s, p95 ≈ 18 ms, žádný snímek nad 50 ms.

## Tažení bodů (8. 11. 2026)

Přání vlastníka: „editace a přesouvání bodů není úplně ideální a blbě se to ovládá“, „těžké chytit
a táhnout“, „v tocích během přesouvání bodů se graf resizuje a graf potom je miniaturní“. Jeden model
pro grafy (`/graph/*`, GraphView a GraphEditor), toky (FF, Dinic, Goldberg), konvexní obal a k-d strom.

- **Jádro:** `core/usePointerDrag.ts` (pointer events, `setPointerCapture`, myš, pero i prst) a čisté
  funkce `core/dragMath.ts`. Úchop je větší než viditelný kruh – myš/pero `max(22, r + 12)` px, prst
  `max(44, r + 12)` px, vyhraje nejbližší prvek (`pickNearest`); práh klik/tah 4 px (`pastThreshold`);
  prvek drží posun z uchopení (`grabOffset` / `followPointer`) a jede přesně pod ukazatelem; kurzor
  `grab` / `grabbing` (oddíl CSS `drag`). Prst, který chytil prvek, stránku neposouvá (nativní
  `touchstart` s `passive: false` přes `attachSvg` – Chrome nebere `touch-action` na vnitřních prvcích
  SVG); prst z prázdného místa ji posouvá dál (kromě k-d roviny, kde tah z prázdna kreslí Q).
- **Během tahu se kresba nepřeměřuje:** při stisku se zmrazí šířka, převod souřadnic, viewBox i meze
  (`session.frozen`). Meze vrcholu = viditelné plátno ∩ `keepScaleBox` (kresba s pevným poměrem stran:
  oblast, kde se po puštění měřítko nezmenší) – vrchol puštěný „ven“ zůstane na okraji.
- **Po puštění kresba neposkočí (V-1):** GraphView si u kresby s pevným poměrem stran ponechá převod
  souřadnic ze stisku (kotva `LayoutAnchor`), dokud se nezmění plátno (šířka, výška), struktura grafu
  a dokud jsou všechny vrcholy v jeho ploše; teprve pak se kresba znovu vystředí. Totéž po Shift+šipkách.
  V editoru (`edit`) se kotva zakotví hned a drží i přes změny struktury (nový vrchol, hrana, import,
  Zpět), dokud se vrcholy vejdou – po „Hotovo“ platí dál, kresba se nepřeměřuje.
  Po znovunačtení odkazu s `xy=` se kresba vystředí podle uložených poloh (měřítko stejné nebo větší).
- **Nepřekrývání (V-5):** puštěný vrchol se odsune na nejbližší volné místo v mezích, aspoň součet
  poloměrů + 6 px od ostatních (`separateFrom`).
- **Úpravy grafu:** o spojení hranou rozhoduje střed taženého vrcholu, ne ukazatel (V-6) – náhledová
  čára i `is-target` sedí s tím, co uživatel vidí. **Dlouhý stisk maže jen prstem či perem a jen na
  viditelném kruhu** (r + 4 px), myší nikdy (V-3; myš má Delete a pravé tlačítko).
- **↶ Vrátit operaci (V-4):** přesun vrcholu v režimu algoritmu je položka „Přesun vrcholu X“ – celý
  tah jedna (id gesta), série Shift+šipek na témž vrcholu jedna (`pushInputGrouped`, okno
  `MOVE_GROUP_MS` = 1,5 s); vrácení přesunu nespouští nový běh (krok přehrávače zůstane). Ctrl+Z na
  kresbě v režimu algoritmu = ↶ Vrátit operaci (`GraphEditor` `onRunUndo`). Sezení „Upravit graf“,
  které jen přesouvalo, je položka „Úprava grafu / sítě“ (`graphDrawingKey`). Obal a k-d vracejí přesun
  bodu svou historií.
- **Toky na telefonu (V-2, V-7):** čitelná šířka sítě (`readableWidth`) se počítá při načtení sítě
  a u příkladu z knihy z jeho kresby (`readableBase`) – tah vrcholu ani odkaz s `xy=` ji nezmění.
- **Obal a k-d:** `algos/geometry/planeDrag.ts` + `usePlaneDrag.ts` nad `usePointerDrag` (viz
  „Konvexní obal“): klik na bod = výběr, smaže × / Delete / Odebrat bod, rohy a hrany Q v k-d.
- **Testy:** `dragMath.test.ts`, `usePointerDrag.dom.test.tsx`, `GraphView.drag.dom.test.tsx` (zmrazené
  měřítko, úchop, skok po puštění, překryv), `GraphView.dom.test.ts` (dlouhý stisk, spojení podle
  středu), `pointer.test.ts`, `graphDragFit.test.ts`, `flowDrag.dom.test.tsx` (šířka sítě po přesunu
  a z odkazu), `moveUndo.dom.test.tsx` (↶ a Ctrl+Z u grafů, FF, Dinica, Goldberga), `inputHistory.test.ts`,
  `planeDrag.test.ts`, `HullPage.dom.test.tsx`, `KdTreePage.dom.test.ts`.

## Editor grafu – oprava 8. 11. 2026 (chyba vlastníka „Edit u grafových algoritmů je zabugovanej“)

Rozhodnutí UX-02 (v editoru jen kresba, sloupec výsledku pryč) vlastník zrušil. Platí pro `/graph/*`
(bfs, dfs, topo, dijkstra, bellman-ford, jarnik, boruvka, kruskal, bridges, scc):

- **Sloupec výsledku zůstává (G-01):** v „Upravit graf“ ukazuje fronta/zásobník, tabulky, les
  Union-Find, in/low, zásobník SCC a proměnné **krok 1 nového běhu** (kroky se z upravovaného grafu
  počítají živě – po přidání vrcholu se např. objeví v lese Union-Find). Kresba v editoru zůstává
  neutrální. Panel editoru (`GraphEditorPanel`: orientovaný/ohodnocený, návod, hláška) je nahoře ve
  sloupci (`.ge-panel-slot`, `contain: inline-size`) – šířku sloupce dává výsledek kroku 1 (nejméně
  `min-width: 15rem`, i u prázdného grafu). Po dobu úprav má sloupec šířku zmrazenou ze vstupu do
  editoru (`.graph-result.is-frozen`, inline `width`, `contain: inline-size`; 9. 11. 2026, X-07) – první
  nakreslený vrchol prázdného grafu (nová tabulka) ho nerozšíří a vrchol zůstane pod kliknutím; po
  „Hotovo“ šířku dává nový běh. Prázdný graf po „Hotovo“ zůstává vedle sloupce (zástupný `.gtable`).
- **Přehrávač v editoru stojí (G-04):** stránka dá Visualizeru `frozenPlayer(player)`
  (`views/graphEditPlayer.ts`) – jen krok 1, „připraveno“, ▶ zakázané; mezerník, šipky, Home/End ani
  posuvník nic neposunou. „Hotovo“ připraví nový běh na kroku 1, pozastaveno. **Stejný přístup pro toky**
  (`flowPage`, `GoldbergPage`): `useMemo(() => mode === "edit" ? frozenPlayer(player) : player, …)`.
- **Import / export textem ve sloupci (G-02):** `GraphEditor textPanel="outside"` a stránka kreslí
  `GraphTextPanel` dole ve sloupci výsledku (na desktopu lepí dole, `position: sticky`). Rozbalený panel
  kresbě nebere šířku ani výšku a sloupec se neschovává (pravidlo `display: none` platí už jen pro
  hradla). `graphFitHeight.availableFor` odečítá jen sourozence, kteří leží opravdu pod kresbou (panel
  vedle v gridu – toky, hradla – výšku nebere).
- **Lišta editoru má jeden řádek (G-03):** „Zpět“ (↶) a „Smazat“ (koš) jsou ikonová tlačítka
  s `aria-label` a `title`, stejně vysoká jako textová; `.graph-editor > .ge-toolbar` `nowrap` – kresba
  při vstupu do editoru ani po „Hotovo“ nezmění velikost (i v úzkých panelech toků). Lišta i její
  tlačítka mají `scroll-margin-top` hlavičky (telefon).
- **Nový vrchol pod kurzorem (G-05):** `newVertexSpot` (graphGeometry) – bod kliknutí v mezích
  `vertexBox` (stejné jako tah: viditelná kresba ∩ `keepScaleBox`), u kresby s pevným poměrem stran
  smí do okraje letterboxu (souřadnice mimo 0…1, reducer je pak neořízne), od ostatních vrcholů aspoň
  r₁ + r₂ + 6 px. Když vrchol pod kliknutím ležet nemůže, hláška v `.ge-message` („Vrchol … je posunutý
  vedle kliknutí …“). Rozložení drží kotva (ostatní vrcholy se neposunou).
- **Klávesy a fokus (G-06):** Ctrl+Z a Delete/Backspace v editoru poslouchají na `window` (kromě psaní
  do polí) – fungují i po kliknutí do kresby, kdy fokus zůstal na `<body>`. Po zavření pole ceny (Enter,
  Esc) dostane fokus hrana (Esc ji nechá vybranou → Delete ji smaže), po „Hotovo“ tlačítko „Upravit
  graf“. Ťuknutí na hranu, přes kterou leží neviditelný úchop sousedního vrcholu, vybere hranu
  (`document.elementsFromPoint`, `data-edge`).
- **↶ Vrátit operaci v editoru (G-08):** první klik zahodí sezení úprav (graf jako při vstupu do editoru,
  editor zůstane otevřený, historie beze změny); další kliky vracejí operace. Ctrl+Z dál vrací jednotlivé
  úpravy.
- **BFS s vrstvami (G-09):** pohled „vrstvy V₀…Vₖ“ má lištu s „Upravit graf“ (stejný obal jako
  GraphEditor); editor vrstvy dočasně skryje, po „Hotovo“ se vrátí.
- **`editState` (F-10):** volitelný prop GraphEditoru – stav kresby v editoru místo `emptyState()`
  (toky: síť párování bez popisků „1“).
- **Testy:** `GraphPage.dom.test.ts` (oddíl „editor grafu“), `GraphEditor.dom.test.ts` (lišta, fokus,
  `editState`), `GraphView.dom.test.ts` (hrana pod úchopem), `graphGeometry.newVertex.test.ts`,
  `graphFitHeight.dom.test.ts`, `graphEditorCss.test.ts`. Prohlížeč: audit editoru všech 10 modulů
  (vstup, kreslení, cena, přesun, mazání, Ctrl+Z, import, Hotovo, ↶) při 1280 × 720, 1366 × 768,
  1920 × 1080 myší a 390 × 844 i 1366 × 768 dotykem.

## Model zadávání dat

1. **ActionMenu** (`core/actionModel.ts` reducer + `ActionMenu.tsx`): každá
   akce modulu má vložené argumenty (číslo, seznam, výběr, text) s validací a
   tlačítko „Provést“; Enter v poli akci spustí. Akce „Vytvořit“ nabízí
   varianty (Náhodně, Seřazeně, Vlastní `P = 5, 3, 9`, Prázdný) a „Příklady
   z knihy“; „Výchozí příklad“ je tlačítko v řádku historie (fáze 3) (s číslem obrázku). Po spuštění se kroky
   jen připraví – přehrávač stojí na **kroku 1, pozastavený** (viz
   „Přehrávání“ výše).
   - **Kontrola ve formuláři** (od validace fáze 2): argument může mít
     `check(value)` (chyba u pole hned při psaní – počet čísel 2ᵏ pro síť,
     text hradlové sítě) a akce `check(values, variant)` (kombinace polí –
     soudělná P a N u Rabin-Karpa). Neplatný vstup akci neprovede, formulář
     zůstane otevřený a po pokusu hláška dostane `role="alert"`.
   - **Upozornění na úpravu vstupu** (`notice` u argumentu i akce): platný
     vstup, který se upraví (vynechané mezery a duplicitní jehly, zkrácení,
     velká písmena → malá, hodnoty mod 17 v ℤ₁₇), ukáže „⚠ …“ ve formuláři
     ještě před Enterem a po provedení zůstane pod akcemi (`ranNote`).
     Varování smaže jen psaní uživatele (`{ type: "text", user: true }`),
     ne doplnění pole stránkou po běhu. Stránky KMP, AC a RK už tyto
     poznámky po běhu neopakují.
2. **Přímá manipulace na plátně**:
   - grafy – `GraphEditor` („Upravit graf“ ↔ „Hotovo“): klik do prázdna
     = vrchol, tah z vrcholu na vrchol = hrana, klik na hranu i na číslo
     ceny (`.edge-label-hit`) = cena,
     Delete = smazat, tah = přesun, ↶ Zpět / Ctrl+Z. V režimu algoritmu
     klik (Enter) na vrchol = v₀ a spuštění; Shift+šipky posouvají vrchol
     (o 0,02, v editoru i v režimu algoritmu), samotné šipky přesouvají fokus.
     Kreslení ani přesun **nespouští** přehrávání a přesun nemění pozici
     kroku (kroky se počítají jen ze struktury grafu bez souřadnic). Textový
     zápis hran je ve sbaleném „Import / export textem“ (oběma směry).
     Plátno grafu bez souřadnic se vejde do šířky telefonu
     (`graphCanvasMinWidth`), při kreslení vždy. Návod prázdného grafu je
     překryv uvnitř `.graph-layout` (`.graph-empty-hint`, bez
     `pointer-events`) – po prvním vrcholu zmizí, ale plátno se neposune.
     Panel výsledku (tabulka zásobníku/fronty, T…) je od kroku 1 (prázdná
     tabulka) a zůstává i v editoru (krok 1 nového běhu, viz „Editor grafu –
     oprava 8. 11. 2026“), graf se tak při přehrávání nezúží; šířku panelu dává
     tabulka, řádek proměnných (závorky DFS) se do ní zalomí (`width: 0;
     min-width: 100%`) – ověřeno v Edge: SVG DFS/BFS/Dijkstra má na kroku 1
     i na konci stejnou šířku.
   - stromy, haldy, pole, seznamy – klik (Enter) na prvek vyplní argument
     akce (`pick.ts`). BST/AVL/BB[α]/splay: Insert má vlastní výchozí x,
     které ve stromu ještě není (`DEFAULT_INSERT_X`/`insertDefault` v
     `treeOps.ts`; AVL 27 = dvojitá rotace), Find/Delete klíč ze stromu;
     pole x je dál sdílené.
   - k-d strom – klik do prázdna = bod, klik na bod = výběr (× / Delete smaže), tah bodu = přesun
     (rovina během tahu ukazuje přestavěné dělení), tah z prázdna = nový obdélník Q, Q jde táhnout
     za rohy (čtverečky), hrany i vnitřek; rovina je jedna zastávka Tabu (Enter = výběr, Delete,
     Shift+šipky přeskočí obsazené souřadnice). `algos/geometry/usePlaneDrag.ts`, `planeDrag.ts`.
3. **Odkaz** – vstup je v adrese za `#` (`?a=…` třídění, `?g=…&d=&w=&s=&p=&xy=`
   grafy, `?k=…` stromy, `?t=…` texty a posloupnosti, `?pts=…&q=…` k-d strom,
   `?j=…&s=…` KMP / Aho-Corasicková / Rabin-Karp, `?net=…&c=…&in=…&xy=…` hradlové
   sítě, `?x=…&y=…` sčítačka, `?net=…&a=…` třídicí sítě, `?p=…&op=…&f=z17` FFT,
   `?x=…&f=z17` FFT2 – tabulka v oddílu „Fáze 2“); „Kopírovat
   odkaz“ předá aktuální stav. Odkaz se
   při otevření stránky nepřepisuje (ani ve StrictMode). Vadný vstup třídění
   z odkazu (`?a=abc,500`) ukáže nad plátnem hlášku jako u grafů („Vstup
   z odkazu nešel použít … – zobrazen výchozí příklad.“), částečně vadný
   použije platná čísla a ohlásí zbytek; adresa zůstane, dokud uživatel
   vstup nezmění (`urlInputNotice` v `sorting/input.ts`).

### Hešování – parametr `t` (E4, 8. 11. 2026)

Otevřená adresace: `t=m:funkce:seed:klíče` – seznam klíčů se vkládá
postupně (význam beze změny), **nebo** seznam všech m buněk: `~` = náhrobek,
`_` = prázdná buňka (např. `16:mod:1:_,_,_,3,~,35,20,7,_,41,_,_,_,_,_,_`);
plná tabulka bez `_` i `~` má navíc `:b` (`4:mod:1:5,4,2,3:b`), aby se
nepletla se seznamem klíčů. Seznam klíčů se zapisuje, kdykoli z něj načtení
postaví stejné buňky (výchozí příklad a tabulky jen po vkládání mají odkaz
jako dřív). Kukačka: `t=m:seed:klíče`, případně seznam buněk s `_` (plná
s `:b`), když pořadí klíčů umístění nezachová (Delete uvolní f(x) klíče
v g(x)). Neplatný seznam (špatný počet, opakovaný klíč, klíč, který Find
nenajde, kukaččí klíč mimo f(x)/g(x), `~` u řetězení nebo kukačky) otevře
výchozí příklad. Kód `hashShare`, `parseCells` v `hashing/ui.ts`; round-trip
ověřen v prohlížeči (Delete(19) v otevřené adresaci, Delete každého klíče
kukačky → odkaz → stejné buňky).

### (a,b)-strom – parametr `var` (E2)

`var=kniha` = varianta Průvodce 8.3 (nový, volitelný); bez něj přednášková
varianta jako dřív. `?ex=obr-8-7a|obr-8-7b|obr-8-8|obr-8-9|obr-8-10` otevře
příklad z knihy, přepne na knižní variantu a rozbalí jeho první operaci
s jejím x. Po operaci nese odkaz množinu klíčů (`k=`), tvar se při otevření
postaví vkládáním.

### Grafy – parametry odkazu

`g` = text hran (řádek `u v [cena]`, samotný vrchol = izolovaný), `d` / `w`
= orientovaný / ohodnocený (0/1), `s` = název v₀, `p` = id knižní předlohy,
jejíž souřadnice upravený graf dědí (nový, volitelný). Výchozí příklad se
startem z knihy dá prázdnou adresu. **Odkaz s `g=` bez `d=`/`w=`** (ručně
psaný) dostane typ jako ve staré verzi (`LEGACY_LINK_TYPE` v
`graphPageModel.ts`: BFS neorientovaný, DFS orientovaný, Dijkstra a kostry
neorientované ohodnocené), ne typ dnešního výchozího příkladu.

**`xy` = souřadnice vrcholů** (nový, volitelný; rozhodnutí D2): `x₀_y₀_x₁_y₁…`
v celých desetitisícinách (0…10000 = 0…1; záporné a nad 1 jdou u knižních
kreseb, |hodnota| ≤ 10) v pořadí vrcholů, jak je přečte `parseGraphInput`
z `g=`. Volitelný první údaj `a<desetitisíciny>` je poměr stran; `a0` =
volná kresba bez poměru stran a bez knižních ohnutí hran. Bez `g=` patří
k výchozímu příkladu (přesun ve výchozím DFS dá `#/graph/dfs?xy=…`). `xy` se
píše jen tehdy, když se kresba liší od té, kterou by odkaz bez něj otevřel
(ruční kreslení, přesun vrcholu) – nezměněné předvolby, výchozí příklady
i náhodný graf zůstávají krátké. Odkaz bez `xy` se otevře přesně jako dřív
(`graphFromUrl` = `buildGraph(spec).graph`). Vadné `xy` (lichý počet,
nečíselný údaj, mimo ±10, jiný počet vrcholů) → automatické rozložení
a hláška „Souřadnice vrcholů z odkazu nešly použít – graf je rozložen
automaticky.“; u vadného `g=` se `xy` ignoruje. Přesun vrcholu se do adresy
zapíše 250 ms po posledním pohybu (`URL_MOVE_DELAY_MS` v `GraphPage.tsx`,
prohlížeče škrtí `replaceState`), ostatní změny hned; „Jiný alg.“ `xy`
přenáší. Ohnutí hran se do odkazu nepíše (smazaná a znovu přidaná knižní
hrana dostane po otevření ohnutí z knihy); „Kopírovat odkaz“ do 250 ms po
přesunu zkopíruje ještě předchozí adresu. Logika: `encodeXY` / `decodeXY` /
`graphFromUrl` / `positionsParam` v `graphPageModel.ts`, testy
`graphLinkXY.test.ts`, `GraphLinkXY.dom.test.ts`.

## Předvolby z knihy

Grafy (`algos/graphs/presets.ts`, nabídka „Příklady z knihy“; výchozí
příklad podle `defaultPresetId`):

| id | Obrázek (strana) | Výchozí pro | Poznámka |
| --- | --- | --- | --- |
| `pig` | Obr. 5.5 „Prasátko“ (113) | BFS, DFS | start 0; výsledky = obr. 5.8 (vrstvy) a 5.9 (in/out, třídy hran) |
| `residues` | Obr. 5.4 Graf zbytků, k = 7 (109) | – | |
| `bridges` | Obr. 5.10 Mosty a artikulace (123) | – | popisky A, B, … doplněné |
| `scc` | Obr. 5.13 Silně souvislé komponenty (131) | – | |
| `condensation` | Obr. 5.13 Graf komponent – DAG (131) | Topologické uspořádání | |
| `mst4` | Obr. 7.1 Mřížka 4 × 4 (168) | – | dvě minimální kostry o ceně 31 |
| `mst3` | Obr. 7.2 Mřížka 3 × 3 (169) | Jarník (start E), Kruskal | týž graf na obr. 7.5 (Borůvka) a 7.6 (Kruskal) |

Dijkstra má výchozí textovou předvolbu „Ohodnocený graf“ (silové
rozložení). Kresba: předvolba se souřadnicemi **nikdy** neprochází silovým
rozložením, `graphViewport` ji vepíše se zachovaným poměrem stran,
`drawingExtent` počítá i s oblouky a smyčkami. Po úpravě textu zůstanou
knižní souřadnice vrcholům se stejným jménem. Přepínače kresby: DFS „styl
knihy“ (nestromové hrany tečkovaně, typ v popisku – obr. 5.9), BFS „vrstvy
V₀…Vₖ“ (`layers.ts`, obr. 5.8: zpětná hrana 6→0 obloukem pod kresbou,
popisek D= vedle vrcholu, ze kterého vede svislá hrana; nedosažitelné
vrcholy 5 a 8 mají vlastní sloupec vpravo – kniha je vynechává).

Ostatní moduly:

- Binární halda – obr. 4.1, 4.2 (Insert(1)), 4.3 (ExtractMin)
  (`structures/bookExample.ts`); intervalový strom – obr. 4.6.
- BST / AVL / BB[α] – obr. 8.1–8.6 (`trees/bookExamples.ts`).
- Magisterské: amortizace – L01; splay – L02; (2,4)-strom – L03;
  stránkování – L04 (vč. Béládyho anomálie); sufixové pole – L05.

Moduly fáze 2 (nabídka „Příklady z knihy“; data obrázků v `*.fixtures.ts`,
výsledky ověřené testy proti knize):

| Modul | Příklady (obrázek / cvičení, strana) | Výchozí |
| --- | --- | --- |
| KMP | kokos v clanekokokosu (320–321); obr. 13.1 barbarossa (321); bananas, anna (319); cv. 1 aaab (324; naivně 28 / KMP 17 porovnání); aaaa (zarážka) | kokos |
| Aho-Corasicková | obr. 13.2 se senem barbara (326) – 15 stavů, 4 zkratky; bara (325–326); barbarabaraba; cv. 13.3.1 ve třech částech (12 / 26 / 34 stavů); obr. 13.1 barbarossa (Zpět = Z z KMP); cv. 13.3.2 (9 výskytů) | obr. 13.2 |
| Rabin-Karp | sena ze str. 319–320: kokos N = 101 (bez kolize), N = 17 (falešná shoda), bananas N = 13, nejhorší případ aaa, N = 2 – P a N volené (kniha nemá číselný příklad) | kokos, N = 101 |
| Hradlové sítě | obr. 15.1 majorita (382); obr. 15.2 vlevo or řetězcem n = 4 a vpravo or stromem n = 8 (385); cv. 15.1.4 xor ze čtyř nand (385); školní sčítačka ze hradel k obr. 15.3, n = 2 (387) | obr. 15.1, vstup 101 |
| Sčítačka | obr. 15.4 průběh paralelního sčítání n = 8; obr. 15.3 školně (vstup z obr. 15.4); jednobitové bloky 0011 + 0101 (388) | obr. 15.4, obě souběžně |
| Třídicí sítě | obr. 15.6 bublinka jak je zapsaná (393); obr. 15.7 po vrstvách, 2n − 3 taktů; obr. 15.8 bitonická B₈ (394); obr. 15.9 třídička T₈ (395); obr. 15.10 separátor S₈ (396–397); cv. 15.3.6 0-1 princip (397); cv. 15.3.7 Batcher (398, 19 komparátorů, hloubka 6) | T₈ |
| FFT | p = (0, …, 7); cv. 17.3.2 (432): (1, …, 1), (1, −1, …), (1, 0, 1, 0, …); inverzní FFT (Ω⁻¹ = Ω̄ / n, 432); cv. 17.5.2 123 × 456 (440); ℤ₁₇ (439): p = (0, …, 7) a (1, 2, 3) · (4, 5, 6); (1, 2, 3) · (4, 5, 6) v ℂ | p = (0, …, 7) v ℂ |
| FFT2 | obr. 17.4 x = (0, …, 7) (438), totéž po vrstvách (439); cv. 17.3.2; ℤ₁₇ (439); n = 4 a n = 16 (vlastní) | obr. 17.4 |

### Jak přidat knižní předvolbu grafu

1. Vyrenderuj stranu PDF a odečti mřížku vrcholů a hrany (pořadí hran = pořadí
   v textu hran; ceny; ohnuté hrany jako `bends: { "u>v": ohnutí }`).
2. **Červený test**: do `algos/graphs/book.fixtures.ts` zapiš očekávání
   (souřadnice / výsledek algoritmu z knihy) a do `book.test.ts` test, že
   předvolba je přesně podle obrázku a algoritmus dá výsledek z knihy.
3. Do `presets.ts` přidej `book({ id, label: "Obr. X.Y …", page, directed,
   weighted, grid, edges, bends?, note?, start? })` a zařaď ji do `PRESETS`
   (nové na konec; text hran stávajících předvoleb neměň – odkazy nesou
   text a podle něj se předvolba pozná).
   `start` = v₀ z knihy (výchozí v₀, když uživatel žádný nezvolil).
4. V nabídce „Příklady z knihy“ se objeví sama; má-li být výchozí, uprav
   `defaultPresetId` (a test „výchozí příklad“ v `graphPageModel.test.ts`).
5. Ověř snímkem 1400 px i 390 px proti obrázku v PDF.

## UX testy a jak je spustit

Vlastník 7. 11. 2026: žádný Playwright – scénáře jsou v jsdom (součást
`npm test`) a rozložení se měří skriptem v headless Edge.

- **Scénáře v jsdom** (`npm test`): `allModules.dom.test.tsx` (všech 41
  modulů: otevření, první operace, stojí na kroku 1), `noAutoplay.test.ts`,
  `deepLinks.test.tsx` (sdílené odkazy), `keyboardFlow.dom.test.tsx` (jen
  klávesnice: Enter v poli → mezerník přehraje → fokus na ▶ → mezerník
  pozastaví), `sidebar.dom.test.tsx`, `landing/*.test.ts*` (hledání, filtr,
  historie, náhledy), `core/ActionMenu.dom.test.ts` (varování, sbalení),
  `core/Visualizer.dom.test.ts` (posun plátna), stránky modulů
  (`algos/*/page*.test.ts*`), CSS pravidla (`cssScope`, `motionCss`).
  Jeden soubor: `npx vitest run src/algo/keyboardFlow.dom.test.tsx`.
- **Rozložení v prohlížeči** (ruční, po `npm run build`):
  `node scripts/measure-algo-fit.mjs --w 1280 --h 720` (dále 1366 × 768,
  1920 × 1080; telefon `--w 390 --h 844`; `--port` volný port, `--shots
  složka` uloží snímky). Návratový kód 0 = vše se vejde. `--edit` přidá
  stav s otevřeným „Upravit graf / síť“; cesty smí mít parametry
  (`/flow/dinic?ex=obr-14-6`).
- Stav 7. 11. 2026 (po validaci fáze 1): 33/33 při 1280 × 720,
  1366 × 768 a 1920 × 1080 ve všech stavech včetně skutečné operace;
  390 × 844 bez zakrytého plátna (Kruskal opraven). Po integraci fáze 2
  (7. 11. 2026, skutečné operace nových modulů – Postavit automat, Hledat,
  Spočítat(vstupy), Sečíst(x, y), T₈(P), FFT(p), FFT2(x)): **41/41** při
  1280 × 720, 1366 × 768 a 1920 × 1080 ve všech čtyřech stavech, po operaci
  vždy „Přehrát, krok 1 / N“; 390 × 844 bez zakrytého plátna. Nejmenší
  měřítko nových modulů při 1280 × 720 po operaci: Aho-Corasicková 1 (po
  načtení 0,91), třídicí síť 0,96, FFT 0,98. Po opravách z validace fáze 2 znovu 41/41 při
  1280 × 720, 1366 × 768, 1920 × 1080 i 390 × 844 (bez zakrytého plátna),
  po operaci vždy krok 1, pozastaveno.
- Fáze 3 (7. 11. 2026): skript hlásí i vnitřní přetečení plátna („PLÁTNO
  PŘETÉKÁ“). **41/41** při 1280 × 720, 1366 × 768, 1920 × 1080 (všechny
  čtyři stavy včetně rozbaleného popisu) i 390 × 844; po operaci všech 41
  „Přehrát, krok 1 / N“.
- Po D1–D3 (8. 11. 2026): **41/41** při 1280 × 720, 1366 × 768, 1920 × 1080
  i 390 × 844, po operaci všech 41 „Přehrát, krok 1 / N“.
- Klávesnice a odkazy v Edge (8. 11. 2026, ruční skripty mimo repo): staré
  odkazy grafů/hradel bez `xy=` beze změny a bez přepisu adresy; 15 vadných
  `xy=` u grafů a 11 u hradel → hláška, kresba jako bez nich, krok 1; mezerník
  a šipky v poli akce, textarea, ceně hrany i hledání na úvodní stránce patří
  poli; na kresbě mezerník přehraje / pozastaví, šipky jen fokus, Esc →
  „Vytvořit“, Shift+šipky posunou vrchol / hradlo a adresa dostane `xy=`;
  všech 41 modulů má skupinu i prvky se jménem pro čtečku.

## Testy

- Čistá logika v `.ts` (prostředí node): algoritmy, `*PageModel.ts`,
  `actionModel.ts`, `structure.ts`, `player.ts`, geometrie pohledů,
  `graphEdit.ts`, `layers.ts`, knižní předvolby (`book.test.ts` proti
  `book.fixtures.ts` – výsledky algoritmů se ověřují na skutečných
  algoritmech).
- Tenké DOM testy (`// @vitest-environment jsdom` na 1. řádku, pomůcky
  `core/domTest.ts`): stránky grafů, třídění, k-d, hešování, ActionMenu,
  GraphEditor, posun plátna (`Visualizer.dom.test.ts`), animace
  (`useTween.dom.test.ts`, `stepTransition.dom.test.ts`,
  `useFlip.dom.test.ts`). jsdom nemá `getScreenCTM` – testy ho podstrčí
  (matice 1 : 1) nebo předají `screenMatrix`.
- `core/cssScope.test.ts` hlídá CSS: vše pod `.algo-root`, proměnné
  `--algo-*`, sticky pod hlavičkou webu, z-index < 1000, lišta přehrávání
  v jednom řádku, tip bez záporného okraje, pravidla rozložení na jednu
  obrazovku (výška kostry z `100dvh`, mřížka, zmenšování SVG, sbalený popis,
  nejmenší výška pseudokódu, akce v řádku, posun plátna pod hlavičku, stíny
  posouvání). Skutečné rozložení měří `scripts/measure-algo-fit.mjs`.
- Celá aplikace (7. 11. 2026, po validaci fáze 1): 112 souborů / 3128 testů (`npx tsc -b`, `npm run lint`, `npm run build` bez chyb).
  Po integraci fáze 2 (7. 11. 2026): 153 souborů / 3722 testů, brána bez chyb a varování.
  Po validaci fáze 2 (7. 11. 2026): 157 souborů / 3774 testů, brána bez chyb a varování.
  Po fázi 3 (7. 11. 2026): 170 souborů / 4031 testů, brána bez chyb a varování.
  Po D1–D3 (8. 11. 2026): 176 souborů / 4149 testů, brána bez chyb a varování.
  Po dávce 2 E1–E7 (8. 11. 2026): 195 souborů / 4321 testů, brána bez chyb a varování.
  Po zbytcích dávky 2 (8. 11. 2026): 199 souborů / 4381 testů, brána bez chyb a varování.

## Otevřené body

- **Po opravě editoru toků (9. 11. 2026) zůstává:** vlastní velké párování (8 + 8 a víc vrcholů) –
  vrstevnatá R Dinica na konci běhu při ≤ 1366 × 768 má kroužky na minimu a mírně se překrývají,
  kresba výšek Goldberga (18+ sloupců) se při ≤ 1366 × 768 a na telefonu posouvá do strany (při
  1920 × 1080 bez posunu); obr. 14.7 u Goldberga na telefonu (16 sloupců výšek) totéž. Řádek proměnných
  Goldberga a Dinica se u párování v užším panelu mezi kroky zalamuje na dva až tři řádky a kresba nad
  ním se o ~26 px na řádek přeměří (bylo i dřív, mimo editor). Po „Hotovo“ drží kresba grafu kotvu (polohy jako v editoru), odkaz otevřený znovu kresbu
  vystředí (rozdíl poloh až desítky px, záměr G-05). Borůvka: popisky komponent se v režimu algoritmu
  mohou překrývat (G-10, mimo editor, neřešeno).

- Rozhodnuto 7. 11. 2026: výchozí příklad Topologického uspořádání zůstává
  obr. 5.13; „DAG (plánování činností)“ je ve Vytvořit ▸ další příklady
  (hlídá `graphActions.test.ts`). Hlavička webu má pod 600 px zkrácené
  popisky „Průvodce · Kredity · Mapa · Algoritmy“ (`data-short` + CSS
  v `src/styles/global.css`, plné jméno v `aria-label`/`title`; hlídá
  `src/shared/SiteHeader.test.tsx`) a na 390 px se vejde na jeden řádek.
- Dluh: `tsconfig.algo.json` bez `noUncheckedIndexedAccess` (viz
  `docs/migrace.md`).
- **Rozhodnuto 7. 11. 2026, hotovo 8. 11. 2026 (D1–D3):** popisky KMP
  „Postavit automat(ι)“ / „Hledat(σ)“ (ι = jehla, σ = seno; AC má dál
  „Hledat(S)“); `xy=` v odkazu grafů a hradel; roving tabindex (viz
  „Klávesnice na kresbě“). Beze změny zůstává: FFT s desetinnou tečkou,
  Rabin–Karp s P = 31 a N = 101 / 17 (volené, kniha číselný příklad nemá).
- **Hotovo 8. 11. 2026 (dávka 2, E1–E7 – viz oddíl „Dávka 2“):** (a,b)-strom
  s variantou Průvodce 8.3 (výchozí zůstává přednášková), splay Delete podle
  obr. 9.7, náhrobky a umístění kukačky v odkazu `t=`, les Union-Find
  u Kruskala, desetinná čárka (mimo FFT), graf amortizace, stopa sond
  a vyhazování, větší kresby Rabin–Karp / sufixové pole / bezzámkový zásobník,
  čitelné odkazy bez `%2C`.
- **Zbytky dávky 2 hotové 8. 11. 2026** (viz „Zbytky dávky 2“ v oddílu
  Dávka 2). Zůstává jen: na telefonu (390 px) mají grafové moduly s lesem /
  tabulkou delší stránku (posouvání je tam povolené); malé (a,b)-stromy
  (obr. 8.7–8.10) vyplní při 1920 × 1080 kvůli stropu hladiny 200 px jen
  ~40 % výšky plátna (při 1280 × 720 ~92 %; BST při 1920 × 1080 ~53 %).
- **K rozhodnutí vlastníka** (dřívější doporučení, nenaplánováno):
  - KMP / AC: odkaz nese vstup, ne operaci (přijmout pravidlo, `op=`
    nezavádět);
  - „Příklady z knihy“ u struktur jako varianta Vytvořit, jinde samostatná
    akce (nechat);
  - zbloudilá `src/algo/node_modules/.vite` (cache Vitestu) – smazat jen se
    souhlasem.
- Z fáze 2 zůstává: přepínač „Bez zkratek (cvičení 3)“ u Aho–Corasickové
  není; ohyby zpětných hran mimo obr. 13.2 jsou heuristika; hradlové sítě –
  vrcholy jdou přesouvat jen v režimu úprav, pravdivostní tabulka do 6 vstupů,
  paleta bez konstant 0/1, hloubka včetně vstupů a výstupů (vysvětleno
  v nápovědě); dlouhý aktivní řádek pseudokódu může odrolovat záhlaví;
  „Přečti znak(x)“ má `maxlength` 1.
- **Z fáze 4 zůstává** (8. 11. 2026): Dinic na desktopu pod 1600 × 900
  začíná kresbou „jen R“ (obě kresby jdou zapnout přepínačem); u mostů při
  1280 × 720 se tabulka in/low (11 řádků) a proměnné M/A posouvají uvnitř
  panelu výsledku (jako u Kruskala); obr. 12.4 a 12.6 – aplikace najde jinou,
  stejně dobrou cestu než kniha (vysvětleno v poznámce u příkladu); u obr.
  14.7 jsou kapacity doplněné (kniha je nemá); UX-12 vyřešeno 8. 11. 2026
  (klik i Enter na bod v obalu / k-d bod vybere, maže Delete nebo ×).
- **Z tažení bodů zůstává** (8. 11. 2026; nepoužívaný `views/usePlanePointer.ts` smazán – obal
  a k-d používají `usePlaneDrag`): u vlastní sítě (bez příkladu z knihy)
  se čitelná šířka na telefonu počítá z poloh v `xy=` (u příkladů z knihy z jeho kresby); kotva
  rozložení po tahu se po znovunačtení stránky nepamatuje (kresba se vystředí, měřítko se nezmenší);
  k-d rovina má dál `touch-action: none` (tah z prázdna kreslí Q).
- Úklid (jen se souhlasem vlastníka): nasazení
  `dist/algo/` místo `~/WWW/algo` (bezpečná výměna souborů jako dřívější
  `publish.mjs`), README.
