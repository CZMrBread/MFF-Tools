import { formatNum } from "../../core/format";
import { parseIntStrict, parseNumberList } from "../../core/input";
import { snap, type Step, type StepGen } from "../../core/steps";

/* ================================================================== graf ceny operací (obr. 9.2) */

/** Jedna operace v grafu: skutečná cena (sloupec) a potenciál po ní (bod křivky). */
export interface OpBar {
  real: number;
  phi: number;
  label: string;
}

/**
 * Historie operací pro graf „skutečná cena a potenciál“ (Průvodce obr. 9.2: šedivé sloupce, černá
 * křivka). Drží posledních CHART_MAX operací; `phi0` je potenciál před první z nich (začátek křivky),
 * `first` její pořadové číslo od začátku účtování. `live` = poslední operace ještě probíhá.
 */
export interface CostChart {
  phi0: number;
  first: number;
  ops: OpBar[];
  live: boolean;
}

/** Kolik posledních operací graf ukazuje (obr. 9.2 má 64 incrementů). */
export const CHART_MAX = 64;

export const mkChart = (phi0: number): CostChart => ({
  phi0,
  first: 1,
  ops: [],
  live: false,
});

/** Začátek operace: nový sloupec s nulovou cenou, potenciál zatím beze změny. */
function chartBegin(c: CostChart, label: string, phi: number) {
  c.ops.push({ real: 0, phi, label });
  c.live = true;
  while (c.ops.length > CHART_MAX) {
    c.phi0 = c.ops[0].phi;
    c.ops.shift();
    c.first++;
  }
}

/** Průběžný účet probíhající operace (sloupec roste s kroky). */
function chartBill(c: CostChart, real: number, phi: number) {
  const last = c.ops[c.ops.length - 1];
  if (!last) return;
  last.real = real;
  last.phi = phi;
}

/* ================================================================== nafukovací pole */

export interface ArrState {
  /** kapacita p */
  p: number;
  /** prvky (délka n) */
  items: { id: number; v: number }[];
  marks: Record<number, string>;
  /** souhrn: skutečná cena, amortizovaná cena, počet operací */
  real: number;
  amort: number;
  ops: number;
  /** potenciál Φ₀ ve chvíli, kdy začalo účtování (výchozí stav / vyprázdnění) */
  phi0: number;
  vars: Record<string, string | number>;
  nextId: number;
  /** cena a potenciál posledních operací (graf pod polem) */
  chart: CostChart;
}

/** Víc prvků už by se na plátno rozumně nevešlo – Insert nad limit se neprovede. */
/** Výchozí příklad nafukovacího pole: plné pole kapacity 4 (stránka i náhled na úvodní stránce). */
export const ARR_DEFAULT = [1, 2, 3, 4];
/** Výchozí příklad binárního počítadla: 7 = 000111. */
export const CNT_DEFAULT = 7;

export const ARR_MAX_N = 256;
/** Hodnoty se kreslí do buňky široké 40 px – držíme je na nejvýše třech číslicích. */
export const ARR_MAX_VALUE = 999;

/**
 * Cenový model stránky: zápis / odebrání prvku stojí 1, kopírování při realokaci 1 za prvek.
 * V tomto modelu je amortizovaná cena (skutečná + ΔΦ) Insertu nejvýše 3 a Delete nejvýše 2.
 * (Přednáška počítá jen zkopírované prvky – tam vychází 2 pro obě operace.)
 */
export const AMORT_INSERT = 3;
export const AMORT_DELETE = 2;

/** vzorec potenciálu je v popisu stránky – v panelu proměnných stačí krátký název */
export const VAR_PHI = "Φ";
export const VAR_PHI0 = "Φ₀";
export const VAR_REAL = "Σ skutečná cena";
export const VAR_AMORT_ARR = `Σ amortizovaná (Insert ${AMORT_INSERT}, Delete ${AMORT_DELETE})`;
export const VAR_BOUND = "Σ amortizovaná + Φ₀ − Φ";

/** Potenciál z přednášky: 2n − p pro p ≤ 2n, jinak p/2 − n (vždy ≥ 0). */
export const phiArr = (n: number, p: number) =>
  p <= 2 * n ? 2 * n - p : p / 2 - n;

/** Číslo pro zprávy a proměnné: desetinná čárka, skutečné minus. */
export const fmt = (x: number) =>
  formatNum(Math.round(x * 100) / 100).replace("-", "−");
