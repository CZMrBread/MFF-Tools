/**
 * Bloomův filtr (jedna sdílená tabulka m bitů, k hešovacích funkcí) – čisté generátory kroků.
 */
import { rng, snap, type StepGen } from "../../core/steps";
import { plural } from "../../views/text";
import { czNum, HASH_FNS, isKey, keyError } from "./hashfn";

export interface BloomState {
  m: number;
  k: number;
  seed: number;
  bits: number[];
  marks: Record<number, string>;
  vars: Record<string, string | number>;
  /** skutečně vložené klíče – filtr je nezná, slouží jen k rozpoznání falešně pozitivních odpovědí */
  inserted: number[];
}

const bloomFns = (st: BloomState) => {
  const lin = HASH_FNS.find((h) => h.id === "linear")!;
  return Array.from({ length: st.k }, (_, i) =>
    lin.make(st.m, st.seed + 31 * i),
  );
};

/** Pozice bitů h₁(x), …, h_k(x). */
export const bloomBits = (st: BloomState, x: number): number[] =>
  bloomFns(st).map((h) => h(x));

export const PC_BL_INSERT = [
  "Insert(x):",
  "  Pro i = 1, …, k:",
  "    B[hᵢ(x)] ← 1",
];
export const PC_BL_QUERY = [
  "Lookup(x):",
  "  Pro i = 1, …, k:",
  "    Je-li B[hᵢ(x)] = 0: odpovíme NE (jistě není).",
  "  Odpovíme ANO (možná je – falešně pozitivní s pravděpodobností ≈ (1 − e^{−kn/m})^k).",
];

/** Odhad pravděpodobnosti falešně pozitivní odpovědi (1 − e^(−kn/m))^k. */
export const bloomFp = (st: BloomState): number =>
  Math.pow(1 - Math.exp((-st.k * st.inserted.length) / st.m), st.k);

const percent = (p: number) => czNum(p * 100, 1) + " %";

export function bloomVars(st: BloomState) {
  st.vars = {
    n: st.inserted.length,
    m: st.m,
    k: st.k,
    "odhad P(falešně pozitivní)": percent(bloomFp(st)),
    jedničky: st.bits.filter((b) => b).length,
  };
}

export function mkB(m: number, k: number): BloomState {
  const st: BloomState = {
    m,
    k,
    seed: 5,
    bits: Array(m).fill(0),
    marks: {},
    vars: {},
    inserted: [],
  };
  bloomVars(st);
  return st;
}

/** Neplatný klíč: jediný krok s vysvětlením, filtr se nemění. */
function* rejectKey(st: BloomState, message: string): StepGen<BloomState> {
  bloomVars(st);
  yield { ...snap(st, null, message), error: true };
}

export function* blInsert(st: BloomState, x: number): StepGen<BloomState> {
  st.marks = {};
  const err = keyError(x);
  if (err) {
    yield* rejectKey(st, err);
    return;
  }
  const pos = bloomBits(st, x);
  if (!st.inserted.includes(x)) st.inserted.push(x);
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    const was = st.bits[p];
    st.bits[p] = 1;
    st.marks[p] = was ? "cell-compare" : "cell-new";
    bloomVars(st);
    st.vars.x = x;
    yield snap(
      st,
      2,
      `h${i + 1}(${x}) = ${p}: bit ${was ? "už byl 1" : "nastavíme na 1"}.`,
    );
  }
}

export function* blQuery(st: BloomState, x: number): StepGen<BloomState> {
  st.marks = {};
  const err = keyError(x);
  if (err) {
    yield* rejectKey(st, err);
    return;
  }
  const pos = bloomBits(st, x);
  bloomVars(st);
  st.vars.x = x;
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    // testovaný bit = 1 fialově (cell-hit), aby se nepletl s nově nastaveným bitem u Insertu (zelený cell-new)
    st.marks[p] = st.bits[p] ? "cell-hit" : "cell-removed";
    yield snap(st, 2, `h${i + 1}(${x}) = ${p}: bit je ${st.bits[p]}.`);
    if (!st.bits[p]) {
      yield snap(st, 2, `Bit je 0 → odpověď NE, ${x} v množině určitě není.`);
      return;
    }
  }
  const truly = st.inserted.includes(x);
  yield snap(
    st,
    3,
    `Všechny bity jsou 1 → odpověď ANO. ${truly ? `(${x} byl opravdu vložen.)` : `(${x} vložen NEBYL – falešně pozitivní!)`}`,
  );
}

