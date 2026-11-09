import { snap, type Step, type StepGen } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import {
  COMP_COLORS,
  DASHED,
  fail,
  inputProblem,
  L,
  LINE,
  type GraphAlgorithm,
} from "./algoKit";
import { bellmanFord } from "./bellmanFord";
import { boruvka } from "./boruvka";
import { bridges } from "./bridges";
import { scc } from "./scc";
import {
  cmpLabel,
  emptyState,
  fmtNum,
  neighbors,
  plural,
  type GEdge,
  type Graph,
  type GraphState,
} from "./graph";

// typ a kontrola vstupu žijí v algoKit.ts (nové algoritmy fáze 4 je importují odtud); tady kvůli dřívějším importům
export {
  inputProblem,
  type GraphAlgorithm,
  type GraphLegendItem,
  type GraphVariant,
} from "./algoKit";

/* ------------------------------------------------------------------ BFS */

export const bfs: GraphAlgorithm = {
  id: "bfs",
  title: "Prohledávání do šířky (BFS)",
  opName: "BFS",
  tip: "klikněte na vrchol 2 (= nový v₀) – v orientovaném „prasátku“ z něj nevede žádná hrana a BFS hned skončí. Pak v „Upravit graf“ odškrtněte „orientovaný“, dejte Hotovo a ▶ – z vrcholu 2 je teď dosažitelné všechno.",
  description:
    "Z počátečního vrcholu objevujeme vrcholy po vrstvách: nejprve sousedy, pak sousedy sousedů… Otevřené vrcholy čekají ve frontě. Výsledkem jsou vzdálenosti D(v) (počet hran) a strom nejkratších cest daný P(v).",
  complexity: "O(n + m)",
  needsStart: true,
  pseudocode: [
    "Pro všechny vrcholy v: stav(v) ← nenalezený, D(v) ← ∅, P(v) ← ∅",
    "stav(v₀) ← otevřený, D(v₀) ← 0",
    "Založíme frontu Q a vložíme do ní v₀.",
    "Dokud je fronta Q neprázdná:",
    "  Odebereme první vrchol z Q a označíme ho v.",
    "  Pro všechny následníky w vrcholu v:",
    "    Je-li stav(w) = nenalezený:",
    "      stav(w) ← otevřený, D(w) ← D(v) + 1, P(w) ← v",
    "      Přidáme w do fronty Q.",
    "  stav(v) ← uzavřený",
  ],
  legend: [
    { cls: "sw-open", label: "otevřený (ve frontě)", marks: ["n-open"] },
    { cls: "sw-current", label: "právě zavíraný", marks: ["n-current"] },
    { cls: "sw-closed", label: "uzavřený", marks: ["n-closed"] },
    {
      cls: "sw-tree",
      label: "stromová hrana (P)",
      shape: LINE,
      marks: ["e-tree"],
    },
    {
      cls: "sw-seen",
      label: "prozkoumaná hrana mimo strom",
      shape: DASHED,
      marks: ["e-seen"],
    },
  ],
  *run(g, start) {
    const st = emptyState();
    const err = inputProblem(g, start);
    if (err) {
      yield fail(st, err);
      return;
    }
    const D = new Map<number, number>();
    const queue: number[] = [];
    const table = () => {
      st.table = {
        title: "Fronta Q (zleva začátek)",
        header: [],
        rows: [queue.map((v) => L(g, v))],
      };
    };
    yield snap(st, 0, "Všechny vrcholy jsou nenalezené.");
    D.set(start, 0);
    st.nodeMarks[start] = "n-open";
    st.nodeSub[start] = "D=0";
    queue.push(start);
    table();
    yield snap(st, 2, `Otevřeme v₀ = ${L(g, start)} a vložíme ho do fronty.`);
    while (queue.length) {
      const v = queue.shift()!;
      table();
      st.nodeMarks[v] = "n-current";
      st.vars = { v: L(g, v) };
      yield snap(st, 4, `Odebereme z fronty vrchol ${L(g, v)}.`);
      for (const { v: w, e } of neighbors(g, v)) {
        st.vars.w = L(g, w);
        if (!D.has(w)) {
          D.set(w, D.get(v)! + 1);
          st.nodeMarks[w] = "n-open";
          st.nodeSub[w] = `D=${D.get(w)}`;
          st.edgeMarks[e.id] = "e-tree";
          queue.push(w);
          table();
          yield snap(
            st,
            7,
            `Objevili jsme ${L(g, w)}: D = ${D.get(w)}, P = ${L(g, v)}. Přidáme do fronty.`,
          );
        } else {
          const prev = st.edgeMarks[e.id];
          if (!prev) st.edgeMarks[e.id] = "e-seen";
          yield snap(
            st,
            6,
            `${L(g, w)} už byl nalezen (D = ${D.get(w)}), nic neděláme.`,
          );
        }
      }
      st.nodeMarks[v] = "n-closed";
      delete st.vars.w;
      yield snap(st, 9, `Uzavřeme ${L(g, v)}.`);
    }
    st.vars = {};
    const unreached = g.nodes.filter((n) => !D.has(n.id)).map((n) => n.label);
    // nejvzdálenější vrchol (při shodě ten objevený dřív)
    let far = start;
    for (const [v, d] of D) if (d > D.get(far)!) far = v;
    const farthest =
      far === start
        ? ""
        : ` Nejvzdálenější je ${L(g, far)} s D = ${D.get(far)}.`;
    yield snap(
      st,
      3,
      `Hotovo – fronta je prázdná.${farthest} ${unreached.length ? `Nedosažitelné vrcholy: ${unreached.join(", ")}.` : "Všechny vrcholy jsou dosažitelné."}`,
    );
  },
};

