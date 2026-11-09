/**
 * Hešování se separovanými řetězci a s otevřenou adresací (lineární přidávání) – čisté generátory kroků.
 * Stránka HashPage.tsx je jen přehrává.
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import { plural } from "../../views/text";
import { czNum, HASH_FNS, isKey, keyError } from "./hashfn";

export interface HashState {
  m: number;
  fnId: string;
  seed: number;
  /** separované řetězce: seznam klíčů v přihrádce */
  buckets: number[][];
  /** otevřená adresace: klíč, null = volno, 'tomb' = náhrobek */
  cells: (number | null | "tomb")[];
  marks: Record<number, string>;
  /** zvýraznění klíče uvnitř přihrádky (řetězení) */
  keyMark: { bucket: number; idx: number; cls: string } | null;
  vars: Record<string, string | number>;
  /** počet uložených klíčů (náhrobky se nepočítají) */
  n: number;
  /** stopa sond právě probíhající operace otevřené adresace (kreslí se pod řadou buněk, E6) */
  trail: ProbeTrailItem[];
}

/**
 * Výsledek jedné sondy: jiný klíč (`other`, key = klíč v buňce), náhrobek, prázdná buňka, hledaný klíč
 * nalezen (`found`) / smazán (`removed`), nebo uložení vkládaného klíče (`placed`, key = x).
 */
export type ProbeTrailKind =
  "other" | "tomb" | "empty" | "found" | "removed" | "placed";
export interface ProbeTrailItem {
  cell: number;
  kind: ProbeTrailKind;
  key?: number;
}

export type HashOp = "insert" | "find" | "delete";

const fnOf = (id: string) => HASH_FNS.find((f) => f.id === id) ?? HASH_FNS[0];
const hashOf = (st: HashState) => fnOf(st.fnId).make(st.m, st.seed);
const alpha = (st: HashState) => czNum(st.n / st.m);

export function mkTable(m: number, fnId: string, seed: number): HashState {
  return {
    m,
    fnId,
    seed,
    buckets: Array.from({ length: m }, () => []),
    cells: Array(m).fill(null),
    marks: {},
    keyMark: null,
    vars: {},
    n: 0,
    trail: [],
  };
}

const clear = (st: HashState) => {
  st.marks = {};
  st.keyMark = null;
  st.trail = [];
};

/** Krok, který oznamuje neprovedenou operaci (Visualizer ho zvýrazní červeně). */
const failStep = (st: HashState, message: string): Step<HashState> => ({
  ...snap(st, null, message),
  error: true,
});

/** Neplatný klíč: jediný krok s vysvětlením, tabulka se nemění. */
function* rejectKey(st: HashState, message: string): StepGen<HashState> {
  st.vars = { "α = n/m": alpha(st) };
  yield failStep(st, message);
}

/* ================================================================== řetězení */

export const PC_CHAIN: Record<HashOp, string[]> = {
  insert: [
    "Insert(x):",
    "  i ← h(x)",
    "  Projdeme řetězec přihrádky i; je-li tam x, končíme.",
    "  Připojíme x na konec řetězce i.",
  ],
  find: [
    "Find(x):",
    "  i ← h(x)",
    "  Projdeme řetězec přihrádky i a porovnáváme s x.",
    "  // Očekávaná délka řetězce je n/m (faktor naplnění α).",
  ],
  delete: [
    "Delete(x):",
    "  i ← h(x)",
    "  Najdeme x v řetězci přihrádky i.",
    "  Odpojíme ho ze seznamu.",
  ],
};

