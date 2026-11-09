/**
 * Kukaččí hešování – čisté generátory kroků (stránka CuckooPage je jen přehrává).
 * Dvě funkce f, g; klíč x smí ležet jen v buňce f(x) nebo g(x).
 */
import { rng, snap, type Step, type StepGen } from "../../core/steps";
import { plural } from "../../views/text";
import { czNum, HASH_FNS, isKey, KEY_MAX, keyError } from "./hashfn";

export interface CuckooState {
  m: number;
  seed: number;
  cells: (number | null)[];
  marks: Record<number, string>;
  vars: Record<string, string | number>;
  /** počet klíčů v tabulce (během vyhazování včetně klíče „v ruce“) */
  n: number;
  /** šipka: odkud kam se právě klíč stěhuje */
  arrow: { from: number; to: number } | null;
  /** stopa vyhazování právě probíhajícího Insertu (kreslí se pod řadou buněk, E6) */
  trail: CuckooTrailItem[];
}

/** Řádek stopy: klíč `key` jsme uložili do buňky `cell` a vyhodili z ní `evicted` (null = buňka byla volná). */
export interface CuckooTrailItem {
  key: number;
  cell: number;
  evicted: number | null;
}

type Fn = (x: number) => number;

const fnsFor = (m: number, seed: number): [Fn, Fn] => {
  const lin = HASH_FNS.find((h) => h.id === "linear")!;
  return [lin.make(m, seed), lin.make(m, seed + 7919)];
};
export const fns = (st: CuckooState): [Fn, Fn] => fnsFor(st.m, st.seed);
export const mkC = (m: number, seed: number): CuckooState => ({
  m,
  seed,
  cells: Array(m).fill(null),
  marks: {},
  vars: {},
  n: 0,
  arrow: null,
  trail: [],
});

const alpha = (st: CuckooState) => czNum(st.n / st.m);

/** Kolikrát nejvýše zkusíme při přehešování zvolit nové f, g, než vložení vzdáme. */
export const MAX_REHASH = 64;

/** Limit přesunů ⌈6 log n⌉ (n = počet klíčů včetně vkládaného). */
const timeout = (n: number) => Math.ceil(6 * Math.log2(Math.max(2, n)));

export const PC_CK_INSERT = [
  "Insert(x):",
  "  Je-li x v buňce f(x) nebo g(x): hotovo.",
  "  Je-li některá z nich volná: uložíme x tam.",
  "  Jinak opakujeme nejvýše ⌈6 log n⌉-krát:",
  "    Vyhodíme klíč y z buňky f(x) a uložíme tam x.",
  "    y přesuneme do jeho druhé buňky (té, kde právě nebyl);",
  "    je-li obsazená, vyhodí dalšího, atd.",
  "  Při vypršení limitu: zvolíme nové f, g a vše přehešujeme.",
  "  // Příliš plnou tabulku (potřebujeme m ≥ (2+ε)·n) v praxi zvětšíme.",
];
export const PC_CK_FIND = [
  "Find(x):",
  "  Podíváme se do buňky f(x).",
  "  Podíváme se do buňky g(x).",
  "  Nejvýše 2 přístupy – O(1) i v nejhorším případě.",
];
export const PC_CK_DELETE = [
  "Delete(x):",
  "  Je-li x v buňce f(x): vyprázdníme ji.",
  "  Jinak je-li x v buňce g(x): vyprázdníme ji.",
  "  Jinak x v tabulce není.",
  "  // Náhrobky nejsou potřeba – každý klíč má jen 2 možná místa.",
];

/** Společný začátek operací: zruší zvýraznění; pro neplatný klíč vrátí hlášku. */
function begin(st: CuckooState, x: number): string | null {
  st.marks = {};
  st.arrow = null;
  st.trail = [];
  const err = keyError(x);
  if (err) st.vars = { "α = n/m": alpha(st) };
  return err;
}

/** Krok, který oznamuje neprovedenou operaci (Visualizer ho zvýrazní červeně). */
const failStep = (st: CuckooState, message: string): Step<CuckooState> => ({
  ...snap(st, null, message),
  error: true,
});

const shown = (c: number | null) => (c === null ? "prázdno" : `klíč ${c}`);

