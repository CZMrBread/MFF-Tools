/**
 * Komponenty silné souvislosti (Průvodce 5.9–5.10, obr. 5.13). Výchozí varianta: Tarjanův algoritmus
 * KompSSTarjan s procedurou KSST (5.10, str. 136–137) – jedno DFS, zásobník Z, esc(v). Varianta „kosaraju“:
 * KompSilnéSouvislosti (5.9, str. 133–134) – DFS v Gᵀ plní zásobník Z podle out, pak DFS v G
 * v pořadí odebírání ze Z. Stopa graphsB (fáze 4).
 *
 * comp(v) je jako v knize identifikátor = kořen komponenty (komp(t) ← v). Barva n-compK = pořadí nalezení.
 */
import { snap, type StepGen } from "../../core/steps";
import { cellKey } from "../../views/tableCells";
import {
  COMP_COLORS,
  DASHED,
  fail,
  inputProblem,
  L,
  LINE,
  type GraphAlgorithm,
} from "./algoKit";
import {
  cmpLabel,
  emptyState,
  neighbors,
  type GEdge,
  type Graph,
  type GraphState,
} from "./graph";

const INF = Number.POSITIVE_INFINITY;
const num = (x: number | undefined) =>
  x === undefined ? "–" : x === INF ? "∞" : String(x);

const TARJAN = [
  "Pro všechny vrcholy v: in(v) ← nedefinováno, komp(v) ← nedefinováno",
  "T ← 0, Z ← prázdný zásobník",
  "Pro všechny vrcholy u: pokud in(u) není definovaný, zavoláme KSST(u).",
  "Výstup: komp(v) pro každý vrchol v (identifikátor komponenty = její kořen)",
  "Procedura KSST(v):",
  "  T ← T + 1, in(v) ← T",
  "  Do zásobníku Z přidáme vrchol v.",
  "  esc(v) ← +∞",
  "  Pro všechny následníky w vrcholu v:",
  "    Pokud in(w) není definován:   // hrana vw je stromová",
  "      Zavoláme KSST(w).",
  "      esc(v) ← min(esc(v), esc(w))",
  "    Jinak není-li komp(w) definovaná:   // zpětná, příčná nebo dopředná",
  "      esc(v) ← min(esc(v), in(w))",
  "  Je-li esc(v) ≥ in(v):   // v je kořen komponenty",
  "    Opakujeme: odebereme ze zásobníku Z vrchol t, komp(t) ← v,",
  "    cyklus ukončíme, pokud t = v.",
];
const T_LN = {
  init: 0,
  zero: 1,
  outer: 2,
  out: 3,
  enter: 5,
  push: 6,
  esc: 7,
  tree: 9,
  minEsc: 11,
  other: 12,
  minIn: 13,
  root: 14,
  pop: 15,
  popEnd: 16,
} as const;

const KOSARAJU = [
  "Sestrojíme graf Gᵀ s obrácenými hranami.",
  "Z ← prázdný zásobník",
  "Pro všechny vrcholy v nastavíme komp(v) ← nedefinováno.",
  "Spouštíme DFS v Gᵀ opakovaně, než prozkoumáme všechny vrcholy.",
  "  Kdykoliv přitom opouštíme vrchol, vložíme ho do Z.   // Z je setříděný podle out(v)",
  "Postupně odebíráme vrcholy ze zásobníku Z a pro každý vrchol v:",
  "  Pokud komp(v) = nedefinováno:",
  "    Spustíme DFS(v) v G, přičemž vstupujeme pouze do vrcholů",
  "    s nedefinovanou hodnotou komp(…) a tuto hodnotu přepisujeme na v.",
  "Výstup: komp(v) pro každý vrchol v",
];
const K_LN = {
  transpose: 0,
  zero: 1,
  undef: 2,
  dfsT: 3,
  leave: 4,
  pop: 5,
  test: 6,
  dfsG: 7,
  enterG: 8,
  out: 9,
} as const;

const compClass = (k: number) => `n-comp${k % COMP_COLORS}`;

