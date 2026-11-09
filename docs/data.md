# Data studijních plánů (`data/`)

Zdroj pravdy je Karolinka MFF UK pro daný ročník. Data jsou z velké části
zpracovaná AI a mohou obsahovat chyby – **nevymýšlej kódy předmětů, kredity ani
zařazení do skupin z hlavy**; když něco chybí, řekni to a nech doplnění na mně.
Při migraci se formát **nemění**.

## Adresářová struktura

```
data/
├── years.json              # ["2024-2025", "2025-2026", "2026-2027"] – poslední = výchozí
└── <rok>/
    ├── fields.json         # obory dostupné v roce, např. ["fyzika","informatika","matematika","ucitelstvi"]
    └── <obor>/
        ├── nodes.json      # pole uzlů: specializace, požadavky programu, předměty
        └── links.json      # pole hran předmět → specializace
```

Obory jsou **striktně oddělené** – každý má vlastní složku a vlastní uzly.
Nikdy je neslévej do jednoho seznamu. Nový rok = nová složka + zápis do
`years.json` (na konec).

## `nodes.json` – tři druhy uzlů podle `group`

### `spec` – specializace / studijní program
```json
{ "id": "s1", "label": "Obecná informatika", "group": "spec",
  "study_type": "bakalarske", "color": "#ff6b6b", "radius": 40 }
```
- `id`: `s<n>` bakalářské, `m<n>` magisterské
- `study_type`: `"bakalarske"` | `"magisterske"`
- `color`, `radius` používá mapa (D3)

### `program_req` – požadavky plánu pro jednu specializaci
```json
{ "id": "req_s1", "group": "program_req", "spec": "s1", "level": "bc",
  "total_credits": 180, "mandatory_credits": 110, "pv_overall_min": 45,
  "pv_groups": [
    { "group": "telocvik", "label": "Tělesná výchova", "min_credits": 4 },
    { "group": 1, "label": "Skupina 1", "min_credits": 30 },
    { "group": 0, "label": "Povinně volitelné", "min_credits": 38, "includes_groups": [1] }
  ] }
```
- `pv_overall_min`: minimum za povinně volitelné celkem (**bez** skupin
  „povinného výběru", viz níže)
- `pv_groups[].group`: identifikátor skupiny – číslo nebo string
  (`"telocvik"`, `"alt1"`, …); párování přes `subj.pv_group[spec]`
- `pv_groups[].includes_groups`: nadřazená skupina započítává i kredity
  podskupin (matematika)
- `pv_groups[].mandatory_choice: true`: skupina „povinného výběru"
  (počítá se do celku, ne do PV celkem). Totéž platí automaticky pro
  `group === "telocvik"` a `group` odpovídající `/^alt\d*$/`

### `subj` – předmět
```json
{ "id": "NAIL002", "label": "NAIL002 Neuronové sítě", "group": "subj",
  "radius": 8, "shared_count": 1, "course_type": "elective",
  "mandatory_in": [], "elective_in": ["m6"],
  "credits": 8, "pv_group": { "m6": 1 }, "semester": "zimní" }
```
- `id`: kód předmětu ze SIS (např. `NAIL002`) – identifikátor, neměnit formát
- `mandatory_in`: specializace, kde je předmět povinný
- `elective_in`: specializace, kde je povinně volitelný
- `pv_group`: `{ "<specId>": <group> }` – do které PV skupiny dané specializace
  patří; klíč musí odpovídat `pv_groups[].group` v `program_req` té specializace
- `credits`: číslo; `semester`: `"zimní"` | `"letní"` | jiný text
- `shared_count`, `radius`: pro mapu

## `links.json`
```json
{ "source": "NAFF003", "target": "m7", "value": 1 }
```
`source` = kód předmětu, `target` = id specializace. Používá hlavně mapa.
Každý `source` i `target` musí existovat v `nodes.json`.

## Validace (implementovat v `src/lib/data.ts`, testovat nad daty v repu)

- každý `program_req.spec` ukazuje na existující `spec`
- každý `subj.mandatory_in[]`, `elective_in[]` a klíč v `pv_group` je existující `spec`
- hodnota `pv_group[spec]` odpovídá některé `pv_groups[].group` příslušného `program_req`
  – výjimka: hodnota `"doporucene"` (doporučený předmět mimo PV skupiny; žádné
  `pv_groups` ji nedefinují, kalkulačka ho nezobrazí ani nezapočítá, mapa ho
  ukazuje přes `links` / `elective_in`). Validátor ji nehlásí
  (`RECOMMENDED_PV_GROUP` v `src/lib/data.ts`); počty výskytů na rok × obor
  hlídá `src/lib/__fixtures__/known-data-problems.json`
- `links[].source` / `target` existují v `nodes`
- `credits` je nezáporné číslo

Zachovej formátování JSON (odsazení, pořadí klíčů), aby byly diffy čitelné.
