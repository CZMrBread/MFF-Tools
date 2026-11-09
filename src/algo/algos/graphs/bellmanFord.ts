/**
 * Bellmanův–Fordův algoritmus (Průvodce 6.3, str. 149–153): obecný algoritmus Relaxace (str. 150), který
 * otevřené vrcholy uzavírá v pořadí fronty (str. 152). Fáze F₀, F₁, … podle definice z knihy (Fᵢ₊₁ uzavírá
 * vrcholy otevřené během Fᵢ); bez záporných cyklů skončí po nejvýše n fázích (důsledek invariantu F).
 * Varianta „po fázích“ = cvičení 6.3.4 (n fází, v každé relaxujeme všechny vrcholy). Záporný cyklus
 * (cvičení 6.3.2) poznáme ve chvíli, kdy hrany předchůdců P uzavřou kružnici – ta má vždy zápornou délku
 * a nejpozději ve fázi n nastane. Stopa graphsA (fáze 4).
 */
import { formatTerm } from "../../core/format";
import { snap, type StepGen } from "../../core/steps";
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
  fmtNum,
  neighbors,
  type GEdge,
  type Graph,
  type GraphState,
} from "./graph";

/** Fáze s dolním indexem: 2 → „F₂“. */
const SUB = "₀₁₂₃₄₅₆₇₈₉";
export const phaseLabel = (i: number) =>
  "F" + String(i).replace(/\d/g, (d) => SUB[Number(d)]);

const QUEUE_CODE = [
  "Pro všechny vrcholy v: stav(v) ← nenalezený, h(v) ← +∞, P(v) ← nedefinováno",
  "stav(v₀) ← otevřený, h(v₀) ← 0   // fáze F₀",
  "Dokud existují otevřené vrcholy:",
  "  v ← nejstarší otevřený vrchol   // fronta",
  "  Pro všechny následníky w vrcholu v:   // relaxujeme vrchol v",
  "    Pokud h(w) > h(v) + ℓ(v, w):",
  "      h(w) ← h(v) + ℓ(v, w)",
  "      stav(w) ← otevřený",
  "      P(w) ← v",
  "      Uzavřou-li hrany P kružnici, je záporná: skončíme.   // cv. 2",
  "  stav(v) ← uzavřený",
  "Výstup: ohodnocení vrcholů h a pole předchůdců P",
];

const PHASES_CODE = [
  "Pro všechny vrcholy v: h(v) ← +∞, P(v) ← nedefinováno",
  "h(v₀) ← 0",
  "Pro fáze i = 1, …, n:",
  "  Pro všechny vrcholy v s h(v) < +∞:   // relaxujeme vrchol v",
  "    Pro všechny následníky w vrcholu v:",
  "      Pokud h(w) > h(v) + ℓ(v, w):",
  "        h(w) ← h(v) + ℓ(v, w), P(w) ← v",
  "        Uzavřou-li hrany P kružnici, je záporná: skončíme.   // cv. 2",
  "  Nezměnilo-li se ve fázi i žádné h, skončíme.",
  "Výstup: ohodnocení vrcholů h a pole předchůdců P",
];

