/**
 * Mosty a artikulace (Průvodce 5.7, str. 123–126, obr. 5.10): DFS s in(v) a low(v) – algoritmus Mosty
 * a procedura Mosty2 podle knihy. Artikulace kniha pseudokódem nezapisuje („detailní zápis ponechme jako
 * cvičení“, str. 126); test podle textu: nekořenový vrchol v je artikulace, má-li syna w s low(w) ≥ in(v),
 * kořen, má-li v DFS stromu aspoň dva syny. Stopa graphsB (fáze 4).
 *
 * Odchylky od knihy (kniha předpokládá souvislý graf bez násobných hran): nesouvislý graf projdeme po
 * komponentách (Mosty2 z každého dosud nenavštíveného vrcholu); násobná hrana do otce není „w = p“ –
 * otce poznáme podle stromové hrany, takže druhá hrana do otce je zpětná.
 */
import { snap, type StepGen } from "../../core/steps";
import { cellKey } from "../../views/tableCells";
import {
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
  type Graph,
  type GraphState,
} from "./graph";

const INF = Number.POSITIVE_INFINITY;
/** +∞ jako „∞“ (low bez zpětné hrany) */
const num = (x: number | undefined) =>
  x === undefined ? "–" : x === INF ? "∞" : String(x);

/** Hrana „v–w“ ve směru průchodu (otec–syn). */
const edgeName = (g: Graph, v: number, w: number) => `${L(g, v)}–${L(g, w)}`;

/** Česky: „2 syny“, „5 synů“. */
function sons(k: number): string {
  if (k === 0) return "žádného syna";
  if (k === 1) return "jediného syna";
  return `${k} ${k <= 4 ? "syny" : "synů"}`;
}

const PSEUDOCODE = [
  "M ← ∅, A ← ∅, T ← 0   // mosty, artikulace, počítadlo kroků",
  "Pro všechny vrcholy v nastavíme in(v) ← nedefinováno.",
  "Zvolíme libovolně vrchol u ∈ V a zavoláme Mosty2(u, nedefinováno).",
  "Kořen u je artikulace, má-li v DFS stromu aspoň dva syny.",
  "Výstup: seznam mostů M a artikulací A",
  "Procedura Mosty2(v, p):",
  "  T ← T + 1, in(v) ← T",
  "  low(v) ← +∞",
  "  Pro všechny následníky w vrcholu v:",
  "    Pokud in(w) není definován:   // hrana vw je stromová",
  "      Zavoláme Mosty2(w, v).",
  "      Pokud low(w) ≥ in(w): přidáme vw do M.   // most",
  "      Pokud low(w) ≥ in(v) a v ≠ u: přidáme v do A.",
  "      low(v) ← min(low(v), low(w))",
  "    Jinak je-li w ≠ p a in(w) < in(v):   // zpětná hrana",
  "      low(v) ← min(low(v), in(w))",
];

/** řádky pseudokódu (indexy) */
const LN = {
  init: 0,
  undef: 1,
  start: 2,
  root: 3,
  out: 4,
  enter: 6,
  low: 7,
  tree: 9,
  bridge: 11,
  art: 12,
  minLow: 13,
  backTest: 14,
  back: 15,
} as const;