/** Sdílený stav obou variant: zásobník Z, komponenty, tabulka a proměnné. */
function makeCtx(g: Graph) {
  const st = emptyState();
  const Z: number[] = [];
  const comp = new Map<number, number>(); // vrchol → kořen (identifikátor komponenty)
  const comps: { root: number; members: number[] }[] = [];
  let zMarks: Record<string, string> = {};
  let T = 0;
  const sortLabels = (vs: readonly number[]) =>
    vs.map((v) => L(g, v)).sort(cmpLabel);
  const compText = () =>
    comps.map((c) => `{${sortLabels(c.members).join(", ")}}`).join(", ");
  const refresh = () => {
    st.table = {
      title: "Zásobník Z (vpravo vrchol)",
      header: [],
      rows: [Z.map((v) => L(g, v))],
      tail: true,
      cellMarks: zMarks,
    };
    st.vars = comps.length
      ? {
          T,
          komponenty: compText(),
          kořeny: comps.map((c) => L(g, c.root)).join(", "),
        }
      : { T };
  };
  return {
    st,
    Z,
    comp,
    comps,
    tick: () => ++T,
    get T() {
      return T;
    },
    /** zvýraznit pozice Z (od indexu `from` do konce třídou cls) */
    markZ(from: number | null, cls = "cell-hot") {
      zMarks = {};
      if (from !== null)
        for (let i = from; i < Z.length; i++) zMarks[cellKey(0, i)] = cls;
    },
    step(line: number | null, message: string) {
      refresh();
      return snap(st, line, message);
    },
    /** přiřadí vrchol do komponenty s kořenem root (index barvy = pořadí komponenty) */
    assign(v: number, root: number) {
      comp.set(v, root);
      let c = comps.find((x) => x.root === root);
      if (!c) comps.push((c = { root, members: [] }));
      c.members.push(v);
      st.nodeMarks[v] = compClass(comps.indexOf(c));
    },
    finalMessage() {
      if (comps.length === 1)
        return `Hotovo: graf je silně souvislý – jediná komponenta ${compText()}.`;
      const k = comps.length;
      return `Hotovo: ${k} ${k <= 4 ? "komponenty" : "komponent"} silné souvislosti – ${compText()} (v pořadí nalezení, tedy v opačném topologickém pořadí grafu komponent).`;
    },
  };
}

/* ------------------------------------------------------------------ Tarjan (5.10) */

