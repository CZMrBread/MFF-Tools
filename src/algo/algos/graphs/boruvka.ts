/**
 * Borůvkův algoritmus (Průvodce 7.3, str. 173–174, obr. 7.5): minimální kostra po iteracích – každá
 * komponenta lesa T si vybere nejlehčí hranu, která z ní vede ven, a všechny vybrané hrany přidáme naráz.
 * Kniha předpokládá unikátní váhy; při shodě rozhoduje pořadí hran (dvojice (w, pořadí) je úplné
 * uspořádání, takže nevznikne kružnice – cvičení 7.3.1). Nesouvislý graf → minimální les. Stopa graphsA.
 */
import { snap, type StepGen } from "../../core/steps";
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
  fmtNum,
  plural,
  type GEdge,
  type Graph,
  type GraphState,
} from "./graph";

/** „po 2 iteracích“ */
const iterations = (k: number) => `${k} ${k === 1 ? "iteraci" : "iteracích"}`;

/** Je hrana a lehčí než b? Váha, při shodě dřívější hrana (cvičení 7.3.1). */
const lighter = (a: GEdge, b: GEdge) =>
  a.w < b.w || (a.w === b.w && a.id < b.id);

function* runBoruvka(g: Graph): StepGen<GraphState> {
  const st = emptyState();
  const err = inputProblem(g, null, true);
  if (err) {
    yield fail(st, err);
    return;
  }
  const n = g.nodes.length;
  const inT = new Set<number>();
  let total = 0;
  /** barva vrcholu z minulého obarvení – komponenta si ji po sloučení ponechá, kde to jde */
  const prevColor = new Map<number, number>();

  /** Komponenty lesa T: seznamy vrcholů seřazené podle názvu, komponenty podle nejmenšího vrcholu. */
  const components = (): number[][] => {
    const p = g.nodes.map((nd) => nd.id);
    const root = (x: number): number => {
      while (p[x] !== x) x = p[x];
      return x;
    };
    for (const id of inT) p[root(g.edges[id].u)] = root(g.edges[id].v);
    const by = new Map<number, number[]>();
    for (const nd of g.nodes) {
      const r = root(nd.id);
      by.set(r, [...(by.get(r) ?? []), nd.id]);
    }
    const byLabel = (a: number, b: number) =>
      cmpLabel(g.nodes[a].label, g.nodes[b].label);
    return [...by.values()]
      .map((c) => c.sort(byLabel))
      .sort((a, b) => byLabel(a[0], b[0]));
  };
  const compOf = (cs: number[][]) => {
    const m = new Map<number, number>();
    cs.forEach((c, i) => c.forEach((v) => m.set(v, i)));
    return m;
  };
  const name = (c: number[]) => `komp. ${L(g, c[0])}`;

  /** Popisky a barvy komponent; sousední komponenty dostanou různé barvy (hladově, do 8 barev). */
  const paint = (cs: number[][]) => {
    const of = compOf(cs);
    const adj = cs.map(() => new Set<number>());
    for (const e of g.edges) {
      const [a, b] = [of.get(e.u)!, of.get(e.v)!];
      if (a !== b) {
        adj[a].add(b);
        adj[b].add(a);
      }
    }
    const color: number[] = [];
    cs.forEach((c, i) => {
      const used = new Set(
        [...adj[i]].filter((j) => j < i).map((j) => color[j]),
      );
      // přednost má barva, kterou měla část komponenty dřív (sloučení nepřebarví celý graf)
      const wish = [
        ...new Set(c.map((v) => prevColor.get(v) ?? i % COMP_COLORS)),
      ];
      const pick =
        wish.find((x) => !used.has(x) && !color.slice(0, i).includes(x)) ??
        wish.find((x) => !used.has(x)) ??
        [...Array(COMP_COLORS).keys()].find((x) => !used.has(x)) ??
        i % COMP_COLORS;
      color.push(pick);
    });
    cs.forEach((c, i) => {
      for (const v of c) {
        st.nodeMarks[v] = `n-comp${color[i]}`;
        st.nodeSub[v] = name(c);
        prevColor.set(v, color[i]);
      }
    });
  };
  /** nejlehčí hrana mezi komponentou i a zbytkem grafu (smyčky a hrany uvnitř komponent se nepočítají) */
  const lightestOut = (i: number, of: Map<number, number>) => {
    let best: GEdge | null = null;
    for (const e of g.edges)
      if ((of.get(e.u) === i) !== (of.get(e.v) === i))
        if (!best || lighter(e, best)) best = e;
    return best;
  };
  const crossing = (e: GEdge, of: Map<number, number>) =>
    of.get(e.u) !== of.get(e.v);

  const loops = g.edges.filter((e) => e.u !== e.v);
  const unique = new Set(loops.map((e) => e.w)).size === loops.length;
  let cs = components();
  paint(cs);
  st.vars = { iterace: 0, k: cs.length, "váha T": "0" };
  yield snap(
    st,
    0,
    `T ← (V, ∅): les ${plural(n, "izolovaného vrcholu", "izolovaných vrcholů", "izolovaných vrcholů")}, každý vrchol je zatím sám sobě komponentou.${unique ? "" : " Váhy nejsou unikátní (kniha je předpokládá): při shodě vah bereme za lehčí hranu tu, která je v seznamu hran dřív – jinak by mohla vzniknout kružnice (cvičení 7.3.1)."}`,
  );

  let iter = 0;
  const nm = (e: GEdge) => `${L(g, e.u)}–${L(g, e.v)}`;
  /** souhrn pro konec: iterace, přidané hrany, váha T po iteraci */
  const summary: string[][] = [];
  for (;;) {
    cs = components();
    let of = compOf(cs);
    const anyOut = g.edges.some((e) => crossing(e, of));
    if (cs.length <= 1 || !anyOut) break;
    iter++;
    const rows: string[][] = cs.map((c) => [
      name(c),
      c.map((v) => L(g, v)).join(", "),
      "",
      "",
    ]);
    const table = (hl?: number) => {
      st.table = {
        title: `Iterace ${iter}: nejlehčí hrana z každé komponenty ven`,
        header: ["komponenta", "vrcholy", "eᵢ", "w"],
        rows: rows.map((r) => [...r]),
        highlight: hl,
      };
    };
    st.vars = { iterace: iter, k: cs.length, "váha T": fmtNum(total) };
    // šipky eᵢ minulé iterace zmizí (obr. 7.5 je kreslí jen u hran vybraných v této iteraci)
    st.edgeArrow = {};
    table();
    yield snap(
      st,
      1,
      `T má ${plural(cs.length, "komponentu", "komponenty", "komponent")} – není souvislý, začíná ${iter}. iterace.`,
    );
    // ř. 3: rozklad na komponenty; hrany uvnitř komponent už nikdy nebudou potřeba
    for (const e of g.edges)
      if (!inT.has(e.id))
        st.edgeMarks[e.id] = crossing(e, of) ? "" : "e-rejected";
    yield snap(
      st,
      2,
      `Rozložíme T na ${plural(cs.length, "komponentu", "komponenty", "komponent")} souvislosti (barva a popisek pod vrcholem).`,
    );
    // ř. 4: jeden krok na komponentu
    const chosen: (GEdge | null)[] = [];
    for (let i = 0; i < cs.length; i++) {
      const e = lightestOut(i, of);
      chosen.push(e);
      for (const x of g.edges) {
        const c = st.edgeMarks[x.id];
        if (c === "e-candidate") st.edgeMarks[x.id] = "";
        const own = (of.get(x.u) === i) !== (of.get(x.v) === i);
        if (own && c !== "e-active") st.edgeMarks[x.id] = "e-candidate";
      }
      let msg: string;
      if (e) {
        const from = of.get(e.u) === i ? e.u : e.v;
        const to = from === e.u ? e.v : e.u;
        st.edgeMarks[e.id] = "e-active";
        // šipka od komponenty, která hranu vybrala (obr. 7.5); vybraná z obou stran = oboustranná
        const dir: "u" | "v" = to === e.v ? "v" : "u";
        const had: "u" | "v" | "both" | undefined = st.edgeArrow?.[e.id];
        st.edgeArrow = {
          ...st.edgeArrow,
          [e.id]: had && had !== dir ? "both" : dir,
        };
        rows[i][2] = `${L(g, from)}→${L(g, to)}`;
        rows[i][3] = fmtNum(e.w);
        msg = `${name(cs[i])}: nejlehčí hrana ven je ${L(g, from)}–${L(g, to)} s vahou ${fmtNum(e.w)}, označíme ji e${String(i + 1).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])}.`;
      } else {
        rows[i][2] = "—";
        msg = `${name(cs[i])} nemá žádnou hranu ven – je to celá komponenta grafu, eᵢ neexistuje.`;
      }
      st.vars = {
        iterace: iter,
        k: cs.length,
        Tᵢ: name(cs[i]),
        "váha T": fmtNum(total),
      };
      table(i);
      yield snap(st, 3, msg);
    }
    // ř. 5: přidáme všechny vybrané hrany naráz (hranu vybranou z obou stran jen jednou)
    for (const x of g.edges)
      if (st.edgeMarks[x.id] === "e-candidate") st.edgeMarks[x.id] = "";
    const added: GEdge[] = [];
    const twice: GEdge[] = [];
    for (const e of chosen) {
      if (!e) continue;
      if (added.includes(e)) {
        if (!twice.includes(e)) twice.push(e);
        continue;
      }
      added.push(e);
    }
    added.sort((a, b) => a.id - b.id);
    for (const e of added) {
      inT.add(e.id);
      st.edgeMarks[e.id] = "e-tree";
      total += e.w;
    }
    cs = components();
    of = compOf(cs);
    paint(cs);
    st.vars = { iterace: iter, k: cs.length, "váha T": fmtNum(total) };
    table();
    summary.push([String(iter), added.map(nm).join(", "), fmtNum(total)]);
    const both = twice.length
      ? twice.length === 1
        ? ` Hranu ${nm(twice[0])} si vybraly obě její komponenty, přidáme ji jen jednou.`
        : ` Hrany ${twice.map(nm).join(", ")} si vybraly obě jejich komponenty, přidáme je jen jednou.`
      : "";
    yield snap(
      st,
      4,
      `Přidáme do T ${plural(added.length, "hranu", "hrany", "hran")}: ${added.map(nm).join(", ")}.${both} Váha T = ${fmtNum(total)}.`,
    );
  }
  st.edgeArrow = {};
  st.table = {
    title: "Kostra T po iteracích",
    header: ["iterace", "přidané hrany", "váha T"],
    rows: summary,
  };
  // hrany mimo T: uvnitř komponenty (nepotřebné) – v nesouvislém grafu jiné nezbývají
  for (const e of g.edges)
    if (!inT.has(e.id)) st.edgeMarks[e.id] = "e-rejected";
  st.vars = { iterace: iter, k: cs.length, "váha T": fmtNum(total) };
  const bound = `⌊log₂ ${n}⌋ = ${Math.floor(Math.log2(n))}`;
  const after = iter
    ? `po ${iterations(iter)} (nejvýš ${bound})`
    : "hned na začátku";
  yield snap(
    st,
    5,
    cs.length <= 1
      ? `Hotovo – T je souvislý ${after}, váha minimální kostry je ${fmtNum(total)}.`
      : `Hotovo ${after}, ale graf není souvislý – žádná hrana už nevede mezi komponentami T. Místo kostry vznikl minimální les (kostra každé komponenty grafu), ${plural(cs.length, "komponenta", "komponenty", "komponent")}, váha ${fmtNum(total)}.`,
  );
}