export function* ckFind(st: CuckooState, x: number): StepGen<CuckooState> {
  const err = begin(st, x);
  if (err) {
    yield failStep(st, err);
    return;
  }
  const [f, g] = fns(st);
  const a = f(x);
  const b = g(x);
  st.vars = { x, "f(x)": a, "g(x)": b, "α = n/m": alpha(st) };
  // značku „nalezeno“ nastavujeme PŘED vydáním kroku – co se změní až po posledním yield, nikdo neuvidí
  st.marks[a] = st.cells[a] === x ? "cell-found" : "cell-compare";
  yield snap(
    st,
    1,
    `f(${x}) = ${a}: ${st.cells[a] === x ? "nalezeno!" : `je tam ${shown(st.cells[a])}`}.`,
  );
  if (st.cells[a] === x) return;
  st.marks[b] = st.cells[b] === x ? "cell-found" : "cell-compare";
  yield snap(
    st,
    2,
    `g(${x}) = ${b}: ${st.cells[b] === x ? "nalezeno!" : `je tam ${shown(st.cells[b])}`}.`,
  );
  if (st.cells[b] === x) return;
  yield snap(st, 3, `${x} v tabulce není – stačily 2 přístupy.`);
}

export function* ckDelete(st: CuckooState, x: number): StepGen<CuckooState> {
  const err = begin(st, x);
  if (err) {
    yield failStep(st, err);
    return;
  }
  const [f, g] = fns(st);
  const a = f(x);
  const b = g(x);
  st.vars = { x, "f(x)": a, "g(x)": b, "α = n/m": alpha(st) };
  const tries: [string, number, number][] = [
    ["f", a, 1],
    ["g", b, 2],
  ];
  for (const [name, i, line] of tries) {
    if (st.cells[i] === x) {
      st.marks[i] = "cell-removed";
      yield snap(
        st,
        line,
        `${name}(${x}) = ${i}: nalezeno – buňku vyprázdníme (bez náhrobků, každý klíč má jen 2 možná místa).`,
      );
      st.cells[i] = null;
      st.n--;
      st.marks = {};
      st.vars["α = n/m"] = alpha(st);
      yield snap(st, line, `Hotovo, ${x} je smazán.`);
      return;
    }
    st.marks[i] = "cell-compare";
    yield snap(st, line, `${name}(${x}) = ${i}: je tam ${shown(st.cells[i])}.`);
  }
  yield snap(st, 3, `${x} v tabulce není.`);
}

/**
 * Tiché vložení bez kroků (pro přehešování): stejný postup jako Insert. Vrací false, když vyprší limit přesunů –
 * tabulka je pak rozpracovaná a volající ji zahodí. Nesmí volat snap(): stovky skrytých snímků by zdržovaly UI.
 */
function place(
  cells: (number | null)[],
  key: number,
  f: Fn,
  g: Fn,
  limit: number,
): boolean {
  for (const i of [f(key), g(key)]) {
    if (cells[i] === null) {
      cells[i] = key;
      return true;
    }
  }
  let cur = key;
  let pos = f(key);
  for (let step = 0; step < limit; step++) {
    const y = cells[pos]!;
    cells[pos] = cur;
    const other = f(y) === pos ? g(y) : f(y);
    if (cells[other] === null) {
      cells[other] = y;
      return true;
    }
    cur = y;
    pos = other;
  }
  return false;
}

/**
 * Přehešování: zkouší nové dvojice f, g (nejvýše MAX_REHASH), dokud se nepodaří umístit všechny klíče.
 * Při úspěchu přepíše st.seed, st.cells, st.n a vrátí pořadí úspěšného pokusu; jinak vrátí 0 a stav nemění.
 * Iterativně a s omezeným počtem pokusů – rekurzivní „přehešování v přehešování“ u plné tabulky nikdy neskončilo.
 */
function rehash(st: CuckooState, keys: number[]): number {
  if (keys.length > st.m) return 0;
  for (let attempt = 1; attempt <= MAX_REHASH; attempt++) {
    const seed = st.seed + 101 * attempt;
    const [f, g] = fnsFor(st.m, seed);
    const cells: (number | null)[] = Array(st.m).fill(null);
    let ok = true;
    for (let j = 0; j < keys.length && ok; j++)
      ok = place(cells, keys[j], f, g, timeout(j + 1));
    if (ok) {
      st.seed = seed;
      st.cells = cells;
      st.n = keys.length;
      return attempt;
    }
  }
  return 0;
}

