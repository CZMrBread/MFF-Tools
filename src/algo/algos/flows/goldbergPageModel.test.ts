/*
 * Model stránky Goldbergova algoritmu bez Reactu: odkaz (ex=, g=, xy=, z=, s=, v=nejvyssi), příklady
 * z knihy, nabídka akcí a název operace.
 */
import { describe, expect, it } from "vitest";
import { strArg } from "../../core/actionModel";
import { presetNet, flowPresetById } from "./flowPresets";
import { netOf } from "./flowPageModel";
import {
  GOLDBERG_DEFAULT_EXAMPLE,
  GOLDBERG_PRESET_IDS,
  goldbergActionDefs,
  goldbergExampleInput,
  goldbergExampleOf,
  goldbergFromParams,
  goldbergOpTitle,
  goldbergParams,
  type GoldbergHandlers,
} from "./goldbergPageModel";

const P = (q: string) => new URLSearchParams(q);

describe("odkaz", () => {
  it("prázdná adresa = výchozí příklad obr. 14.2, základní varianta; zpět prázdná adresa", () => {
    const r = goldbergFromParams(P(""));
    expect(r.problem).toBeNull();
    expect(r.input.example).toBe("obr-14-2");
    expect(GOLDBERG_DEFAULT_EXAMPLE).toBe("obr-14-2");
    expect(r.variant).toBe("zakladni");
    expect(goldbergParams(r.input, r.variant)).toEqual({});
  });

  it("ex=obr-14-7 a v=nejvyssi tam i zpět", () => {
    const r = goldbergFromParams(P("ex=obr-14-7&v=nejvyssi"));
    expect(r.problem).toBeNull();
    expect(r.input.example).toBe("obr-14-7");
    expect(r.variant).toBe("nejvyssi");
    expect(goldbergParams(r.input, r.variant)).toEqual({
      ex: "obr-14-7",
      v: "nejvyssi",
    });
  });

  it("neznámý příklad (i obr. 14.4 s počátečním tokem) a varianta → výchozí s hláškou", () => {
    const r = goldbergFromParams(P("ex=obr-14-4&v=nahodne"));
    expect(r.input.example).toBe("obr-14-2");
    expect(r.variant).toBe("zakladni");
    expect(r.problem).toContain("Příklad „obr-14-4“ z odkazu neznám");
    expect(r.problem).toContain("Varianta „nahodne“");
    expect(GOLDBERG_PRESET_IDS).not.toContain("obr-14-4");
  });

  it("vlastní síť g= s polohami xy= a zdrojem / stokem z odkazu se obnoví beze změny", () => {
    const r0 = goldbergFromParams(P("g=x+a+3%0Aa+y+2%0Ax+y+1&z=a&s=x"));
    expect(r0.problem).toBeNull();
    expect(r0.input.example).toBeNull();
    expect(r0.input.z).toBe("a");
    const q = goldbergParams(r0.input, "zakladni");
    expect(q.g).toBeDefined();
    expect(q.xy).toBeDefined();
    expect(q).toMatchObject({ z: "a", s: "x" });
    const r1 = goldbergFromParams(P(new URLSearchParams(q).toString()));
    expect(r1.problem).toBeNull();
    // xy= nese souřadnice na 4 desetinná místa
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    expect(r1.input.graph.nodes.map((n) => [n.label, n.x, n.y])).toEqual(
      r0.input.graph.nodes.map((n) => [n.label, r4(n.x), r4(n.y)]),
    );
    // a podruhé už beze změny (odkaz je stabilní)
    expect(goldbergParams(r1.input, "zakladni")).toEqual(q);
    const net = netOf(r1.input);
    expect(net.graph.nodes[net.z].label).toBe("a");
  });

  it("posunutý vrchol příkladu: ex= i xy=; neplatná síť z odkazu → výchozí příklad s hláškou", () => {
    const inp = goldbergExampleInput(flowPresetById("obr-14-2")!);
    inp.graph.nodes[1] = { ...inp.graph.nodes[1], x: 0.5, y: 0.3 };
    const q = goldbergParams(inp, "zakladni");
    expect(q.ex).toBe("obr-14-2");
    expect(q.xy).toBeDefined();
    const back = goldbergFromParams(P(new URLSearchParams(q).toString()));
    expect(back.input.graph.nodes[1]).toMatchObject({ x: 0.5, y: 0.3 });
    const bad = goldbergFromParams(P("g=z+s+3%0Az+s+4"));
    expect(bad.input.example).toBe("obr-14-2");
    expect(bad.problem).toMatch(/Síť z odkazu nešla použít/);
  });

  it("příklad podle struktury sítě: obr. 14.2 i po posunu vrcholu, upravená síť už ne", () => {
    const g = presetNet(flowPresetById("obr-14-6")!).graph;
    expect(goldbergExampleOf(g, null)).toBe("obr-14-6");
    const g2 = { ...g, edges: g.edges.slice(1) };
    expect(goldbergExampleOf(g2, "obr-14-6")).toBeNull();
  });
});

describe("akce", () => {
  const calls: string[] = [];
  const h: GoldbergHandlers = {
    random: (n, m) => calls.push(`random ${n} ${m}`),
    empty: () => calls.push("empty"),
    bipartite: (t) => calls.push(`bip ${t}`),
    loadExample: (id) => calls.push(`ex ${id}`),
    run: (z, s) => calls.push(`run ${z} ${s}`),
    setCapacities: (cs) => calls.push(`caps ${cs.join(",")}`),
    switchAlgo: (k) => calls.push(`algo ${k}`),
  };
  const input = goldbergFromParams(P("")).input;
  const defs = goldbergActionDefs(input, h);

  it("pořadí: Vytvořit, Příklady z knihy, Goldberg(z, s), Kapacity hran, Jiný alg.", () => {
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Goldberg(z, s)",
      "Kapacity hran",
      "Jiný alg.",
    ]);
    const book = defs[1];
    expect(book.variants!.map((v) => v.id)).toEqual(GOLDBERG_PRESET_IDS);
    expect(book.selectedVariant).toBe("obr-14-2");
  });

  it("Goldberg(z, s) spustí se zdrojem a stokem, stejný vrchol odmítne; Jiný alg. nabízí FF i Dinica", () => {
    const run = defs[2];
    const args = { z: "z", s: "s" };
    run.run(args, null);
    expect(calls).toContain("run z s");
    expect(run.check!({ z: "a", s: "a" }, null)).toMatch(/různé/);
    expect(strArg(args, "z")).toBe("z");
    const other = defs[4];
    expect(other.variants!.map((v) => v.id)).toEqual(["ff", "dinic"]);
    other.run({}, "dinic");
    expect(calls).toContain("algo dinic");
  });

  it("název operace: Goldberg(z, s), u vylepšení „· nejvyšší vrchol“", () => {
    const net = netOf(input);
    expect(goldbergOpTitle(net, "zakladni")).toBe("Goldberg(z, s)");
    expect(goldbergOpTitle(net, "nejvyssi")).toBe(
      "Goldberg(z, s) · nejvyšší vrchol",
    );
  });
});