/* ------------------------------------------------------------------ DFS */

export const dfs: GraphAlgorithm = {
  id: "dfs",
  title: "Prohledávání do hloubky (DFS)",
  opName: "DFS",
  tip: "v orientovaném „prasátku“ najděte zpětnou, dopřednou a příčnou hranu. Pak v „Upravit graf“ odškrtněte „orientovaný“, dejte Hotovo a ▶ – v neorientovaném grafu zbudou jen stromové a zpětné hrany.",
  description:
    "Rekurzivně: otevřeme vrchol, projdeme jeho následníky, nenalezené navštívíme rekurzivně, pak vrchol zavřeme. Čísla in/out dávají uzávorkování; podle nich klasifikujeme hrany na stromové, zpětné, dopředné a příčné.",
  complexity: "O(n + m)",
  needsStart: true,
  pseudocode: [
    "DFS(v₀): T ← 0; všechny vrcholy nenalezené; zavoláme DFS2(v₀)",
    "",
    "DFS2(v):",
    "  stav(v) ← otevřený; T ← T + 1; in(v) ← T",
    "  Pro všechny následníky w vrcholu v:",
    "    Je-li stav(w) = nenalezený, zavoláme DFS2(w).",
    "    // jinak klasifikujeme hranu vw:",
    "    //   w otevřený → zpětná; in(w) > in(v) → dopředná; jinak příčná",
    "  stav(v) ← uzavřený; T ← T + 1; out(v) ← T",
  ],
  legend: [
    {
      cls: "sw-open",
      label: "otevřený (na zásobníku rekurze)",
      marks: ["n-open"],
    },
    { cls: "sw-closed", label: "uzavřený", marks: ["n-closed"] },
    {
      cls: "sw-relax",
      label: "hrana, po které právě sestupujeme",
      shape: LINE,
      marks: ["e-relax"],
    },
    { cls: "sw-tree", label: "stromová hrana", shape: LINE, marks: ["e-tree"] },
    { cls: "sw-back", label: "zpětná hrana", shape: DASHED, marks: ["e-back"] },
    {
      cls: "sw-forward",
      label: "dopředná hrana",
      shape: DASHED,
      marks: ["e-forward"],
    },
    {
      cls: "sw-cross",
      label: "příčná hrana",
      shape: DASHED,
      marks: ["e-cross"],
    },
  ],
  *run(g, start) {
    const st = emptyState();
    const err = inputProblem(g, start);
    if (err) {
      yield fail(st, err);
      return;
    }
    let T = 0;
    const tin = new Map<number, number>();
    const tout = new Map<number, number>();
    const stack: number[] = [];
    const sub = (v: number) =>
      (st.nodeSub[v] = `${tin.get(v) ?? "–"}/${tout.get(v) ?? "–"}`);
    const table = () => {
      st.table = {
        title: "Zásobník rekurze (vpravo aktuální vrchol)",
        header: [],
        rows: [stack.map((v) => L(g, v))],
        tail: true,
      };
    };
    let brackets = "";
    yield snap(st, 0, "Všechny vrcholy jsou nenalezené, T = 0.");

    function* dfs2(v: number, parentEdge: number | null): StepGen<GraphState> {
      T++;
      tin.set(v, T);
      st.nodeMarks[v] = "n-open";
      if (parentEdge !== null) st.edgeMarks[parentEdge] = "e-tree";
      stack.push(v);
      sub(v);
      brackets += `(${L(g, v)}`;
      st.vars = { T, závorky: brackets };
      table();
      yield snap(st, 3, `Otevřeme ${L(g, v)}, in = ${T}.`);
      for (const { v: w, e } of neighbors(g, v)) {
        if (!g.directed && e.id === parentEdge) continue;
        if (!tin.has(w)) {
          // sestupná hrana má jinou barvu (e-relax) než zpětné hrany, aby se v obrázku nepletly
          st.edgeMarks[e.id] = "e-relax";
          yield snap(
            st,
            5,
            `Následník ${L(g, w)} je nenalezený – rekurzivně se do něj vydáme.`,
          );
          yield* dfs2(w, e.id);
          st.vars = { T, závorky: brackets };
          table();
          yield snap(st, 4, `Vrátili jsme se do ${L(g, v)}.`);
        } else if (!g.directed) {
          // v neorientovaném grafu je každá nestromová hrana zpětná (podruhé ji potkáme z druhého konce a přeskočíme)
          if (!st.edgeMarks[e.id]) {
            st.edgeMarks[e.id] = "e-back";
            const why = w === v ? "smyčka" : `${L(g, w)} je otevřený (předek)`;
            yield snap(
              st,
              7,
              `Hrana ${L(g, v)}–${L(g, w)}: ${why} → zpětná hrana.`,
            );
          }
        } else {
          let cls: string;
          let why: string;
          if (!tout.has(w)) {
            cls = "e-back";
            why = `${L(g, w)} je otevřený → zpětná hrana`;
          } else if (tin.get(w)! > tin.get(v)!) {
            cls = "e-forward";
            why = `in(${L(g, w)}) > in(${L(g, v)}) → dopředná hrana`;
          } else {
            cls = "e-cross";
            why = `${L(g, w)} už je uzavřený a in(${L(g, w)}) < in(${L(g, v)}) → příčná hrana`;
          }
          st.edgeMarks[e.id] = cls;
          yield snap(st, 7, `Hrana ${L(g, v)}→${L(g, w)}: ${why}.`);
        }
      }
      T++;
      tout.set(v, T);
      st.nodeMarks[v] = "n-closed";
      stack.pop();
      sub(v);
      brackets += `)${L(g, v)}`;
      st.vars = { T, závorky: brackets };
      table();
      yield snap(st, 8, `Uzavřeme ${L(g, v)}, out = ${T}.`);
    }
    yield* dfs2(start, null);
    // zbytek grafu (nedosažitelné vrcholy) ponecháme nenalezený
    const unreached = g.nodes.filter((n) => !tin.has(n.id)).map((n) => n.label);
    yield snap(
      st,
      0,
      unreached.length
        ? `Hotovo. Z ${L(g, start)} nejsou dosažitelné vrcholy ${unreached.join(", ")} – zůstaly nenalezené.`
        : `Hotovo, z ${L(g, start)} jsme navštívili všechny vrcholy.`,
    );
  },
};

