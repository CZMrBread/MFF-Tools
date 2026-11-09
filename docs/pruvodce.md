# Modul Průvodce prváka

Stará verze: `index.html` (hlavní stránka webu). Nová: `src/guide/`.

## Co to je

Statická informační stránka pro prváky informatiky: co zařídit jako první
(CAS, ISIC, SIS), doporučené nastavení SISu, povolení zveřejnit, přeposílání
školního e-mailu, ubytovací stipendium, důležité odkazy, tipy na volitelné
předměty, FAQ k zápisu rozvrhu a prvnímu semestru.

## Pravidla

- **Obsah přenes doslova** – texty, odkazy, pořadí sekcí a ikony (Bootstrap
  Icons) zachovej. Neopravuj a nepřepisuj formulace bez domluvy; obsah je můj
  osobní text, ne generický návod.
- Obsah drž odděleně od komponent (např. `src/guide/content.tsx` nebo
  jednotlivé sekce jako komponenty bez logiky), aby šel snadno upravovat.
- Z této stránky vedou odkazy na kalkulačku a mapu – v nové verzi přes
  router, ale výsledné URL musí zůstat `kalkulačka/` a `specializace/`.
- Sticky navigace / scroll chování ze starého kódu (IIFE na konci souboru)
  zachovat.
- Žádná data z `data/` se tu nenačítají.
