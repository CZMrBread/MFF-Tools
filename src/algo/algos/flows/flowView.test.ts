import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { FIG_14_4, NET_14_7 } from "./flow.fixtures";
import { defaultEnds, residualArcs, type FlowNet } from "./flowNet";
import { flowPresetById, presetNet } from "./flowPresets";
import { BLOCK_LINES, CLEAN_LINES, dinic } from "./dinic";
import { FF_LINES, fordFulkerson } from "./fordFulkerson";
import {
  bipartiteNet,
  exampleInput,
  flowParams,
  randomNet,
} from "./flowPageModel";
import {
  autoFlowView,
  flowLegend,
  flowStacked,
  STACK_ASPECT,
  flowVars,
  layeredView,
  netState,
  residualGraph,
  readableBase,
  readableWidth,
  residualState,
  stateFits,
} from "./flowView";

function preset(id: string): { net: FlowNet; init: number[] | null } {
  const { graph, init } = presetNet(flowPresetById(id)!);
  return { net: { graph, ...defaultEnds(graph) }, init };
}
const lab = (n: FlowNet, v: number) => n.graph.nodes[v].label;
const ekey = (n: FlowNet, id: number) =>
  `${lab(n, n.graph.edges[id].u)}>${lab(n, n.graph.edges[id].v)}`;

describe("síť: tok / kapacita (obr. 14.4 vlevo)", () => {
  const { net, init } = preset("obr-14-4");
  const steps = materialize(fordFulkerson(net, { search: "dfs", init: init! }));

  it("popisky hran „f/c“, nasycené a protékané hrany, zdroj a stok", () => {
    const st = netState(net, steps[0].state);
    expect(st.edgeText).toEqual(
      Object.fromEntries(
        net.graph.edges.map((e) => [e.id, `${init![e.id]}/${e.w}`]),
      ),
    );
    const byKey = (k: string) =>
      st.edgeMarks[net.graph.edges.findIndex((_, i) => ekey(net, i) === k)];
    expect(byKey("z>a")).toBe("e-sat"); // 10/10
    expect(byKey("b>d")).toBe("e-sat"); // 3/3
    expect(byKey("a>c")).toBe("e-flow"); // 6/7
    expect(st.nodeMarks[net.z]).toBe("n-term");
    expect(st.nodeMarks[net.s]).toBe("n-term");
  });

  it("cesta zbcads: hrany po směru e-path, hrana a→c použitá proti směru e-path-back", () => {
    const s = steps.find(
      (x) => x.line === FF_LINES.search && x.state.path.length,
    )!;
    const st = netState(net, s.state);
    const marks = Object.fromEntries(
      net.graph.edges.map((e) => [ekey(net, e.id), st.edgeMarks[e.id] ?? ""]),
    );
    expect(marks["z>b"]).toBe("e-path");
    expect(marks["b>c"]).toBe("e-path");
    expect(marks["a>c"]).toBe("e-path-back");
    expect(marks["a>d"]).toBe("e-path");
    expect(marks["d>s"]).toBe("e-path");
    expect(marks["z>a"]).toBe("e-sat");
  });

  it("konec: hrany minimálního řezu e-cut a vrcholy A n-cut-a", () => {
    const last = steps[steps.length - 1].state;
    const st = netState(net, last);
    for (const e of last.cut!.edges) expect(st.edgeMarks[e]).toBe("e-cut");
    for (const v of last.cut!.A)
      if (v !== net.z) expect(st.nodeMarks[v]).toBe("n-cut-a");
    expect(st.nodeMarks[net.z]).toBe("n-term n-cut-a");
  });
});