/** Společný stav obou variant: ohodnocení, předchůdci a hledání záporného cyklu. */
function relaxation(g: Graph, start: number, st: GraphState) {
  const h = new Map<number, number>();
  /** vrchol → id hrany P(w)v */
  const P = new Map<number, number>();
  const fmt = (v: number) => (h.has(v) ? fmtNum(h.get(v)!) : "∞");
  const arrow = g.directed ? "→" : "–";
  /** předchůdce podle hrany P(x) (u neorientované hrany druhý konec) */
  const parent = (x: number): number | null => {
    const id = P.get(x);
    if (id === undefined) return null;
    const e = g.edges[id];
    return g.directed || e.v === x ? e.u : e.v;
  };
  /**
   * Po P(w) ← v: vede-li cesta po předchůdcích z v do w, hrany P tvoří kružnici w → … → v → w. Vrací
   * její vrcholy (první = poslední = w), jinak null.
   */
  const pCycle = (v: number, w: number): number[] | null => {
    const back: number[] = [];
    let x: number | null = v;
    for (let i = 0; x !== null && i <= g.nodes.length; i++) {
      back.push(x);
      if (x === w) return [...back.reverse(), w];
      x = parent(x);
    }
    return null;
  };
  /** Označí záporný cyklus a vrátí závěrečnou hlášku (začíná „Hotovo“, krok s outcome warn). */
  const cycleMessage = (cyc: number[]) => {
    let len = 0;
    for (const x of cyc.slice(1)) {
      const e = g.edges[P.get(x)!];
      len += e.w;
      st.edgeMarks[e.id] = "e-back";
    }
    for (const x of cyc.slice(1))
      st.nodeMarks[x] = `${st.nodeMarks[x] || "n-open"} n-bad`.trim();
    const text = cyc.map((x) => L(g, x)).join(" → ");
    st.vars = { ...st.vars, cyklus: text, "délka cyklu": fmtNum(len) };
    const und =
      !g.directed && cyc.length === 3
        ? " V neorientovaném grafu je každá hrana se zápornou délkou záporným cyklem (tam a zpět)."
        : "";
    return `Hotovo: hrany P uzavřely kružnici ${text} délky ${fmtNum(len)} < 0 – graf má záporný cyklus dosažitelný z ${L(g, start)}. Obcházením cyklu by h klesalo donekonečna, vzdálenosti proto nejsou definované.${und}`;
  };
  /** popis testu relaxace hrany e = vw */
  const test = (v: number, w: number, e: GEdge) => {
    const cand = h.get(v)! + e.w;
    const better = !h.has(w) || h.get(w)! > cand;
    const q = `Hrana ${L(g, v)}${arrow}${L(g, w)} (ℓ = ${fmtNum(e.w)}): h(${L(g, w)}) = ${fmt(w)}`;
    const sum = `h(${L(g, v)}) + ℓ = ${fmt(v)} + ${formatTerm(e.w)} = ${fmtNum(cand)}`;
    return {
      cand,
      better,
      message: better
        ? `${q} > ${sum} – zlepšíme.`
        : `${q} ≤ ${sum} – nezlepší se.`,
    };
  };
  /** třída hrany po testu / po změně předchůdce: hrana P některého svého konce je stromová */
  const edgeClass = (e: GEdge) =>
    P.get(e.v) === e.id || (!g.directed && P.get(e.u) === e.id)
      ? "e-tree"
      : "e-seen";
  /** konec bez záporného cyklu: nedosažitelné vrcholy */
  const unreached = () => {
    const u = g.nodes.filter((n) => !h.has(n.id)).map((n) => n.label);
    return u.length ? ` Nedosažitelné vrcholy (h = ∞): ${u.join(", ")}.` : "";
  };
  return { h, P, fmt, pCycle, cycleMessage, test, unreached, edgeClass };
}

const fazich = (k: number) => `${k} ${k === 1 ? "fázi" : "fázích"}`;

