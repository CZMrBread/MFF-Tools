# MFF UK Nástroje

Sada přehledných webových nástrojů pro (nejen) prváky informatiky na MFF UK. Vytvořeno studenty pro studenty — nejedná se o oficiální stránky fakulty.

🔗 **Živá verze:** [www.ms.mff.cuni.cz/~smolad](https://www.ms.mff.cuni.cz/~smolad/)

> [!IMPORTANT]
> Tenhle projekt je z velké části vygenerovaný pomocí AI (kód i tento popis). Data o předmětech a kreditech se snažím udržovat přesná, ale ber je jako pomocnou orientaci, ne autoritativní zdroj — vždy si je ověř v [Karolínce pro svůj ročník](https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany). Chyby nebo nesrovnalosti hlaš prosím v issue nebo PR. Více v sekci [Přispívání](#přispívání).

## Co tu najdeš

### 🧭 Průvodce prváka — `/`

Studentský průvodce pro prváky informatiky — co zařídit jako první (CAS, ISIC, SIS), doporučené nastavení SISu, info o ubytovacím stipendiu, tipy na volitelné předměty a odpovědi na časté otázky ohledně zápisu rozvrhu a přežití prvního semestru.

### 🧮 Kalkulačka kreditů — `/kalkulačka/`

Vyber akademický rok, obor (fyzika, informatika, matematika, učitelství), stupeň studia (Bc./Mgr.) a specializaci, odškrtávej splněné předměty a kalkulačka spočítá získané a chybějící kredity po kategoriích (povinné, povinně volitelné, volitelné). Postup se ukládá lokálně v prohlížeči (`localStorage`) zvlášť pro každý rok a obor.

V záložce **Rozvrh** si poskládáš povinné a povinně volitelné předměty do ročníků a semestrů — přetažením (na počítači) nebo klepnutím (na mobilu). Zařazení předmětu do rozvrhu ho zároveň označí jako splněný v kalkulačce.

> [!NOTE]
> Data o předmětech a kreditech jsou z velké části zpracovaná pomocí AI. Než se na ně spolehneš při zápisu, ověř si je v [Karolínce pro svůj ročník](https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany).

### 🗺️ Mapa předmětů — `/specializace/`

Interaktivní síťový graf (D3.js) s průniky předmětů napříč specializacemi zvoleného oboru. Vyber jednu nebo víc specializací a mapa zvýrazní společné předměty — hodí se při rozhodování mezi specializacemi.

### 📈 Vizualizace algoritmů — `/algo/`

Přes 50 interaktivních vizualizací algoritmů a datových struktur podle knihy *Průvodce labyrintem algoritmů* (Mareš, Valla) a magisterské přednášky Datové struktury I: třídění, haldy, vyhledávací stromy (AVL, splay, (a,b), LLRB…), hešování, grafy (BFS, DFS, Dijkstra, kostry, mosty, komponenty…), toky v sítích, dynamické programování, textové algoritmy, paralelní algoritmy, geometrie a FFT. Vlastní vstup, krokování dopředu i zpět, zvýrazněný pseudokód, příklady z knihy a sdílitelné odkazy (`/algo/#/sort/quick?a=…`).

## Technologie

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript, testy [Vitest](https://vitest.dev/)
- [D3.js](https://d3js.org/) pro mapu předmětů, `react-router-dom` jen uvnitř stránky algoritmů
- [Bootstrap Icons](https://icons.getbootstrap.com/) pro ikony
- Výstup buildu je čistě statický (bez backendu) a funguje pod podsložkou (`/~smolad/`)
- Design vychází z oficiálních barev a fontu MFF UK

## Struktura repozitáře

```
MFF-Tools/
├── app/                    # Vstupní HTML stránek (index, kalkulačka/, specializace/, algo/)
├── src/
│   ├── guide/              # Průvodce prváka
│   ├── calculator/         # Kalkulačka kreditů + Rozvrh
│   ├── map/                # Mapa předmětů (D3)
│   ├── algo/               # Vizualizace algoritmů
│   ├── lib/                # Čistá logika (data, výpočet kreditů, rozvrh, mapa)
│   ├── shared/             # Hlavička, patička, výběr roku a oboru
│   └── legacy/             # Původní HTML stránky – jen reference pro testy shody
├── public/                 # Favicony, manifest (public/data/ se generuje z data/)
├── data/
│   ├── years.json          # Seznam akademických roků (poslední = výchozí)
│   └── <rok>/              # např. 2026-2027
│       ├── fields.json     # Obory dostupné v daném roce
│       └── <obor>/         # fyzika, informatika, matematika, ucitelstvi
│           ├── nodes.json  # Specializace, předměty a požadavky studijních plánů
│           └── links.json  # Vazby mezi předměty a specializacemi
├── docs/                   # Dokumentace pro vývoj (formát dat, moduly, konvence)
└── scripts/                # Pomocné skripty (kopie dat, měření rozložení algo)
```

Nový akademický rok přidáš tak, že vytvoříš složku `data/<rok>/` s `fields.json` a podsložkami oborů a rok připíšeš na konec `data/years.json`. Formát dat popisuje [`docs/data.md`](docs/data.md).

## Spuštění lokálně

Potřebuješ [Node.js](https://nodejs.org/) 22+.

```sh
npm install
npm run dev      # vývojový server (http://localhost:5173/)
npm test         # testy
npm run lint     # ESLint
npm run build    # statický build do dist/
npm run preview  # náhled buildu
```

Data se před `dev`, `build` i `test` automaticky zkopírují z `data/` do `public/data/` — upravuj vždy jen `data/`. Na server se nahrává obsah složky `dist/`.

## Přispívání

Máš nápad na vylepšení, našel/a jsi chybu v datech o předmětech nebo kreditech, nebo chceš doplnit nový obor? Klidně otevři issue nebo pull request. Konvence kódu a postup ověření změn jsou v [`docs/kod.md`](docs/kod.md).

## Licence

[GPLv3](LICENSE) © 2026 Dominik Smola
