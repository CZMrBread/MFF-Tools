/*
 * Kresba Goldbergova algoritmu bez Reactu: síť „vlna / kapacita“ s výškou a přebytkem u vrcholu, kresba
 * výšek (sloupce vrcholů, hladiny 0…H pevné pro celý běh), hrany s rezervou dolů a převedení, proměnné
 * a legenda.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { lbl, residualArcs, type FlowNet } from "./flowNet";
import { flowPresetById, presetNet } from "./flowPresets";
import { goldberg, GOLDBERG_LINES, type GoldbergState } from "./goldberg";
import {
  goldbergLegend,
  goldbergNetState,
  goldbergStacked,
  goldbergView,
  goldbergStateFits,
  goldbergVars,
  heightArcs,
  heightLayout,
  heightMax,
  heightNodeName,
  HEIGHT_MIN_COL,
} from "./goldbergView";

const bookNet = (id: string): FlowNet => {
  const graph = presetNet(flowPresetById(id)!).graph;
  return {
    graph,
    z: graph.nodes.find((n) => n.label === "z")!.id,
    s: graph.nodes.find((n) => n.label === "s")!.id,
  };
};
const net = bookNet("obr-14-2");
const steps = materialize(goldberg(net));
const byLabel = (l: string) => net.graph.nodes.find((n) => n.label === l)!.id;
const firstAt = (line: number) => steps.find((s) => s.line === line)!;

describe("síť: vlna / kapacita", () => {
  it("bez kroku: 0/c u hran, zdroj a stok zvýrazněné, bez popisků výšky", () => {
    const s = goldbergNetState(net, undefined);
    expect(Object.values(s.edgeText!)).toContain("0/10");
    expect(s.nodeMarks[net.z]).toBe("n-term");
    expect(s.nodeMarks[net.s]).toBe("n-term");
    expect(s.nodeSub).toEqual({});
  });

  it("po vlně: hrany ze z plné, u vrcholu výška a přebytek („h 0 · +10“), zdroj jen výška", () => {
    const s = goldbergNetState(net, firstAt(GOLDBERG_LINES.wave).state);
    const za = net.graph.edges.find(
      (e) => e.u === net.z && e.v === byLabel("a"),
    )!;
    expect(s.edgeText![za.id]).toBe("10/10");
    expect(s.edgeMarks[za.id]).toBe("e-sat");
    expect(s.nodeSub[byLabel("a")]).toBe("h 0 · +10");
    expect(s.nodeSub[net.z]).toBe("h 6");
    expect(s.nodeSub[byLabel("c")]).toBe("h 0");
    expect(s.nodeMarks[byLabel("a")]).toBe("n-excess");
  });

  it("převedení: zpracovávaný vrchol n-current, měněná hrana e-changed", () => {
    const push = firstAt(GOLDBERG_LINES.push);
    const s = goldbergNetState(net, push.state);
    const ac = net.graph.edges.find(
      (e) => e.u === byLabel("a") && e.v === byLabel("c"),
    )!;
    expect(s.edgeMarks[ac.id]).toBe("e-changed");
    expect(s.nodeMarks[byLabel("a")]).toBe("n-current");
    expect(s.nodeMarks[byLabel("c")]).toBe("n-excess");
  });

  it("konec: řez e-cut a vrcholy A n-cut-a; stav jiné sítě se nekreslí", () => {
    const end = steps[steps.length - 1].state;
    const s = goldbergNetState(net, end);
    expect(
      Object.values(s.edgeMarks).filter((c) => c === "e-cut"),
    ).toHaveLength(3);
    expect(s.nodeMarks[byLabel("a")]).toBe("n-cut-a");
    expect(s.nodeMarks[net.z]).toBe("n-term n-cut-a");
    const other = bookNet("obr-14-3");
    expect(goldbergStateFits(other, end)).toBe(false);
    expect(goldbergNetState(other, end).nodeSub).toEqual({});
  });
});

describe("kresba výšek", () => {
  it("výška kresby je pevná pro celý běh: aspoň n, jinak nejvyšší výška v běhu", () => {
    expect(heightMax(net, steps)).toBe(8);
    expect(heightMax(net, [])).toBe(6);
  });

  it("rozložení: sloupce podle kresby sítě (z vlevo, s vpravo), hladina h → y, vyšší = výš", () => {
    const lay = heightLayout(net, 8, 600, 320);
    expect(lay.columns.map((v) => lbl(net.graph, v))).toEqual([
      "z",
      "a",
      "b",
      "c",
      "d",
      "s",
    ]);
    const st = firstAt(GOLDBERG_LINES.wave).state;
    const p = lay.at(st);
    expect(p[net.z].y).toBeLessThan(p[byLabel("a")].y);
    expect(p[byLabel("a")].y).toBe(lay.levelY(0));
    expect(lay.levelY(8)).toBeCloseTo(lay.top, 6);
    expect(lay.levelY(0)).toBeCloseTo(320 - lay.bottom, 6);
    // sloupce rovnoměrně a uvnitř šířky
    const xs = lay.columns.map((v) => p[v].x);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(xs[0] - lay.r).toBeGreaterThanOrEqual(lay.left);
    expect(xs[xs.length - 1] + lay.r).toBeLessThanOrEqual(
      600 - lay.right + 1e-6,
    );
  });

  it("úzké plátno: kresba se nezúží pod HEIGHT_MIN_COL na sloupec (vrcholy se nepřekrývají)", () => {
    const big = bookNet("obr-14-7");
    const lay = heightLayout(big, 18, 200, 300);
    expect(lay.width).toBeGreaterThan(200);
    const xs = lay.columns.map((v) => lay.at(undefined)[v].x);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(HEIGHT_MIN_COL - 1e-6);
    expect(2 * lay.r).toBeLessThan(HEIGHT_MIN_COL);
  });

  it("hrany: jen oblouky s rezervou dolů (seznamy L(u)), převedení s popiskem +δ", () => {
    const wave = firstAt(GOLDBERG_LINES.wave).state;
    // z je nahoře, ale hrany ze z jsou plné – dolů s rezervou nic nevede
    expect(heightArcs(net, wave)).toEqual([]);
    const push = firstAt(GOLDBERG_LINES.push);
    const arcs = heightArcs(net, push.state);
    const p = arcs.find((a) => a.cls === "gb-push")!;
    expect(lbl(net.graph, p.u) + lbl(net.graph, p.v)).toBe("ac");
    expect(p.label).toBe("+7");
    const all = residualArcs(net.graph);
    for (const a of arcs.filter((x) => x.cls === "gb-down")) {
      expect(push.state.h[a.u]).toBeGreaterThan(push.state.h[a.v]);
      expect(all[a.arc].u).toBe(a.u);
    }
  });

  it("přístupný název vrcholu: výška a přebytek", () => {
    const st = firstAt(GOLDBERG_LINES.wave).state;
    expect(heightNodeName(net, st, byLabel("a"))).toBe(
      "a: výška 0, přebytek 10",
    );
    expect(heightNodeName(net, st, net.z)).toBe("z (zdroj): výška 6");
    expect(heightNodeName(net, st, net.s)).toBe("s (stok): výška 0, přitéká 0");
    expect(heightNodeName(net, undefined, byLabel("a"))).toBe("a");
  });
});

describe("proměnné a legenda", () => {
  it("proměnné: |f|, u, P, počty operací; varianta nejvyšší má H", () => {
    const push = firstAt(GOLDBERG_LINES.push).state;
    const v = goldbergVars(net, push);
    expect(v["|f|"]).toBe("0");
    expect(v["u"]).toBe("a");
    expect(v["δ"]).toBe("7");
    expect(v["P"]).toBe("(a, b, c)");
    expect(v["převedení"]).toBe("1");
    expect(v["zvednutí"]).toBe("1");
    expect(v["H"]).toBeUndefined();
    const hi = materialize(goldberg(net, { variant: "nejvyssi" }));
    const hv = goldbergVars(
      net,
      hi.find((s) => s.line === GOLDBERG_LINES.loop)!.state as GoldbergState,
    );
    expect(hv["H"]).toBe("0");
    expect(goldbergVars(net, undefined)).toEqual({});
  });

  it("legenda jen s tím, co v běhu nastane", () => {
    const leg = goldbergLegend(net, steps).map((l) => l.cls);
    expect(leg).toEqual(
      expect.arrayContaining([
        "sw-gb-current",
        "sw-gb-excess",
        "sw-gb-down",
        "sw-gb-push",
        "sw-gb-lift",
        "sw-flow-cut",
      ]),
    );
    expect(leg).not.toContain("sw-flow-match");
  });
});

describe("rozložení panelů", () => {
  it("podle poměru stran kresby (F-04): široká obr. 14.7 pod sebou, síť párování obr. 14.6 a malá obr. 14.2, 14.3 vedle sebe", () => {
    expect(goldbergStacked(bookNet("obr-14-7"))).toBe(true);
    expect(goldbergStacked(bookNet("obr-14-6"))).toBe(false);
    expect(goldbergStacked(bookNet("obr-14-2"))).toBe(false);
    expect(goldbergStacked(bookNet("obr-14-3"))).toBe(false);
  });
});

describe("výchozí kresba", () => {
  it("široká síť v menším okně na jednu obrazovku → jen výšky; jinak obě; volba uživatele má přednost", () => {
    expect(goldbergView(null, { stacked: true, cramped: true })).toBe("vysky");
    expect(goldbergView(null, { stacked: true, cramped: false })).toBe("obe");
    expect(goldbergView(null, { stacked: false, cramped: true })).toBe("obe");
    expect(goldbergView("sit", { stacked: true, cramped: true })).toBe("sit");
    expect(goldbergView("obe", { stacked: true, cramped: true })).toBe("obe");
  });
});

describe("kresba výšek se vejde do malého obalu – nikdy se neořezává (F-04)", () => {
  it.each([
    ["obr-14-7", 600, 150],
    ["obr-14-7", 600, 90],
    ["obr-14-6", 300, 120],
    ["obr-14-2", 300, 100],
  ] as const)("%s do %i × %i px", (id, w, hh) => {
    const net = bookNet(id);
    const steps = materialize(goldberg(net));
    const hMax = heightMax(net, steps);
    const lay = heightLayout(net, hMax, w, hh);
    expect(lay.height).toBeLessThanOrEqual(hh);
    // hladiny shora dolů, nejvyšší i nejnižší uvnitř kresby
    expect(lay.levelY(lay.hMax)).toBeGreaterThanOrEqual(0);
    expect(lay.levelY(0)).toBeLessThanOrEqual(lay.height);
    expect(lay.levelY(1)).toBeLessThan(lay.levelY(0));
  });
  it("prázdná síť, jeden vrchol a z = s nespadnou (F-09)", () => {
    const one: FlowNet = {
      graph: {
        directed: true,
        weighted: true,
        nodes: [{ id: 0, label: "z", x: 0.5, y: 0.5 }],
        edges: [],
      },
      z: 0,
      s: 0,
    };
    const none: FlowNet = {
      graph: { directed: true, weighted: true, nodes: [], edges: [] },
      z: 0,
      s: 0,
    };
    for (const net of [one, none]) {
      const lay = heightLayout(net, 1, 300, 200);
      expect(Number.isFinite(lay.height)).toBe(true);
      expect(lay.at(undefined).every((p) => Number.isFinite(p.y))).toBe(true);
      expect(heightArcs(net, undefined)).toEqual([]);
    }
  });
});