export function* ckInsert(st: CuckooState, x: number): StepGen<CuckooState> {
  const err = begin(st, x);
  if (err) {
    yield failStep(st, err);
    return;
  }
  const [f, g] = fns(st);
  st.vars = { x, "f(x)": f(x), "g(x)": g(x), "α = n/m": alpha(st) };
  st.marks = { [f(x)]: "cell-compare", [g(x)]: "cell-compare" };
  if (st.cells[f(x)] === x || st.cells[g(x)] === x) {
    st.marks = { [st.cells[f(x)] === x ? f(x) : g(x)]: "cell-found" };
    yield snap(st, 1, `${x} už v tabulce je.`);
    return;
  }
  yield snap(st, 1, `Kandidátní buňky f(${x}) = ${f(x)} a g(${x}) = ${g(x)}.`);
  for (const i of [f(x), g(x)]) {
    if (st.cells[i] === null) {
      st.cells[i] = x;
      st.n++;
      st.marks = { [i]: "cell-new" };
      st.trail = [{ key: x, cell: i, evicted: null }];
      st.vars["α = n/m"] = alpha(st);
      yield snap(st, 2, `Buňka ${i} je volná – vložíme ${x}.`);
      return;
    }
  }
  if (st.n >= st.m) {
    // n + 1 klíčů se do m buněk nevejde při žádné volbě f, g – přehešování by nikdy neskončilo
    yield snap(
      st,
      8,
      `Tabulka je plná (n = m = ${st.m}) – ${x} se už nevejde. Kukaččí hešování potřebuje m ≥ (2+ε)·n; v praxi bychom tabulku zvětšili.`,
    );
    return;
  }
  // stav před vyhazováním – vrátíme se k němu, kdyby se nepodařilo ani přehešovat
  const before = { cells: [...st.cells], n: st.n };
  const limit = timeout(st.n + 1);
  let cur = x;
  let pos = f(x);
  for (let step = 0; step < limit; step++) {
    const y = st.cells[pos]!;
    st.cells[pos] = cur;
    st.n += step === 0 ? 1 : 0;
    const other = f(y) === pos ? g(y) : f(y);
    st.marks = { [pos]: "cell-new", [other]: "cell-compare" };
    st.arrow = { from: pos, to: other };
    st.trail.push({ key: cur, cell: pos, evicted: y });
    st.vars = {
      ...st.vars,
      "α = n/m": alpha(st),
      krok: step + 1,
      limit,
      vyhozen: y,
    };
    yield snap(
      st,
      step === 0 ? 4 : 6,
      `Buňka ${pos}: vložíme ${cur}, vyhodíme ${y}. Jeho druhé místo je ${other}${st.cells[other] === null ? " (volné)" : ` (obsazeno klíčem ${st.cells[other]})`}.`,
    );
    if (st.cells[other] === null) {
      st.cells[other] = y;
      st.marks = { [other]: "cell-new" };
      st.arrow = null;
      st.trail.push({ key: y, cell: other, evicted: null });
      yield snap(
        st,
        5,
        `${y} se usadil v buňce ${other}. Hotovo po ${step + 1} ${step === 0 ? "přesunu" : "přesunech"}.`,
      );
      return;
    }
    cur = y;
    pos = other;
  }
  // vypršel limit → přehešování (stopa patří staré tabulce a funkcím – po přehešování by mátla)
  st.marks = {};
  st.arrow = null;
  yield snap(
    st,
    7,
    `Vyčerpali jsme limit ${limit} přesunů (klíč ${cur} nemá kam) – zřejmě cyklus. Zvolíme nové hešovací funkce f, g.`,
  );
  const keys = st.cells.filter((c): c is number => c !== null);
  keys.push(cur);
  st.trail = [];
  const attempts = rehash(st, keys);
  if (attempts === 0) {
    st.cells = before.cells;
    st.n = before.n;
    st.vars = { x, "f(x)": f(x), "g(x)": g(x), "α = n/m": alpha(st) };
    yield snap(
      st,
      8,
      `Ani ${MAX_REHASH} pokusů o nové f, g nestačilo – tabulka je příliš plná (α = ${alpha(st)}, potřebujeme m ≥ (2+ε)·n). ${x} jsme nevložili, tabulka zůstává jako před operací; v praxi bychom ji zvětšili.`,
    );
    return;
  }
  const [nf, ng] = fns(st);
  st.marks = { [st.cells[nf(x)] === x ? nf(x) : ng(x)]: "cell-new" };
  st.vars = {
    x,
    "f(x)": nf(x),
    "g(x)": ng(x),
    "α = n/m": alpha(st),
    "nové f, g": attempts === 1 ? "ano" : `ano (${attempts}. pokus)`,
  };
  yield snap(
    st,
    7,
    `Přehešováno s novými funkcemi f, g${attempts > 1 ? ` (podařilo se až na ${attempts}. pokus)` : ""}: ${keys.length < 5 ? `všechny ${keys.length} klíče jsou znovu vloženy` : `všech ${keys.length} klíčů je znovu vloženo`}.`,
  );
}