/* ------------------------------------------------------------------ topologické uspořádání */

export const topo: GraphAlgorithm = {
  id: "topo",
  title: "Topologické uspořádání (DFS)",
  opName: "Topologické uspořádání",
  shortOpName: "Topo. uspořádání",
  forcedWhy: "Topologické uspořádání má smysl jen pro orientovaný graf.",
  tip: "Vytvořit ▸ „Orientovaný graf s cyklem“ – DFS narazí na zpětnou hranu a uspořádání neexistuje. Vytvořit ▸ Náhodně tu dává vždy acyklický graf.",
  description:
    "V acyklickém orientovaném grafu (DAG) seřadíme vrcholy tak, aby každá hrana vedla zleva doprava. Pořadí, v němž DFS vrcholy opouští, je opačné k topologickému. Najde-li DFS zpětnou hranu, graf obsahuje cyklus a uspořádání neexistuje.",
  complexity: "O(n + m)",
  needsStart: false,
  directed: true,
  pseudocode: [
    "Spouštíme DFS opakovaně, dokud nejsou všechny vrcholy navštíveny.",
    "DFS2(v):",
    "  stav(v) ← otevřený",
    "  Pro všechny následníky w vrcholu v:",
    "    Je-li stav(w) = otevřený: zpětná hrana → cyklus, uspořádání neexistuje.",
    "    Je-li stav(w) = nenalezený, zavoláme DFS2(w).",
    "  stav(v) ← uzavřený",
    "  Připojíme v na začátek výsledného seznamu.",
  ],
  legend: [
    { cls: "sw-open", label: "otevřený", marks: ["n-open"] },
    { cls: "sw-closed", label: "uzavřený (zařazen)", marks: ["n-closed"] },
    { cls: "sw-tree", label: "stromová hrana", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-seen",
      label: "hrana do uzavřeného vrcholu",
      shape: DASHED,
      marks: ["e-seen"],
    },
    {
      cls: "sw-back",
      label: "zpětná hrana = cyklus",
      shape: DASHED,
      marks: ["e-back"],
    },
    {
      cls: "sw-bad",
      label: "vrchol, ve kterém se cyklus uzavřel",
      marks: ["n-bad"],
    },
  ],
  *run(g) {
    const st = emptyState();
    const err = inputProblem(g, null);
    if (err) {
      yield fail(st, err);
      return;
    }
    const state = new Map<number, "open" | "closed">();
    const order: number[] = [];
    const stack: number[] = []; // otevřené vrcholy (cesta rekurze) – kvůli vypsání nalezeného cyklu
    const table = () => {
      st.table = {
        title: "Topologické pořadí (zleva)",
        header: [],
        rows: [order.map((v) => L(g, v))],
      };
    };
    table();
    const starts = [...g.nodes].sort((a, b) => cmpLabel(a.label, b.label));
    let cycle = false;

    function* dfs2(v: number): StepGen<GraphState> {
      state.set(v, "open");
      stack.push(v);
      st.nodeMarks[v] = "n-open";
      yield snap(st, 2, `Otevřeme ${L(g, v)}.`);
      for (const { v: w, e } of neighbors(g, v)) {
        if (cycle) return;
        const s = state.get(w);
        if (s === "open") {
          st.edgeMarks[e.id] = "e-back";
          st.nodeMarks[w] = "n-open n-bad"; // vrchol zůstává otevřený, jen ho zvýrazníme
          cycle = true;
          const path = [...stack.slice(stack.indexOf(w)), w]
            .map((u) => L(g, u))
            .join(" → ");
          yield {
            ...snap(
              st,
              4,
              `Hrana ${L(g, v)}→${L(g, w)} vede do otevřeného vrcholu – našli jsme cyklus ${path}. Topologické uspořádání neexistuje.`,
            ),
            // konec bez výsledku: ⚠ místo zeleného ✓ (Visualizer podle Step.outcome)
            outcome: "warn",
          };
          return;
        }
        if (s === undefined) {
          st.edgeMarks[e.id] = "e-tree";
          yield snap(st, 5, `${L(g, w)} je nenalezený, vstoupíme.`);
          yield* dfs2(w);
          if (cycle) return;
        } else {
          st.edgeMarks[e.id] = "e-seen";
        }
      }
      state.set(v, "closed");
      stack.pop();
      st.nodeMarks[v] = "n-closed";
      order.unshift(v);
      order.forEach((u, i) => (st.nodeSub[u] = `#${i + 1}`));
      table();
      yield snap(st, 7, `Uzavřeme ${L(g, v)} a dáme ho na začátek seznamu.`);
    }

    for (const n of starts) {
      if (cycle) break;
      if (state.has(n.id)) continue;
      yield snap(
        st,
        0,
        `Spustíme DFS z dosud nenavštíveného vrcholu ${n.label}.`,
      );
      yield* dfs2(n.id);
    }
    if (!cycle)
      yield snap(st, 7, `Hotovo: ${order.map((v) => L(g, v)).join(" ≺ ")}.`);
  },
};

