import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  FIG_14_4,
  FIG_14_5,
  NET_14_2,
  NET_14_3,
  NET_14_6,
  TEXT_354,
} from "./flow.fixtures";
import {
  checkFlow,
  flowByKey,
  flowValue,
  matchingOf,
  netFromText,
  residual,
  residualArcs,
  type FlowNet,
} from "./flowNet";
import type { FlowState } from "./flowState";
import {
  FF_LINES,
  fordFulkerson,
  PC_FF,
  PC_FF_FORWARD,
  pathText,
} from "./fordFulkerson";

const caps = (o: Readonly<Record<string, number>>) =>
  Object.entries(o)
    .map(([k, c]) => `${k.replace(">", " ")} ${c}`)
    .join("\n");
const net142 = () => netFromText(caps(NET_14_2.capacities));
const net143 = () =>
  netFromText(NET_14_3.edges.map((k) => `${k.replace(">", " ")} 1`).join("\n"));
const net146 = () =>
  netFromText(
    [
      ...["L1", "L2", "L3", "L4", "L5"].map((l) => `z ${l} 1`),
      ...NET_14_6.edges.map(([a, b]) => `${a} ${b} 1`),
      ...["R1", "R2", "R3", "R4", "R5"].map((r) => `${r} s 1`),
    ].join("\n"),
  );

const lab = (n: FlowNet, v: number) => n.graph.nodes[v].label;
/** cesty (z oblouků) v pořadí, jak je algoritmus našel */
function paths(n: FlowNet, steps: { state: FlowState; line: number | null }[]) {
  const arcs = residualArcs(n.graph);
  return steps
    .filter((s) => s.line === FF_LINES.search && s.state.path.length)
    .map((s) => pathText(n.graph, arcs, s.state.path));
}
const byKey = (n: FlowNet, f: readonly number[]) =>
  Object.fromEntries(
    n.graph.edges.map((e) => [`${lab(n, e.u)}>${lab(n, e.v)}`, f[e.id]]),
  );

describe("FordFulkerson – obr. 14.2 a 14.5", () => {
  it("BFS z nulového toku skončí přesně tokem z obr. 14.5 (|f| = 18) a řezem A = {z, a, b, c}", () => {
    const n = net142();
    const steps = materialize(fordFulkerson(n, { search: "bfs" }));
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(FIG_14_5.value);
    expect(byKey(n, last.state.f)).toEqual(FIG_14_5.flow);
    expect(last.state.cut!.A.map((v) => lab(n, v))).toEqual(FIG_14_5.cutA);
    expect(last.message).toMatch(/^Hotovo/);
    expect(last.message).toContain("18");
    expect(last.line).toBe(FF_LINES.output);
    expect(steps[0].line).toBe(FF_LINES.init);
  });

  it("BFS najde nejkratší cesty: zacs, zads, zbcs, zbds a nakonec zbcads", () => {
    const n = net142();
    expect(paths(n, materialize(fordFulkerson(n, { search: "bfs" })))).toEqual([
      "zacs",
      "zads",
      "zbcs",
      "zbds",
      "zbcads",
    ]);
  });

  it("v každém kroku hledání cesty je f tok (kapacity, Kirchhoff) a |f| sedí", () => {
    const n = net142();
    for (const search of ["bfs", "dfs"] as const)
      for (const s of materialize(fordFulkerson(n, { search }))) {
        if (s.line !== FF_LINES.search) continue;
        expect(checkFlow(n, s.state.f)).toBeNull();
        expect(s.state.value).toBe(flowValue(n, s.state.f));
      }
  });

  it("z toku 16 (obr. 14.2 vpravo) BFS najde cestu zbcs s ε = 1 (text str. 354)", () => {
    const n = net142();
    const init = flowByKey(n.graph, NET_14_2.flow16);
    const steps = materialize(fordFulkerson(n, { search: "bfs", init }));
    expect(steps[0].state.value).toBe(16);
    expect(paths(n, steps)[0]).toBe(TEXT_354.path);
    const eps = steps.find((s) => s.line === FF_LINES.eps)!;
    expect(eps.state.eps).toBe(TEXT_354.eps);
  });

  it("z toku 16 DFS najde nenasycenou cestu zbcads z obr. 14.4 s rezervami 4, 6, 6, 1, 3 a ε = 1", () => {
    const n = net142();
    const init = flowByKey(n.graph, NET_14_2.flow16);
    const steps = materialize(fordFulkerson(n, { search: "dfs", init }));
    expect(paths(n, steps)[0]).toBe(FIG_14_4.path);
    const first = steps.find((s) => s.line === FF_LINES.eps)!;
    const arcs = residualArcs(n.graph);
    expect(
      first.state.path.map((a) => residual(n.graph, init, arcs[a])),
    ).toEqual(FIG_14_4.residuals);
    expect(first.state.eps).toBe(FIG_14_4.eps);
    expect(first.message).toMatch(/ε = min\{4, 6, 6, 1, 3\} = 1/);
    // po zlepšení |f| = 17
    const next = steps.filter((s) => s.line === FF_LINES.search)[1];
    expect(next.state.value).toBe(17);
  });

  it("oblouk proti směru hrany (c→a) odečte δ z f(ac) – řádky 6 a 7, po směru nic nepřičte", () => {
    const n = net142();
    const init = flowByKey(n.graph, NET_14_2.flow16);
    const steps = materialize(fordFulkerson(n, { search: "dfs", init }));
    const delta = steps.find(
      (s) => s.line === FF_LINES.delta && s.message.includes("c→a"),
    )!;
    expect(delta.state.delta).toBe(1);
    expect(delta.message).toMatch(/δ = min\{f\(ac\), ε\} = min\{6, 1\} = 1/);
    const sub = steps[steps.indexOf(delta) + 1];
    expect(sub.line).toBe(FF_LINES.sub);
    expect(sub.message).toMatch(/f\(ac\) ← 6 − 1 = 5/);
    // další krok už patří následujícímu oblouku (a→d)
    expect(steps[steps.indexOf(delta) + 2].line).toBe(FF_LINES.delta);
  });
});