/* ================================================================== hromadné operace */

/** Postupně vloží všechny klíče (tlačítko „Vložit … náhodných“). */
export function* ckInsertAll(
  st: CuckooState,
  keys: number[],
): StepGen<CuckooState> {
  for (const k of keys) yield* ckInsert(st, k);
}

/**
 * Doplní tabulku náhodnými klíči (1 … 999, které v ní ještě nejsou) na `target` prvků – NEpřidává další
 * klíče při každém kliknutí. Skončí i tehdy, když už se další klíč vložit nepodaří.
 */
export function* ckFill(
  st: CuckooState,
  target: number,
  seed: number,
): StepGen<CuckooState> {
  const goal = Math.min(Number.isFinite(target) ? Math.floor(target) : 0, st.m);
  if (st.n >= goal) {
    st.marks = {};
    st.arrow = null;
    st.trail = [];
    st.vars = { "α = n/m": alpha(st) };
    yield snap(
      st,
      null,
      `Tabulka je už zaplněná na α = ${alpha(st)} (klíčů: ${st.n} z ${st.m} buněk) – není co doplňovat.`,
    );
    return;
  }
  const r = rng(seed);
  const used = new Set(st.cells.filter((c): c is number => c !== null));
  for (let tries = 0; st.n < goal && tries < 50 * st.m; tries++) {
    const k = 1 + Math.floor(r() * 999);
    if (used.has(k)) continue;
    used.add(k);
    const before = st.n;
    yield* ckInsert(st, k);
    if (st.n === before) return; // vložení bylo odmítnuto (tabulka je příliš plná) – nemá smysl pokračovat
  }
}

/**
 * Tři klíče, které v tabulce nejsou a mají stejnou dvojici buněk {f(k), g(k)}. Tři klíče se do dvou buněk
 * nevejdou, takže jejich vložení jistě skončí cyklem a přehešováním. Hledá hrubou silou od nejmenších klíčů
 * (dvojic buněk je nejvýše m(m+1)/2, klíčů 65 535 – trojice vždy existuje).
 */
export function cycleKeys(st: CuckooState): number[] {
  const [f, g] = fns(st);
  const present = new Set(st.cells);
  const groups = new Map<number, number[]>();
  for (let k = 1; k <= KEY_MAX; k++) {
    if (present.has(k)) continue;
    const a = f(k);
    const b = g(k);
    const id = Math.min(a, b) * st.m + Math.max(a, b);
    let grp = groups.get(id);
    if (!grp) groups.set(id, (grp = []));
    grp.push(k);
    if (grp.length === 3) return grp;
  }
  return [];
}

/** Tlačítko „Vynutit cyklus“: vloží tři klíče se stejnými buňkami – třetí (nejpozději) vyvolá přehešování. */
export function* ckForceCycle(st: CuckooState): StepGen<CuckooState> {
  for (const k of cycleKeys(st)) yield* ckInsert(st, k);
}

/* ================================================================== stavba a závěrečné kroky */

/**
 * Tabulka postavená z klíčů bez animace (výchozí příklad, „Postavit“, odkaz): klíče se vkládají stejným
 * postupem jako Insert (včetně případného přehešování). Neplatné, opakované a nevložitelné klíče jsou ve `skipped`.
 */
export function ckBuild(
  m: number,
  seed: number,
  keys: number[],
): { state: CuckooState; used: number[]; skipped: number[] } {
  const st = mkC(m, seed);
  const used: number[] = [];
  const skipped: number[] = [];
  for (const k of keys) {
    const n0 = st.n;
    if (isKey(k) && !st.cells.includes(k))
      for (const step of ckInsert(st, k)) void step;
    if (st.n > n0) used.push(k);
    else skipped.push(k);
  }
  st.marks = {};
  st.arrow = null;
  st.trail = [];
  st.vars = { "α = n/m": alpha(st) };
  return { state: st, used, skipped };
}