function* tarjan(g: Graph): StepGen<GraphState> {
  const ctx = makeCtx(g);
  const { st, Z, comp } = ctx;
  const tin = new Map<number, number>();
  const esc = new Map<number, number>();
  const open = new Set<number>(); // na zásobníku rekurze
  const sub = (v: number) =>
    (st.nodeSub[v] = `${tin.get(v)}/${num(esc.get(v))}`);

  yield ctx.step(T_LN.init, "Všechny vrcholy mají in i komp nedefinované.");
  yield ctx.step(T_LN.zero, "T = 0, zásobník Z je prázdný.");

  function edgeKind(v: number, w: number): string {
    if (w === v) return "smyčka";
    if (open.has(w)) return "zpětná hrana";
    if (tin.get(w)! > tin.get(v)!) return "dopředná hrana";
    return "příčná hrana";
  }

  function* ksst(v: number): StepGen<GraphState> {
    const T = ctx.tick();
    tin.set(v, T);
    open.add(v);
    st.nodeMarks[v] = "n-open";
    sub(v);
    ctx.markZ(null);
    yield ctx.step(
      T_LN.enter,
      `KSST(${L(g, v)}): T = ${T}, in(${L(g, v)}) = ${T}.`,
    );
    Z.push(v);
    ctx.markZ(Z.length - 1);
    yield ctx.step(T_LN.push, `Vrchol ${L(g, v)} přidáme do zásobníku Z.`);
    esc.set(v, INF);
    sub(v);
    ctx.markZ(null);
    yield ctx.step(
      T_LN.esc,
      `esc(${L(g, v)}) ← +∞ – zatím nevíme o žádné hraně z podstromu ${L(g, v)} ven.`,
    );
    for (const { v: w, e } of neighbors(g, v)) {
      const ev = esc.get(v)!;
      if (!tin.has(w)) {
        st.edgeMarks[e.id] = "e-relax";
        yield ctx.step(
          T_LN.tree,
          `in(${L(g, w)}) není definován – hrana ${L(g, v)}→${L(g, w)} je stromová, zavoláme KSST(${L(g, w)}).`,
        );
        yield* ksst(w);
        st.edgeMarks[e.id] = "e-tree";
        const ew = esc.get(w)!;
        const n = Math.min(ev, ew);
        esc.set(v, n);
        sub(v);
        ctx.markZ(null);
        yield ctx.step(
          T_LN.minEsc,
          `Návrat z KSST(${L(g, w)}): esc(${L(g, v)}) ← min(${num(ev)}, esc(${L(g, w)}) = ${num(ew)}) = ${num(n)}.`,
        );
      } else if (!comp.has(w)) {
        st.edgeMarks[e.id] = "e-back";
        const iw = tin.get(w)!;
        const n = Math.min(ev, iw);
        esc.set(v, n);
        sub(v);
        yield ctx.step(
          T_LN.minIn,
          `Hrana ${L(g, v)}→${L(g, w)}: in(${L(g, w)}) = ${iw} je definován a komp(${L(g, w)}) ne (${edgeKind(v, w)}) – esc(${L(g, v)}) ← min(${num(ev)}, ${iw}) = ${num(n)}.`,
        );
      } else {
        st.edgeMarks[e.id] = "e-rejected";
        yield ctx.step(
          T_LN.other,
          `Hrana ${L(g, v)}→${L(g, w)}: komp(${L(g, w)}) = ${L(g, comp.get(w)!)} je definovaná – esc(${L(g, v)}) se nemění (${L(g, w)} leží v už odebrané komponentě).`,
        );
      }
    }
    open.delete(v);
    const ev = esc.get(v)!;
    const iv = tin.get(v)!;
    if (ev < iv) {
      st.nodeMarks[v] = "n-closed";
      ctx.markZ(null);
      yield ctx.step(
        T_LN.root,
        `esc(${L(g, v)}) = ${num(ev)} < in(${L(g, v)}) = ${iv} – ${L(g, v)} není kořen komponenty, zůstane v zásobníku Z.`,
      );
      return;
    }
    st.nodeMarks[v] = "n-current";
    const from = Z.lastIndexOf(v);
    ctx.markZ(from, "cell-found");
    yield ctx.step(
      T_LN.root,
      `esc(${L(g, v)}) = ${num(ev)} ≥ in(${L(g, v)}) = ${iv} – ${L(g, v)} je kořen komponenty, odebereme ji ze zásobníku Z.`,
    );
    for (;;) {
      const t = Z.pop()!;
      ctx.assign(t, v);
      ctx.markZ(from, "cell-found");
      if (t !== v) {
        yield ctx.step(
          T_LN.pop,
          `Odebereme ${L(g, t)} ze zásobníku Z, komp(${L(g, t)}) ← ${L(g, v)}.`,
        );
        continue;
      }
      ctx.markZ(null);
      const members = ctx.comps[ctx.comps.length - 1].members
        .map((x) => L(g, x))
        .sort(cmpLabel);
      yield ctx.step(
        T_LN.popEnd,
        `Odebereme ${L(g, t)}, komp(${L(g, t)}) ← ${L(g, v)}; t = v, cyklus končí – komponenta {${members.join(", ")}} je hotová.`,
      );
      break;
    }
  }

  const starts = [...g.nodes].sort((a, b) => cmpLabel(a.label, b.label));
  for (const n of starts) {
    if (tin.has(n.id)) continue;
    yield ctx.step(
      T_LN.outer,
      `in(${n.label}) není definovaný – zavoláme KSST(${n.label}).`,
    );
    yield* ksst(n.id);
  }
  yield ctx.step(T_LN.out, ctx.finalMessage());
}

/* ------------------------------------------------------------------ přes Gᵀ (5.9, Kosaraju–Sharir) */

/** Následníci v Gᵀ = předchůdci v G (podle názvu); hrana e je hrana G (w→u). */
function predecessors(g: Graph, u: number): { v: number; e: GEdge }[] {
  return g.edges
    .filter((e) => e.v === u)
    .map((e) => ({ v: e.u, e }))
    .sort((a, b) => cmpLabel(L(g, a.v), L(g, b.v)));
}

