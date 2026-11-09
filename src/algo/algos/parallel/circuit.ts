/**
 * Hradlové sítě (Průvodce, kap. 15.1, s. 381–385) – čistý model bez Reactu (testy v circuit.test.ts).
 *
 * Síť = vstupy (I), hradla (H) a výstupy (O); každý vrchol drží zdroje svých vstupních portů v pořadí
 * argumentů funkce (z(e) z definice na s. 382), nezapojený port = null. Výstup hradla může vést do
 * libovolně mnoha portů. Síť musí být acyklická.
 *
 * Výpočet po taktech (definice ze s. 383): v taktu 0 mají hodnotu vstupy, v každém dalším taktu se
 * ohodnotí vrcholy, jejichž všechny vstupní hrany vedou z ohodnocených vrcholů. Vrstva S_i = vrcholy
 * ohodnocené poprvé v taktu i (= max vrstev zdrojů + 1). Časová složitost = hloubka = počet neprázdných
 * vrstev, prostorová = počet hradel (s. 384).
 */
import { snap, type StepGen } from "../../core/steps";

export type Bit = 0 | 1;
export type GateFn = "and" | "or" | "not" | "nand" | "nor" | "xor";
export type NodeKind = "in" | "gate" | "out";
/** směr toku kresby: zleva doprava (obr. 15.1) nebo shora dolů (obr. 15.2 vpravo) */
export type Flow = "right" | "down";

export interface CNode {
  /** jméno = popisek, v síti jedinečné (x, A1, q) */
  id: string;
  kind: NodeKind;
  /** funkce hradla (jen u kind = "gate") */
  fn?: GateFn;
  /** zdroje vstupních portů v pořadí argumentů; vstup sítě [], výstup [zdroj] */
  inputs: (string | null)[];
  /** střed vrcholu v jednotkách kresby (px při měřítku 1) */
  x: number;
  y: number;
  /** poloha svislé „sběrnice“ rozvětvení vodičů z tohoto vrcholu (knižní kresba); jinak automaticky */
  bus?: number;
}

export interface Circuit {
  nodes: CNode[];
  flow?: Flow;
}

export interface GateInfo {
  arity: number;
  /** znak v hradle jako v knize (∧ ∨ ¬ ⊕) */
  symbol: string;
  /** název v paletě */
  name: string;
  /** předpona jména nového hradla v editoru */
  prefix: string;
  apply: (a: readonly Bit[]) => Bit;
}

const b = (v: boolean): Bit => (v ? 1 : 0);

export const GATE_INFO: Record<GateFn, GateInfo> = {
  and: {
    arity: 2,
    symbol: "∧",
    name: "AND",
    prefix: "A",
    apply: (a) => b(a[0] === 1 && a[1] === 1),
  },
  or: {
    arity: 2,
    symbol: "∨",
    name: "OR",
    prefix: "O",
    apply: (a) => b(a[0] === 1 || a[1] === 1),
  },
  not: {
    arity: 1,
    symbol: "¬",
    name: "NOT",
    prefix: "N",
    apply: (a) => b(a[0] !== 1),
  },
  nand: {
    arity: 2,
    symbol: "¬∧",
    name: "NAND",
    prefix: "NA",
    apply: (a) => b(!(a[0] === 1 && a[1] === 1)),
  },
  nor: {
    arity: 2,
    symbol: "¬∨",
    name: "NOR",
    prefix: "NO",
    apply: (a) => b(!(a[0] === 1 || a[1] === 1)),
  },
  xor: {
    arity: 2,
    symbol: "⊕",
    name: "XOR",
    prefix: "X",
    apply: (a) => b(a[0] !== a[1]),
  },
};

export const GATE_FNS: readonly GateFn[] = [
  "and",
  "or",
  "not",
  "nand",
  "nor",
  "xor",
];

/** nejvýše tolik vstupů (pravdivostní tabulka 2ⁿ řádků) a vrcholů */
export const MAX_INPUTS = 8;
/** pravdivostní tabulka se ukazuje jen do tolika vstupů (2⁶ = 64 řádků) */
export const TABLE_MAX_INPUTS = 6;
export const MAX_NODES = 60;

export function arityOf(n: Pick<CNode, "kind" | "fn">): number {
  if (n.kind === "in") return 0;
  if (n.kind === "out") return 1;
  return GATE_INFO[n.fn ?? "and"].arity;
}

