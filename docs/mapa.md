# Modul Mapa předmětů

Stará verze: `specializace/index.html` (D3 v7 z CDN). Nová: `src/map/`.

## Co dělá

Silový graf (D3 `forceSimulation`) předmětů a specializací zvoleného roku a
oboru. Uživatel vybere jednu nebo více specializací (filtr i podle stupně
Bc./Mgr.) a mapa zvýrazní předměty, které mají vybrané specializace společné –
pomůcka při rozhodování mezi specializacemi.

## Data

- uzly: `nodes.json` – `spec` (velké barevné kruhy, `color`, `radius`) a `subj`
  (malé kruhy, `radius`, `shared_count` = v kolika specializacích se předmět
  vyskytuje); `program_req` se v mapě nepoužívá
- hrany: `links.json` (`source` = předmět, `target` = specializace)

## Chování, které musí zůstat

- Výběr roku a oboru stejný jako v kalkulačce (sdílený hook `useStudyData`
  a komponenty `YearSelect` / `FieldSelect`; záložní seznam roků mapy je
  `["2025-2026"]`). Změna roku či oboru vrátí filtr na „Bakalářské“ a graf
  sestaví znovu – jako reload staré stránky.
- Simulace: `alphaDecay(0.035)`, `forceLink` (distance 30, strength 0.1),
  `forceManyBody` (spec: 0, subj: −25), `forceCollide` (radius + 6,
  `iterations(1)`), vlastní síla `pullToSpecs` přitahující předměty ke
  specializacím, s nimiž jsou ve filtru spojené (cíle předpočítané při změně
  filtru – `rebuildPullTargets`) – přeneseno 1:1 ze starého kódu.
- Do středu se táhne předmět, který je „společný povinný“, nebo je spojený se
  všemi viditelnými specializacemi, pokud jich je víc než jedna.
- „Společný povinný“ = `course_type` mandatory a předmět je povinný ve všech
  specializacích některého stupně, který má aspoň 2 specializace
  (`isCommonMandatory`). Určuje základní barvu, barvu ve výběru, štítek
  v tooltipu a tah do středu.
- Zoom/pan (`d3.zoom`), tlačítka přiblížit/oddálit (`scaleBy` 1.4 / 1/1.4,
  přechod 200 ms), reset pohledu (přechod 300 ms) a celá obrazovka.
- Kliknutí na specializaci ji přepne v aktivním výběru; zvýraznění hran
  barvou cílové specializace, ostatní ztlumené. Předměty sdílené všemi
  vybranými specializacemi se zvýrazní.
- Kliknutí na předmět otevře popover: kód předmětu, odkazy SIS a WIKI a
  tlačítko „Zobrazit specializace“ / „Odebrat z výběru specializací“. To
  aditivně zvýrazní specializace vybraných předmětů – AND (ve všech) a OR
  (aspoň v jednom), `computeSubjHighlightIntersection`; nezávisle na výběru
  specializací. Popover neukazuje kredity ani semestr.
- Tooltip při hoveru, zalamování popisků (`wrap`).
- Skryté prvky filtru mají `visibility: hidden` s přechodem opacity.

## Implementace v Reactu

- D3 řídí SVG uvnitř `useEffect` nad `ref`em; React nerenderuje jednotlivé
  uzly (výkon – stovky uzlů). Stav výběru specializací drž v Reactu a do D3
  ho propisuj přes efekt.
- Simulaci při změně dat zastav (`simulation.stop()`) v cleanupu efektu.
- D3 jako npm závislost (`d3`, `@types/d3`), ne CDN.

## Nová implementace (`src/map/`, `src/lib/map.ts`)

- `MapPage.tsx` – nadpis, výběr roku/oboru, filtr stupně, legenda;
  `MapGraph.tsx` + `graph.ts` – D3 graf; `SubjectPopover.tsx` – popover.
- Čistá logika (filtr stupně, barvy, společné povinné, tah do středu,
  tooltipy, zalamování, pozice popoveru) je v `src/lib/map.ts`.
- Uzly `program_req` se do grafu nepřidávají. Stará stránka je vykreslovala
  jako neviditelné kroužky, které ve filtru „Všechny stupně“ odpuzovaly
  předměty, takže polohy předmětů se v tomto filtru mírně liší; ve filtrech
  Bc./Mgr. je výsledek shodný (`graph.legacy.test.tsx`).