function* runQueue(g: Graph, start: number): StepGen<GraphState> {
  const st = emptyState();
  const R = relaxation(g, start, st);
  const { h, P, fmt } = R;
  const n = g.nodes.length;
  const queue: number[] = [];
  /** fáze, ve které byl vrchol (naposledy) otevřen */
  const openedIn = new Map<number, number>();
  const closedTimes = new Map<number, number>();
  const table = (hl?: number) => {
    st.table = {
      title: "Fronta otevřených vrcholů (nejstarší nahoře)",
      header: ["vrchol", "h", "otevřen ve"],
      rows: queue.map((v) => [L(g, v), fmt(v), phaseLabel(openedIn.get(v)!)]),
      highlight: hl,
    };
  };
  for (const nd of g.nodes) st.nodeSub[nd.id] = "∞";
  table();
  yield snap(
    st,
    0,
    "Všechny vrcholy jsou nenalezené, ohodnocení h = +∞, předchůdci P nedefinovaní.",
  );
  h.set(start, 0);
  queue.push(start);
  openedIn.set(start, 0);
  st.nodeMarks[start] = "n-open";
  st.nodeSub[start] = "0";
  st.vars = { fáze: phaseLabel(0) };
  table();
  yield snap(
    st,
    1,
    `h(${L(g, start)}) = 0 a ${L(g, start)} otevřeme – to je fáze F₀. Fáze Fᵢ₊₁ uzavírá vrcholy otevřené během fáze Fᵢ.`,
  );
  let phase = 0;
  while (queue.length) {
    const v = queue[0];
    const ph = openedIn.get(v)! + 1;
    if (ph > n) {
      // pojistka: záporný cyklus se pozná dřív (hrany P uzavřou kružnici nejpozději ve fázi n). Kdyby přesto
      // fáze přesáhly n, závěr nesmí tvrdit, že je fronta prázdná (CR-5).
      st.vars = { fáze: phaseLabel(phase) };
      const s = snap(
        st,
        11,
        `Hotovo: fáze přesáhly n = ${n} a fronta prázdná není – graf má záporný cyklus dosažitelný z ${L(g, start)}, vzdálenosti nejsou definované.`,
      );
      yield { ...s, outcome: "warn" };
      return;
    }
    const fresh = ph !== phase;
    phase = ph;
    table(0);
    queue.shift();
    st.nodeMarks[v] = "n-current";
    st.vars = { fáze: phaseLabel(phase), v: L(g, v), "h(v)": fmt(v) };
    yield snap(
      st,
      3,
      `${fresh ? `Začíná fáze ${phaseLabel(phase)} – uzavírá vrcholy otevřené ve fázi ${phaseLabel(phase - 1)}. ` : ""}Nejstarší otevřený vrchol je ${L(g, v)} (h = ${fmt(v)}): vyjmeme ho z fronty a relaxujeme.`,
    );
    table();
    for (const { v: w, e } of neighbors(g, v)) {
      const t = R.test(v, w, e);
      st.edgeMarks[e.id] = "e-relax";
      st.vars = { ...st.vars, w: L(g, w) };
      yield snap(st, 5, t.message);
      if (!t.better) {
        st.edgeMarks[e.id] = R.edgeClass(e);
        continue;
      }
      h.set(w, t.cand);
      st.nodeSub[w] = fmtNum(t.cand);
      if (w === v) st.vars = { ...st.vars, "h(v)": fmt(v) };
      table();
      yield snap(st, 6, `h(${L(g, w)}) ← ${fmtNum(t.cand)}.`);
      if (!queue.includes(w)) {
        queue.push(w);
        openedIn.set(w, phase);
        if (w !== v) st.nodeMarks[w] = "n-open";
        table();
        yield snap(
          st,
          7,
          `${L(g, w)} otevřeme – zařadíme ho na konec fronty (otevřen ve fázi ${phaseLabel(phase)}, uzavře ho fáze ${phaseLabel(phase + 1)}).${closedTimes.has(w) ? ` Už byl uzavřený – relaxační algoritmus smí vrchol otevřít znovu.` : ""}`,
        );
      } else {
        yield snap(
          st,
          7,
          `${L(g, w)} už je otevřený – ve frontě zůstává na svém místě.`,
        );
      }
      const old = P.get(w);
      P.set(w, e.id);
      if (old !== undefined) st.edgeMarks[old] = R.edgeClass(g.edges[old]);
      st.edgeMarks[e.id] = "e-tree";
      yield snap(st, 8, `P(${L(g, w)}) ← ${L(g, v)}.`);
      const cyc = R.pCycle(v, w);
      if (cyc) {
        const s = snap(st, 9, R.cycleMessage(cyc));
        yield { ...s, outcome: "warn" };
        return;
      }
    }
    if (!queue.includes(v)) {
      st.nodeMarks[v] = "n-closed";
      closedTimes.set(v, (closedTimes.get(v) ?? 0) + 1);
    } else st.nodeMarks[v] = "n-open";
    delete st.vars.w;
    yield snap(st, 10, `Uzavřeme ${L(g, v)}.`);
  }
  st.vars = { fáze: phaseLabel(phase) };
  st.table = undefined;
  const again = g.nodes
    .filter((nd) => (closedTimes.get(nd.id) ?? 0) > 1)
    .map((nd) => `${nd.label} (${closedTimes.get(nd.id)}×)`);
  yield snap(
    st,
    11,
    `Hotovo – fronta je prázdná po ${fazich(phase)} (n = ${n}). Čísla pod vrcholy jsou vzdálenosti z ${L(g, start)}, hrany P tvoří strom nejkratších cest.${again.length ? ` Víckrát uzavřené vrcholy: ${again.join(", ")}.` : ""}${R.unreached()}`,
  );
}