export const inputsOf = (c: Circuit) => c.nodes.filter((n) => n.kind === "in");
export const outputsOf = (c: Circuit) =>
  c.nodes.filter((n) => n.kind === "out");
export const gateCount = (c: Circuit) =>
  c.nodes.filter((n) => n.kind === "gate").length;

/** id → id vrcholů, do kterých z něj vede hrana (každý port zvlášť – multigraf) */
export function successors(c: Circuit): Map<string, string[]> {
  const out = new Map<string, string[]>(c.nodes.map((n) => [n.id, []]));
  for (const n of c.nodes)
    for (const s of n.inputs) if (s !== null) out.get(s)?.push(n.id);
  return out;
}

/** Cyklus v síti jako cesta [v, …, v] (ve směru hran), nebo null. */
export function findCycle(c: Circuit): string[] | null {
  const succ = successors(c);
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const dfs = (v: string): string[] | null => {
    state.set(v, 1);
    stack.push(v);
    for (const w of succ.get(v) ?? []) {
      const s = state.get(w);
      if (s === 1) return [...stack.slice(stack.indexOf(w)), w];
      if (s === undefined) {
        const r = dfs(w);
        if (r) return r;
      }
    }
    stack.pop();
    state.set(v, 2);
    return null;
  };
  for (const n of c.nodes)
    if (!state.has(n.id)) {
      const r = dfs(n.id);
      if (r) return r;
    }
  return null;
}

/**
 * Uzavřel by nový vodič `from` → `to` cyklus? Vrátí cestu [to, …, from, to], nebo null.
 * (Cyklus vznikne právě tehdy, když z `to` po hranách dojdeme do `from`.)
 */
export function wouldCycle(
  c: Circuit,
  from: string,
  to: string,
): string[] | null {
  if (from === to) return [to, to];
  const succ = successors(c);
  const prev = new Map<string, string>();
  const queue = [to];
  const seen = new Set([to]);
  while (queue.length) {
    const v = queue.shift()!;
    if (v === from) {
      const path = [from];
      let u = from;
      while (u !== to) {
        u = prev.get(u)!;
        path.unshift(u);
      }
      return [...path, to];
    }
    for (const w of succ.get(v) ?? [])
      if (!seen.has(w)) {
        seen.add(w);
        prev.set(w, v);
        queue.push(w);
      }
  }
  return null;
}

/**
 * Vrstvy (takt, ve kterém vrchol poprvé vydá výsledek): vstupy a vrcholy bez zapojeného portu 0,
 * jinak max(vrstvy zdrojů) + 1; vrchol, který není vstupem, je nejméně ve vrstvě 1. Nezapojené porty se
 * ignorují (živá hloubka v editoru). Vrcholy na cyklu (a za ním) vrstvu nedostanou.
 */
export function circuitLayers(c: Circuit): Record<string, number> {
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const layer: Record<string, number> = {};
  const busy = new Set<string>();
  const visit = (id: string): number | null => {
    if (id in layer) return layer[id];
    const n = byId.get(id);
    if (!n || busy.has(id)) return null;
    busy.add(id);
    let L = n.kind === "in" ? 0 : 1;
    for (const s of n.inputs) {
      if (s === null || !byId.has(s)) continue;
      const ls = visit(s);
      if (ls === null) {
        busy.delete(id);
        return null;
      }
      L = Math.max(L, ls + 1);
    }
    busy.delete(id);
    layer[id] = L;
    return L;
  };
  for (const n of c.nodes) visit(n.id);
  // pořadí klíčů podle sítě (stabilní výpis)
  const ordered: Record<string, number> = {};
  for (const n of c.nodes) if (n.id in layer) ordered[n.id] = layer[n.id];
  return ordered;
}

/** Hloubka = počet neprázdných vrstev (vrstvy 0 … max jsou vždy všechny neprázdné). */
export function circuitDepth(c: Circuit): number {
  const ls = Object.values(circuitLayers(c));
  return ls.length ? Math.max(...ls) + 1 : 0;
}

export interface CircuitIssues {
  /** síť nejde spočítat */
  errors: string[];
  /** porušená podmínka definice, která výpočtu nevadí */
  warnings: string[];
}