function* run(g: Graph): StepGen<GraphState> {
  const st = emptyState();
  const err = inputProblem(g, null);
  if (err) {
    yield fail(st, err);
    return;
  }
  let T = 0;
  const tin = new Map<number, number>();
  const low = new Map<number, number>();
  const parent = new Map<number, number | null>();
  const order: number[] = []; // vrcholy v pořadí otevření = řádky tabulky
  const closed = new Set<number>();
  const arts: number[] = [];
  const found: [number, number][] = []; // mosty (otec, syn) v pořadí nalezení
  let hl: number | undefined;
  let hot: [number, number][] = [];

  const mark = (v: number) => {
    const base = closed.has(v) ? "n-closed" : "n-open";
    st.nodeMarks[v] = arts.includes(v) ? `${base} n-art` : base;
  };
  const sub = (v: number) =>
    (st.nodeSub[v] = `${tin.get(v)}/${num(low.get(v))}`);
  /** řádek tabulky vrcholu */
  const row = (v: number) => order.indexOf(v);
  const refresh = () => {
    st.vars = {
      T,
      M: found.length
        ? found.map(([a, b]) => edgeName(g, a, b)).join(", ")
        : "∅",
      A: arts.length ? arts.map((v) => L(g, v)).join(", ") : "∅",
    };
    st.table = {
      title: "in a low (v pořadí otevření), p = otec",
      header: ["v", "in", "low", "p"],
      rows: order.map((v) => {
        const p = parent.get(v);
        return [
          L(g, v),
          String(tin.get(v)),
          num(low.get(v)),
          p === null || p === undefined ? "–" : L(g, p),
        ];
      }),
      highlight: hl,
      cellMarks: Object.fromEntries(
        hot.map(([r, c]) => [cellKey(r, c), "cell-hot"]),
      ),
    };
  };
  /** krok se zvýrazněným řádkem vrcholu `at` a buňkami `cells` ([vrchol, sloupec]) */
  const step = (
    line: number | null,
    message: string,
    at: number | null,
    cells: [number, number][] = [],
  ) => {
    hl = at === null ? undefined : row(at);
    hot = cells.map(([v, c]) => [row(v), c]);
    refresh();
    return snap(st, line, message);
  };

  refresh();
  yield step(LN.init, "M = ∅, A = ∅, T = 0.", null);
  yield step(LN.undef, "Všechny vrcholy mají in nedefinováno.", null);

  function* mosty2(
    v: number,
    p: number | null,
    pEdge: number | null,
    root: number,
  ): StepGen<GraphState> {
    T++;
    tin.set(v, T);
    parent.set(v, p);
    order.push(v);
    mark(v);
    sub(v);
    yield step(
      LN.enter,
      `Mosty2(${L(g, v)}, ${p === null ? "–" : L(g, p)}): T = ${T}, in(${L(g, v)}) = ${T}.`,
      v,
      [[v, 1]],
    );
    low.set(v, INF);
    sub(v);
    yield step(
      LN.low,
      `low(${L(g, v)}) ← +∞ – zatím neznáme žádnou zpětnou hranu z podstromu ${L(g, v)}.`,
      v,
      [[v, 2]],
    );
    let children = 0;
    for (const { v: w, e } of neighbors(g, v)) {
      const lv = low.get(v)!;
      if (!tin.has(w)) {
        children++;
        st.edgeMarks[e.id] = "e-relax";
        yield step(
          LN.tree,
          `in(${L(g, w)}) není definován – hrana ${edgeName(g, v, w)} je stromová, zavoláme Mosty2(${L(g, w)}, ${L(g, v)}).`,
          v,
        );
        yield* mosty2(w, v, e.id, root);
        closed.add(w);
        mark(w);
        const lw = low.get(w)!;
        const iw = tin.get(w)!;
        const iv = tin.get(v)!;
        if (lw >= iw) {
          st.edgeMarks[e.id] = "e-bridge";
          found.push([v, w]);
          yield step(
            LN.bridge,
            `low(${L(g, w)}) = ${num(lw)} ≥ in(${L(g, w)}) = ${iw} – z podstromu ${L(g, w)} nevede zpětná hrana nad ${L(g, w)}, hrana ${edgeName(g, v, w)} je most.`,
            v,
            [
              [w, 1],
              [w, 2],
            ],
          );
        } else {
          st.edgeMarks[e.id] = "e-tree";
          yield step(
            LN.bridge,
            `low(${L(g, w)}) = ${num(lw)} < in(${L(g, w)}) = ${iw} – z podstromu ${L(g, w)} vede zpětná hrana výš, hrana ${edgeName(g, v, w)} není most.`,
            v,
            [
              [w, 1],
              [w, 2],
            ],
          );
        }
        if (v === root) {
          yield step(
            LN.art,
            `${L(g, v)} je kořen DFS stromu – o něm rozhodne až počet synů (řádek „Kořen u…“).`,
            v,
          );
        } else if (lw >= iv) {
          const again = arts.includes(v);
          if (!again) arts.push(v);
          mark(v);
          yield step(
            LN.art,
            `low(${L(g, w)}) = ${num(lw)} ≥ in(${L(g, v)}) = ${iv} – podstrom ${L(g, w)} se bez ${L(g, v)} nedostane výš, ${L(g, v)} ${again ? "už v A je" : "je artikulace"}.`,
            v,
            [
              [w, 2],
              [v, 1],
            ],
          );
        } else {
          yield step(
            LN.art,
            `low(${L(g, w)}) = ${num(lw)} < in(${L(g, v)}) = ${iv} – podstrom ${L(g, w)} obchází ${L(g, v)} zpětnou hranou, kvůli němu ${L(g, v)} artikulace není.`,
            v,
            [
              [w, 2],
              [v, 1],
            ],
          );
        }
        const nl = Math.min(lv, lw);
        low.set(v, nl);
        sub(v);
        yield step(
          LN.minLow,
          `low(${L(g, v)}) ← min(${num(lv)}, ${num(lw)}) = ${num(nl)}.`,
          v,
          [[v, 2]],
        );
        continue;
      }
      const iw = tin.get(w)!;
      const iv = tin.get(v)!;
      if (e.id === pEdge) {
        yield step(
          LN.backTest,
          `Hrana ${edgeName(g, v, w)} vede do otce p = ${L(g, w)} – je to stromová hrana, přeskočíme.`,
          v,
        );
      } else if (w === v) {
        yield step(
          LN.backTest,
          `Smyčka ${edgeName(g, v, w)}: in(${L(g, w)}) = in(${L(g, v)}) – na mosty ani low nemá vliv.`,
          v,
        );
      } else if (iw < iv) {
        st.edgeMarks[e.id] = "e-back";
        const nl = Math.min(lv, iw);
        low.set(v, nl);
        sub(v);
        const why =
          w === p
            ? `Hrana ${edgeName(g, v, w)} je násobná: vede do otce ${L(g, w)}, ale není to stromová hrana – počítáme ji jako zpětnou (kniha násobné hrany nemá).`
            : `Hrana ${edgeName(g, v, w)} je zpětná (in(${L(g, w)}) = ${iw} < in(${L(g, v)}) = ${iv}).`;
        yield step(
          LN.back,
          `${why} low(${L(g, v)}) ← min(${num(lv)}, ${iw}) = ${num(nl)}.`,
          v,
          [[v, 2]],
        );
      } else {
        yield step(
          LN.backTest,
          `Hrana ${edgeName(g, v, w)}: in(${L(g, w)}) = ${iw} > in(${L(g, v)}) = ${iv} – zpětnou hranu ${edgeName(g, w, v)} už jsme zpracovali z druhé strany.`,
          v,
        );
      }
    }
    if (v === root) {
      closed.add(v);
      if (children >= 2) arts.push(v);
      mark(v);
      yield step(
        LN.root,
        `Kořen ${L(g, v)} má v DFS stromu ${sons(children)} – ${children >= 2 ? "je artikulace" : "není artikulace"}.`,
        v,
      );
    }
  }

  const starts = [...g.nodes].sort((a, b) => cmpLabel(a.label, b.label));
  let first = true;
  for (const n of starts) {
    if (tin.has(n.id)) continue;
    yield step(
      LN.start,
      first
        ? `Zvolíme u = ${n.label} a zavoláme Mosty2(${n.label}, –).`
        : `Graf není souvislý – Mosty2 zavoláme i z dalšího nenavštíveného vrcholu: Mosty2(${n.label}, –).`,
      null,
    );
    first = false;
    yield* mosty2(n.id, null, null, n.id);
  }

  const bridgeList = found
    .map(([a, b]) => edgeName(g, a, b))
    .sort(cmpLabel)
    .join(", ");
  const artList = arts
    .map((v) => L(g, v))
    .sort(cmpLabel)
    .join(", ");
  yield step(
    LN.out,
    !bridgeList && !artList
      ? "Hotovo. Graf nemá žádný most ani artikulaci."
      : `Hotovo. Mosty: ${bridgeList || "žádné"}. Artikulace: ${artList || "žádné"}.`,
    null,
  );
}