const signed = (x: number) => (x > 0 ? "+" : "") + fmt(x);
const items = (n: number) =>
  `${n} ${n === 1 ? "prvek" : n >= 2 && n <= 4 ? "prvky" : "prvků"}`;

/** Pravá strana nerovnosti potenciálové metody: Σ amortizovaná + Φ₀ − Φ (číslo, ne text z proměnných). */
export const arrBound = (st: ArrState) =>
  st.amort + st.phi0 - phiArr(st.items.length, st.p);

export function arrVars(st: ArrState) {
  const n = st.items.length;
  const phi = phiArr(n, st.p);
  st.vars = {
    n,
    p: st.p,
    [VAR_PHI]: fmt(phi),
    [VAR_PHI0]: fmt(st.phi0),
    [VAR_REAL]: st.real,
    [VAR_AMORT_ARR]: st.amort,
    [VAR_BOUND]: fmt(st.amort + st.phi0 - phi),
  };
}

/** Vkládaná hodnota: celé číslo v rozsahu ±ARR_MAX_VALUE; null = vstup není číslo. */
export function normValue(x: number): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return Math.max(-ARR_MAX_VALUE, Math.min(ARR_MAX_VALUE, Math.trunc(x))) + 0;
}

/** Nový stav pole (výchozí příklad i vyprázdnění) – proměnné jsou vidět hned. */
export function mkArr(p: number, values: number[]): ArrState {
  const vals = values
    .map(normValue)
    .filter((v): v is number => v !== null)
    .slice(0, ARR_MAX_N);
  const cap = Math.max(1, vals.length, Number.isFinite(p) ? Math.floor(p) : 1);
  const st: ArrState = {
    p: cap,
    items: vals.map((v, id) => ({ id, v })),
    marks: {},
    real: 0,
    amort: 0,
    ops: 0,
    phi0: phiArr(vals.length, cap),
    vars: {},
    nextId: vals.length,
    chart: mkChart(phiArr(vals.length, cap)),
  };
  arrVars(st);
  return st;
}

/** Nejmenší mocnina dvojky ≥ n (aspoň 1) – kapacita pole postaveného ze zadaných prvků. */
export const capacityFor = (n: number) =>
  2 ** Math.ceil(Math.log2(Math.max(1, Math.floor(n) || 1)));

/** „Postavit“: pole ze zadaných hodnot, kapacita = nejbližší vyšší mocnina dvojky (jako po samých Insertech). */
export function buildArr(values: number[]): ArrState {
  const vals = values
    .map(normValue)
    .filter((v): v is number => v !== null)
    .slice(0, ARR_MAX_N);
  return mkArr(capacityFor(vals.length), vals);
}

/** Kolik prvků jde zadat do pole „Postavit“ (víc by se v textovém poli špatně četlo). */
export const BUILD_MAX = 64;
/** pravidla pole „Prvky“ i parametru `?a=` v adrese */
export const BUILD_RULES = {
  min: -ARR_MAX_VALUE,
  max: ARR_MAX_VALUE,
  maxCount: BUILD_MAX,
  integerOnly: true,
};

/** Prvky ze sdíleného odkazu (`?a=5,8,13`); nic platného → null (použije se výchozí příklad). */
export function arrFromUrl(param: string | null): number[] | null {
  if (!param) return null;
  const v = parseNumberList(param, BUILD_RULES).values;
  return v.length ? v : null;
}

export const PC_ARR_INSERT = [
  "Insert(x):",
  "  Pokud n = p:   // pole je plné",
  "    Alokujeme nové pole kapacity 2p a překopírujeme n prvků.   // cena n",
  "  A[n] ← x; n ← n + 1   // cena 1",
  "",
  "Potenciál Φ = 2n − p (pro p ≤ 2n), jinak p/2 − n.",
  "Amortizovaná cena = skutečná + ΔΦ ≤ 3 = O(1).",
];
export const PC_ARR_DELETE = [
  "Delete:   // odebere poslední prvek",
  "  n ← n − 1   // cena 1",
  "  Pokud p = 4n a p > 1:   // pole je řídké",
  "    Alokujeme nové pole kapacity p/2 a překopírujeme n prvků.   // cena n",
  "",
  "Potenciál Φ = p/2 − n (pro p ≥ 2n), jinak 2n − p.",
  "Amortizovaná cena = skutečná + ΔΦ ≤ 2 = O(1).",
];