/* ------------------------------------------------------------------ Dijkstra */

export const dijkstra: GraphAlgorithm = {
  id: "dijkstra",
  title: "Dijkstrův algoritmus",
  opName: "Dijkstra",
  forcedWhy:
    "Dijkstrův algoritmus počítá s délkami hran, graf je proto vždy ohodnocený.",
  tip: "sledujte vrchol D – jeho odhad se nejdřív nastaví na 14 (přes B) a po uzavření E se zlepší na 9. Pak v „Délky hran“ napište jedné hraně zápornou délku (např. −2) a Enter: Dijkstra ji odmítne.",
  description:
    "Nejkratší cesty z v₀ v grafu s nezápornými délkami hran. Udržujeme odhady h(v); v každém kroku uzavřeme otevřený vrchol s nejmenším odhadem (ten už je přesný) a relaxujeme hrany z něj. S haldou běží v O((n + m) log n).",
  complexity: "O((n + m) log n) s binární haldou",
  needsStart: true,
  weighted: true,
  pseudocode: [
    "Pro všechny v: h(v) ← +∞, stav(v) ← nenalezený",
    "h(v₀) ← 0, stav(v₀) ← otevřený",
    "Dokud existují otevřené vrcholy:",
    "  v ← otevřený vrchol s nejmenším h(v)",
    "  Pro všechny následníky w vrcholu v:",
    "    Pokud h(w) > h(v) + ℓ(v, w):   // relaxace hrany",
    "      h(w) ← h(v) + ℓ(v, w), P(w) ← v",
    "      stav(w) ← otevřený",
    "  stav(v) ← uzavřený",
  ],
  legend: [
    { cls: "sw-open", label: "otevřený (v haldě)", marks: ["n-open"] },
    { cls: "sw-current", label: "právě zavíraný", marks: ["n-current"] },
    { cls: "sw-closed", label: "uzavřený (h přesné)", marks: ["n-closed"] },
    { cls: "sw-tree", label: "hrana ke P(w)", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-relax",
      label: "relaxovaná hrana",
      shape: LINE,
      marks: ["e-relax"],
    },
    {
      cls: "sw-seen",
      label: "prozkoumaná hrana (není ve stromu)",
      shape: DASHED,
      marks: ["e-seen"],
    },
  ],
  *run(g, start) {
    const st = emptyState();
    const err = inputProblem(g, start, true);
    if (err) {
      yield fail(st, err);
      return;
    }
    const neg = g.edges.find((e) => e.w < 0);
    if (neg) {
      yield fail(
        st,
        `Dijkstrův algoritmus vyžaduje nezáporné délky hran – hrana ${L(g, neg.u)}${g.directed ? "→" : "–"}${L(g, neg.v)} má délku ${fmtNum(neg.w)}.`,
      );
      return;
    }
    // odhady počítáme přesně (porovnání v relaxaci), zaokrouhlujeme až při výpisu
    const h = new Map<number, number>();
    const P = new Map<number, number>(); // vrchol → id hrany
    const closed = new Set<number>();
    const open = new Set<number>();
    const fmt = (v: number) => (h.has(v) ? fmtNum(h.get(v)!) : "∞");
    const table = () => {
      const rows = [...open]
        .sort((a, b) => h.get(a)! - h.get(b)!)
        .map((v) => [L(g, v), fmt(v)]);
      st.table = {
        title: "Otevřené vrcholy (halda podle h)",
        header: ["vrchol", "h"],
        rows,
      };
    };
    for (const n of g.nodes) st.nodeSub[n.id] = "∞";
    yield snap(st, 0, "Všechny odhady jsou +∞.");
    h.set(start, 0);
    open.add(start);
    st.nodeMarks[start] = "n-open";
    st.nodeSub[start] = "0";
    table();
    yield snap(st, 1, `h(${L(g, start)}) = 0.`);
    while (open.size) {
      let v = -1;
      for (const u of open) if (v < 0 || h.get(u)! < h.get(v)!) v = u;
      open.delete(v);
      st.nodeMarks[v] = "n-current";
      st.vars = { v: L(g, v), "h(v)": fmtNum(h.get(v)!) };
      table();
      yield snap(
        st,
        3,
        `Nejmenší odhad má ${L(g, v)} (h = ${fmt(v)}) – ten je už určitě správný.`,
      );
      for (const { v: w, e } of neighbors(g, v)) {
        if (closed.has(w)) continue;
        const cand = h.get(v)! + e.w;
        st.edgeMarks[e.id] = "e-relax";
        yield snap(
          st,
          5,
          `Hrana do ${L(g, w)}: je h(${L(g, w)}) = ${fmt(w)} > ${fmt(v)} + ${fmtNum(e.w)} = ${fmtNum(cand)}?`,
        );
        if (!h.has(w) || h.get(w)! > cand) {
          if (P.has(w)) st.edgeMarks[P.get(w)!] = "e-seen";
          h.set(w, cand);
          P.set(w, e.id);
          open.add(w);
          st.nodeMarks[w] = "n-open";
          st.nodeSub[w] = fmtNum(cand);
          st.edgeMarks[e.id] = "e-tree";
          table();
          yield snap(
            st,
            6,
            `Ano – zlepšíme: h(${L(g, w)}) ← ${fmtNum(cand)}, P(${L(g, w)}) ← ${L(g, v)}.`,
          );
        } else {
          st.edgeMarks[e.id] = P.get(w) === e.id ? "e-tree" : "e-seen";
          yield snap(st, 5, "Ne – odhad se nezlepšil.");
        }
      }
      closed.add(v);
      st.nodeMarks[v] = "n-closed";
      yield snap(st, 8, `Uzavřeme ${L(g, v)}.`);
    }
    st.vars = {};
    st.table = undefined;
    const unreached = g.nodes.filter((n) => !h.has(n.id)).map((n) => n.label);
    yield snap(
      st,
      2,
      `Hotovo – žádné otevřené vrcholy. Čísla pod vrcholy jsou vzdálenosti z ${L(g, start)}, zvýrazněné hrany tvoří strom nejkratších cest.${unreached.length ? ` Nedosažitelné vrcholy (h = ∞): ${unreached.join(", ")}.` : ""}`,
    );
  },
};

