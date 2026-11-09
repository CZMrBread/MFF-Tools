# Modul Kalkulačka kreditů

Stará verze: `kalkulačka/index.html` (vanilla JS, ~1900 řádků). Nová: `src/calculator/`.
Při nejasnosti o chování si přečti starý kód – je referencí. Podrobný popis
výpočtů je v `docs/algo.md`.

## Co dělá

1. Uživatel vybere **akademický rok** (`years.json`), **obor** (`fields.json`),
   **stupeň** (Bc./Mgr. – filtr `spec.study_type`) a **specializaci** (`spec`).
2. Načte se `nodes.json` daného roku a oboru, z něj `program_req` pro
   specializaci a předměty, které se jí týkají.
3. Uživatel odškrtává splněné předměty; u povinně volitelných může předmět
   označit „bez kreditů" (splnil ho, ale kredity se nepočítají – snižuje
   minimum skupiny).
4. Souhrn ukazuje průběh po kategoriích a zda jsou splněné všechny podmínky.
5. Záložka **Rozvrh**: povinné a PV předměty se dají přetáhnout (desktop) nebo
   klepnutím zařadit (mobil) do ročníku × semestru. Zařazení do rozvrhu
   předmět zároveň označí jako splněný; odškrtnutí v kalkulačce ho z rozvrhu
   odebere.

## Výpočetní logika (přenést do `src/lib/credits.ts` jako čisté funkce)

- `planFor(spec)` → `{ req, mandatory, groups }`: povinné = `subj.mandatory_in`
  obsahuje spec; skupiny = `req.pv_groups` s předměty, kde `subj.pv_group[spec]
  === group`; prázdné skupiny se vynechají. Skupina s `includes_groups` má
  `counted` = vlastní předměty + předměty podskupin (dedup podle id).
- `isMandatoryChoice(def)`: `mandatory_choice === true` ∨ `group === 'telocvik'`
  ∨ `group` matchuje `/^alt\d*$/`. Tyto skupiny jsou „Povinné — …", mají vlastní
  minimum, počítají se do celkových kreditů, **ne** do PV celkem.
- `effMin(min, subjects)` = `max(0, min − kredity předmětů „bez kreditů" v subjects)`.
- `planTotals(plan, isDone)`: povinné získané / celkem; PV získané přes všechny
  PV skupiny (dedup), PV celkem minimum = `effMin(pv_overall_min, všechny PV)`;
  choice skupiny zvlášť. `totalEarned = mandEarned + choiceEarned + pvEarned`.
- Odhad volitelných: `total_credits − mandTotal − choiceMin − effOverall`
  (jen informativně, pokud > 0).
- Stav „splněno": povinné všechny ∧ minima choice skupin ∧ minima PV skupin
  ∧ PV celkem ∧ celkem ≥ `total_credits`.
- Řazení předmětů: `label.localeCompare(b.label, 'cs')`.

Pro každou funkci napiš Vitest test; očekávané hodnoty vezmi ze staré verze
(spusť ji v prohlížeči nebo přepočítej ručně nad malým vzorkem dat).

## `localStorage` – klíče musí zůstat kompatibilní

Implementace: `src/lib/storage.ts` (testy `storage.test.ts` spouštějí i starý
kód a porovnávají zápisy).

Globální (sdílené s mapou):
- `mff_akademicky_rok` – vybraný rok
- `mff_obor` – vybraný obor

Per rok a obor – `lsKey(name)` = `name + '_' + rok + (obor && obor !==
'informatika' ? '_' + obor : '')` (bez roku `neznamy`). Informatika má klíče
bez přípony oboru, aby zůstal postup uložený před zavedením oborů:
- `mff_spec` – id specializace
- `mff_degree` – `bakalarske` / `magisterske` (hodnota `spec.study_type`)
- `mff_completed` – JSON pole id splněných předmětů
- `mff_nocredit` – JSON pole id předmětů „bez kreditů"
- `mff_sched_placements_<spec>` – JSON `{ [subjId]: { year, semester } }`
  (celý klíč `lsKey('mff_sched_placements_' + spec)`, tedy např.
  `mff_sched_placements_s1_2026-2027_fyzika`)
- `mff_sched_years_<spec>` – počet ročníků v rozvrhu jako text

„Změnit obor“ (změna specializace) po potvrzení smaže `mff_spec`,
`mff_degree`, `mff_completed`, `mff_nocredit` a rozvrh dané specializace pro
aktuální rok a obor; ostatní kombinace zůstanou.

## UI

Nový kód: `src/calculator/` – `CalculatorPage.tsx` (výběr roku/oboru, podstrom
s `key` podle roku i oboru), `Planner.tsx` (průvodce stupeň → specializace,
dashboard, ukládání), `CategoryBlock.tsx`, `SummaryPanel.tsx`,
`ScheduleBoard.tsx` + `YearPicker.tsx` (Rozvrh). Výpočty jen z `src/lib/credits.ts`
a `src/lib/schedule.ts`.

- Krokový průvodce (rok → obor → stupeň → specializace → dashboard).
- Dashboard: bloky Povinné / Povinné — výběr / Povinně volitelné — skupiny /
  souhrn s progress bary a stavovou hláškou.
- Řádek předmětu (Kalkulačka): checkbox, kód + název, kredity; zaškrtávátko
  „bez kreditů" jen ve skupinách magisterského plánu (`req.level === 'mgr'`,
  i ve skupinách povinného výběru).
- Mobil first – používá se hlavně z telefonu.