export function* chainOp(
  st: HashState,
  x: number,
  op: HashOp,
): StepGen<HashState> {
  clear(st);
  const err = keyError(x);
  if (err) {
    yield* rejectKey(st, err);
    return;
  }
  const i = hashOf(st)(x);
  st.vars = { x, "h(x)": i, "α = n/m": alpha(st) };
  st.marks = { [i]: "cell-active" };
  yield snap(st, 1, `h(${x}) = ${i}.`);
  const chain = st.buckets[i];
  for (let k = 0; k < chain.length; k++) {
    st.keyMark = { bucket: i, idx: k, cls: "key-compare" };
    yield snap(st, 2, `Porovnáme s ${chain[k]}.`);
    if (chain[k] === x) {
      if (op === "delete") {
        st.keyMark = { bucket: i, idx: k, cls: "key-removed" };
        yield snap(st, 3, `Nalezeno – odpojíme ${x}.`);
        chain.splice(k, 1);
        st.n--;
        st.keyMark = null;
        st.vars["α = n/m"] = alpha(st);
        yield snap(st, 3, `Hotovo, ${x} je smazán.`);
      } else {
        st.keyMark = { bucket: i, idx: k, cls: "key-found" };
        yield snap(
          st,
          2,
          op === "insert"
            ? `${x} už v tabulce je.`
            : `Nalezeno po ${k + 1} ${k === 0 ? "porovnání" : "porovnáních"}.`,
        );
      }
      return;
    }
  }
  if (op === "insert") {
    chain.push(x);
    st.n++;
    st.keyMark = { bucket: i, idx: chain.length - 1, cls: "key-new" };
    st.vars["α = n/m"] = alpha(st);
    yield snap(
      st,
      3,
      `Připojíme ${x} na konec řetězce (délka ${chain.length}).`,
    );
  } else {
    st.keyMark = null;
    yield snap(
      st,
      2,
      chain.length === 0
        ? `Přihrádka ${i} je prázdná – ${x} v tabulce není.`
        : `Došli jsme na konec řetězce – ${x} v tabulce není.`,
    );
  }
}

/* ================================================================== lineární přidávání */

export const PC_LP: Record<HashOp, string[]> = {
  insert: [
    "Insert(x):",
    "  i ← h(x)",
    "  Dokud buňka i není prázdná (nejvýše m sond):",
    "    Je-li v ní x: konec, x už v tabulce je.",
    "    Je-li v ní náhrobek: zapamatujeme si první takový.",
    "    i ← (i + 1) mod m",
    "  Uložíme x do zapamatovaného náhrobku, jinak do prázdné buňky i.",
    "  Není-li ani jedno: tabulka je plná.",
  ],
  find: [
    "Find(x):",
    "  i ← h(x)",
    "  Dokud buňka i není prázdná (nejvýše m sond):",
    "    Je-li v ní x: nalezeno.",
    "    i ← (i + 1) mod m   // náhrobky přeskakujeme",
    "  Nenalezeno.",
  ],
  delete: [
    "Delete(x):",
    "  i ← h(x)",
    "  Dokud buňka i není prázdná (nejvýše m sond):",
    "    Je-li v ní x: nahradíme ho náhrobkem † a skončíme.",
    "    i ← (i + 1) mod m   // náhrobky přeskakujeme",
    "  x v tabulce není.",
    "  // Buňku nesmíme vyprázdnit: přerušili bychom posloupnost sond jiných klíčů.",
  ],
};

/** Řádky pseudokódu, které jednotlivé události animace zvýrazňují – každá operace má vlastní pseudokód. */
interface LpLines {
  hash: number;
  /** narazili jsme na prázdnou buňku (podmínka cyklu neplatí) */
  empty: number;
  found: number;
  tomb: number;
  next: number;
  /** Insert: uložení klíče */
  place: number;
  /** Insert: plná tabulka; Find/Delete: nenalezeno */
  fail: number;
}
export const LP_LINES: Record<HashOp, LpLines> = {
  insert: { hash: 1, empty: 2, found: 3, tomb: 4, next: 5, place: 6, fail: 7 },
  find: { hash: 1, empty: 2, found: 3, tomb: 4, next: 4, place: 3, fail: 5 },
  delete: { hash: 1, empty: 2, found: 3, tomb: 4, next: 4, place: 3, fail: 5 },
};

const sondy = (k: number) => (k === 1 ? "1 sondě" : `${k} sondách`);

/** Uložení x do buňky `cell` ve stopě: prázdná buňka z poslední sondy se přebarví, náhrobek dostane vlastní řádek. */
function placeOnTrail(st: HashState, cell: number, x: number) {
  const end = st.trail[st.trail.length - 1];
  if (end && end.cell === cell && end.kind === "empty")
    st.trail[st.trail.length - 1] = { cell, kind: "placed", key: x };
  else st.trail.push({ cell, kind: "placed", key: x });
}