/** Krok se vždy vydává s čerstvými proměnnými (n, p, Φ, Σ). `error` = operace se neprovedla. */
function emit(
  st: ArrState,
  line: number | null,
  message: string,
  error = false,
): Step<ArrState> {
  arrVars(st);
  const step = snap(st, line, message);
  return error ? { ...step, error: true } : step;
}

const summary = (cost: number, dPhi: number, bound: number) =>
  `skutečná cena ${cost}, ΔΦ = ${signed(dPhi)} → amortizovaně ${fmt(cost + dPhi)} ≤ ${bound}.`;
const shape = (st: ArrState) => `n = ${st.items.length}, p = ${st.p}`;

export function* arrInsert(st: ArrState, x: number): StepGen<ArrState> {
  st.marks = {};
  const n = st.items.length;
  const v = normValue(x);
  if (v === null) {
    yield emit(
      st,
      0,
      "Hodnota x není číslo – zadejte celé číslo. Nic se nevložilo.",
      true,
    );
    return;
  }
  if (n >= ARR_MAX_N) {
    yield emit(
      st,
      0,
      `Vizualizace je omezená na ${items(ARR_MAX_N)} – Insert se neprovedl.`,
      true,
    );
    return;
  }
  const phiBefore = phiArr(n, st.p);
  let cost = 0;
  st.ops++;
  st.amort += AMORT_INSERT;
  chartBegin(st.chart, `Insert(${fmt(v)})`, phiBefore);
  if (n >= st.p) {
    yield emit(st, 1, `n = p = ${n}: pole je plné, musíme realokovat.`);
    st.p = Math.max(1, st.p) * 2;
    st.real += n;
    cost += n;
    for (let i = 0; i < n; i++) st.marks[i] = "box-compare";
    chartBill(st.chart, cost, phiArr(n, st.p));
    yield emit(
      st,
      2,
      `Nová kapacita ${st.p}, zkopírovali jsme ${items(n)} (cena ${n}). Potenciál klesl z ${fmt(phiBefore)} na ${fmt(phiArr(n, st.p))} – kopírování zaplatil.`,
    );
  }
  st.items.push({ id: st.nextId++, v });
  st.real += 1;
  cost += 1;
  st.marks = { [n]: "box-new" };
  chartBill(st.chart, cost, phiArr(n + 1, st.p));
  const dPhi = phiArr(n + 1, st.p) - phiBefore;
  const note =
    v !== x
      ? " (x upraveno na celé číslo v rozsahu ±" + ARR_MAX_VALUE + ")"
      : "";
  yield emit(st, 3, `Vložíme ${fmt(v)} na pozici ${n} (cena 1)${note}.`);
  // závěrečný krok: výsledek operace a její účet
  st.chart.live = false;
  yield emit(
    st,
    null,
    `Insert(${fmt(v)}): ${shape(st)}; ${summary(cost, dPhi, AMORT_INSERT)}`,
  );
}

export function* arrDelete(st: ArrState): StepGen<ArrState> {
  st.marks = {};
  if (!st.items.length) {
    yield emit(st, 0, "Pole je prázdné – není co odebrat.", true);
    return;
  }
  const phiBefore = phiArr(st.items.length, st.p);
  let cost = 1;
  st.ops++;
  st.amort += AMORT_DELETE;
  chartBegin(st.chart, "Delete", phiBefore);
  const last = st.items.length - 1;
  const removed = st.items[last].v;
  st.marks = { [last]: "box-removed" };
  yield emit(st, 1, `Odebereme poslední prvek ${fmt(removed)} (cena 1).`);
  st.items.pop();
  st.real += 1;
  const n = st.items.length;
  st.marks = {};
  chartBill(st.chart, cost, phiArr(n, st.p));
  if (st.p === 4 * n && st.p > 1) {
    yield emit(st, 2, `p = 4n (${st.p} = 4·${n}): pole je řídké, zmenšíme ho.`);
    st.p = Math.max(1, st.p / 2);
    st.real += n;
    cost += n;
    for (let i = 0; i < n; i++) st.marks[i] = "box-compare";
    chartBill(st.chart, cost, phiArr(n, st.p));
    yield emit(
      st,
      3,
      `Zmenšíme kapacitu na ${st.p}, zkopírujeme ${items(n)} (cena ${n}). Kopírování zaplatil potenciál.`,
    );
  } else {
    yield emit(st, 2, `p = ${st.p} ≠ 4n = ${4 * n}, kapacitu neměníme.`);
  }
  st.marks = {};
  st.chart.live = false;
  const dPhi = phiArr(n, st.p) - phiBefore;
  yield emit(
    st,
    null,
    `Delete: odebráno ${fmt(removed)}; ${shape(st)}; ${summary(cost, dPhi, AMORT_DELETE)}`,
  );
}