/* ------------------------------------------------------------------ Jarník */

export const jarnik: GraphAlgorithm = {
  id: "jarnik",
  title: "Jarníkův (Primův) algoritmus",
  opName: "Jarník",
  forcedWhy: "Minimální kostra se hledá v neorientovaném ohodnoceném grafu.",
  tip: "spusťte algoritmus z různých vrcholů v₀ – kostra roste jinak, ale její váha vyjde pokaždé stejně (a stejně jako u Kruskala).",
  description:
    "Minimální kostra: začneme z jednoho vrcholu a opakovaně přidáváme nejlehčí hranu (s nejmenší vahou w(e)), která vede z dosavadního stromu ven. Správnost plyne z řezového lemmatu. S haldou běží v O(m log n). Nalezl ho Vojtěch Jarník v roce 1930.",
  complexity: "O(m log n) s binární haldou",
  needsStart: true,
  weighted: true,
  directed: false,
  pseudocode: [
    "T ← strom obsahující jen vrchol v₀",
    "Dokud existuje hrana vedoucí z T ven:",
    "  Vybereme nejlehčí takovou hranu uv (u ∈ T, v ∉ T).",
    "  Přidáme hranu uv a vrchol v do T.",
    "Výstup: minimální kostra T (pokud je graf souvislý)",
  ],
  legend: [
    { cls: "sw-closed", label: "vrchol v kostře", marks: ["n-closed"] },
    { cls: "sw-tree", label: "hrana kostry", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-candidate",
      label: "hrana vedoucí ven (kandidát)",
      shape: LINE,
      marks: ["e-candidate"],
    },
    {
      cls: "sw-current",
      label: "právě vybraná nejlehčí hrana",
      shape: LINE,
      marks: ["e-active"],
    },
    {
      cls: "sw-rejected",
      label: "hrana uvnitř T (zahozena)",
      shape: DASHED,
      marks: ["e-rejected"],
    },
  ],
  *run(g, start) {
    const st = emptyState();
    const err = inputProblem(g, start, true);
    if (err) {
      yield fail(st, err);
      return;
    }
    const inT = new Set<number>([start]);
    st.nodeMarks[start] = "n-closed";
    let total = 0;
    const crosses = (e: GEdge) => inT.has(e.u) !== inT.has(e.v);
    /** hrana přes řez zapsaná jako v pseudokódu: nejdřív konec v T, pak konec mimo T */
    const name = (e: GEdge) =>
      inT.has(e.u) ? `${L(g, e.u)}–${L(g, e.v)}` : `${L(g, e.v)}–${L(g, e.u)}`;
    const table = () => {
      const rows = g.edges
        .filter(crosses)
        .sort((a, b) => a.w - b.w)
        .map((e) => [name(e), fmtNum(e.w)]);
      st.table = {
        title: "Hrany vedoucí z T ven (podle váhy)",
        header: ["hrana", "w"],
        rows,
        highlight: rows.length ? 0 : undefined,
      };
      for (const e of g.edges) {
        if (st.edgeMarks[e.id] === "e-tree") continue;
        st.edgeMarks[e.id] = crosses(e)
          ? "e-candidate"
          : inT.has(e.u) && inT.has(e.v)
            ? "e-rejected"
            : "";
      }
    };
    table();
    st.vars = { "váha T": "0" };
    yield snap(st, 0, `T obsahuje jen ${L(g, start)}.`);
    for (;;) {
      let best: GEdge | null = null;
      for (const e of g.edges)
        if (crosses(e) && (!best || e.w < best.w)) best = e;
      if (!best) break;
      st.edgeMarks[best.id] = "e-active";
      yield snap(
        st,
        2,
        `Nejlehčí hrana ven je ${name(best)} s vahou ${fmtNum(best.w)}.`,
      );
      const v = inT.has(best.u) ? best.v : best.u;
      inT.add(v);
      total += best.w;
      st.nodeMarks[v] = "n-closed";
      st.edgeMarks[best.id] = "e-tree";
      st.vars = { "váha T": fmtNum(total) };
      table();
      yield snap(
        st,
        3,
        `Přidáme hranu a vrchol ${L(g, v)} do T; váha T = ${fmtNum(total)}.`,
      );
    }
    const missing = g.nodes.length - inT.size;
    yield snap(
      st,
      4,
      missing
        ? `Hotovo, ale graf není souvislý – ${plural(missing, "vrchol zůstal", "vrcholy zůstaly", "vrcholů zůstalo")} mimo. Máme minimální kostru komponenty vrcholu ${L(g, start)} (váha ${fmtNum(total)}).`
        : `Hotovo, váha minimální kostry je ${fmtNum(total)}.`,
    );
  },
};