export function* probeOp(
  st: HashState,
  x: number,
  op: HashOp,
): StepGen<HashState> {
  clear(st);
  const err = keyError(x);
  if (err) {
    yield* rejectKey(st, err);
    return;
  }
  const L = LP_LINES[op];
  let i = hashOf(st)(x);
  st.vars = { x, "h(x)": i, "α = n/m": alpha(st), sond: 0 };
  st.marks = { [i]: "cell-active" };
  yield snap(st, L.hash, `h(${x}) = ${i}.`);
  let probes = 0;
  let firstTomb = -1;
  for (let step = 0; step < st.m; step++) {
    const c = st.cells[i];
    const next = (i + 1) % st.m;
    probes++;
    st.vars.sond = probes;
    st.marks[i] = "cell-compare";
    st.trail.push(
      c === null
        ? { cell: i, kind: "empty" }
        : c === "tomb"
          ? { cell: i, kind: "tomb" }
          : c === x
            ? { cell: i, kind: op === "delete" ? "removed" : "found", key: x }
            : { cell: i, kind: "other", key: c },
    );
    if (c === null) {
      if (op === "insert") {
        yield snap(
          st,
          L.empty,
          `Buňka ${i} je prázdná – ${x} v tabulce není, můžeme ho vložit.`,
        );
        const target = firstTomb >= 0 ? firstTomb : i;
        st.cells[target] = x;
        st.n++;
        st.marks = { [target]: "cell-new" };
        placeOnTrail(st, target, x);
        st.vars["α = n/m"] = alpha(st);
        yield snap(
          st,
          L.place,
          `Vložíme ${x} do buňky ${target}${firstTomb >= 0 ? " (první náhrobek na cestě)" : ""} po ${sondy(probes)}.`,
        );
      } else {
        yield snap(st, L.empty, `Buňka ${i} je prázdná – hledání končí.`);
        yield snap(st, L.fail, `${x} v tabulce není (počet sond: ${probes}).`);
      }
      return;
    }
    if (c === "tomb") {
      const remember = op === "insert" && firstTomb < 0;
      if (remember) firstTomb = i;
      yield snap(
        st,
        L.tomb,
        `Buňka ${i} je náhrobek – ${remember ? "zapamatujeme si ho a " : ""}pokračujeme na buňku ${next}.`,
      );
    } else if (c === x) {
      if (op === "delete") {
        st.marks[i] = "cell-removed";
        yield snap(st, L.found, `Nalezeno v buňce ${i} po ${sondy(probes)}.`);
        st.cells[i] = "tomb";
        st.n--;
        st.marks = { [i]: "cell-tomb" };
        st.vars["α = n/m"] = alpha(st);
        yield snap(
          st,
          L.place,
          "Místo smazání vložíme náhrobek †, aby hledání dalších klíčů nekončilo předčasně.",
        );
      } else {
        st.marks[i] = "cell-found";
        yield snap(
          st,
          L.found,
          op === "insert"
            ? `${x} už v tabulce je.`
            : `Nalezeno v buňce ${i} po ${sondy(probes)}.`,
        );
      }
      return;
    } else {
      yield snap(
        st,
        L.next,
        `Buňka ${i} obsahuje ${c} ≠ ${x}, posuneme se na buňku ${next}.`,
      );
    }
    i = next;
  }
  // prošli jsme všech m buněk a žádná není prázdná
  if (op === "insert" && firstTomb >= 0) {
    st.cells[firstTomb] = x;
    st.n++;
    st.marks = { [firstTomb]: "cell-new" };
    placeOnTrail(st, firstTomb, x);
    st.vars["α = n/m"] = alpha(st);
    yield snap(
      st,
      L.place,
      `Prošli jsme všech ${st.m} buněk a žádná není prázdná – ${x} vložíme do prvního náhrobku (buňka ${firstTomb}).`,
    );
    return;
  }
  yield snap(
    st,
    L.fail,
    op === "insert"
      ? "Tabulka je plná – nelze vložit (v praxi bychom ji včas zvětšili a přehešovali)."
      : `${x} v tabulce není – prošli jsme celou tabulku (${st.m} sond).`,
  );
}

/* ================================================================== hromadné operace a přehešování */

/** Postupně vloží všechny klíče (tlačítka „Vložit … náhodných“ a „Vložit násobky m“). */
export function* insertAll(
  st: HashState,
  keys: number[],
  probing: boolean,
): StepGen<HashState> {
  for (const k of keys) yield* (probing ? probeOp : chainOp)(st, k, "insert");
}

/** Klíče m, 2m, …, ⌊m/2⌋·m – zlý vstup pro „x mod m“ (všechny padnou do přihrádky 0). */
export const multiplesOf = (m: number): number[] =>
  Array.from({ length: Math.floor(m / 2) }, (_, k) => (k + 1) * m);