export const cycleMessage = (path: readonly string[]) =>
  `Síť obsahuje cyklus ${path.join(" → ")} – hradlová síť musí být acyklická (výstup hradla se nesmí vrátit na jeho vstup).`;

/** Podmínky definice (s. 382–383) potřebné pro výpočet. */
export function validateCircuit(c: Circuit): CircuitIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cyc = findCycle(c);
  if (cyc) errors.push(cycleMessage(cyc));
  if (!inputsOf(c).length) errors.push("Síť nemá žádný vstup.");
  if (!outputsOf(c).length) errors.push("Síť nemá žádný výstup.");
  const succ = successors(c);
  for (const n of c.nodes) {
    if (n.kind === "gate")
      n.inputs.forEach((s, j) => {
        if (s === null)
          errors.push(`Hradlo ${n.id} nemá zapojený ${j + 1}. vstup.`);
      });
    if (n.kind === "out" && n.inputs[0] == null)
      errors.push(`Výstup ${n.id} nemá zapojený vstup.`);
    if (n.kind === "gate" && !succ.get(n.id)?.length)
      warnings.push(
        `Z hradla ${n.id} nevede žádná hrana (jeho výsledek se nepoužije).`,
      );
    if (n.kind === "in" && !succ.get(n.id)?.length)
      warnings.push(
        `Vstup ${n.id} se nikde nepoužívá (výstupy na něm nezávisí).`,
      );
  }
  return { errors, warnings };
}

/** Hodnota hradla z hodnot jeho vstupů. */
export function applyGate(fn: GateFn, args: readonly Bit[]): Bit {
  return GATE_INFO[fn].apply(args);
}

/** Výsledek celé sítě (hodnoty všech vrcholů) – bez kroků. Síť musí být platná. */
export function evaluateCircuit(
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
): Record<string, Bit> {
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const val: Record<string, Bit> = {};
  const get = (id: string): Bit => {
    if (id in val) return val[id];
    const n = byId.get(id)!;
    const args = n.inputs.map((s) => (s === null ? 0 : get(s)));
    const v: Bit =
      n.kind === "in"
        ? (bits[id] ?? 0)
        : n.kind === "out"
          ? args[0]
          : applyGate(n.fn ?? "and", args);
    val[id] = v;
    return v;
  };
  const out: Record<string, Bit> = {};
  for (const n of c.nodes) out[n.id] = get(n.id);
  return out;
}

/** Klíč struktury sítě bez poloh (jména, funkce, zapojení, pořadí) – změna = nový výpočet. */
export function structureKey(c: Circuit): string {
  return c.nodes
    .map(
      (n) =>
        `${n.kind}:${n.id}:${n.fn ?? ""}(${n.inputs.map((s) => s ?? "_").join(",")})`,
    )
    .join(";");
}

/* ------------------------------------------------------------------ výpočet po taktech */

export interface CircuitState {
  takt: number;
  /** počet vrstev (hloubka) */
  depth: number;
  gates: number;
  /** hodnota vrcholu, null = v tomto taktu ještě neznámá */
  values: Record<string, Bit | null>;
  /** vrstva S_takt – vrcholy, které v tomto taktu vydaly výsledek poprvé */
  active: string[];
  done: boolean;
}

export const CIRCUIT_PSEUDOCODE = [
  "Takt 0: ohodnotíme vstupy sítě (a konstanty) – vrstva S₀",
  "Pro takt t = 1, 2, …:",
  "  Současně ohodnotíme každý vrchol, jehož všechny vstupy už mají hodnotu:",
  "    hradlo h: hodnota ← F(h)(hodnoty vstupů v pořadí z)",
  "    výstup sítě: zkopíruje hodnotu, která do něj přišla",
  "  Vrcholy ohodnocené v taktu t tvoří vrstvu S_t",
  "Výsledek = ohodnocení výstupů (jakmile mají hodnotu všechny vrcholy)",
  "Čas = hloubka (počet neprázdných vrstev), prostor = počet hradel",
];

const SUB = "₀₁₂₃₄₅₆₇₈₉";
export const subscript = (n: number) =>
  String(n)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");