function* runPhases(g: Graph, start: number): StepGen<GraphState> {
  const st = emptyState();
  const R = relaxation(g, start, st);
  const { h, P, fmt } = R;
  const n = g.nodes.length;
  const order = [...g.nodes]
    .sort((a, b) => cmpLabel(a.label, b.label))
    .map((nd) => nd.id);
  const table = (hl?: number) => {
    st.table = {
      title: "Ohodnocení a předchůdci",
      header: ["vrchol", "h", "P"],
      rows: order.map((v) => {
        const id = P.get(v);
        const e = id === undefined ? null : g.edges[id];
        const p = e === null ? "–" : L(g, g.directed || e.v === v ? e.u : e.v);
        return [L(g, v), fmt(v), p];
      }),
      highlight: hl,
    };
  };
  for (const nd of g.nodes) st.nodeSub[nd.id] = "∞";
  table();
  yield snap(st, 0, "Všechna ohodnocení h jsou +∞, předchůdci P nedefinovaní.");
  h.set(start, 0);
  st.nodeSub[start] = "0";
  st.nodeMarks[start] = "n-visited";
  st.vars = { fáze: phaseLabel(0) };
  table();
  yield snap(st, 1, `h(${L(g, start)}) = 0.`);
  let phases = 0;
  for (let i = 1; i <= n; i++) {
    phases = i;
    let changed = false;
    st.vars = { fáze: phaseLabel(i) };
    table();
    yield snap(
      st,
      2,
      `Fáze ${phaseLabel(i)}: relaxujeme postupně všechny vrcholy s konečným h (v pořadí podle názvu).`,
    );
    for (const v of order) {
      if (!h.has(v)) continue;
      st.nodeMarks[v] = "n-current";
      st.vars = { fáze: phaseLabel(i), v: L(g, v), "h(v)": fmt(v) };
      table(order.indexOf(v));
      yield snap(st, 3, `Relaxujeme ${L(g, v)} (h = ${fmt(v)}).`);
      for (const { v: w, e } of neighbors(g, v)) {
        const t = R.test(v, w, e);
        st.edgeMarks[e.id] = "e-relax";
        st.vars = { ...st.vars, w: L(g, w) };
        yield snap(st, 5, t.message);
        if (!t.better) {
          st.edgeMarks[e.id] = R.edgeClass(e);
          continue;
        }
        changed = true;
        h.set(w, t.cand);
        st.nodeSub[w] = fmtNum(t.cand);
        if (w !== v) st.nodeMarks[w] = "n-visited";
        else st.vars = { ...st.vars, "h(v)": fmt(v) };
        const old = P.get(w);
        P.set(w, e.id);
        if (old !== undefined) st.edgeMarks[old] = R.edgeClass(g.edges[old]);
        st.edgeMarks[e.id] = "e-tree";
        table(order.indexOf(v));
        yield snap(
          st,
          6,
          `h(${L(g, w)}) ← ${fmtNum(t.cand)}, P(${L(g, w)}) ← ${L(g, v)}.`,
        );
        const cyc = R.pCycle(v, w);
        if (cyc) {
          const s = snap(st, 7, R.cycleMessage(cyc));
          yield { ...s, outcome: "warn" };
          return;
        }
      }
      st.nodeMarks[v] = "n-visited";
    }
    if (!changed) {
      st.vars = { fáze: phaseLabel(i) };
      table();
      yield snap(
        st,
        8,
        `Ve fázi ${phaseLabel(i)} se nezměnilo žádné h – další fáze by nic nezměnily, skončíme.`,
      );
      break;
    }
  }
  st.vars = { fáze: phaseLabel(phases) };
  table();
  yield snap(
    st,
    9,
    `Hotovo po ${fazich(phases)} (n = ${n}). Čísla pod vrcholy jsou vzdálenosti z ${L(g, start)}, hrany P tvoří strom nejkratších cest.${R.unreached()}`,
  );
}