/** Klíče uložené v tabulce (bez náhrobků). */
export const storedKeys = (st: HashState, probing: boolean): number[] =>
  probing
    ? st.cells.filter((c): c is number => typeof c === "number")
    : st.buckets.flat();

/**
 * Přehešuje všechny klíče do nové tabulky (jiné m, jiná funkce nebo nový seed). Náhrobky přitom zmizí.
 * Žádný klíč se nesmí ztratit: zmenšení otevřené adresace pod počet klíčů se odmítne (ok = false, stav zůstává).
 */
export function rehashTable(
  prev: HashState,
  probing: boolean,
  nm: number,
  nf: string,
  ns: number,
): { state: HashState; ok: boolean; message: string } {
  const keys = storedKeys(prev, probing);
  const badSize = !Number.isInteger(nm) || nm < 1;
  if (badSize || (probing && keys.length > nm)) {
    const state = structuredClone(prev);
    clear(state);
    state.vars = { "α = n/m": alpha(state) };
    const why = badSize
      ? `Velikost tabulky m = ${nm} není platná`
      : `Do tabulky s m = ${nm} se ${keys.length} klíčů nevejde`;
    return {
      state,
      ok: false,
      message: `${why} – ponecháváme m = ${prev.m}.${badSize ? "" : " Nejdřív některé klíče smažte."}`,
    };
  }
  const fresh = mkTable(nm, fnOf(nf).id, ns);
  placeKeys(fresh, keys, probing);
  fresh.vars = { "α = n/m": alpha(fresh) };
  const tombs = probing ? prev.cells.filter((c) => c === "tomb").length : 0;
  return {
    state: fresh,
    ok: true,
    message: `Tabulka přehešována: m = ${nm}, ${fnOf(nf).describe(nm)}.${tombs > 0 ? ` Náhrobky (${tombs}) přitom zmizely.` : ""}`,
  };
}

/** Tiché vložení klíčů bez kroků (přehešování, stavba z pole). U otevřené adresace jich smí být nejvýše m. */
function placeKeys(st: HashState, keys: number[], probing: boolean) {
  const h = hashOf(st);
  for (const k of keys) {
    if (probing) {
      let i = h(k);
      // klíčů je nejvýše m, takže volná buňka existuje a najdeme ji nejvýše po m krocích
      for (let guard = 0; guard < st.m && st.cells[i] !== null; guard++)
        i = (i + 1) % st.m;
      st.cells[i] = k;
    } else {
      st.buckets[h(k)].push(k);
    }
    st.n++;
  }
}

/**
 * Tabulka postavená z klíčů bez animace (výchozí příklad, „Postavit“, odkaz). Neplatné klíče a opakování
 * se přeskočí; otevřená adresace pojme nejvýše m klíčů – přebývající jsou ve `skipped`.
 */
export function buildTable(
  m: number,
  fnId: string,
  seed: number,
  keys: number[],
  probing: boolean,
): { state: HashState; used: number[]; skipped: number[] } {
  const st = mkTable(m, fnOf(fnId).id, seed);
  const used: number[] = [];
  const skipped: number[] = [];
  const seen = new Set<number>();
  for (const k of keys) {
    if (!isKey(k) || seen.has(k) || (probing && used.length >= m))
      skipped.push(k);
    else used.push(k);
    seen.add(k);
  }
  placeKeys(st, used, probing);
  st.vars = { "α = n/m": alpha(st) };
  return { state: st, used, skipped };
}

/* ================================================================== závěrečné kroky operací */

/** Nejdelší řetězec (počet klíčů v jedné přihrádce). */
export const longestChain = (st: HashState): number =>
  st.buckets.reduce((a, c) => Math.max(a, c.length), 0);

