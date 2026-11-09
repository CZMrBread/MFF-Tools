import { describe, expect, it, vi } from "vitest";
import type { ActionDef } from "../../core/actionModel";
import { materialize } from "../../core/steps";
import { graphStructureKey } from "../graphs/graphPageModel";
import { matchingOf, netProblem } from "./flowNet";
import { flowPresetById, presetNet, presetsFor } from "./flowPresets";
import { fordFulkerson } from "./fordFulkerson";
import {
  bipartiteNet,
  defaultExample,
  endsNote,
  exampleInput,
  flowActionDefs,
  flowFromParams,
  flowParams,
  initFlowFor,
  netOf,
  randomNet,
  type FlowHandlers,
  type FlowInput,
} from "./flowPageModel";

const P = (q: string) => new URLSearchParams(q);
const labels = (i: FlowInput) => i.graph.nodes.map((n) => n.label);

describe("výchozí příklad a odkaz", () => {
  it("bez parametrů: FordFulkerson obr. 14.2 s BFS, Dinic obr. 14.7", () => {
    const ff = flowFromParams("ff", P(""));
    expect(ff.problem).toBeNull();
    expect(ff.input.example).toBe("obr-14-2");
    expect(ff.settings).toEqual({ search: "bfs", variant: "rezervy" });
    expect(defaultExample("dinic").id).toBe("obr-14-7");
    expect(flowFromParams("dinic", P("")).input.example).toBe("obr-14-7");
  });

  it("výchozí příklad má prázdnou adresu", () => {
    for (const kind of ["ff", "dinic"] as const) {
      const r = flowFromParams(kind, P(""));
      expect(flowParams(kind, r.input, r.settings)).toEqual({});
    }
  });

  it("?ex=obr-14-4: síť z obr. 14.2 s počátečním tokem 16 a hledáním DFS (jako v knize)", () => {
    const r = flowFromParams("ff", P("ex=obr-14-4"));
    expect(r.input.example).toBe("obr-14-4");
    expect(r.settings.search).toBe("dfs");
    const init = initFlowFor(r.input);
    expect(init.init).not.toBeNull();
    expect(init.label).toMatch(/obr\. 14\.2 vpravo/);
    expect(flowParams("ff", r.input, r.settings)).toEqual({ ex: "obr-14-4" });
    // BFS u příkladu s DFS se do odkazu zapíše
    const bfs = { ...r.settings, search: "bfs" as const };
    expect(flowParams("ff", r.input, bfs)).toEqual({
      ex: "obr-14-4",
      cesta: "bfs",
    });
    expect(
      flowFromParams("ff", P("ex=obr-14-4&cesta=bfs")).settings.search,
    ).toBe("bfs");
  });

  it("počáteční tok jen u nezměněné sítě příkladu", () => {
    const r = flowFromParams("ff", P("ex=obr-14-4"));
    const g = r.input.graph;
    const edited = {
      ...r.input,
      graph: { ...g, edges: g.edges.map((e, i) => (i ? e : { ...e, w: 11 })) },
    };
    expect(initFlowFor(edited).init).toBeNull();
  });

  it("vlastní síť: g= (text hran s kapacitami) a xy= (kresba) – odkaz otevře stejnou síť", () => {
    const g = randomNet(8, 12, 7);
    const input: FlowInput = { graph: g, z: null, s: null, example: null };
    const settings = { search: "dfs" as const, variant: "rezervy" as const };
    const q = flowParams("ff", input, settings);
    expect(q.g).toBeDefined();
    expect(q.xy).toBeDefined();
    expect(q.cesta).toBe("dfs");
    const back = flowFromParams("ff", P(new URLSearchParams(q).toString()));
    expect(back.problem).toBeNull();
    // id vrcholů se po přečtení textu smí přečíslovat (pořadí prvního výskytu) – hrany, kapacity a popisky ne
    const canon = (x: typeof g) => [
      x.edges.map((e) => `${x.nodes[e.u].label}>${x.nodes[e.v].label}:${e.w}`),
      x.nodes.map((n) => n.label).sort(),
      x.aspect,
    ];
    expect(canon(back.input.graph)).toEqual(canon(g));
    for (const n of back.input.graph.nodes) {
      const o = g.nodes.find((m) => m.label === n.label)!;
      expect(n.x).toBeCloseTo(o.x, 4);
      expect(n.y).toBeCloseTo(o.y, 4);
    }
    expect(back.settings.search).toBe("dfs");
  });

  it("posunutý vrchol příkladu: ex= a xy=", () => {
    const r = flowFromParams("ff", P(""));
    const moved = {
      ...r.input,
      graph: {
        ...r.input.graph,
        nodes: r.input.graph.nodes.map((n, i) =>
          i === 0 ? { ...n, x: n.x + 0.1 } : n,
        ),
      },
    };
    const q = flowParams("ff", moved, r.settings);
    expect(q.ex).toBe("obr-14-2");
    expect(q.xy).toBeDefined();
    const back = flowFromParams("ff", P(new URLSearchParams(q).toString()));
    expect(back.input.graph.nodes[0].x).toBeCloseTo(moved.graph.nodes[0].x, 4);
  });

  it("z= a s= jiné než výchozí; varianta po směru (v=po-smeru) jen u FordFulkersona", () => {
    const r = flowFromParams("ff", P("ex=obr-14-3&z=a&s=b&v=po-smeru"));
    expect(r.problem).toBeNull();
    expect(r.input.z).toBe("a");
    expect(r.input.s).toBe("b");
    expect(r.settings.variant).toBe("po-smeru");
    const net = netOf(r.input);
    expect(net.graph.nodes[net.z].label).toBe("a");
    expect(flowParams("ff", r.input, r.settings)).toEqual({
      ex: "obr-14-3",
      z: "a",
      s: "b",
      v: "po-smeru",
    });
    expect(flowFromParams("dinic", P("v=po-smeru")).settings.variant).toBe(
      "rezervy",
    );
  });

  it.each([
    ["ex=obr-99", /příklad/i],
    ["g=a%20b%20x%20y", /síť/i],
    ["g=z%20s%202.5", /celé číslo/],
    ["v=nic", /varianta/i],
    ["cesta=xyz", /hledání/i],
    ["z=q", /zdroj/i],
  ])("vadný odkaz ?%s → výchozí příklad a hláška", (q, re) => {
    const r = flowFromParams("ff", P(q));
    expect(r.problem).toMatch(re);
    expect(netProblem(netOf(r.input))).toBeNull();
  });
});