/** Postupně vloží všechny klíče (tlačítko „Vložit … náhodných“). */
export function* blInsertAll(
  st: BloomState,
  keys: number[],
): StepGen<BloomState> {
  for (const k of keys) yield* blInsert(st, k);
}

/**
 * Otestuje `count` náhodných klíčů (1 … 999), které vloženy NEBYLY, a na konci shrne, kolikrát filtr
 * odpověděl falešně pozitivně.
 */
export function* blTestForeign(
  st: BloomState,
  count: number,
  seed: number,
): StepGen<BloomState> {
  const r = rng(seed);
  const used = new Set(st.inserted);
  const keys: number[] = [];
  for (let tries = 0; keys.length < count && tries < 100 * count; tries++) {
    const k = 1 + Math.floor(r() * 999);
    if (used.has(k)) continue;
    used.add(k);
    keys.push(k);
  }
  let fp = 0;
  for (const k of keys) {
    if (bloomBits(st, k).every((p) => st.bits[p])) fp++;
    yield* blQuery(st, k);
  }
  st.marks = {};
  bloomVars(st);
  st.vars["falešně pozitivních"] = `${fp} z ${keys.length}`;
  yield snap(
    st,
    null,
    `Z ${keys.length} nevložených klíčů odpověděl filtr ANO u ${fp} (falešně pozitivní odpovědi), tedy u ${percent(keys.length ? fp / keys.length : 0)}; odhad ze vzorce je ${percent(bloomFp(st))}.`,
  );
}

/* ================================================================== stavba a závěrečné kroky */

/** Filtr postavený z klíčů bez animace (výchozí příklad, „Postavit“, odkaz). Neplatné a opakované klíče jsou ve `skipped`. */
export function blBuild(
  m: number,
  k: number,
  keys: number[],
): { state: BloomState; used: number[]; skipped: number[] } {
  const st = mkB(m, k);
  const used: number[] = [];
  const skipped: number[] = [];
  for (const x of keys) {
    if (!isKey(x) || st.inserted.includes(x)) {
      skipped.push(x);
      continue;
    }
    for (const p of bloomBits(st, x)) st.bits[p] = 1;
    st.inserted.push(x);
    used.push(x);
  }
  bloomVars(st);
  return { state: st, used, skipped };
}

const ones = (st: BloomState) => st.bits.filter((b) => b).length;
const fpText = (st: BloomState) =>
  `odhad P(falešně pozitivní) = ${percent(bloomFp(st))}`;

/** Insert / Lookup se závěrečným krokem „Lookup(17): ANO – …“ (u Insertu: kolik bitů bylo nových). */
export function* blOp(
  st: BloomState,
  x: number,
  op: "insert" | "lookup",
): StepGen<BloomState> {
  if (keyError(x)) {
    yield* (op === "insert" ? blInsert : blQuery)(st, x);
    return;
  }
  if (op === "insert") {
    const before = ones(st);
    yield* blInsert(st, x);
    const fresh = ones(st) - before;
    const distinct = new Set(bloomBits(st, x)).size;
    yield snap(
      st,
      null,
      `Insert(${x}): ${fresh === 0 ? "žádný nový bit – všechny už byly 1" : `${plural(fresh, "nastaven", "nastaveny", "nastaveno")} ${fresh} ${plural(fresh, "nový bit", "nové bity", "nových bitů")}`}${
        fresh > 0 && fresh < distinct
          ? `, ${distinct - fresh} už ${plural(distinct - fresh, "byl", "byly", "bylo")} 1`
          : ""
      }; jedniček ${ones(st)} z ${st.m}, ${fpText(st)}.`,
    );
    return;
  }
  yield* blQuery(st, x);
  const yes = bloomBits(st, x).every((p) => st.bits[p]);
  const answer = !yes
    ? `NE – ${x} v množině určitě není.`
    : st.inserted.includes(x)
      ? `ANO – ${x} byl opravdu vložen.`
      : `ANO, ale ${x} vložen nebyl – falešně pozitivní odpověď (${fpText(st)}).`;
  yield snap(st, null, `Lookup(${x}): ${answer}`);
}

/** Hromadné vložení se shrnutím (počet jedniček a odhad falešně pozitivních odpovědí). */
export function* blInsertAllOp(
  st: BloomState,
  keys: number[],
  title: string,
): StepGen<BloomState> {
  yield* blInsertAll(st, keys);
  st.marks = {};
  bloomVars(st);
  yield snap(
    st,
    null,
    `${title}: n = ${st.inserted.length}, jedniček ${ones(st)} z ${st.m}, ${fpText(st)}.`,
  );
}
