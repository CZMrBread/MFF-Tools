# Výpočetní algoritmy

Popis výpočtů Kalkulačky kreditů a záložky Rozvrh. Kód je v `src/lib/credits.ts`
a `src/lib/schedule.ts` – čisté funkce bez Reactu, bez DOM a bez globálního stavu.
Při změně výpočtu tento soubor aktualizuj.

Referencí chování je stará stránka `kalkulačka/index.html` ve stavu `e0a6ccf`
(živá verze s obory, `includes_groups` a skupinami povinného výběru). Nový kód
počítá **totéž včetně zvláštností** (viz [Zachované zvláštnosti](#zachované-zvláštnosti));
shodu hlídají testy nad záznamem staré stránky (viz [Ověření](#ověření-shody-se-starou-stránkou)).

## Vstupy

| Vstup | Typ | Odkud |
| --- | --- | --- |
| data roku a oboru | `StudyIndex` (`subjects`, `requirementBySpec`, `specById`, `subjectById`) | `data/<rok>/<obor>/nodes.json` přes `src/lib/data.ts` |
| splněné předměty | `ReadonlySet<string>` (id) | `lsKey('mff_completed')` |
| předměty „bez kreditů" | `ReadonlySet<string>` (id) | `lsKey('mff_nocredit')` |
| zařazení do rozvrhu | `Placements` = `{ [id]: { year, semester } }` | `lsKey('mff_sched_placements_<spec>')` |
| počet ročníků | `number \| null` | `lsKey('mff_sched_years_<spec>')` |

`lsKey(name)` = `name + '_' + rok`, u jiného oboru než informatika ještě
`+ '_' + obor` (viz `src/lib/storage.ts`). Výpočty o roku ani oboru nic nevědí –
dostávají jen data a množiny; obor se uplatní jen v nadpisu (`degreeHeading`).

Většina výpočtů nebere množinu splněných přímo, ale predikát
`IsDone = (id) => boolean`: v Kalkulačce `doneIn(completed)`, v Rozvrhu
`placedIn(placements)` (předmět je „hotový", když je zařazený). „Bez kreditů" se
v obou případech bere z téže množiny `noCredit`.

Kredity předmětu jsou `subject.credits || 0` (`subjectCredits`). Stará stránka je
brala přes `byId[id].credits` (poslední předmět s daným id); v datech žádné id
předmětu není dvakrát, takže jde o totéž. Kredity se nikde nezaokrouhlují; v datech
jsou celá čísla.

## Řazení předmětů

`compareSubjects(a, b)` = `a.label.localeCompare(b.label, 'cs')` (implementováno
přes `Intl.Collator('cs')`, výsledek je stejný). `sortSubjects` vrací nové pole,
řazení je stabilní – předměty se stejným názvem zůstávají v pořadí dat. Název
(`label`) začíná kódem předmětu, takže se v praxi řadí podle kódu.

## Výběr specializace

`specsForDegree(specs, degree)` = specializace s `study_type === degree` v pořadí
dat (nabídka po volbě stupně studia).

## Plán specializace – `planFor`, `buildPlan`

`planFor(index, specId)` najde požadavky `index.requirementBySpec.get(specId)` a
zavolá `buildPlan(req, index.subjects, specId)`. Pro specializaci bez požadavků
vrací `null` (stará stránka by spadla; při obnově uloženého výběru proto platí
podmínka starého `init`: uloženou specializaci použít jen když pro ni požadavky
existují).

`buildPlan` vrací `StudyPlan { req, mandatory, groups }`:

- `mandatory` – předměty, jejichž `mandatory_in` obsahuje `specId`, seřazené.
- `groups` – pro každou definici z `req.pv_groups` (v pořadí dat) předměty
  s `pv_group[specId] === def.group`, seřazené. Porovnání je striktní (`1` a
  `"1"` jsou různé skupiny). **Skupiny bez předmětů se vynechají.**
- Předmět, jehož `pv_group[specId]` neodpovídá žádné definici (v datech
  `"doporucene"` = `RECOMMENDED_PV_GROUP`, doporučený předmět), v plánu není –
  nezobrazí se a nikam se nepočítá.
- `group.counted` – předměty, jejichž kredity se počítají do minima skupiny:
  vlastní předměty skupiny a předměty skupin uvedených v `def.includes_groups`
  (jen přímo uvedené skupiny, které v plánu zůstaly – prázdná nebo neexistující
  se ignoruje; bez přechodného uzávěru), každý předmět jednou podle `id`
  (pozice prvního výskytu). Bez `includes_groups` platí `counted = subjects`.
  `group.includedLabels` jsou názvy započítaných podskupin v pořadí
  `includes_groups`. V datech `includes_groups` používá matematika 2026-2027
  (např. „O" u Matematických struktur zahrnuje A, G a KL).

`planSubjectsById(plan)` = všechny předměty plánu (povinné + vlastní předměty
skupin) podle `id`; jen tyto předměty mohou být v rozvrhu.

`isMasterPlan(plan)` = `req.level === 'mgr'`; `degreeLabel(plan)` =
„Magisterské studium" / „Bakalářské studium". Nadpis nad názvem specializace
(Kalkulačka i Rozvrh) je `degreeHeading(plan, obor)` = `degreeLabel(plan) +
fieldSuffix(obor)`; `fieldSuffix(obor)` = „ · " + `fieldLabel(obor)` (název
z `FIELD_LABELS`, neznámý obor svým id), bez oboru prázdný řetězec (starý
`oborSuffix`). Příklad: „Bakalářské studium · Informatika".

## Skupiny povinného výběru – `isMandatoryChoice`, `groupTitle`

`isMandatoryChoice(def)` je pravda, když `def.mandatory_choice === true`, nebo
`def.group === 'telocvik'`, nebo `String(def.group)` odpovídá `/^alt\d*$/`
(`alt`, `alt1`, `alt2`, …; číselné id skupiny nikdy). V datech jde o tělesnou
výchovu (všechny obory), alternativy „právě jeden z" `alt1`/`alt2` (fyzika) a
skupiny s `mandatory_choice: true` (informatika, např. Týmový projekt). Podle
Karolinky jsou to povinné předměty:

- nadpis bloku `groupTitle(def)` je „Povinné — <label>", u ostatních skupin
  „Povinně volitelné — <label>";
- v `planTotals` patří do `choiceGroups`, ostatní skupiny do `pvGroups`;
- jejich kredity se počítají do „Celkem kreditů", ale **ne** do „PV celkem"
  (`pv_overall_min` je v datech bez nich);
- jejich minima patří k podmínce „povinné" a v souhrnu mají pruh v oddílu
  „Povinné" (pod pruhem povinných předmětů).

## Efektivní minimum – `effMin`

```
effMin(rawMin, subjects, noCredit) =
  null                                   když rawMin == null
  max(0, rawMin − Σ kredity předmětů ze `subjects`, které jsou v `noCredit`)
```

Předmět „bez kreditů" tedy sníží minimum o své kredity, nejvýše na 0. Součet
samotný vrací `noCreditCredits(subjects, noCredit)` (starý `ncCreditsIn`).

## Průběh skupiny – `groupProgress`

Pro skupinu `g`, predikát `isDone` a množinu `noCredit`:

- `earned` = Σ kredity hotových předmětů z `g.counted`
- `rawMin` = `g.def.min_credits` (`null` = bez limitu, `0` = bez vlastního limitu)
- `min` = `effMin(rawMin, g.counted, noCredit)`
- `noCreditCredits` = kredity „bez kreditů" v `g.counted`
- `satisfied` = `!(min && earned < min)` – nesplněná je jen skupina s kladným
  efektivním minimem a méně kredity (starý `groupBars`)
- `hasBar` = `Boolean(rawMin)` – pruh v souhrnu má jen skupina s nenulovým
  minimem **z dat** (i když ho „bez kreditů" snížilo na 0)

## Součty – `planTotals(plan, isDone, noCredit)`

Starý `planTotals` + součty povinných z `renderSummary`:

- `mandEarned` = Σ kredity hotových povinných; `mandTotal` = Σ kredity všech
  povinných (pole `req.mandatory_credits` se nepoužívá)
- `choiceGroups` / `pvGroups` = skupiny plánu s / bez `isMandatoryChoice`,
  v pořadí plánu
- `allPv` = sjednocení vlastních předmětů (`subjects`, ne `counted`) všech
  `pvGroups`, každý předmět jednou podle id
- `pvEarned` = Σ kredity hotových předmětů z `allPv`
- `choiceEarned` = Σ přes `choiceGroups` kreditů hotových vlastních předmětů
  skupiny (`subjects`)
- `choiceMin` = Σ `min_credits || 0` přes `choiceGroups` (nesnížené)
- `ncTotal` = kredity „bez kreditů" v `allPv` („bez kreditů" ve skupině
  povinného výběru „PV celkem" nesnižuje)
- `effOverall` = `max(0, pv_overall_min − ncTotal)`, nebo `null`, když plán
  `pv_overall_min` nemá
- `totalEarned` = `mandEarned + choiceEarned + pvEarned`

## Souhrn a stav „splněno" – `planSummary(plan, isDone, noCredit)`

K součtům přidává průběh skupin (`choiceProgress` = `groupProgress` skupin
`choiceGroups`, `pvProgress` totéž pro `pvGroups`) a:

- `structuralFree` = `total_credits − mandTotal − choiceMin − (effOverall || 0)`
  – odhad kreditů za volitelné předměty. Zobrazuje se jen v Kalkulačce a jen
  když je kladný („z toho volitelné (libovolné předměty) ~N kr.").
- `mandOk` = `mandTotal > 0 ∧ mandEarned ≥ mandTotal ∧` všechny `choiceProgress`
  jsou `satisfied`
- `groupsOk` = všechny `pvProgress` jsou `satisfied`
- `overallOk` = `effOverall == null ∨ pvEarned ≥ effOverall`
- `totalOk` = `totalEarned ≥ total_credits`
- `fulfilled` = `mandOk ∧ groupsOk ∧ overallOk ∧ totalOk`
- `missing` – co zbývá, v pevném pořadí: „povinné", „minima PV skupin",
  „PV celkem", „N kr. do T" (N = `total_credits − totalEarned`)

`planStatus(summary, context)` z toho dělá hlášku: „✓ Všechny podmínky
studijního plánu jsou splněné." (tón `ok`), jinak „Zbývá splnit: …."
(Kalkulačka) nebo „Zbývá zařadit: …." (Rozvrh) s položkami `missing`
oddělenými „, " (tón `todo`).

## Pruh průběhu – `progressBar(earned, target)`

Starý `bar()` bez HTML:

- `percent` = `min(earned / target · 100, 100)`, když je `target` nenulový;
  jinak 100 při `earned > 0` a 0 jinak. Nezaokrouhluje se.
- `remaining` = `max(0, target − earned)`; bez cíle (`null`) `null`
- `done` = `target != null ∧ earned ≥ target` (cíl 0 je splněný vždy)
- `tone`: `done` → zelená `#1f9d55`; jinak `percent === 0` → `empty` (červená);
  `percent ≥ 75` → `near` (žlutá `--col-mixed`, text `#8a6d00`); jinak
  `progress` (modrá). Barvy jsou v `PROGRESS_COLORS`.
- `widthPercent` = 3, když `percent === 0` a cíl je nenulový (aby byla červená
  vidět); jinak `percent`
- `valueText` = „E / T kr.", bez cíle „E kr."; `remainingText` = „zbývá N",
  při `remaining === 0` „✓ splněno", bez cíle prázdný (řádek se nevykreslí)

## Panel „Kontrola plnění" – `summaryItems(summary, context)`

Položky v pořadí vykreslení (starý `renderSummary` / `renderSchedSummary`):

1. oddíl „Povinné", pruh „Povinné předměty" (`mandEarned` / `mandTotal`), pruhy
   skupin povinného výběru s `hasBar` (`earned` / `min`, popisek `def.label`)
2. jen když aspoň jedna PV skupina má `hasBar`: oddíl „Povinně volitelné —
   skupiny" a pruhy těchto skupin (`earned` / `min`)
3. jen když plán má `pv_overall_min`: oddíl „PV celkem", pruh „Povinně volitelné
   celkem" (`pvEarned` / `effOverall`) a při `ncTotal > 0` poznámka „sníženo
   „bez kreditů“: −N kr. (z `pv_overall_min`)"
4. čára, pruh „Celkem kreditů" (`totalEarned` / `total_credits`)
5. jen v Kalkulačce a při `structuralFree > 0`: poznámka s odhadem volitelných

## Bloky kategorií – `planCategories(plan, completed, noCredit)`

První blok „Povinné předměty": podtitulek „Nutné splnit všechny • E/T kr.",
štítek „hotovo" (když `mandEarned ≥ mandTotal ∧ mandTotal > 0`), jinak „splnit
vše" (`canCompleteAll` – v Kalkulačce klikací, v Rozvrhu jen štítek).

Pak jeden blok za každou skupinu plánu v pořadí plánu, nadpis `groupTitle`
(„Povinné — …" / „Povinně volitelné — …"):

| `rawMin` | štítek | podtitulek |
| --- | --- | --- |
| `null` | „bez limitu" | „Získáno E kr. (počítá se do celku PV)" |
| `0` | „bez vlastního limitu" | totéž |
| jinak, `earned ≥ min` | „splněno" | „Minimum M kr.[ (včetně skupin: …)][ (sníženo o N kr. „bez kreditů“ z R)] • získáno E kr." |
| jinak | „min. M kr." | totéž |

M je efektivní minimum, R minimum z dat, N kredity „bez kreditů" a E získané
kredity – vše nad `group.counted`. „(včetně skupin: A, B)" jsou `includedLabels`
oddělené „, ", jen když nějaké jsou. Text „(počítá se do celku PV)" je stejný
i u skupin povinného výběru. Přepínač „bez kreditů" (`allowNoCredit`) mají jen
skupiny magisterského plánu. V seznamu bloku jsou vlastní předměty skupiny
(`group.subjects`).

Bloky se počítají vždy nad množinou **splněných** předmětů – i v levém sloupci
Rozvrhu (jen souhrn Rozvrhu počítá nad zařazenými). Řádek předmětu je
v Kalkulačce zvýrazněný (a zaškrtnutý), když je předmět splněný, v Rozvrhu když
je zařazený.

## Rozvrh (`src/lib/schedule.ts`)

### Počet ročníků

- `defaultYearsFor(degree)`: `bakalarske` → 3, `magisterske` → 2, cokoli jiného 3
- `effectiveDegree(storedDegree, spec)`: uložený stupeň, jinak `spec.study_type`
- `resolveYearsCount(yearsCount, degree)`: uložený počet; výchozí jen když je
  `null` nebo `NaN`
- `changeYears(state, delta)`: `clamp((yearsCount || 1) + delta, 1, 8)`; zařazení
  do ročníků nad novým počtem se zahodí (předměty zůstanou splněné)
- `yearsStepper(n)`: „−" je vypnuté pro `n ≤ 1`, „+" pro `n ≥ 8`

### Semestry

Zařadit lze jen do semestru `zimní` nebo `letní`.

- `canPlace(subject, semester)`: předmět se semestrem `zimní`/`letní` jen do
  svého semestru; `oba` i jakýkoli jiný text do kteréhokoli
- `isDropAllowed(subject, semester)` (zvýraznění cíle při přetahování): povoleno,
  když se neví, co se táhne, nebo je semestr `oba`, nebo odpovídá. U neznámého
  textu semestru se tedy cíl ukáže jako zakázaný, ale puštění předmět zařadí.
- `quickPlacementSemester(subject)` (zaškrtávátko v Rozvrhu, vždy 1. ročník):
  pevný semestr, jinak `zimní`
- `placementOptions(subject, yearsCount)`: pro ročníky 1..N jedna volba u pevného
  semestru, jinak dvě (zimní, letní); text „N. ročník — zimní/letní semestr"
- `semesterTagText`: `zimní` → „ZS", `letní` → „LS", `oba` → „ZS nebo LS",
  jinak „—"; `placedAtText(p)` = „N. r. / ZS"; `semesterSlotLabel` = „Zimní
  semestr" / „Letní semestr"

### Ročníky – `yearBlocks(plan, placements, yearsCount)`

Pro každý ročník 1..`yearsCount`: předměty plánu zařazené do toho ročníku
v pořadí, v jakém byly zařazeny; `credits` = součet jejich kreditů; `winter` /
`summer` podle semestru **zařazení** (`placements[id].semester`), ne podle
`subject.semester`. Celoroční předmět („oba") je tedy v jednom semestru a počítá
se jednou. Zařazení do ročníku nad `yearsCount` se nezobrazí, v souhrnu se ale
počítá.

### Souhrn – `scheduleSummary(plan, placements, noCredit)`

`planSummary(plan, placedIn(placements), noCredit)` – stejný výpočet jako
v Kalkulačce (včetně skupin povinného výběru), „získané" jsou kredity zařazených
předmětů. Odhad volitelných se v Rozvrhu nezobrazuje, hláška začíná „Zbývá
zařadit:".

### Úklid při vykreslení – `normalizeState(state, plan, degree)`

Doplní počet ročníků (`resolveYearsCount`) a zahodí zařazení předmětů, které
nejsou v plánu (`prunePlacements`). Stará stránka to dělala při každém
vykreslení (i Kalkulačky – `renderDashboard` volá `renderSchedule`) a
**neukládala** – upravený stav se zapsal až s příštím uložením rozvrhu.

### Přechody stavu

Stav je `CalculatorState { completed, noCredit, placements, yearsCount }`;
přechody ho nemění, vracejí nový. Sloupec „ukládá" říká, co stará stránka po
akci zapsala do `localStorage` (P = postup, R = rozvrh); totéž vrací
`stateChanges(před, po)` porovnáním identity objektů.

| Funkce | Co dělá | Ukládá |
| --- | --- | --- |
| `toggleDone(state, id)` | splněný → zruší splnění a odebere z rozvrhu; jinak označí jako splněný a zruší „bez kreditů" | P; R jen když byl zařazený |
| `toggleNoCredit(state, id)` | zapnuto → vypne; jinak zapne, zruší splnění a odebere z rozvrhu | P; R jen když byl zařazený |
| `completeAllMandatory(state, plan)` | všechny povinné splněné, u nich zruší „bez kreditů" | P |
| `resetCategory(state, ids)` | zruší splnění, „bez kreditů" i zařazení | P; R jen když byl některý zařazený |
| `resetAllProgress(state)` | vyprázdní splněné, „bez kreditů" i rozvrh; počet ročníků zůstane | P + R |
| `changeYears(state, delta)` | viz výše | R (i když se počet nezmění) |
| `placeSubject(state, subject, year, semester)` | při `!subject` nebo `!canPlace` nic; jinak zařadí (přesune), označí jako splněný, zruší „bez kreditů" | P + R (nic, když se ignoruje) |
| `unplaceFromSchedule(state, id)` | zruší zařazení i splnění; „bez kreditů" nechá | P + R |
| `resetYear(state, year)` | totéž pro všechny předměty ročníku | P + R (nic, když je ročník prázdný) |
| `resetAllSchedule(state)` | totéž pro celý rozvrh | P + R (nic, když je rozvrh prázdný) |
| `resetScheduleCategory(state, ids)` | zruší zařazení i splnění předmětů kategorie, i nezařazených | P + R |

Z toho plynou invarianty, které stará stránka sama udržuje: zařazený předmět je
vždy splněný a předmět není zároveň splněný a „bez kreditů". Výpočty na nich
nezávisí (stav z `localStorage` je může porušovat).

## Zachované zvláštnosti

Chování staré stránky, které může vypadat jako chyba, ale je zachováno:

1. **Skupina povinného výběru s `includes_groups`** by v pruhu a podtitulku
   počítala `counted`, ale do `choiceEarned` (a tedy do celku) jen vlastní
   předměty. V datech `includes_groups` mají jen PV skupiny matematiky.
2. **Plán bez povinných předmětů nejde splnit** – `mandOk` vyžaduje
   `mandTotal > 0`; stejně tak štítek „hotovo".
3. **`mandatory_credits` z dat se nepoužívá**, povinné kredity se sčítají
   z předmětů. U bakalářských plánů informatiky 2024-2025 a 2025-2026 vychází
   součet o 6 kreditů menší než `mandatory_credits`; v datech 2026-2027 se
   shoduje.
4. **Odhad volitelných roste s „bez kreditů"** – počítá se z efektivního
   `effOverall`, ne z `pv_overall_min`.
5. **Předmět „bez kreditů" snižuje minimum, i když je zároveň splněný**
   (stav, který stará stránka sama nevytvoří); kredity se mu pak počítají také.
6. **Předmět povinný i povinně volitelný v téže specializaci by se do celku
   započítal dvakrát** (`totalEarned = mandEarned + choiceEarned + pvEarned`).
   V datech (všechny roky a obory) takový není.
7. **Pruh skupiny s minimem sníženým na 0** je vždy zelený („✓ splněno") a
   jeho šířka je 0 %, dokud ve skupině není žádný kredit.
8. **Předměty se skupinou, kterou požadavky neznají** (`"doporucene"`), se
   v Kalkulačce nezobrazují a nepočítají.
9. **Zařazení do ročníku nad počtem ročníků** není v ročnících vidět, ale
   v souhrnu Rozvrhu se počítá (vznikne jen ručním zásahem do úložiště;
   `changeYears` taková zařazení zahazuje).
10. **Souhrn Rozvrhu a levý sloupec Rozvrhu počítají nad různými množinami**
    (zařazené × splněné). Předmět splněný v Kalkulačce, ale nezařazený, je
    v levém sloupci Rozvrhu započítaný v podtitulku kategorie, v souhrnu
    Rozvrhu ne.
11. **Předmět podskupiny se počítá do dvou minim, ale do celku jednou.** Předmět
    skupiny uvedené v `includes_groups` se započítá do minima své skupiny i do
    minima nadřazené skupiny, do „PV celkem" a celku jen jednou. „Bez kreditů"
    u něj snižuje obě minima.

## Ověření shody se starou stránkou

- `scripts/gen-credits-fixture.mjs` vyřízne `<script>` ze staré stránky, spustí
  ho beze změny v `node:vm` s náhražkou DOM, `localStorage` a `fetch` a pro každý
  rok × obor (`data/years.json` × `data/<rok>/fields.json`) × specializaci ×
  scénář zavolá původní `renderDashboard()`. Uloží, co stránka vykreslila (bloky
  kategorií, souhrn, hláška, rozvrh), a zvlášť čísla (`numbers`) – výsledky
  původních `planTotals`, `effMin` a `ncCreditsIn`, ověřené proti vykreslenému
  souhrnu. Barvy pruhů ukládá jako název stavu (`done`/`empty`/`near`/`progress`)
  s tabulkou `tones`, kterou test porovná s `PROGRESS_COLORS`. Druhá část
  přehrává posloupnosti akcí přes původní funkce (`toggleDone`, `placeSubject`,
  …) a po každé zapíše stav a co se uložilo.
- Scénáře (pro každou specializaci): nic splněno; vše splněno a zařazeno; PV
  „bez kreditů"; tři pseudonáhodné podmnožiny s pevným semínkem (část PV předmětů
  „bez kreditů", předměty mimo plán, zařazení nad počtem ročníků, předměty
  zároveň splněné i „bez kreditů").
- Výstup `src/lib/__fixtures__/credits-legacy.json` (kompaktní JSON, datové sady
  pod klíčem „rok/obor") je v repu, aby testy fungovaly i po smazání staré
  stránky. Přegenerování (jen dokud stará stránka existuje):
  `node scripts/gen-credits-fixture.mjs`. Výstup je deterministický.
- `src/lib/credits.test.ts` a `src/lib/schedule.test.ts` porovnávají nový kód se
  záznamem (texty i čísla) a obsahují jednotkové testy nad ručně sestavenými
  daty. Test hlídá, že záznam pokrývá právě všechny kombinace rok × obor. Záznam
  platí jen pro data, ze kterých vznikl (kontroluje se otisk `nodes.json`); po
  změně dat nebo staré stránky je potřeba ho přegenerovat.
- Generátor jde pustit i nad jinou kopií stránky a dat
  (`--html <soubor> --data <složka> --out <soubor>`); data musí mít
  `fields.json` pro každý rok.