/** Kolik operací z dávky „k× Insert“ / „k× Delete“ se opravdu provede (limit prvků, prázdné pole). */
export function batchCount(st: ArrState, k: number, insert: boolean): number {
  const n = st.items.length;
  return Math.max(0, Math.min(Math.floor(k) || 0, insert ? ARR_MAX_N - n : n));
}

/** Dávka k× Insert s hodnotami x, x+1, …; na konci souhrn celé dávky. */
export function* arrInsertMany(
  st: ArrState,
  x: number,
  k: number,
): StepGen<ArrState> {
  yield* batch(st, batchCount(st, k, true), true, (i) => arrInsert(st, x + i));
}

/** Dávka k× Delete (nejvýše tolik, kolik je prvků). */
export function* arrDeleteMany(st: ArrState, k: number): StepGen<ArrState> {
  yield* batch(st, batchCount(st, k, false), false, () => arrDelete(st));
}

function* batch(
  st: ArrState,
  count: number,
  insert: boolean,
  op: (i: number) => StepGen<ArrState>,
): StepGen<ArrState> {
  st.marks = {};
  if (count === 0) {
    yield emit(
      st,
      0,
      insert
        ? `Vizualizace je omezená na ${items(ARR_MAX_N)} – další Insert se neprovede.`
        : "Pole je prázdné – není co odebrat.",
      true,
    );
    return;
  }
  const real0 = st.real;
  const phiBefore = phiArr(st.items.length, st.p);
  for (let i = 0; i < count; i++) yield* op(i);
  const real = st.real - real0;
  const dPhi = phiArr(st.items.length, st.p) - phiBefore;
  const bound = insert ? AMORT_INSERT : AMORT_DELETE;
  st.marks = {};
  yield emit(
    st,
    null,
    `${count}× ${insert ? "Insert" : "Delete"}: ${shape(st)}; skutečná cena dávky ${real}, ΔΦ = ${signed(dPhi)} → amortizovaně ${fmt(real + dPhi)} ≤ ${count}·${bound} = ${count * bound}.`,
  );
}

/* ---------- rozložení buněk pole na plátně ---------- */

export const CELL_W = 40;
export const CELL_H = 36;
export const CELLS_PER_ROW = 16;
const ROW_H = 58;

export interface ArrLayout {
  /** počet vykreslených buněk (= kapacita) */
  cells: number;
  perRow: number;
  rows: number;
  /** šířka obdélníku buňky */
  cellW: number;
  /** rozměry viewBoxu; stejná šířka se použije i jako max-width, aby se pole nezmenšovalo */
  width: number;
  height: number;
  x: (i: number) => number;
  y: (i: number) => number;
}

/** Buňky mají pevnou velikost a zalamují se do řádků po CELLS_PER_ROW – čitelné pro každou kapacitu. */
export function arrayLayout(
  p: number,
  /** nejvýš tolik buněk v řádku (úzký displej: podle šířky), výchozí CELLS_PER_ROW */
  maxPerRow: number = CELLS_PER_ROW,
): ArrLayout {
  const cells =
    Number.isFinite(p) && p >= 1 ? Math.min(Math.floor(p), 4 * ARR_MAX_N) : 1;
  const perRow = Math.min(
    cells,
    CELLS_PER_ROW,
    Math.max(1, Math.floor(maxPerRow)),
  );
  const rows = Math.ceil(cells / perRow);
  return {
    cells,
    perRow,
    rows,
    cellW: CELL_W - 2,
    width: perRow * CELL_W + 10,
    height: rows * ROW_H + 12,
    x: (i) => 5 + (i % perRow) * CELL_W,
    y: (i) => 10 + Math.floor(i / perRow) * ROW_H,
  };
}

/* ================================================================== binární počítadlo */

export interface CntState {
  bits: number[]; // bits[0] = nejnižší bit
  marks: Record<number, string>;
  real: number;
  amort: number;
  /** potenciál (počet jedniček) ve chvíli, kdy začalo účtování */
  phi0: number;
  vars: Record<string, string | number>;
  /** cena a potenciál posledních incrementů (graf jako obr. 9.2) */
  chart: CostChart;
}

/** Největší počáteční hodnota pro „Postavit“ (12 bitů se na plátno vejde i na telefonu). */
export const CNT_MAX_START = 4095;
export const VAR_PHI_CNT = "Φ (počet jedniček)";