/* ------------------------------------------------------------------ Kruskal + Union-Find */

export const kruskal: GraphAlgorithm = {
  id: "kruskal",
  title: "Kruskalův algoritmus + Union-Find",
  opName: "Kruskal",
  forcedWhy: "Minimální kostra se hledá v neorientovaném ohodnoceném grafu.",
  tip: "sledujte keříky nad tabulkou hran – Find zvýrazní cesty z obou konců hrany do kořenů. Zahozená hrana (✗) má oba konce ve stejném keříku (v grafu stejnou barvu). Při stejných vahách rozhoduje pořadí v tabulce.",
  description:
    "Hrany setřídíme podle vah w(e) a bereme je od nejlehčí; hranu přidáme, pokud spojuje dvě různé komponenty dosavadního lesa. Komponenty udržujeme strukturou Union-Find s keříky: Find vystoupá z obou vrcholů do kořenů keříků a porovná je, Union připojí mělčí keřík pod kořen hlubšího. Keříky tak zůstávají hluboké nejvýše log n a obě operace trvají O(log n). Třídění hran i všechny operace Union-Findu dohromady stojí O(m log n).",
  complexity: "O(m log n)",
  needsStart: false,
  weighted: true,
  directed: false,
  pseudocode: [
    "Setřídíme hrany podle vah: w(e₁) ≤ w(e₂) ≤ … ≤ w(eₘ)",
    "T ← les bez hran; každý vrchol je vlastní komponenta (keřík Union-Findu).",
    "Pro i = 1, …, m:",
    "  u, v ← krajní vrcholy hrany eᵢ",
    "  Pokud Kořen(u) ≠ Kořen(v):   // Find(u, v): leží v různých komponentách",
    "    Přidáme eᵢ do T; Union(u, v)",
    "  Jinak hranu zahodíme (uzavřela by kružnici).",
    "Výstup: minimální kostra T",
  ],
  legend: [
    { cls: "sw-tree", label: "hrana kostry", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-current",
      label: "právě zkoumaná hrana",
      shape: LINE,
      marks: ["e-active"],
    },
    {
      cls: "sw-rejected",
      label: "zahozená hrana",
      shape: DASHED,
      marks: ["e-rejected"],
    },
    {
      cls: "sw-comp",
      label:
        "barva vrcholu v grafu i v lese = jeho komponenta (keřík Union-Findu)",
      marks: ["n-comp*"],
    },
  ],
  *run(g) {
    const st = emptyState();
    const err = inputProblem(g, null, true);
    if (err) {
      yield fail(st, err);
      return;
    }
    // Union-Find s keříky podle Průvodce (oddíl 7.4): P = rodič, H = hloubka keříku v kořeni, bez komprese cest
    const parent = new Map<number, number>(g.nodes.map((n) => [n.id, n.id]));
    const depth = new Map<number, number>(g.nodes.map((n) => [n.id, 0]));
    const size = new Map<number, number>(g.nodes.map((n) => [n.id, 1]));
    const root = (x: number): number => {
      while (parent.get(x) !== x) x = parent.get(x)!;
      return x;
    };
    /** cesta, kterou vystoupá Kořen(x): x, P(x), …, kořen */
    const climb = (x: number): number[] => {
      const out = [x];
      while (parent.get(x) !== x) out.push((x = parent.get(x)!));
      return out;
    };
    /** les keříků do stavu (panel výsledku, UnionFindView) */
    const showUf = (path: number[], linked: number | null) => {
      st.uf = {
        parent: g.nodes.map((n) =>
          parent.get(n.id) === n.id ? null : parent.get(n.id)!,
        ),
        depth: g.nodes.map((n) => depth.get(n.id)!),
        path,
        linked,
      };
    };
    // barva komponenty = barva jejího kořene; přeživší kořen si barvu při Union nechává
    const color = new Map<number, number>(
      g.nodes.map((n, i) => [n.id, i % COMP_COLORS]),
    );
    /** Sdílejí-li dvě komponenty barvu a nějaká je volná, přebarvíme menší z nich (do 8 komponent jsou pak barvy různé). */
    const fixColors = () => {
      for (;;) {
        const byColor: number[][] = Array.from(
          { length: COMP_COLORS },
          () => [],
        );
        for (const [r, c] of color) byColor[c].push(r);
        const free = byColor.findIndex((rs) => rs.length === 0);
        const shared = byColor.find((rs) => rs.length > 1);
        if (free < 0 || !shared) return;
        let pick = shared[0];
        for (const r of shared) if (size.get(r)! <= size.get(pick)!) pick = r;
        color.set(pick, free);
      }
    };
    const paint = () => {
      for (const n of g.nodes) {
        const r = root(n.id);
        st.nodeSub[n.id] = `komp. ${L(g, r)}`;
        st.nodeMarks[n.id] = "n-comp" + color.get(r);
      }
    };
    const sorted = [...g.edges].sort((a, b) => a.w - b.w);
    const table = (hl: number) => {
      st.table = {
        title: "Hrany podle váhy",
        header: ["#", "hrana", "w", "stav"],
        rows: sorted.map((e, i) => [
          String(i + 1),
          `${L(g, e.u)}–${L(g, e.v)}`,
          fmtNum(e.w),
          st.edgeMarks[e.id] === "e-tree"
            ? "✓ v T"
            : st.edgeMarks[e.id] === "e-rejected"
              ? "✗"
              : "",
        ]),
        highlight: hl,
      };
    };
    table(-1);
    showUf([], null);
    yield snap(
      st,
      0,
      `Setřídili jsme ${plural(sorted.length, "hranu", "hrany", "hran")} podle váhy.`,
    );
    paint();
    yield snap(st, 1, "Každý vrchol je zatím samostatná komponenta.");
    let total = 0;
    let count = 0;
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const [lu, lv] = [L(g, e.u), L(g, e.v)];
      st.edgeMarks[e.id] = "e-active";
      table(i);
      st.vars = { i: i + 1, "váha T": fmtNum(total) };
      showUf([], null);
      yield snap(st, 3, `Hrana ${lu}–${lv} (w = ${fmtNum(e.w)}).`);
      const a = root(e.u);
      const b = root(e.v);
      showUf([...new Set([...climb(e.u), ...climb(e.v)])], null);
      yield snap(
        st,
        4,
        `Find(${lu}, ${lv}): Kořen(${lu}) = ${L(g, a)}, Kořen(${lv}) = ${L(g, b)}.`,
      );
      if (a !== b) {
        // Union podle hloubky: mělčí keřík pod kořen hlubšího; při shodě b pod a a keřík a se prohloubí
        let top = a;
        let sub = b;
        let how: string;
        if (depth.get(a)! < depth.get(b)!) {
          top = b;
          sub = a;
          how = `mělčí keřík ${L(g, a)} připojíme pod kořen ${L(g, b)}`;
        } else if (depth.get(a)! > depth.get(b)!) {
          how = `mělčí keřík ${L(g, b)} připojíme pod kořen ${L(g, a)}`;
        } else {
          depth.set(a, depth.get(a)! + 1);
          how = `keříky jsou stejně hluboké, ${L(g, b)} připojíme pod ${L(g, a)} a keřík se prohloubí`;
        }
        parent.set(sub, top);
        size.set(top, size.get(top)! + size.get(sub)!);
        color.delete(sub);
        fixColors();
        st.edgeMarks[e.id] = "e-tree";
        total += e.w;
        count++;
        paint();
        showUf([], sub);
        table(i);
        st.vars = { i: i + 1, "váha T": fmtNum(total) };
        yield snap(
          st,
          5,
          `Různé komponenty – hranu přidáme do T. Union: ${how}. Váha T = ${fmtNum(total)}.`,
        );
        if (count === g.nodes.length - 1) {
          table(-1);
          showUf([], null);
          const rest =
            i < sorted.length - 1 ? " Zbývající hrany není třeba zkoumat." : "";
          yield snap(
            st,
            7,
            `Hotovo: máme n − 1 = ${plural(count, "hranu", "hrany", "hran")}, kostra je hotová (váha ${fmtNum(total)}).${rest}`,
          );
          return;
        }
      } else {
        st.edgeMarks[e.id] = "e-rejected";
        table(i);
        yield snap(
          st,
          6,
          e.u === e.v
            ? "Smyčka – oba konce jsou tentýž vrchol, hranu zahodíme."
            : "Oba konce jsou ve stejné komponentě – hrana by uzavřela kružnici, zahodíme ji.",
        );
      }
    }
    table(-1);
    showUf([], null);
    yield snap(
      st,
      7,
      count === g.nodes.length - 1
        ? `Hotovo, váha kostry ${fmtNum(total)}.`
        : `Hotovo, ale graf není souvislý – místo kostry vznikl minimální les (kostra každé komponenty). Počet komponent: ${g.nodes.length - count}, váha ${fmtNum(total)}.`,
    );
  },
};