describe("obr. 14.3 – algoritmus v úzkých", () => {
  it("jen po směru hran s DFS: cesta zabs a pak už žádná – tok 1, maximum je 2 (varování)", () => {
    const n = net143();
    const steps = materialize(
      fordFulkerson(n, { search: "dfs", forwardOnly: true }),
    );
    expect(paths(n, steps)).toEqual([NET_14_3.stuckPath]);
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(NET_14_3.stuckValue);
    expect(last.outcome).toBe("warn");
    expect(last.message).toMatch(/maximální tok má velikost 2/i);
  });

  it("s rezervami (FordFulkerson, DFS): cesty zabs a zbas – tok 2", () => {
    const n = net143();
    const steps = materialize(fordFulkerson(n, { search: "dfs" }));
    expect(paths(n, steps)).toEqual([NET_14_3.stuckPath, NET_14_3.secondPath]);
    expect(steps[steps.length - 1].state.value).toBe(NET_14_3.max);
    expect(steps[steps.length - 1].outcome).toBeUndefined();
  });

  it("varianty mají vlastní pseudokód z knihy", () => {
    expect(PC_FF[0]).toMatch(/^Algoritmus FordFulkerson/);
    expect(PC_FF).toContain(
      "    ε ← min{r(e) | e ∈ P}   // spočítáme rezervu celé cesty",
    );
    expect(PC_FF_FORWARD.join("\n")).toMatch(/c\(e\) − f\(e\)/);
  });
});

describe("obr. 14.6 – největší párování", () => {
  it("maximální tok 4 je párování (každý vrchol nejvýš jednou) a konec ho vypíše", () => {
    const n = net146();
    const steps = materialize(fordFulkerson(n, { search: "bfs" }));
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(NET_14_6.size);
    const m = matchingOf(n, last.state.f)!;
    expect(m.pairs).toHaveLength(4);
    const used = m.pairs.flat();
    expect(new Set(used).size).toBe(used.length);
    expect(last.state.matching).toEqual(m.edges);
    expect(last.message).toMatch(/párování/);
  });
});

describe("okrajové případy", () => {
  it("stok nedosažitelný: tok 0 a řez kolem dosažitelných vrcholů", () => {
    const n = netFromText("z a 3\nb s 2");
    const steps = materialize(fordFulkerson(n, {}));
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(0);
    expect(last.message).toMatch(/^Hotovo/);
    expect(last.state.cut!.A.map((v) => lab(n, v))).toEqual(["z", "a"]);
  });

  it("vadná síť: jediný chybový krok", () => {
    const n = netFromText("z s 2.5");
    const steps = materialize(fordFulkerson(n, {}));
    expect(steps).toHaveLength(1);
    expect(steps[0].error).toBe(true);
    expect(steps[0].message).toMatch(/celé číslo/);
  });

  it("řádky kroků leží v pseudokódu", () => {
    const n = net142();
    for (const forwardOnly of [false, true])
      for (const s of materialize(fordFulkerson(n, { forwardOnly }))) {
        const pc = forwardOnly ? PC_FF_FORWARD : PC_FF;
        expect(s.line).not.toBeNull();
        expect(s.line!).toBeLessThan(pc.length);
      }
  });

  it("náhodné sítě: BFS i DFS dají stejný maximální tok rovný kapacitě řezu", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const names = ["z", "a", "b", "c", "d", "e", "s"];
      const lines: string[] = [];
      const seen = new Set<string>();
      for (let k = 0; k < 14; k++) {
        const u = names[Math.floor(r() * names.length)];
        const v = names[Math.floor(r() * names.length)];
        if (u === v || seen.has(`${u}>${v}`)) continue;
        seen.add(`${u}>${v}`);
        lines.push(`${u} ${v} ${1 + Math.floor(r() * 9)}`);
      }
      if (!seen.has("z>s")) lines.push("z s 0");
      const n = netFromText(lines.join("\n"));
      const vals = (["bfs", "dfs"] as const).map((search) => {
        const steps = materialize(fordFulkerson(n, { search }));
        const last = steps[steps.length - 1].state;
        expect(checkFlow(n, last.f)).toBeNull();
        const cap = last.cut!.edges.reduce((s, e) => s + n.graph.edges[e].w, 0);
        expect(cap, `seed ${seed}`).toBe(last.value);
        return last.value;
      });
      expect(vals[0], `seed ${seed}`).toBe(vals[1]);
    }
  });
});