/** Počáteční hodnota ze sdíleného odkazu (`?v=7`); neplatná → null. */
export const cntFromUrl = (param: string | null): number | null =>
  param ? parseIntStrict(param, { min: 0, max: CNT_MAX_START }).value : null;
export const VAR_AMORT_CNT = "Σ amortizovaná (2/op)";

const ones = (st: CntState) => st.bits.filter((b) => b).length;
export const cntValue = (st: CntState) =>
  st.bits.reduce((acc, b, i) => acc + b * 2 ** i, 0);

export const PC_CNT = [
  "Increment:",
  "  i ← 0",
  "  Dokud bit_i = 1:",
  "    bit_i ← 0; i ← i + 1   // cena 1 za každý shozený bit",
  "  bit_i ← 1   // cena 1",
  "",
  "Potenciál Φ = počet jedniček. Amortizovaná cena = skutečná + ΔΦ = 2.",
];

/** Σ amortizovaná + Φ₀ − Φ binárního počítadla. */
export const cntBound = (st: CntState) => st.amort + st.phi0 - ones(st);

export function cntVars(st: CntState) {
  const phi = ones(st);
  st.vars = {
    hodnota: cntValue(st),
    [VAR_PHI_CNT]: phi,
    [VAR_PHI0]: st.phi0,
    [VAR_REAL]: st.real,
    [VAR_AMORT_CNT]: st.amort,
    [VAR_BOUND]: st.amort + st.phi0 - phi,
  };
}

/** Počítadlo s danou počáteční hodnotou 0…CNT_MAX_START (aspoň šest bitů, další přibývají podle potřeby). */
export function mkCounter(start = 0): CntState {
  const v = Number.isFinite(start)
    ? Math.max(0, Math.min(CNT_MAX_START, Math.trunc(start)))
    : 0;
  const bits = Array.from(
    { length: Math.max(6, v.toString(2).length) },
    (_, i) => Math.floor(v / 2 ** i) % 2,
  );
  const st: CntState = {
    bits,
    marks: {},
    real: 0,
    amort: 0,
    phi0: 0,
    vars: {},
    chart: mkChart(0),
  };
  st.phi0 = ones(st);
  st.chart.phi0 = st.phi0;
  cntVars(st);
  return st;
}

export function* increment(st: CntState): StepGen<CntState> {
  st.marks = {};
  const before = cntValue(st);
  const phiBefore = ones(st);
  st.amort += 2;
  chartBegin(st.chart, `Increment ${before} → ${before + 1}`, phiBefore);
  let i = 0;
  let flips = 0;
  while (i < st.bits.length && st.bits[i] === 1) {
    st.bits[i] = 0;
    st.real++;
    flips++;
    st.marks[i] = "box-removed";
    chartBill(st.chart, flips, ones(st));
    cntVars(st);
    yield snap(
      st,
      3,
      `bit ${i} byl 1 → shodíme na 0 (zaplatí mince, která na něm ležela).`,
    );
    i++;
  }
  if (i === st.bits.length) st.bits.push(0);
  st.bits[i] = 1;
  st.real++;
  st.marks[i] = "box-new";
  chartBill(st.chart, flips + 1, ones(st));
  cntVars(st);
  yield snap(st, 4, `bit ${i} ← 1 (cena 1 + jedna mince navíc na nový bit).`);
  const dPhi = ones(st) - phiBefore;
  st.chart.live = false;
  yield snap(
    st,
    null,
    `Increment: ${before} → ${cntValue(st)}; skutečná cena ${flips + 1}, ΔΦ = ${signed(dPhi)} → amortizovaně ${flips + 1 + dPhi}.`,
  );
}

/** Dávka k× Increment se souhrnem na konci. */
export function* incrementMany(st: CntState, k: number): StepGen<CntState> {
  const count = Math.max(1, Math.floor(k) || 1);
  const before = cntValue(st);
  const real0 = st.real;
  const phiBefore = ones(st);
  for (let i = 0; i < count; i++) yield* increment(st);
  const real = st.real - real0;
  const dPhi = ones(st) - phiBefore;
  st.marks = {};
  cntVars(st);
  yield snap(
    st,
    null,
    `${count}× Increment: ${before} → ${cntValue(st)}; skutečná cena dávky ${real}, ΔΦ = ${signed(dPhi)} → amortizovaně ${real + dPhi} = ${count}·2.`,
  );
}