describe("náhodná síť", () => {
  it("vrcholy z, a, b, …, s; bez chyb, kapacity 1–9, stok dosažitelný; stejné semínko = stejná síť", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = randomNet(8, 12, seed);
      expect(g.nodes.map((n) => n.label)).toEqual([
        "z",
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "s",
      ]);
      const net = netOf({ graph: g, z: null, s: null, example: null });
      expect(netProblem(net), `seed ${seed}`).toBeNull();
      expect(g.edges.length).toBeLessThanOrEqual(12);
      expect(g.edges.every((e) => e.w >= 1 && e.w <= 9)).toBe(true);
      const last = materialize(fordFulkerson(net, {})).at(-1)!;
      expect(last.state.value, `seed ${seed}`).toBeGreaterThan(0);
      expect(g.aspect).toBeDefined();
    }
    expect(randomNet(10, 16, 3)).toEqual(randomNet(10, 16, 3));
  });
});

describe("párování z bipartitního grafu (14.3)", () => {
  it("síť z → L → R → s s kapacitami 1, nakreslená jako obr. 14.6", () => {
    const r = bipartiteNet("L1 R2, L1 R3, L2 R1");
    expect(r.error).toBeNull();
    const g = r.graph!;
    expect(g.nodes.map((n) => n.label)).toEqual([
      "z",
      "L1",
      "L2",
      "R1",
      "R2",
      "R3",
      "s",
    ]);
    expect(g.edges.every((e) => e.w === 1)).toBe(true);
    expect(g.edges).toHaveLength(2 + 3 + 3);
    const net = netOf({ graph: g, z: null, s: null, example: null });
    expect(matchingOf(net, [])).not.toBeNull();
    const x = (l: string) => g.nodes.find((n) => n.label === l)!.x;
    expect(x("z")).toBeLessThan(x("L1"));
    expect(x("L1")).toBeLessThan(x("R1"));
    expect(x("R1")).toBeLessThan(x("s"));
  });

  it.each([
    ["", /aspoň jednu dvojici/],
    ["A B, B C", /na obou stranách/],
    ["z A", /z a s/],
    ["A", /dvojic/],
  ])("bipartiteNet(%j) hlásí chybu", (t, re) => {
    expect(bipartiteNet(t).error).toMatch(re);
  });
});