type CkOp = "insert" | "find" | "delete";
const CK_OPS = { insert: ckInsert, find: ckFind, delete: ckDelete };
const OP_NAME: Record<CkOp, string> = {
  insert: "Insert",
  find: "Find",
  delete: "Delete",
};
const presuny = (k: number) =>
  `${k} ${plural(k, "přesunu", "přesunech", "přesunech")}`;

/** Je krok zprávou o úspěšném přehešování? */
const isRehash = (s: Step<CuckooState>) =>
  s.line === 7 && s.message.startsWith("Přehešováno");

/**
 * Insert / Find / Delete se závěrečným krokem „Insert(57): …“: kam se klíč dostal, po kolika přesunech,
 * zda se přehešovávalo, nové α. Odmítnuté vložení je chybový krok.
 */
export function* ckOp(
  st: CuckooState,
  x: number,
  op: CkOp,
): StepGen<CuckooState> {
  if (keyError(x)) {
    yield* CK_OPS[op](st, x);
    return;
  }
  const title = `${OP_NAME[op]}(${x})`;
  const [f] = fns(st);
  const had = st.cells.indexOf(x);
  const hadVia = had === f(x) ? "f(x)" : "g(x)";
  let moves = 0;
  let rehashed = false;
  for (const s of CK_OPS[op](st, x)) {
    if (s.line === 4 || s.line === 6) moves++;
    if (isRehash(s)) rehashed = true;
    yield s;
  }
  st.arrow = null;
  const now = st.cells.indexOf(x);
  const a = alpha(st);
  if (op === "insert") {
    if (had >= 0)
      yield snap(
        st,
        null,
        `${title}: ${x} už v tabulce je (buňka ${had}) – nic se nezměnilo.`,
      );
    else if (now < 0)
      yield failStep(
        st,
        `${title}: ${x} se nevložil – tabulka je příliš plná (α = ${a}); potřebujeme m ≥ (2+ε)·n.`,
      );
    else if (rehashed)
      yield snap(
        st,
        null,
        `${title}: po ${presuny(moves)} vypršel limit, tabulka se přehešovala s novými f, g; ${x} je v buňce ${now}, α = ${a}.`,
      );
    else if (moves === 0)
      yield snap(
        st,
        null,
        `${title}: uloženo do volné buňky ${now} bez vyhazování; α = ${a}.`,
      );
    else
      yield snap(
        st,
        null,
        `${title}: uloženo po ${presuny(moves)}; ${x} je v buňce ${now}, α = ${a}.`,
      );
  } else if (op === "find") {
    yield snap(
      st,
      null,
      had >= 0
        ? `${title}: nalezeno v buňce ${had} = ${hadVia} (${hadVia === "f(x)" ? "1 přístup" : "2 přístupy"}).`
        : `${title}: ${x} v tabulce není – stačily 2 přístupy.`,
    );
  } else {
    yield snap(
      st,
      null,
      had >= 0
        ? `${title}: smazáno z buňky ${had} = ${hadVia}; α = ${a}.`
        : `${title}: ${x} v tabulce není – nic se nezměnilo.`,
    );
  }
}

/**
 * Hromadná operace (Vložit náhodné, Doplnit na 60 %, Vynutit cyklus) se shrnutím: kolik klíčů přibylo,
 * kolikrát se přehešovávalo a výsledné α.
 */
export function* ckBulkOp(
  st: CuckooState,
  title: string,
  gen: StepGen<CuckooState>,
): StepGen<CuckooState> {
  const n0 = st.n;
  let rehashes = 0;
  let steps = 0;
  for (const s of gen) {
    steps++;
    if (isRehash(s)) rehashes++;
    yield s;
  }
  // operace, která neudělala nic (není co doplňovat), už svou hlášku má
  if (steps <= 1 && st.n === n0) return;
  st.marks = {};
  st.arrow = null;
  st.trail = [];
  st.vars = { "α = n/m": alpha(st) };
  const added = st.n - n0;
  const rh = rehashes === 0 ? "bez přehešování" : `přehešováno ${rehashes}×`;
  yield snap(
    st,
    null,
    `${title}: ${plural(added, "přibyl", "přibyly", "přibylo")} ${added} ${plural(added, "klíč", "klíče", "klíčů")}, ${rh}; n = ${st.n}, α = ${alpha(st)}.`,
  );
}