function* kosaraju(g: Graph): StepGen<GraphState> {
  const ctx = makeCtx(g);
  const { st, Z, comp } = ctx;
  const tin = new Map<number, number>();
  const tout = new Map<number, number>();
  const sub = (v: number) =>
    (st.nodeSub[v] = `${tin.get(v)}/${num(tout.get(v))}`);

  yield ctx.step(
    K_LN.transpose,
    "Gᵀ = G s obrácenými hranami – v první fázi budeme hrany procházet proti šipkám.",
  );
  yield ctx.step(K_LN.zero, "Zásobník Z je prázdný.");
  yield ctx.step(K_LN.undef, "Všechny vrcholy mají komp nedefinované.");

  function* dfsT(v: number): StepGen<GraphState> {
    const T = ctx.tick();
    tin.set(v, T);
    st.nodeMarks[v] = "n-open";
    sub(v);
    ctx.markZ(null);
    yield ctx.step(K_LN.dfsT, `Otevřeme ${L(g, v)}, in = ${T}.`);
    for (const { v: w, e } of predecessors(g, v)) {
      const name = `${L(g, v)}→${L(g, w)} v Gᵀ (${L(g, w)}→${L(g, v)} v G)`;
      if (!tin.has(w)) {
        st.edgeMarks[e.id] = "e-relax";
        yield ctx.step(
          K_LN.dfsT,
          `Hrana ${name}: ${L(g, w)} je nenalezený, vstoupíme do něj.`,
        );
        yield* dfsT(w);
        st.edgeMarks[e.id] = "e-tree";
      } else {
        if (!st.edgeMarks[e.id]) st.edgeMarks[e.id] = "e-seen";
        yield ctx.step(K_LN.dfsT, `Hrana ${name}: ${L(g, w)} už je nalezený.`);
      }
    }
    const T2 = ctx.tick();
    tout.set(v, T2);
    st.nodeMarks[v] = "n-closed";
    sub(v);
    Z.push(v);
    ctx.markZ(Z.length - 1);
    yield ctx.step(
      K_LN.leave,
      `Opouštíme ${L(g, v)} (out = ${T2}) a vložíme ho do zásobníku Z.`,
    );
  }

  const starts = [...g.nodes].sort((a, b) => cmpLabel(a.label, b.label));
  for (const n of starts) {
    if (tin.has(n.id)) continue;
    ctx.markZ(null);
    yield ctx.step(
      K_LN.dfsT,
      `Spustíme DFS v Gᵀ z dosud nenavštíveného vrcholu ${n.label}.`,
    );
    yield* dfsT(n.id);
  }

  // druhá fáze nad G: kresba znovu bez značek, in/out z Gᵀ zůstávají pod vrcholy
  st.nodeMarks = {};
  st.edgeMarks = {};
  ctx.markZ(null);
  yield ctx.step(
    K_LN.pop,
    "Všechny vrcholy jsou v zásobníku Z (nahoře ten s největším out) – teď je budeme odebírat a prohledávat G.",
  );

  function* dfsG(x: number, root: number): StepGen<GraphState> {
    ctx.assign(x, root);
    yield ctx.step(
      K_LN.enterG,
      `Vstoupíme do ${L(g, x)}, komp(${L(g, x)}) ← ${L(g, root)}.`,
    );
    for (const { v: y, e } of neighbors(g, x)) {
      if (!comp.has(y)) {
        st.edgeMarks[e.id] = "e-tree";
        yield* dfsG(y, root);
      } else {
        if (!st.edgeMarks[e.id]) st.edgeMarks[e.id] = "e-rejected";
        yield ctx.step(
          K_LN.enterG,
          `Hrana ${L(g, x)}→${L(g, y)}: komp(${L(g, y)}) = ${L(g, comp.get(y)!)} je definovaná – do ${L(g, y)} nevstoupíme.`,
        );
      }
    }
  }

  while (Z.length) {
    const v = Z[Z.length - 1];
    ctx.markZ(Z.length - 1, "cell-found");
    yield ctx.step(K_LN.pop, `Odebereme ${L(g, v)} ze zásobníku Z.`);
    Z.pop();
    ctx.markZ(null);
    if (comp.has(v)) {
      yield ctx.step(
        K_LN.test,
        `komp(${L(g, v)}) = ${L(g, comp.get(v)!)} je definovaná – přeskočíme.`,
      );
      continue;
    }
    yield ctx.step(
      K_LN.dfsG,
      `komp(${L(g, v)}) je nedefinovaná – spustíme DFS(${L(g, v)}) v G a nalezeným vrcholům přepíšeme komp na ${L(g, v)}.`,
    );
    yield* dfsG(v, v);
    const members = ctx.comps[ctx.comps.length - 1].members
      .map((x) => L(g, x))
      .sort(cmpLabel);
    yield ctx.step(
      K_LN.dfsG,
      `DFS(${L(g, v)}) skončilo – komponenta {${members.join(", ")}} s komp = ${L(g, v)} je hotová.`,
    );
  }
  yield ctx.step(K_LN.out, ctx.finalMessage());
}