describe("síť rezerv (obr. 14.4 vpravo)", () => {
  const { net, init } = preset("obr-14-4");
  const arcs = residualArcs(net.graph);
  const steps = materialize(fordFulkerson(net, { search: "dfs", init: init! }));

  it("oblouky jako hrany ve stejné kresbě: 16 oblouků, souřadnice a poměr stran sítě", () => {
    const rg = residualGraph(net.graph, arcs);
    expect(rg.directed).toBe(true);
    expect(rg.weighted).toBe(false);
    expect(rg.edges).toHaveLength(16);
    expect(rg.nodes).toEqual(net.graph.nodes);
    expect(rg.aspect).toBe(net.graph.aspect);
  });

  it("popisky rezerv jako na obrázku, nasycené oblouky e-zero, cesta a ε", () => {
    const s = steps.find((x) => x.line === FF_LINES.eps)!;
    const st = residualState(net, s.state, arcs);
    const got = Object.fromEntries(
      arcs.map((a) => [
        `${lab(net, a.u)}>${lab(net, a.v)}`,
        st.edgeText![a.id],
      ]),
    );
    expect(got).toEqual(
      Object.fromEntries(
        Object.entries(FIG_14_4.residualPairs).map(([k, r]) => [k, String(r)]),
      ),
    );
    const mark = (k: string) =>
      st.edgeMarks[
        arcs.find((a) => `${lab(net, a.u)}>${lab(net, a.v)}` === k)!.id
      ];
    expect(mark("z>a")).toBe("e-zero");
    expect(mark("z>b")).toBe("e-path");
    expect(mark("c>a")).toBe("e-path");
    expect(mark("a>d")).toBe("e-path e-min"); // r = 1 = ε
  });
});

