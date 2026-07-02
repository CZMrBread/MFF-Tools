# MFF UK Nástroje

Sada přehledných webových nástrojů pro (nejen) prváky informatiky na MFF UK. Vytvořeno studenty pro studenty — nejedná se o oficiální stránky fakulty.

🔗 **Živá verze:** [ms.mff.cuni.cz/~smolad](https://www.ms.mff.cuni.cz/~smolad/)

## Co tu najdeš

### 🧭 Průvodce prváka
`index.html`

Moje osobní stránka jako studentského průvodce pro prváky informatiky — co zařídit jako první (CAS, ISIC, SIS), jak si nastavit eduroam, info o ubytovacím stipendiu, tipy na volitelné předměty a odpovědi na časté otázky ohledně zápisu rozvrhu a přežití prvního semestru.

> 🚧 Momentálně ve vývoji — chybí doplnit jméno, kontakt a screenshoty k eduroamu.

### 🧮 Kalkulačka kreditů
`kalkulačka/index.html`

Interaktivní nástroj pro sledování plnění studijního plánu. Vyber stupeň studia (Bc./Mgr.) a specializaci, odškrtávej splněné předměty a kalkulačka ti spočítá získané a chybějící kredity po jednotlivých kategoriích (povinné, povinně volitelné, volitelné). Postup se ukládá lokálně v prohlížeči (`localStorage`), takže se nic neztratí ani po zavření karty.

### 🗺️ Mapa předmětů
`specializace/index.html`

Interaktivní síťový graf (D3.js) zobrazující průniky předmětů napříč specializacemi. Vyber jednu nebo víc specializací a mapa zvýrazní společné/sdílené předměty — ideální pro rozhodování mezi obory před zápisem do letního semestru.

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
│   └── index.html            # Kalkulačka kreditů (data o předmětech přímo v kódu)
├── specializace/
│   ├── index.html            # Mapa předmětů (D3 graf)
│   ├── nodes.json             # Uzly grafu (specializace + předměty)
│   ├── links.json             # Vazby mezi předměty a specializacemi
│   └── edit.php               # Pomocný editor dat (server-side)
```

## Přispívání

Máš nápad na vylepšení, našel/a jsi chybu v datech o předmětech nebo kreditech, nebo chceš doplnit nový obor? Klidně otevři issue nebo pull request.

## Licence

[MIT](LICENSE) © 2026 Dominik Smola
