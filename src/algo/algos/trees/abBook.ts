/**
 * (a,b)-strom podle Průvodce 8.3 (varianta „kniha“): klíče x_1 < … < x_k leží ve vnitřních vrcholech
 * se syny s_0 … s_k, vnější vrcholy (listy) jsou prázdné a nekreslí se – vrchol na předposlední hladině
 * má `children: []`. Operace odpovídají procedurám AbInsert/AbInsert2 a AbDelete/AbDelete2 z knihy
 * (rekurze je přepsaná na cestu od kořene a návrat po ní). Přednášková varianta je v abtree.ts.
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import {
  abHeight,
  abKeyError,
  abParamError,
  abReject,
  abSummary,
  clear,
  emptyAB,
  finalStep,
  sons,
  type ABState,
} from "./abtree";

/* ------------------------------------------------------------------ pseudokódy */

export const PC_BOOK_FIND = [
  "Find(x):   // Průvodce 8.3, hledání klíče",
  "  v ← kořen",
  "  Dokud v není vnější list:",
  "    Je-li x = x_i pro některý klíč vrcholu v: nalezeno.",
  "    Jinak najdeme i, aby x_i < x < x_{i+1}, a v ← s_i.",
  "  Došli jsme do vnějšího listu – x ve stromu není.",
];
export const PC_BOOK_INSERT = [
  "Insert(x):   // AbInsert, Průvodce 8.3",
  "  Hledáme x jako ve Find; je-li ve stromu, končíme.",
  "  Skončili jsme ve vnějším listu – x vložíme do jeho otce v",
  "    (přibude mu i nový vnější list).",
  "  Dokud má v víc než b synů (tedy b klíčů):",
  "    m ← ⌊(b+1)/2⌋   // štěpení, prostřední z b klíčů",
  "    v_1 ← klíče x_1 … x_{m−1}, v_2 ← klíče x_{m+1} … x_b (i se syny)",
  "    Je-li v kořen: nový kořen s klíčem x_m a syny v_1, v_2 (výška +1);",
  "    jinak x_m vložíme do otce mezi v_1 a v_2 a v ← otec.",
];
export const PC_BOOK_DELETE = [
  "Delete(x):   // AbDelete, Průvodce 8.3",
  "  Najdeme vrchol v s klíčem x_i = x; není-li, končíme.",
  "  Není-li v na předposlední hladině: x_i ← následník m",
  "    (minimum podstromu s_i) a mažeme m z jeho vrcholu.",
  "  Klíč odebereme z vrcholu na předposlední hladině (i s listem).",
  "  Dokud má vrchol v méně než a synů a není kořen:",
  "    ℓ ← levý bratr v (není-li, pravý – zrcadlově), o ← klíč otce mezi nimi",
  "    Má-li ℓ aspoň a+1 synů: půjčka – největší klíč ℓ jde do otce,",
  "      o jde do v jako nejmenší klíč, nejpravější syn ℓ přejde pod v.",
  "    Jinak sloučíme ℓ, o a v do jednoho vrcholu; v ← otec.",
  "  Nemá-li kořen žádný klíč: jeho jediný syn je novým kořenem (výška −1).",
];

/* ------------------------------------------------------------------ stavba */

/** Tvar stromu: pole = vrchol na předposlední hladině, { k, c } = vrchol s klíči k a syny c. */
export type AbBookSpec =
  readonly number[] | { k: readonly number[]; c?: readonly AbBookSpec[] };

/** Strom knižní varianty přesně podle tvaru (bez kontroly – předloha je platná). */
export function abBookFromSpec(
  a: number,
  b: number,
  spec: AbBookSpec,
): ABState {
  const st = emptyAB(a, b, "kniha");
  const make = (s: AbBookSpec): number => {
    const id = st.nextId++;
    const keys = Array.isArray(s) ? s : (s as { k: readonly number[] }).k;
    const kids = Array.isArray(s)
      ? []
      : ((s as { c?: readonly AbBookSpec[] }).c ?? []);
    st.nodes[id] = { id, keys: [...keys], children: [] };
    st.nodes[id].children = kids.map(make);
    return id;
  };
  st.root = make(spec);
  return st;
}