/** Nejdelší shluk – souvislý úsek neprázdných buněk (i náhrobky prodlužují sondování), cyklicky přes konec tabulky. */
export function longestRun(st: HashState): number {
  const m = st.cells.length;
  if (st.cells.every((c) => c !== null)) return m;
  let best = 0;
  let run = 0;
  // dvě obrátky pokryjí shluk, který přechází přes konec tabulky
  for (let j = 0; j < 2 * m; j++) {
    run = st.cells[j % m] === null ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return Math.min(best, m);
}

const OP_NAME: Record<HashOp, string> = {
  insert: "Insert",
  find: "Find",
  delete: "Delete",
};
const porovnani = (k: number) =>
  `${k} ${plural(k, "porovnání", "porovnáních", "porovnáních")}`;

/** Kde je klíč x: přihrádka a pořadí v řetězci (řetězení), nebo index buňky (otevřená adresace). */
function locate(
  st: HashState,
  x: number,
  probing: boolean,
): { at: number; pos: number } | null {
  if (probing) {
    const at = st.cells.indexOf(x);
    return at < 0 ? null : { at, pos: 0 };
  }
  for (let at = 0; at < st.m; at++) {
    const pos = st.buckets[at].indexOf(x);
    if (pos >= 0) return { at, pos: pos + 1 };
  }
  return null;
}

/**
 * Operace Insert / Find / Delete i se závěrečným krokem „Insert(35): …“, který shrne výsledek
 * (kam se klíč uložil, po kolika sondách / porovnáních, nové α). Neúspěch je chybový krok.
 */
export function* hashOp(
  st: HashState,
  x: number,
  op: HashOp,
  probing: boolean,
): StepGen<HashState> {
  const inner = probing ? probeOp : chainOp;
  if (keyError(x)) {
    yield* inner(st, x, op);
    return;
  }
  const title = `${OP_NAME[op]}(${x})`;
  const had = locate(st, x, probing);
  yield* inner(st, x, op);
  const now = locate(st, x, probing);
  const a = alpha(st);
  const where = (at: number) => (probing ? `buňce ${at}` : `přihrádce ${at}`);
  let text: string;
  let ok = true;
  if (op === "insert") {
    if (had)
      text = `${x} už v tabulce je (v ${where(had.at)}) – nic se nezměnilo.`;
    else if (now) {
      text = probing
        ? `uloženo do buňky ${now.at} po ${sondy(Number(st.vars.sond))}; α = ${a}.`
        : `uloženo do přihrádky ${now.at}, její řetězec má teď délku ${st.buckets[now.at].length}; α = ${a}.`;
    } else {
      ok = false;
      text = `tabulka je plná – ${x} se nevložil.`;
    }
  } else if (op === "find") {
    if (had)
      text = probing
        ? `nalezeno v buňce ${had.at} po ${sondy(Number(st.vars.sond))}.`
        : `nalezeno v přihrádce ${had.at} po ${porovnani(had.pos)}.`;
    else {
      text = probing
        ? `${x} v tabulce není (počet sond: ${st.vars.sond}).`
        : `${x} v tabulce není (prohledali jsme celý řetězec přihrádky ${st.vars["h(x)"]}).`;
    }
  } else if (had)
    text = probing
      ? `smazáno – v buňce ${had.at} je teď náhrobek †; α = ${a}.`
      : `smazáno z přihrádky ${had.at}; α = ${a}.`;
  else text = `${x} v tabulce není – nic se nezměnilo.`;
  yield ok
    ? snap(st, null, `${title}: ${text}`)
    : failStep(st, `${title}: ${text}`);
}

/** Hromadné vložení (tlačítka „Vložit … náhodných“, „Vložit násobky m“) se shrnutím: kolik přibylo a jak dlouhý je nejdelší řetězec / shluk. */
export function* insertAllOp(
  st: HashState,
  keys: number[],
  probing: boolean,
  title: string,
): StepGen<HashState> {
  const n0 = st.n;
  yield* insertAll(st, keys, probing);
  st.marks = {};
  st.keyMark = null;
  st.trail = [];
  st.vars = { "α = n/m": alpha(st) };
  const added = st.n - n0;
  const dup = keys.length - added;
  const longest = probing
    ? `nejdelší shluk obsazených buněk má ${longestRun(st)}`
    : `nejdelší řetězec má délku ${longestChain(st)}`;
  const parts = [
    `${plural(added, "přibyl", "přibyly", "přibylo")} ${added} ${plural(added, "klíč", "klíče", "klíčů")}`,
    dup > 0
      ? `${dup} ${plural(dup, "se nevložil", "se nevložily", "se nevložilo")} (už v tabulce ${plural(dup, "byl", "byly", "bylo")} nebo není místo)`
      : "",
  ].filter(Boolean);
  yield snap(
    st,
    null,
    `${title}: ${parts.join(", ")}; n = ${st.n}, α = ${alpha(st)}, ${longest}.`,
  );
}