export const bellmanFord: GraphAlgorithm = {
  id: "bellman-ford",
  title: "Bellmanův–Fordův algoritmus",
  opName: "BellmanFord",
  description:
    "Relaxační algoritmus: otevřené vrcholy čekají ve frontě, každý vyjmutý vrchol relaxujeme – zlepšíme ohodnocení h(w) jeho následníků přes hranu vw. Na rozdíl od Dijkstrova algoritmu funguje i se zápornými délkami hran; vrchol se pak může otevřít víckrát. Výpočet dělíme na fáze: fáze Fᵢ₊₁ uzavírá vrcholy otevřené ve fázi Fᵢ. Bez záporných cyklů skončí po nejvýše n fázích, každá trvá O(m). Záporný cyklus (cvičení 2) poznáme tak, že hrany předchůdců P uzavřou kružnici.",
  complexity: "O(nm)",
  needsStart: true,
  weighted: true,
  forcedWhy: "Bellmanův–Fordův algoritmus počítá s délkami hran",
  defaultPreset: "negative",
  pseudocode: QUEUE_CODE,
  variants: [
    {
      id: "queue",
      label: "fronta (kniha)",
      title:
        "Bellmanův–Fordův algoritmus z Průvodce: uzavíráme nejstarší otevřený vrchol",
    },
    {
      id: "phases",
      label: "po fázích (cv. 4)",
      title:
        "Cvičení 6.3.4: n fází, v každé postupně relaxujeme všechny vrcholy",
      pseudocode: PHASES_CODE,
    },
  ],
  legend: [
    { cls: "sw-open", label: "otevřený (ve frontě)", marks: ["n-open"] },
    {
      cls: "sw-visited",
      label: "dosažený vrchol (h < ∞)",
      marks: ["n-visited"],
    },
    {
      cls: "sw-current",
      label: "právě relaxovaný vrchol v",
      marks: ["n-current"],
    },
    { cls: "sw-closed", label: "uzavřený", marks: ["n-closed"] },
    { cls: "sw-tree", label: "hrana P(w) → w", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-relax",
      label: "testovaná hrana vw",
      shape: LINE,
      marks: ["e-relax"],
    },
    {
      cls: "sw-seen",
      label: "prozkoumaná hrana (není v P)",
      shape: DASHED,
      marks: ["e-seen"],
    },
    {
      cls: "sw-back",
      label: "hrana záporného cyklu",
      shape: DASHED,
      marks: ["e-back"],
    },
    { cls: "sw-bad", label: "vrchol záporného cyklu", marks: ["n-bad"] },
  ],
  tip: "sledujte vrchol a: ve fázi F₁ dostane h(a) = 4, ve fázi F₂ se přes zápornou hranu b→a zlepší na −1 a otevře se znovu (Dijkstra by ho už neměnil). Pak Vytvořit ▸ „Orientovaný graf se záporným cyklem“, případně Varianta „po fázích“.",
  previewShare: 0.6,
  run: (g, start, variant) =>
    variant === "phases"
      ? runPhasesChecked(g, start)
      : runQueueChecked(g, start),
};

/** kontrola vstupu společná oběma variantám */
function* checked(
  g: Graph,
  start: number,
  body: (g: Graph, start: number) => StepGen<GraphState>,
): StepGen<GraphState> {
  const err = inputProblem(g, start, true);
  if (err) {
    yield fail(emptyState(), err);
    return;
  }
  yield* body(g, start);
}
const runQueueChecked = (g: Graph, s: number) => checked(g, s, runQueue);
const runPhasesChecked = (g: Graph, s: number) => checked(g, s, runPhases);