export const boruvka: GraphAlgorithm = {
  id: "boruvka",
  title: "Borůvkův algoritmus",
  opName: "Borůvka",
  description:
    "Začneme lesem izolovaných vrcholů. V každé iteraci si každá komponenta lesa vybere nejlehčí hranu (s nejmenší vahou w(e)), která z ní vede ven, a všechny vybrané hrany přidáme naráz – je to paralelní verze Jarníkova algoritmu. Každá iterace aspoň zdvojnásobí velikost komponent, takže jich je nejvýš ⌊log₂ n⌋ a s rozkladem na komponenty v čase O(m) běží celý algoritmus v O(m log n). Objevil ho Otakar Borůvka v roce 1926.",
  complexity: "O(m log n)",
  needsStart: false,
  directed: false,
  weighted: true,
  forcedWhy: "Minimální kostra je pojem pro neorientovaný graf s vahami hran",
  defaultPreset: "mst3", // obr. 7.5 = týž graf jako obr. 7.2
  pseudocode: [
    "T ← (V, ∅)   // začneme triviálním lesem izolovaných vrcholů",
    "Dokud T není souvislý:",
    "  Rozložíme T na komponenty souvislosti T₁, …, Tₖ.",
    "  Pro každý strom Tᵢ najdeme nejlehčí z hran mezi Tᵢ a zbytkem grafu a označíme ji eᵢ.",
    "  Přidáme do T hrany {e₁, …, eₖ}.",
    "Výstup: minimální kostra T",
  ],
  legend: [
    {
      cls: "sw-comp",
      label: "barva a popisek vrcholu = jeho komponenta lesa T",
      marks: ["n-comp*"],
    },
    { cls: "sw-tree", label: "hrana v T", shape: LINE, marks: ["e-tree"] },
    {
      cls: "sw-candidate",
      label: "hrana z komponenty Tᵢ ven (kandidát)",
      shape: LINE,
      marks: ["e-candidate"],
    },
    {
      cls: "sw-current",
      label:
        "vybraná nejlehčí hrana eᵢ – šipka od komponenty, která ji vybrala (přidá se na konci iterace)",
      shape: LINE,
      marks: ["e-active"],
    },
    {
      cls: "sw-rejected",
      label: "hrana uvnitř komponenty (už nepotřebná)",
      shape: DASHED,
      marks: ["e-rejected"],
    },
  ],
  tip: "sledujte tabulku iterace: v první si každý vrchol vybere svou nejlehčí hranu (šipky na obr. 7.5), hranu C–F si vyberou oba její konce. Ve druhé zbývají dvě komponenty a obě si vyberou E–F – kostra váhy 32 je hotová po 2 iteracích.",
  previewShare: 0.5,
  run: (g) => runBoruvka(g),
};