/**
 * Algoritmy stránky grafů v pořadí oddílů knihy (5.2 BFS, 5.6 DFS, 5.7 mosty, 5.8 topologické uspořádání,
 * 5.10 SCC, 6.2 Dijkstra, 6.3 Bellman-Ford, 7.2 Jarník, 7.3 Borůvka, 7.4 Kruskal). Algoritmy fáze 4 jsou
 * ve vlastních souborech (bellmanFord.ts, boruvka.ts, bridges.ts, scc.ts).
 */
export const GRAPH_ALGOS: GraphAlgorithm[] = [
  bfs,
  dfs,
  bridges,
  topo,
  scc,
  dijkstra,
  bellmanFord,
  jarnik,
  boruvka,
  kruskal,
];

/* ------------------------------------------------------------------ legenda podle skutečného běhu */

/** Všechny třídy vrcholů a hran, které se v krocích objeví („n-open n-bad“ = dvě třídy). */
export function usedMarks(steps: readonly Step<GraphState>[]): Set<string> {
  const used = new Set<string>();
  for (const s of steps) {
    for (const c of [
      ...Object.values(s.state.nodeMarks),
      ...Object.values(s.state.edgeMarks),
    ])
      for (const one of c.split(" ")) if (one) used.add(one);
  }
  return used;
}

/** Pokrývá značka legendy některou použitou třídu? („n-comp*“ = předpona) */
export function coversMark(mark: string, used: ReadonlySet<string>): boolean {
  if (!mark.endsWith("*")) return used.has(mark);
  const prefix = mark.slice(0, -1);
  return [...used].some((u) => u.startsWith(prefix));
}

/**
 * Legenda jen s tím, co v tomto běhu opravdu nastane (DFS v neorientovaném grafu nemá dopředné ani příčné hrany,
 * BFS z izolovaného vrcholu žádné hrany…). U Kruskala s víc vrcholy, než je barev, přizná opakování barev.
 */
export function legendFor(
  algo: GraphAlgorithm,
  steps: readonly Step<GraphState>[],
  g?: Graph,
): LegendItem[] {
  const used = usedMarks(steps);
  return algo.legend
    .filter((l) => l.marks.some((m) => coversMark(m, used)))
    .map(({ marks, ...item }) =>
      marks.includes("n-comp*") && g && g.nodes.length > COMP_COLORS
        ? {
            ...item,
            label: `${item.label}; barev je ${COMP_COLORS}, při více komponentách se opakují – rozhoduje popisek „komp. X“`,
          }
        : item,
    );
}
