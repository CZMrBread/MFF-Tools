import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { FIG_14_5, NET_14_2, NET_14_7 } from "./flow.fixtures";
import {
  checkFlow,
  netFromText,
  residualArcs,
  defaultEnds,
  type FlowNet,
} from "./flowNet";
import type { FlowState } from "./flowState";
import {
  BLOCK_LINES,
  CLEAN_LINES,
  dinic,
  DINIC_LINES,
  PC_BLOCK,
  PC_CLEAN,
  PC_DINIC,
} from "./dinic";
import { flowPresetById, presetNet } from "./flowPresets";
import { maxFlowValue, pathText } from "./fordFulkerson";
import { randomNet } from "./flowPageModel";

const caps = (o: Readonly<Record<string, number>>) =>
  Object.entries(o)
    .map(([k, c]) => `${k.replace(">", " ")} ${c}`)
    .join("\n");
const net142 = () => netFromText(caps(NET_14_2.capacities));
const net147 = (): FlowNet => {
  const { graph } = presetNet(flowPresetById("obr-14-7")!);
  return { graph, ...defaultEnds(graph) };
};
const lab = (n: FlowNet, v: number) => n.graph.nodes[v].label;
type S = Step<FlowState>;
const at = (steps: S[], proc: FlowState["proc"], line: number) =>
  steps.filter((s) => s.state.proc === proc && s.line === line);

describe("Dinic – obr. 14.7: čištění vrstevnaté sítě", () => {
  const n = net147();
  const steps = materialize(dinic(n));
  const arcs = residualArcs(n.graph);
  const key = (a: number) => `${lab(n, arcs[a].u)}>${lab(n, arcs[a].v)}`;

  it("vrstvy fáze 1 jsou sloupce obrázku", () => {
    const s = at(steps, "clean", CLEAN_LINES.layers)[0];
    const layers: string[][] = [];
    s.state.dist!.forEach((d, v) => {
      if (d === null) return;
      (layers[d] ??= []).push(lab(n, v));
    });
    expect(layers.map((l) => [...l].sort())).toEqual(
      NET_14_7.layers.map((l) => [...l].sort()),
    );
    expect(s.state.ell).toBe(5);
  });

  it("po vyčištění zůstanou plné hrany, šedivé zmizí v ř. 3 a tečkované jako slepé uličky", () => {
    const done = at(steps, "clean", CLEAN_LINES.loop)[0].state;
    const by = (fate: string) =>
      Object.entries(done.fate)
        .filter(([, f]) => f === fate)
        .map(([a]) => key(Number(a)))
        .sort();
    expect(by("live")).toEqual([...NET_14_7.solid].sort());
    expect(by("gray")).toEqual([...NET_14_7.gray].sort());
    expect(by("dead")).toEqual([...NET_14_7.dotted].sort());
    // smazané slepé uličky: d, g, i, m, n
    expect(done.gone.map((v) => lab(n, v)).sort()).toEqual([
      "d",
      "g",
      "i",
      "m",
      "n",
    ]);
  });

  it("fronta F začíná vrcholy s nulovým výstupním stupněm (g, i, m, n) a d přibude, když zmizí g", () => {
    const q = at(steps, "clean", CLEAN_LINES.queue)[0].state.queue!;
    expect(q.map((v) => lab(n, v))).toEqual(["g", "i", "m", "n"]);
    const pushes = at(steps, "clean", CLEAN_LINES.push);
    expect(pushes[0].message).toMatch(/\bd\b/);
  });

  it("doplněné kapacity: tři fáze s ℓ = 5, 6, 7; fáze 2 použije šedivou k→l (uvnitř vrstvy), fáze 3 šedivou e→b (dozadu)", () => {
    const ells = at(steps, "dinic", DINIC_LINES.ell).map((s) => s.state.ell);
    expect(ells).toEqual([5, 6, 7]);
    const uses = (phase: number, k: string) =>
      at(steps, "block", BLOCK_LINES.path)
        .filter((s) => s.state.phase === phase && s.state.path.length)
        .some((s) => s.state.path.some((a) => key(a) === k));
    expect(uses(2, "k>l")).toBe(true);
    expect(uses(3, "e>b")).toBe(true);
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(6);
    expect(last.state.value).toBe(maxFlowValue(n));
  });
});