export const bridges: GraphAlgorithm = {
  id: "bridges",
  title: "Mosty a artikulace",
  opName: "Mosty",
  description:
    "Most je hrana, jejímž odebráním se graf rozpadne; artikulace je takový vrchol. Při prohledávání do hloubky si každý vrchol pamatuje čas otevření in(v) a low(v) – nejmenší in, kam se z jeho podstromu dostaneme zpětnou hranou. Stromová hrana vw je most, právě když low(w) ≥ in(w); nekořenový vrchol v je artikulace, má-li syna w s low(w) ≥ in(v), kořen, má-li aspoň dva syny. Pod vrcholem je in / low.",
  complexity: "Θ(n + m)",
  needsStart: false,
  directed: false,
  forcedWhy: "Mosty a artikulace se hledají v neorientovaném grafu",
  defaultPreset: "bridges", // obr. 5.10
  previewShare: 1,
  pseudocode: PSEUDOCODE,
  legend: [
    {
      cls: "sw-open",
      label: "otevřený (na zásobníku rekurze)",
      marks: ["n-open"],
    },
    {
      cls: "sw-closed",
      label: "opuštěný (rekurze se z něj vrátila)",
      marks: ["n-closed"],
    },
    { cls: "sw-art", label: "artikulace", marks: ["n-art"] },
    {
      cls: "sw-relax",
      label: "stromová hrana na cestě rekurze (čeká na test mostu)",
      shape: LINE,
      marks: ["e-relax"],
    },
    {
      cls: "sw-tree",
      label: "stromová hrana, která není most",
      shape: LINE,
      marks: ["e-tree"],
    },
    { cls: "sw-bridge", label: "most", shape: LINE, marks: ["e-bridge"] },
    {
      cls: "sw-back",
      label: "zpětná hrana (snižuje low)",
      shape: DASHED,
      marks: ["e-back"],
    },
  ],
  tip: "na obr. 5.10 sledujte low pod vrcholy: c–d je most, protože z podstromu d nevede zpětná hrana výš než do d (low(d) = in(d) = 4). Pak v „Upravit graf“ přidejte hranu b–e – zbudou jen mosty g–j, g–k a artikulace g.",
  run,
};