/* ------------------------------------------------------------------ pomocné */

const fmt = (x: number) => String(x).replace("-", "−");
const box = (keys: readonly number[]) =>
  keys.length ? `[${keys.map(fmt).join(" ")}]` : "[ ]";
const bottom = (st: ABState, id: number) => st.nodes[id].children.length === 0;
/** Index prvního klíče většího než x (= index syna, do kterého se sestupuje). */
const slot = (keys: readonly number[], x: number) => {
  const i = keys.findIndex((k) => x < k);
  return i < 0 ? keys.length : i;
};
const ordinal = (i: number) => `${i + 1}.`;

interface Found {
  /** vrcholy od kořene k vrcholu, kde hledání skončilo */
  path: number[];
  /** index klíče x ve vrcholu path.at(-1), nebo −1 */
  at: number;
}

/** Sestup z kořene (neprázdný strom); `line` = řádek pseudokódu pro kroky sestupu. */
function* descend(
  st: ABState,
  x: number,
  line: number,
): Generator<Step<ABState>, Found, unknown> {
  const path: number[] = [];
  let v = st.root!;
  for (;;) {
    path.push(v);
    const n = st.nodes[v];
    st.marks[v] = "n-active";
    const at = n.keys.indexOf(x);
    if (at >= 0) {
      st.hot = { [v]: at };
      return { path, at };
    }
    const i = slot(n.keys, x);
    // zvýrazněný je klíč, se kterým jsme x porovnali naposledy (první větší, nebo poslední)
    st.hot = { [v]: Math.min(i, n.keys.length - 1) };
    const why =
      i === 0
        ? `${fmt(x)} < ${fmt(n.keys[0])}`
        : i === n.keys.length
          ? `${fmt(x)} > ${fmt(n.keys[i - 1])}`
          : `${fmt(n.keys[i - 1])} < ${fmt(x)} < ${fmt(n.keys[i])}`;
    if (bottom(st, v)) {
      yield snap(
        st,
        line,
        `Ve vrcholu ${box(n.keys)}: ${why} – ${ordinal(i)} syn je vnější list, dál už nejde.`,
      );
      return { path, at: -1 };
    }
    yield snap(
      st,
      line,
      `Ve vrcholu ${box(n.keys)}: ${why}, pokračujeme do ${ordinal(i)} syna.`,
    );
    v = n.children[i];
  }
}

/* ------------------------------------------------------------------ Find */

export function* bookFind(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  if (st.root === null) {
    yield snap(st, 1, "Strom je prázdný (jen vnější list).");
    yield finalStep(
      st,
      "Find",
      x,
      "strom je prázdný, klíč v něm není.",
      "neutral",
    );
    return;
  }
  const r = yield* descend(st, x, 4);
  const v = r.path[r.path.length - 1];
  const visited = r.path.length;
  const count = `${visited} ${visited === 1 ? "vrchol" : visited <= 4 ? "vrcholy" : "vrcholů"}`;
  if (r.at >= 0) {
    st.marks[v] = "n-found";
    yield snap(
      st,
      3,
      `Vrchol ${box(st.nodes[v].keys)} obsahuje ${fmt(x)} – nalezeno.`,
    );
    yield finalStep(st, "Find", x, `nalezeno – prošli jsme ${count}.`);
    return;
  }
  st.marks[v] = "n-bad";
  yield snap(st, 5, `Došli jsme do vnějšího listu – ${fmt(x)} ve stromu není.`);
  yield finalStep(
    st,
    "Find",
    x,
    `klíč ve stromu není – prošli jsme ${count} až k vnějšímu listu.`,
    "neutral",
  );
}

/* ------------------------------------------------------------------ Insert */

