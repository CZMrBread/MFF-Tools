# MFF UK Nástroje

Sada přehledných webových nástrojů pro (nejen) prváky informatiky na MFF UK. Vytvořeno studenty pro studenty — nejedná se o oficiální stránky fakulty.

🔗 **Živá verze:** [www.ms.mff.cuni.cz/~smolad](https://www.ms.mff.cuni.cz/~smolad/)

> [!IMPORTANT]
> Tenhle projekt je z velké části vygenerovaný pomocí AI (kód i tento popis). Data o předmětech a kreditech se snažím udržovat přesná, ale ber je jako pomocnou orientaci, ne autoritativní zdroj — vždy si je ověř v [Karolínce pro svůj ročník](https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany). Chyby nebo nesrovnalosti hlaš prosím v issue nebo pr. Více v sekci [Přispívání](#přispívání)

## Co tu najdeš

### 🧭 Průvodce prváka
`index.html`

Moje osobní stránka jako studentského průvodce pro prváky informatiky — co zařídit jako první (CAS, ISIC, SIS), doporučené nastavení SISu, info o ubytovacím stipendiu, tipy na volitelné předměty a odpovědi na časté otázky ohledně zápisu rozvrhu a přežití prvního semestru.

### 🧮 Kalkulačka kreditů
`kalkulačka/index.html`

Interaktivní nástroj pro sledování plnění studijního plánu. Vyber akademický rok, obor (fyzika, informatika, matematika, učitelství), stupeň studia (Bc./Mgr.) a specializaci, odškrtávej splněné předměty a kalkulačka ti spočítá získané a chybějící kredity po jednotlivých kategoriích (povinné, povinně volitelné, volitelné). Postup se ukládá lokálně v prohlížeči (`localStorage`) zvlášť pro každý rok a obor, takže se nic neztratí ani po zavření karty.

V záložce **Rozvrh** si navíc můžeš poskládat povinné a povinně volitelné předměty do jednotlivých ročníků a semestrů — přetažením (na počítači) nebo klepnutím (na mobilu). Zařazení předmětu do rozvrhu ho zároveň označí jako splněný v kalkulačce, takže oba pohledy zůstávají v sync.

> [!NOTE]
> Data o předmětech a kreditech jsou z velké části zpracovaná pomocí AI. Než se na ně spolehneš při zápisu, ověř si je v [Karolínce pro svůj ročník](https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany).

### 🗺️ Mapa předmětů
`specializace/index.html`

Interaktivní síťový graf (D3.js) zobrazující průniky předmětů napříč specializacemi zvoleného oboru. Vyber jednu nebo víc specializací a mapa zvýrazní společné/sdílené předměty — ideální pro rozhodování mezi obory před zápisem do letního semestru.

## Technologie

- Čistý **HTML/CSS/JS** — žádný build proces, žádné závislosti ke stažení
- [D3.js](https://d3js.org/) pro vizualizaci grafu předmětů (mapa)
- [Bootstrap Icons](https://icons.getbootstrap.com/) pro ikony
- Design vychází z oficiálních barev a fontu MFF UK

## Struktura repozitáře

```
MFF-Tools/
├── index.html              # Průvodce prváka (hlavní stránka)
├── styles.css               # Sdílené styly
├── kalkulačka/
│   └── index.html            # Kalkulačka kreditů
├── specializace/
│   └── index.html            # Mapa předmětů (D3 graf)
└── data/
    ├── years.json            # Seznam akademických roků (poslední = výchozí)
    └── <rok>/                # např. 2026-2027
        ├── fields.json       # Obory dostupné v daném roce, např. ["fyzika", "informatika", …]
        └── <obor>/           # fyzika, informatika, matematika, ucitelstvi
            ├── nodes.json    # Specializace, předměty a požadavky studijních plánů
            └── links.json    # Vazby mezi předměty a specializacemi
```

Nový akademický rok přidáš tak, že vytvoříš složku `data/<rok>/` s `fields.json` a podsložkami oborů a rok připíšeš na konec `data/years.json`.

## Spuštění lokálně

Všechny cesty jsou relativní, takže web funguje stejně na serveru (`/~smolad/`) i lokálně. Stačí v kořeni repozitáře spustit jednoduchý server (kvůli `fetch` nejde stránky otevřít přímo ze souboru):

```sh
python3 -m http.server 8000
```

a otevřít [localhost:8000](http://localhost:8000).

## Přispívání

Máš nápad na vylepšení, našel/a jsi chybu v datech o předmětech nebo kreditech, nebo chceš doplnit nový obor? Klidně otevři issue nebo pull request.

## Licence

[GPLv3](LICENSE) © 2026 Dominik Smola