/** „5 vrstev“ / „2 vrstvy“ / „1 vrstva“ */
export function plural(n: number, one: string, few: string, many: string) {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

/** „y ∧ x = 0 ∧ 1“ pro zprávu kroku */
function formula(n: CNode, vals: Record<string, Bit | null>): string {
  const fn = n.fn ?? "and";
  const names = n.inputs.map((s) => s ?? "_");
  const bits = n.inputs.map((s) => (s === null ? "?" : String(vals[s])));
  const join = (xs: string[]) => {
    switch (fn) {
      case "not":
        return `¬${xs[0]}`;
      case "nand":
        return `¬(${xs[0]} ∧ ${xs[1]})`;
      case "nor":
        return `¬(${xs[0]} ∨ ${xs[1]})`;
      default:
        return `${xs[0]} ${GATE_INFO[fn].symbol} ${xs[1]}`;
    }
  };
  return `${join(names)} = ${join(bits)}`;
}

/**
 * Výpočet sítě po taktech (definice ze s. 383): krok = takt, stav = hodnoty vrcholů. Síť musí být platná
 * (validateCircuit bez chyb). Počet kroků = hloubka.
 */
export function* circuitSteps(
  c: Circuit,
  bits: Readonly<Record<string, Bit>>,
): StepGen<CircuitState> {
  const L = circuitLayers(c);
  const depth = circuitDepth(c);
  const gates = gateCount(c);
  const final = evaluateCircuit(c, bits);
  const st: CircuitState = {
    takt: 0,
    depth,
    gates,
    values: Object.fromEntries(c.nodes.map((n) => [n.id, null])),
    active: [],
    done: false,
  };
  const summary = `Hloubka ${plural(depth, "vrstva", "vrstvy", "vrstev")} (S₀…S${subscript(depth - 1)}), ${plural(gates, "hradlo", "hradla", "hradel")}.`;
  for (let t = 0; t < depth; t++) {
    const layer = c.nodes.filter((n) => L[n.id] === t);
    for (const n of layer) st.values[n.id] = final[n.id];
    st.takt = t;
    st.active = layer.map((n) => n.id);
    st.done = t === depth - 1;
    const parts = layer.map((n) =>
      n.kind === "in"
        ? `${n.id} = ${final[n.id]}`
        : n.kind === "out"
          ? `výstup ${n.id} = ${n.inputs[0]} = ${final[n.id]}`
          : `${n.id} = ${formula(n, st.values)} = ${final[n.id]}`,
    );
    const head = `Takt ${t} (S${subscript(t)})`;
    if (t === 0) {
      const what = layer.some((n) => n.kind !== "in")
        ? "vstupy a hradla bez vstupů"
        : "vstupy";
      yield snap(
        st,
        st.done ? 6 : 0,
        `${head}: ${what} ${parts.join(", ")}.${st.done ? " " + summary : ""}`,
      );
      continue;
    }
    const msg = `${head}: ${parts.join(", ")}.`;
    if (st.done) {
      const outs = outputsOf(c)
        .map((n) => `${n.id} = ${final[n.id]}`)
        .join(", ");
      yield snap(st, 6, `${msg} Výsledek: ${outs}. ${summary}`);
    } else {
      const line = layer.some((n) => n.kind === "gate") ? 3 : 4;
      yield snap(st, line, msg);
    }
  }
}

/* ------------------------------------------------------------------ pravdivostní tabulka */

export interface TruthTable {
  inputs: string[];
  outputs: string[];
  /** řádky v binárním pořadí (první vstup = nejvyšší bit) */
  rows: { bits: Bit[]; outs: Bit[] }[];
}

export function bitsToRecord(
  c: Circuit,
  arr: readonly Bit[],
): Record<string, Bit> {
  const out: Record<string, Bit> = {};
  inputsOf(c).forEach((n, i) => (out[n.id] = arr[i] ?? 0));
  return out;
}

export function truthTable(c: Circuit): TruthTable {
  const ins = inputsOf(c).map((n) => n.id);
  const outs = outputsOf(c).map((n) => n.id);
  const k = ins.length;
  const rows: TruthTable["rows"] = [];
  for (let v = 0; v < 1 << k; v++) {
    const bits = ins.map((_, i) => ((v >> (k - 1 - i)) & 1) as Bit);
    const val = evaluateCircuit(c, bitsToRecord(c, bits));
    rows.push({ bits, outs: outs.map((o) => val[o]) });
  }
  return { inputs: ins, outputs: outs, rows };
}