export function* bookInsert(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x) ?? abParamError(st.a, st.b);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  const { b } = st;
  if (st.root === null) {
    const id = st.nextId++;
    st.nodes[id] = { id, keys: [x], children: [] };
    st.root = id;
    st.marks[id] = "n-new";
    st.hot = { [id]: 0 };
    yield snap(
      st,
      2,
      `Strom byl prázdný – vznikne kořen s jediným klíčem ${fmt(x)} a dvěma vnějšími listy.`,
    );
    clear(st);
    st.marks[id] = "n-new";
    yield finalStep(st, "Insert", x, `vložen první klíč; ${abSummary(st)}.`);
    return;
  }
  const r = yield* descend(st, x, 1);
  if (r.at >= 0) {
    const v = r.path[r.path.length - 1];
    st.marks[v] = "n-found";
    yield snap(st, 1, `Klíč ${fmt(x)} už ve stromu je – nic nevkládáme.`);
    yield finalStep(
      st,
      "Insert",
      x,
      `klíč už ve stromu byl, strom se nezměnil (${abSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const path = r.path;
  let v = path.pop()!;
  const V = st.nodes[v];
  const pos = slot(V.keys, x);
  V.keys.splice(pos, 0, x);
  st.marks = { [v]: "n-new" };
  st.hot = { [v]: pos };
  yield snap(
    st,
    2,
    `Klíč ${fmt(x)} vložíme do otce vnějšího listu: ${box(V.keys)} má teď ${sons(V.keys.length + 1)}${V.keys.length + 1 > b ? "" : `, což je nejvýše b = ${b}`}.`,
  );
  const heightBefore = abHeight(st);
  let splits = 0;
  while (st.nodes[v].keys.length > b - 1) {
    splits++;
    const N = st.nodes[v];
    st.marks = { [v]: "n-bad" };
    st.hot = {};
    yield snap(
      st,
      4,
      `Vrchol ${box(N.keys)} má ${sons(N.keys.length + 1)}, tedy víc než b = ${b} – rozštěpíme ho.`,
    );
    const m = Math.floor((b + 1) / 2); // 1-based index prostředního klíče
    const mid = N.keys[m - 1];
    const nid = st.nextId++;
    st.nodes[nid] = {
      id: nid,
      keys: N.keys.slice(m),
      children: N.children.length ? N.children.slice(m) : [],
    };
    N.keys = N.keys.slice(0, m - 1);
    if (N.children.length) N.children = N.children.slice(0, m);
    const u = path.pop();
    if (u === undefined) {
      const root = st.nextId++;
      st.nodes[root] = { id: root, keys: [mid], children: [v, nid] };
      st.root = root;
      st.marks = { [v]: "n-swap", [nid]: "n-swap", [root]: "n-new" };
      st.hot = { [root]: 0 };
      yield snap(
        st,
        7,
        `m = ⌊(b+1)/2⌋ = ${m}: vrchol rozdělíme na ${box(N.keys)} a ${box(st.nodes[nid].keys)}; byl to kořen, takže prostřední klíč ${fmt(mid)} tvoří nový kořen (výška stromu vzroste o 1).`,
      );
      break;
    }
    const U = st.nodes[u];
    const at = U.children.indexOf(v);
    U.keys.splice(at, 0, mid);
    U.children.splice(at + 1, 0, nid);
    st.marks = { [v]: "n-swap", [nid]: "n-swap", [u]: "n-active" };
    st.hot = { [u]: at };
    yield snap(
      st,
      8,
      `m = ⌊(b+1)/2⌋ = ${m}: vrchol rozdělíme na ${box(N.keys)} a ${box(st.nodes[nid].keys)}, prostřední klíč ${fmt(mid)} vložíme do otce ${box(U.keys)}.`,
    );
    v = u;
  }
  clear(st);
  // nový klíč zůstane zvýrazněný
  for (const n of Object.values(st.nodes))
    if (n.keys.includes(x)) {
      st.marks[n.id] = "n-new";
      st.hot = { [n.id]: n.keys.indexOf(x) };
    }
  const grown = abHeight(st) > heightBefore ? ", výška vzrostla o 1" : "";
  yield finalStep(
    st,
    "Insert",
    x,
    `klíč vložen, ${splits === 0 ? "bez štěpení" : `${splits === 1 ? "jedno štěpení" : `štěpení: ${splits}`}`}${grown}; ${abSummary(st)}.`,
  );
}

/* ------------------------------------------------------------------ Delete */

export function* bookDelete(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x) ?? abParamError(st.a, st.b);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  const { a } = st;
  if (st.root === null) {
    yield snap(st, 1, "Strom je prázdný – není co mazat.");
    yield finalStep(
      st,
      "Delete",
      x,
      "strom je prázdný, není co mazat.",
      "neutral",
    );
    return;
  }
  const r = yield* descend(st, x, 1);
  if (r.at < 0) {
    st.marks[r.path[r.path.length - 1]] = "n-bad";
    yield snap(
      st,
      1,
      `Došli jsme do vnějšího listu – klíč ${fmt(x)} ve stromu není, není co mazat.`,
    );
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč ve stromu není, strom se nezměnil (${abSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const heightBefore = abHeight(st);
  const path = r.path;
  let v = path[path.length - 1];
  let i = r.at;
  let replaced: number | null = null;
  if (!bottom(st, v)) {
    // následník: minimum pravého podstromu s_i (nejlevější vrchol na předposlední hladině)
    const V = st.nodes[v];
    st.marks = { [v]: "n-active" };
    st.hot = { [v]: i };
    let u = V.children[i + 1];
    path.push(u);
    st.marks[u] = "n-compare";
    while (!bottom(st, u)) {
      u = st.nodes[u].children[0];
      path.push(u);
      st.marks[u] = "n-compare";
    }
    const m = st.nodes[u].keys[0];
    yield snap(
      st,
      2,
      `${fmt(x)} není na předposlední hladině – nahradíme ho následníkem: minimum pravého podstromu je ${fmt(m)}.`,
    );
    V.keys[i] = m;
    replaced = m;
    st.marks = { [v]: "n-swap", [u]: "n-removed" };
    st.hot = { [v]: i, [u]: 0 };
    yield snap(
      st,
      3,
      `Klíč ${fmt(x)} přepíšeme následníkem ${fmt(m)}; teď mažeme ${fmt(m)} z vrcholu ${box(st.nodes[u].keys)}.`,
    );
    v = u;
    i = 0;
  } else {
    st.marks = { [v]: "n-removed" };
    st.hot = { [v]: i };
    yield snap(
      st,
      4,
      `Vrchol ${box(st.nodes[v].keys)} je na předposlední hladině – klíč ${fmt(x)} z něj odebereme i s jedním vnějším listem.`,
    );
  }
  st.nodes[v].keys.splice(i, 1);
  st.hot = {};
  st.marks = { [v]: "n-active" };
  const left = st.nodes[v].keys.length + 1;
  yield snap(
    st,
    5,
    `Vrchol ${box(st.nodes[v].keys)} má teď ${sons(left)}.${
      v === st.root
        ? " Je to kořen, pro ten dolní mez a neplatí."
        : left >= a
          ? ` To je aspoň a = ${a}, vrchol zůstává v pořádku.`
          : ` To je méně než a = ${a}.`
    }`,
  );

  let merges = 0;
  let borrowed = false;
  path.pop(); // v
  while (v !== st.root && st.nodes[v].keys.length + 1 < a) {
    const p = path.pop()!;
    const P = st.nodes[p];
    const V = st.nodes[v];
    const j = P.children.indexOf(v);
    const leftSib = j >= 1;
    const l = P.children[leftSib ? j - 1 : j + 1];
    const L = st.nodes[l];
    const oi = leftSib ? j - 1 : j; // index klíče o v otci
    const o = P.keys[oi];
    st.marks = { [v]: "n-bad", [l]: "n-compare", [p]: "n-active" };
    st.hot = { [p]: oi };
    yield snap(
      st,
      6,
      `Vrchol ${box(V.keys)} má ${sons(V.keys.length + 1)}, méně než a = ${a}. ${leftSib ? "Levý" : "Levého bratra nemá, vezmeme pravého –"} bratr ${box(L.keys)} má ${sons(L.keys.length + 1)}, v otci je odděluje klíč ${fmt(o)}.`,
    );
    if (L.keys.length + 1 >= a + 1) {
      // půjčka (obr. 8.10)
      const m = leftSib ? L.keys.pop()! : L.keys.shift()!;
      const c = L.children.length
        ? leftSib
          ? L.children.pop()!
          : L.children.shift()!
        : undefined;
      if (leftSib) V.keys.unshift(o);
      else V.keys.push(o);
      if (c !== undefined) {
        if (leftSib) V.children.unshift(c);
        else V.children.push(c);
      }
      P.keys[oi] = m;
      st.marks = { [v]: "n-new", [l]: "n-swap", [p]: "n-active" };
      st.hot = { [p]: oi };
      yield snap(
        st,
        7,
        `Bratr má syna nazbyt – půjčíme si: jeho ${leftSib ? "největší" : "nejmenší"} klíč ${fmt(m)} jde do otce, klíč ${fmt(o)} z otce do podtečeného vrcholu${c !== undefined ? ` a ${leftSib ? "nejpravější" : "nejlevější"} syn bratra přejde pod něj` : ""}.`,
      );
      borrowed = true;
      break;
    }
    // sloučení (obr. 8.9): ℓ, o, v → jeden vrchol (ponecháme levý z obou)
    const [keep, gone] = leftSib ? [l, v] : [v, l];
    const K = st.nodes[keep];
    const G = st.nodes[gone];
    K.keys = [...K.keys, o, ...G.keys];
    K.children = [...K.children, ...G.children];
    P.keys.splice(oi, 1);
    P.children.splice(P.children.indexOf(gone), 1);
    delete st.nodes[gone];
    st.marks = { [keep]: "n-new", [p]: "n-active" };
    st.hot = {};
    yield snap(
      st,
      9,
      `Bratr má jen ${sons(a)} (a = ${a}) – sloučíme oba vrcholy i s klíčem ${fmt(o)} z otce do ${box(K.keys)} (${sons(K.keys.length + 1)}, nejvýše b = ${st.b}); otec přišel o klíč.`,
    );
    merges++;
    v = p;
  }
  const R = st.nodes[st.root!];
  if (R.keys.length === 0) {
    const old = st.root!;
    st.root = R.children.length ? R.children[0] : null;
    delete st.nodes[old];
    st.marks = st.root === null ? {} : { [st.root]: "n-new" };
    st.hot = {};
    yield snap(
      st,
      10,
      st.root === null
        ? "Kořen přišel o poslední klíč – strom je prázdný."
        : "Kořen nemá žádný klíč – jeho jediný syn se stává novým kořenem, výška klesla o 1.",
    );
  }
  clear(st);
  if (st.root === null) {
    yield finalStep(
      st,
      "Delete",
      x,
      "byl to jediný klíč, strom je teď prázdný.",
    );
    return;
  }
  const repairs = [
    merges === 1 ? "jedno sloučení" : merges > 1 ? `sloučení: ${merges}` : "",
    borrowed ? "půjčka od bratra" : "",
  ]
    .filter(Boolean)
    .join(" a ");
  const shrunk = abHeight(st) < heightBefore ? ", výška klesla o 1" : "";
  yield finalStep(
    st,
    "Delete",
    x,
    `klíč odstraněn${replaced !== null ? ` (nahradil ho následník ${fmt(replaced)})` : ""}, ${repairs || "bez opravy vrcholů"}${shrunk}; ${abSummary(st)}.`,
  );
}

/** Insert bez kroků (stavba stromu z klíčů). */
export function bookInsertSilent(st: ABState, x: number) {
  const g = bookInsert(st, x);
  while (!g.next().done) {
    /* přeskočíme kroky */
  }
  clear(st);
  st.vars = {};
}