describe("vrstevnatá síť (Dinic, obr. 14.7)", () => {
  const { net } = preset("obr-14-7");
  const arcs = residualArcs(net.graph);
  const steps = materialize(dinic(net));

  it("po vyčištění: vrstvy jako skupiny, šedivé, tečkované a smazané vrcholy", () => {
    const s = steps.find(
      (x) => x.state.proc === "clean" && x.line === CLEAN_LINES.loop,
    )!;
    const v = layeredView(net, s.state, arcs);
    expect(v.groups.map((g) => g.label)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(
      v.groups.map((g) => g.nodes.map((id) => lab(net, id)).sort()),
    ).toEqual(NET_14_7.layers.map((l) => [...l].sort()));
    // sloupce zleva doprava podle vrstvy
    const x = (l: string) => v.graph.nodes.find((n) => n.label === l)!.x;
    expect(x("z")).toBeLessThan(x("a"));
    expect(x("a")).toBeCloseTo(x("c"), 6);
    expect(x("s")).toBeCloseTo(1, 6);
    const mark = (k: string) => {
      const e = v.graph.edges.find(
        (e) => `${lab(net, e.u)}>${lab(net, e.v)}` === k,
      )!;
      return v.state.edgeMarks[e.id] ?? "";
    };
    for (const k of NET_14_7.gray) expect(mark(k), k).toBe("e-r-gray");
    for (const k of NET_14_7.dotted) expect(mark(k), k).toBe("e-r-dead");
    // ponechané hrany R jsou výrazné (v knize černé) a liší se od šedivých smazaných (UX-03)
    for (const k of NET_14_7.solid) expect(mark(k), k).toBe("e-r-live");
    for (const l of ["d", "g", "i", "m", "n"])
      expect(
        v.state.nodeMarks[net.graph.nodes.find((n) => n.label === l)!.id],
      ).toBe("n-gone");
    // v síti R jsou jen oblouky s kladnou rezervou (na začátku fáze 1 = hrany sítě)
    expect(v.graph.edges).toHaveLength(net.graph.edges.length);
  });

  it("během blokujícího toku popisky g/r, cesta a nasycené hrany", () => {
    const s = steps.find(
      (x) => x.state.proc === "block" && x.line === BLOCK_LINES.sat,
    )!;
    const v = layeredView(net, s.state, arcs);
    const texts = Object.values(v.state.edgeText!);
    expect(texts.some((t) => /^\d+\/\d+$/.test(t))).toBe(true);
    expect(Object.values(v.state.edgeMarks)).toContain("e-r-sat");
  });

  it("před rozdělením do vrstev (ř. 4) žádné skupiny a popisky jen r", () => {
    const s = steps[1];
    expect(s.state.layered).toBe(false);
    const v = layeredView(net, s.state, arcs);
    expect(v.groups).toEqual([]);
    expect(Object.values(v.state.edgeMarks)).not.toContain("e-r-live");
    expect(Object.values(v.state.edgeText!).every((t) => /^\d+$/.test(t))).toBe(
      true,
    );
  });
});

describe("síť párování (obr. 14.6) bez popisků kapacit (UX-05)", () => {
  it("všechny c = 1: tok ukazuje jen styl čáry (jako kniha), síť rezerv i R bez čísel; jiné sítě popisky mají", () => {
    const { net } = preset("obr-14-6");
    const arcs = residualArcs(net.graph);
    const steps = materialize(fordFulkerson(net, {}));
    for (const s of [undefined, steps[0].state, steps.at(-1)!.state]) {
      // "" = bez popisku (jinak by GraphView ukázal kapacitu ohodnocené sítě)
      const t = Object.values(netState(net, s).edgeText!);
      expect(t).toHaveLength(net.graph.edges.length);
      expect(t.every((x) => x === "")).toBe(true);
      expect(Object.keys(residualState(net, s, arcs).edgeText!)).toHaveLength(
        0,
      );
    }
    const d = materialize(dinic(net));
    expect(
      Object.keys(layeredView(net, d[5].state, arcs).state.edgeText!),
    ).toHaveLength(0);
    // konec: párovací hrany jsou vidět třídou
    expect(
      Object.values(netState(net, steps.at(-1)!.state).edgeMarks),
    ).toContain("e-match");
    const other = preset("obr-14-2").net;
    expect(Object.keys(netState(other, undefined).edgeText!).length).toBe(
      other.graph.edges.length,
    );
  });
});

describe("proměnné a legenda", () => {
  it("Dinic: legenda vysvětlí i ponechané hrany vrstevnaté sítě (UX-03)", () => {
    const { net } = preset("obr-14-7");
    const labels = flowLegend(net, materialize(dinic(net)), "dinic").map(
      (l) => l.label,
    );
    expect(labels.some((l) => /^R: hrana vrstevnaté sítě/.test(l))).toBe(true);
  });

  it("FordFulkerson: |f|, ε, δ; Dinic: fáze, ℓ, |f|, |g|, F", () => {
    const { net, init } = preset("obr-14-4");
    const ff = materialize(fordFulkerson(net, { search: "dfs", init: init! }));
    const d = ff.find((x) => x.line === FF_LINES.delta)!;
    expect(flowVars(net, d.state)).toEqual({
      "|f|": "16",
      ε: "1",
      δ: "0",
    });
    const n7 = preset("obr-14-7").net;
    const ds = materialize(dinic(n7));
    const q = ds.find(
      (x) => x.state.proc === "clean" && x.line === CLEAN_LINES.queue,
    )!;
    expect(flowVars(n7, q.state)).toEqual({
      fáze: "1",
      ℓ: "5",
      "|f|": "0",
      F: "{g, i, m, n}",
    });
  });

  it("legenda jen s tím, co v běhu nastane; vzorky sw-…", () => {
    const { net } = preset("obr-14-2");
    const ff = flowLegend(net, materialize(fordFulkerson(net, {})), "ff");
    const cls = ff.map((l) => l.cls);
    expect(cls).toContain("sw-flow-path");
    expect(cls).toContain("sw-flow-cut");
    expect(cls).not.toContain("sw-flow-match");
    expect(cls).not.toContain("sw-flow-dead");
    for (const c of cls) expect(c).toMatch(/^sw-/);
    const n7 = preset("obr-14-7").net;
    const dl = flowLegend(n7, materialize(dinic(n7)), "dinic").map(
      (l) => l.cls,
    );
    expect(dl).toContain("sw-flow-gray");
    expect(dl).toContain("sw-flow-dead");
    expect(dl).toContain("sw-flow-gone");
    const m = preset("obr-14-6").net;
    expect(
      flowLegend(m, materialize(fordFulkerson(m, {})), "ff").map((l) => l.cls),
    ).toContain("sw-flow-match");
  });
});

describe("náhodné sítě", () => {
  it("pohledy a legenda pro každý krok obou algoritmů bez chyby", () => {
    for (let seed = 1; seed <= 120; seed += 3) {
      const g = randomNet(8, 12, seed);
      const net = { graph: g, ...defaultEnds(g) };
      const arcs = residualArcs(g);
      const d = materialize(dinic(net));
      for (const s of d) {
        const v = layeredView(net, s.state, arcs);
        expect(
          v.graph.edges.every((e) => v.graph.nodes[e.u] && v.graph.nodes[e.v]),
        ).toBe(true);
        expect(
          v.graph.nodes.every(
            (n) => Number.isFinite(n.x) && Number.isFinite(n.y),
          ),
        ).toBe(true);
        netState(net, s.state);
        flowVars(net, s.state);
      }
      flowLegend(net, d, "dinic");
      const f = materialize(fordFulkerson(net, {}));
      for (const s of f) residualState(net, s.state, arcs);
    }
  });
});

describe("krok jiné sítě (průchod renderu, kde se běh teprve mění)", () => {
  it("pohledy krok jiné sítě nepoužijí a nespadnou", () => {
    const big = preset("obr-14-7").net;
    const steps = materialize(dinic(big));
    const small = preset("obr-14-3").net;
    const arcs = residualArcs(small.graph);
    for (const s of steps.slice(0, 12)) {
      expect(stateFits(small, s.state, arcs)).toBe(false);
      const v = layeredView(small, s.state, arcs);
      expect(v.graph.nodes).toHaveLength(4);
      expect(v.groups).toEqual([]);
      expect(netState(small, s.state).edgeText![0]).toBe("0/1");
      residualState(small, s.state, arcs);
    }
    expect(stateFits(big, steps[3].state, residualArcs(big.graph))).toBe(true);
  });
});

describe("čitelná šířka kresby (telefon: širší kresba se posouvá do strany)", () => {
  it("obr. 14.7 potřebuje přes 450 px, obr. 14.2 se vejde do šířky telefonu, volná kresba bez nároku", () => {
    const n7 = preset("obr-14-7").net.graph;
    const n2 = preset("obr-14-2").net.graph;
    expect(readableWidth(n7)).toBeGreaterThan(450);
    expect(readableWidth(n7)).toBeLessThan(900);
    expect(readableWidth(n2)).toBeLessThan(340);
    expect(readableWidth({ ...n2, aspect: undefined })).toBeNull();
  });
});

describe("čitelná šířka nezávisí na posunutých vrcholech příkladu (V-7: odkaz s xy= = stejná kresba)", () => {
  it("příklad z knihy s vrcholem přisunutým k sousedovi: základ = kresba příkladu", () => {
    const n2 = preset("obr-14-2").net.graph;
    const moved = {
      ...n2,
      nodes: n2.nodes.map((n, i) =>
        i === 1 ? { ...n, x: n2.nodes[2].x + 0.01, y: n2.nodes[2].y } : n,
      ),
    };
    expect(readableWidth(moved)!).toBeGreaterThan(readableWidth(n2)!);
    expect(readableWidth(readableBase(moved, "obr-14-2"))).toBe(
      readableWidth(n2),
    );
    // vlastní síť (bez příkladu): jen její kresba
    expect(readableBase(moved, null)).toBe(moved);
  });
});

describe("kresby pod sebou podle poměru stran, jednotně ve všech třech modulech (F-04, F-11)", () => {
  const KINDS = ["ff", "dinic", "goldberg"] as const;
  it("široká obr. 14.7 pod sebou i ve FordFulkersonovi; obr. 14.2 a 14.3 ve FF a Goldbergovi vedle sebe", () => {
    const n7 = preset("obr-14-7").net;
    for (const k of KINDS) expect(flowStacked(n7, k), k).toBe(true);
    for (const id of ["obr-14-2", "obr-14-3"]) {
      expect(flowStacked(preset(id).net, "ff"), id).toBe(false);
      expect(flowStacked(preset(id).net, "goldberg"), id).toBe(false);
    }
  });
  it("síť párování nikdy pod sebou (obr. 14.6 i Vytvořit ▸ Párování s mnoha vrcholy)", () => {
    const big = bipartiteNet(
      "A1 B1, A2 B2, A3 B3, A4 B4, A5 B5, A6 B6, A7 B7, A1 B7",
    ).graph!;
    for (const net of [
      preset("obr-14-6").net,
      { graph: big, ...defaultEnds(big) },
    ])
      for (const k of KINDS) expect(flowStacked(net, k), k).toBe(false);
  });
  it("rozhoduje poměr stran, ne počet vrcholů: síť s 10 vrcholy a poměrem 2 vedle sebe", () => {
    const g = randomNet(10, 14, 7);
    const net = { graph: { ...g, aspect: 2 }, ...defaultEnds(g) };
    expect(flowStacked(net, "goldberg")).toBe(false);
    expect(flowStacked(net, "ff")).toBe(false);
    expect(
      flowStacked({ ...net, graph: { ...g, aspect: STACK_ASPECT } }, "ff"),
    ).toBe(true);
  });
});

describe("výchozí kresba (F-06): síť párování se ukáže se sítí, kde je párování vidět", () => {
  it("FordFulkerson na síti párování jen síť (síť rezerv se 44 oblouky by byla změť), Dinic a Goldberg obě vedle sebe", () => {
    const m = { matching: true, stacked: false, cramped: true };
    expect(autoFlowView({ kind: "ff", ...m })).toBe("sit");
    expect(autoFlowView({ kind: "dinic", ...m })).toBe("obe");
    expect(autoFlowView({ kind: "goldberg", ...m })).toBe("obe");
  });
  it("široká síť pod sebou v menším okně: Dinic a Goldberg jen druhá kresba, FordFulkerson obě; jinak obě", () => {
    const w = { matching: false, stacked: true, cramped: true };
    expect(autoFlowView({ kind: "dinic", ...w })).toBe("druha");
    expect(autoFlowView({ kind: "goldberg", ...w })).toBe("druha");
    expect(autoFlowView({ kind: "ff", ...w })).toBe("obe");
    for (const kind of ["ff", "dinic", "goldberg"] as const) {
      expect(autoFlowView({ kind, ...w, cramped: false })).toBe("obe");
      expect(autoFlowView({ kind, ...w, stacked: false })).toBe("obe");
    }
  });
});

describe("síť párování – zobrazovaný poměr stran: dva sloupce a řádky, které se vejdou (F-05, F-12)", () => {
  it("obr. 14.6 na plátně: sloupce z < L < R < s, poměr ~1,15 (5 řádků), mřížka knihy beze změny", () => {
    const p = flowPresetById("obr-14-6")!;
    const g = exampleInput(p).graph;
    const x = (l: string) => g.nodes.find((n) => n.label === l)!.x;
    expect(x("z")).toBeLessThan(x("L1"));
    expect(x("L1")).toBeLessThan(x("R1"));
    expect(x("R1")).toBeLessThan(x("s"));
    expect(g.aspect!).toBeGreaterThan(0.95);
    expect(g.aspect!).toBeLessThan(1.3);
    // kniha (flowBook.test) má dál poměr 1,5
    expect(presetNet(p).graph.aspect!).toBeCloseTo(1.5, 1);
    // stejné souřadnice vrcholů jako v knize
    expect(g.nodes.map((n) => [n.x, n.y])).toEqual(
      presetNet(p).graph.nodes.map((n) => [n.x, n.y]),
    );
  });
  it("Vytvořit ▸ Párování: poměr podle počtu řádků (stejný jako obr. 14.6 při 5 řádcích, málo řádků širší, mnoho užší)", () => {
    const rows = (k: number) =>
      bipartiteNet(
        Array.from({ length: k }, (_, i) => `A${i + 1} B${i + 1}`).join(", "),
      ).graph!.aspect!;
    expect(rows(5)).toBeCloseTo(
      exampleInput(flowPresetById("obr-14-6")!).graph.aspect!,
      2,
    );
    expect(rows(2)).toBeGreaterThan(rows(5));
    expect(rows(9)).toBeLessThan(rows(5));
    expect(rows(9)).toBeGreaterThanOrEqual(0.8);
  });
  it("telefon (panel 332 px): obr. 14.6 se vejde bez vodorovného posunu", () => {
    const g = exampleInput(flowPresetById("obr-14-6")!).graph;
    expect(readableWidth(readableBase(g, "obr-14-6"))!).toBeLessThanOrEqual(
      332,
    );
  });
  it("odkaz ?ex=obr-14-6 se zobrazovaným poměrem nepřidá xy= (kresba = příklad)", () => {
    const p = flowPresetById("obr-14-6")!;
    expect(
      flowParams("ff", exampleInput(p), { search: "bfs", variant: "rezervy" }),
    ).toEqual({ ex: "obr-14-6" });
  });
});

describe("pohledy nespadnou na n = 0, n = 1 a z = s (F-09)", () => {
  const nets: FlowNet[] = [
    {
      graph: { directed: true, weighted: true, nodes: [], edges: [] },
      z: 0,
      s: 0,
    },
    {
      graph: {
        directed: true,
        weighted: true,
        nodes: [{ id: 0, label: "z", x: 0.5, y: 0.5 }],
        edges: [],
      },
      z: 0,
      s: 0,
    },
    {
      graph: {
        directed: true,
        weighted: true,
        nodes: [
          { id: 0, label: "z", x: 0, y: 0.5 },
          { id: 1, label: "a", x: 1, y: 0.5 },
        ],
        edges: [{ id: 0, u: 0, v: 1, w: 3 }],
      },
      z: 0,
      s: 0,
    },
  ];
  it.each(nets.map((n, i) => [i, n] as const))("síť %i", (_, net) => {
    const arcs = residualArcs(net.graph);
    expect(() => layeredView(net, undefined, arcs)).not.toThrow();
    expect(() => residualState(net, undefined, arcs)).not.toThrow();
    expect(() => netState(net, undefined)).not.toThrow();
    expect(() => flowStacked(net, "dinic")).not.toThrow();
    const lay = layeredView(net, undefined, arcs);
    expect(Number.isFinite(lay.graph.aspect!)).toBe(true);
    for (const n of lay.graph.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("vrstevnatá síť R pro párování: řádky partity mají místo (F-05)", () => {
  it("obr. 14.6, krok 1 (z | L | R | s, 5 řádků): poměr ≤ 1,2 – rozestup řádků aspoň jako sloupců", () => {
    const { net } = preset("obr-14-6");
    const lay = layeredView(net, undefined, residualArcs(net.graph));
    expect(lay.graph.aspect!).toBeLessThanOrEqual(1.2);
    // obr. 14.7 beze změny (jako v knize, široká)
    const n7 = preset("obr-14-7").net;
    expect(
      layeredView(n7, undefined, residualArcs(n7.graph)).graph.aspect!,
    ).toBeGreaterThan(STACK_ASPECT);
  });
});