describe("nabídka akcí", () => {
  const handlers = (): FlowHandlers => ({
    random: vi.fn(),
    empty: vi.fn(),
    bipartite: vi.fn(),
    loadExample: vi.fn(),
    run: vi.fn(),
    setCapacities: vi.fn(),
    switchAlgo: vi.fn(),
  });
  const ids = (d: ActionDef[]) => d.map((a) => a.label);

  it("Vytvořit, Příklady z knihy, operace s z a s, Kapacity hran, Jiný alg.", () => {
    const input = exampleInput(defaultExample("ff"));
    expect(ids(flowActionDefs("ff", input, handlers()))).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "FordFulkerson(z, s)",
      "Kapacity hran",
      "Jiný alg.",
    ]);
    expect(ids(flowActionDefs("dinic", input, handlers()))[2]).toBe(
      "Dinic(z, s)",
    );
  });

  it("Jiný alg. nabízí oba další algoritmy na maximální tok včetně Goldberga (V-8)", () => {
    const input = exampleInput(defaultExample("ff"));
    const h = handlers();
    const ff = flowActionDefs("ff", input, h)[4];
    expect(ff.variants!.map((v) => v.id)).toEqual(["dinic", "goldberg"]);
    ff.run({}, "goldberg");
    expect(h.switchAlgo).toHaveBeenLastCalledWith("goldberg");
    ff.run({}, "dinic");
    expect(h.switchAlgo).toHaveBeenLastCalledWith("dinic");
    const dn = flowActionDefs("dinic", input, h)[4];
    expect(dn.variants!.map((v) => v.id)).toEqual(["ff", "goldberg"]);
    expect(dn.variants!.map((v) => v.label)).toEqual([
      "Fordův–Fulkersonův algoritmus",
      "Goldbergův algoritmus",
    ]);
  });

  it("Příklady z knihy = příklady modulu, zvýrazněný ten, který je na plátně", () => {
    const input = exampleInput(flowPresetById("obr-14-3")!);
    const book = flowActionDefs("ff", input, handlers())[1];
    expect(book.variants!.map((v) => v.id)).toEqual(
      presetsFor("ff").map((p) => p.id),
    );
    expect(book.selectedVariant).toBe("obr-14-3");
  });

  it("operace volá run se zdrojem a stokem; prázdná síť operaci zakáže", () => {
    const h = handlers();
    const input = exampleInput(defaultExample("ff"));
    const run = flowActionDefs("ff", input, h)[2];
    run.run({ z: "a", s: "s" }, null);
    expect(h.run).toHaveBeenCalledWith("a", "s");
    const empty: FlowInput = {
      graph: { directed: true, weighted: true, nodes: [], edges: [] },
      z: null,
      s: null,
      example: null,
    };
    expect(flowActionDefs("ff", empty, h)[2].disabledReason).toMatch(/prázdná/);
  });

  it("Kapacity hran: celá čísla 0–999 v pořadí hran", () => {
    const h = handlers();
    const input = exampleInput(defaultExample("ff"));
    const cap = flowActionDefs("ff", input, h)[3];
    const arg = cap.args![0];
    expect(arg.default).toBe("10 10 7 5 9 3 10 10");
    expect(arg.check!("1 2,5")).toMatch(/celá čísla/);
    expect(arg.check!("1 2 3")).toBeNull();
    cap.run({ c: "1 2 3" }, null);
    expect(h.setCapacities).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("příklad z knihy se načte s kresbou z knihy", () => {
    const p = flowPresetById("obr-14-6")!;
    const input = exampleInput(p);
    expect(graphStructureKey(input.graph)).toBe(
      graphStructureKey(presetNet(p).graph),
    );
    expect(labels(input)).toContain("L1");
  });
});

describe("náhradní zdroj / stok (F-09): poznámka, když zvolený vrchol v síti chybí", () => {
  const net = (
    text: string,
    z: string | null = null,
    s: string | null = null,
  ) => {
    const g = flowFromParams("ff", P(`g=${encodeURIComponent(text)}`)).input
      .graph;
    return { graph: g, z, s, example: null } as FlowInput;
  };
  it("bez vrcholu s: stok s chybí – použije se poslední vrchol", () => {
    expect(endsNote(net("z a 3\na c 2"))).toBe(
      "Stok s v síti chybí – použije se c.",
    );
  });
  it("bez vrcholu z: zdroj z chybí – použije se první vrchol", () => {
    expect(endsNote(net("a b 3\nb s 2"))).toBe(
      "Zdroj z v síti chybí – použije se a.",
    );
  });
  it("zvolený stok x (s=x) zmizel: poznámka s jeho jménem", () => {
    expect(endsNote(net("z a 3\na s 2", null, "x"))).toBe(
      "Stok x v síti chybí – použije se s.",
    );
  });
  it("síť se z a s, prázdná síť a jeden vrchol: bez poznámky (prázdnou síť hlásí netProblem)", () => {
    expect(endsNote(net("z a 3\na s 2"))).toBeNull();
    expect(
      endsNote({
        graph: { directed: true, weighted: true, nodes: [], edges: [] },
        z: null,
        s: null,
        example: null,
      }),
    ).toBeNull();
  });
});