describe("Dinic – obr. 14.2", () => {
  const n = net142();
  const steps = materialize(dinic(n));
  const arcs = residualArcs(n.graph);

  it("fáze 1: ℓ = 3, blokující tok 16 po cestách zacs 7, zads 3, zbcs 3, zbds 3; fáze 2: ℓ = 5, zbcads + 2", () => {
    expect(at(steps, "dinic", DINIC_LINES.ell).map((s) => s.state.ell)).toEqual(
      [3, 5],
    );
    const paths = at(steps, "block", BLOCK_LINES.eps).map(
      (s) =>
        `${s.state.phase}:${pathText(n.graph, arcs, s.state.path)} ${s.state.eps}`,
    );
    expect(paths).toEqual([
      "1:zacs 7",
      "1:zads 3",
      "1:zbcs 3",
      "1:zbds 3",
      "2:zbcads 2",
    ]);
    const outs = at(steps, "block", BLOCK_LINES.output).map((s) => s.message);
    expect(outs[0]).toMatch(/\|g\| = 16/);
    expect(outs[1]).toMatch(/\|g\| = 2/);
  });

  it("konec: maximální tok 18, řez A = {z, a, b, c}, poslední krok Hotovo na řádku Výstup", () => {
    const last = steps[steps.length - 1];
    expect(last.state.value).toBe(FIG_14_5.value);
    expect(last.state.cut!.A.map((v) => lab(n, v))).toEqual(FIG_14_5.cutA);
    expect(last.message).toMatch(/^Hotovo/);
    expect(last.message).toMatch(/2 fáz/);
    expect(last.state.proc).toBe("dinic");
    expect(last.line).toBe(DINIC_LINES.output);
  });

  it("každý krok ukazuje na řádek pseudokódu své procedury", () => {
    const pc = { dinic: PC_DINIC, clean: PC_CLEAN, block: PC_BLOCK };
    for (const s of steps) {
      const lines = pc[s.state.proc as keyof typeof pc];
      expect(lines, s.state.proc).toBeDefined();
      expect(s.line).not.toBeNull();
      expect(s.line!).toBeLessThan(lines.length);
    }
  });

  it("f je tok na začátku každé fáze a po každém zlepšení", () => {
    for (const s of steps)
      if (
        s.state.proc === "dinic" &&
        (s.line === DINIC_LINES.residual || s.line === DINIC_LINES.improve)
      )
        expect(checkFlow(n, s.state.f)).toBeNull();
  });

  it("výstup BlokujícíTok je blokující: v síti R nevede cesta po nenasycených hranách", () => {
    for (const s of at(steps, "block", BLOCK_LINES.output)) {
      const { g, r } = s.state;
      // hrany vrstevnaté sítě po vyčištění = živé + nasycené + smazané slepé uličky ve fázi blokování;
      // cesta ze z do s po vrstvách s g < r nesmí existovat
      const dist = s.state.dist!;
      const ok = (a: number) =>
        r![a] > 0 &&
        dist[arcs[a].u] !== null &&
        dist[arcs[a].v] === dist[arcs[a].u]! + 1 &&
        dist[arcs[a].v]! <= s.state.ell! &&
        g![a] < r![a];
      const seen = new Set([n.z]);
      const q = [n.z];
      while (q.length) {
        const u = q.shift()!;
        for (const a of arcs)
          if (a.u === u && ok(a.id) && !seen.has(a.v)) {
            seen.add(a.v);
            q.push(a.v);
          }
      }
      expect(seen.has(n.s)).toBe(false);
    }
  });
});

describe("Dinic – obecně", () => {
  it("na náhodných sítích stejný tok jako FordFulkerson a nejvýš n fází", () => {
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
      const steps = materialize(dinic(n));
      const last = steps[steps.length - 1].state;
      expect(last.value, `seed ${seed}`).toBe(maxFlowValue(n));
      expect(checkFlow(n, last.f)).toBeNull();
      expect(last.phase).toBeLessThanOrEqual(n.graph.nodes.length + 1);
    }
  });

  it("náhodné sítě ze stránky (randomNet): Dinic doběhne se stejným tokem jako FordFulkerson", () => {
    for (let seed = 1; seed <= 300; seed += 7)
      for (const [nn, mm] of [
        [8, 12],
        [5, 6],
        [14, 30],
        [20, 60],
      ]) {
        const g = randomNet(nn, mm, seed);
        const n = { graph: g, ...defaultEnds(g) };
        const steps = materialize(dinic(n));
        expect(steps.at(-1)!.state.value, `seed ${seed}`).toBe(maxFlowValue(n));
      }
  });

  it("vadná síť: jediný chybový krok", () => {
    const steps = materialize(dinic(netFromText("z z 1")));
    expect(steps).toHaveLength(1);
    expect(steps[0].error).toBe(true);
  });
});