function* run(g: Graph, _start: number, variant?: string): StepGen<GraphState> {
  const err = inputProblem(g, null);
  if (err) {
    yield fail(emptyState(), err);
    return;
  }
  yield* variant === "kosaraju" ? kosaraju(g) : tarjan(g);
}

export const scc: GraphAlgorithm = {
  id: "scc",
  title: "Komponenty silné souvislosti",
  // společné jméno operace obou variant (Tarjan / přes Gᵀ) – tlačítko akce i „Dokončeno: …“
  opName: "Komponenty silné souvislosti",
  shortOpName: "Komponenty",
  description:
    "Komponenty silné souvislosti jsou největší množiny vrcholů, mezi kterými vede cesta oběma směry. Tarjanův algoritmus je najde jedním prohledáním do hloubky: otevřené vrcholy skládá na zásobník Z a pro každý vrchol počítá esc(v) – nejmenší in(w), kam se z podstromu dostane hranou do vrcholu bez komponenty. Je-li esc(v) ≥ in(v), je v kořenem komponenty a ze zásobníku ji odebereme. Pod vrcholem je in / esc (u varianty přes Gᵀ in / out v Gᵀ).",
  complexity: "Θ(n + m)",
  needsStart: false,
  directed: true,
  forcedWhy: "Silná souvislost je pojem pro orientovaný graf",
  defaultPreset: "scc", // obr. 5.13
  previewShare: 1,
  pseudocode: TARJAN,
  variants: [
    {
      id: "tarjan",
      label: "Tarjan (5.10)",
      title: "KompSSTarjan: jedno DFS, zásobník Z a esc(v)",
    },
    {
      id: "kosaraju",
      label: "přes Gᵀ (5.9)",
      title:
        "KompSilnéSouvislosti (Kosaraju, Sharir): DFS v obráceném grafu Gᵀ seřadí vrcholy podle out, pak DFS v G",
      pseudocode: KOSARAJU,
    },
  ],
  legend: [
    {
      cls: "sw-open",
      label: "otevřený (na zásobníku rekurze)",
      marks: ["n-open"],
    },
    {
      cls: "sw-closed",
      label: "opuštěný, zatím bez komponenty (leží v Z)",
      marks: ["n-closed"],
    },
    {
      cls: "sw-current",
      label: "kořen komponenty, kterou právě odebíráme",
      marks: ["n-current"],
    },
    {
      cls: "sw-comp",
      label: "komponenta silné souvislosti (barva podle pořadí nalezení)",
      marks: ["n-comp*"],
    },
    {
      cls: "sw-relax",
      label: "hrana, po které jsme sestoupili (rekurze běží)",
      shape: LINE,
      marks: ["e-relax"],
    },
    { cls: "sw-tree", label: "stromová hrana", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-back",
      label: "hrana do vrcholu bez komponenty – snižuje esc",
      shape: DASHED,
      marks: ["e-back"],
    },
    {
      cls: "sw-seen",
      label: "hrana Gᵀ do už nalezeného vrcholu",
      shape: DASHED,
      marks: ["e-seen"],
    },
    {
      cls: "sw-rejected",
      label: "hrana do vrcholu s určenou komponentou – nic nemění",
      shape: DASHED,
      marks: ["e-rejected"],
    },
  ],
  tip: "na obr. 5.13 sledujte zásobník Z a esc pod vrcholy: f je kořenem komponenty {d, e, f}, protože esc(f) = in(f) = 4. Pak přepněte variantu na „přes Gᵀ (5.9)“ – komponenty vyjdou stejné, jen {d, e, f} dostane komp = d místo f.",
  run,
};
