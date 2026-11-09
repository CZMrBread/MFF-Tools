/*
 * Toky proti nezávislé referenci (CR-3): Edmondsův–Karpův algoritmus na matici kapacit přímo v testu (ne
 * maxFlowValue z téhož modulu). Náhodné sítě do 10 vrcholů včetně nulových kapacit a protisměrných hran;
 * řez E(A, B) se ověřuje celý – z ∈ A, s ∉ A, hrany řezu jsou právě hrany A → B, nasycené, a hrany B → A
 * mají tok 0.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import { dinic } from "./dinic";
import { checkFlow, netFromText, type FlowNet } from "./flowNet";
import { fordFulkerson } from "./fordFulkerson";

/** Edmonds–Karp na matici kapacit (paralelní hrany se sčítají). */
function edmondsKarp(net: FlowNet): number {
  const n = net.graph.nodes.length;
  const c = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of net.graph.edges) c[e.u][e.v] += e.w;
  let total = 0;
  for (;;) {
    const prev = new Array<number>(n).fill(-1);
    prev[net.z] = net.z;
    const q = [net.z];
    while (q.length && prev[net.s] === -1) {
      const u = q.shift()!;
      for (let v = 0; v < n; v++)
        if (prev[v] === -1 && c[u][v] > 0) {
          prev[v] = u;
          q.push(v);
        }
    }
    if (prev[net.s] === -1) return total;
    let eps = Infinity;
    for (let v = net.s; v !== net.z; v = prev[v])
      eps = Math.min(eps, c[prev[v]][v]);
    for (let v = net.s; v !== net.z; v = prev[v]) {
      c[prev[v]][v] -= eps;
      c[v][prev[v]] += eps;
    }
    total += eps;
  }
}

function randomFlowNet(seed: number): FlowNet {
  const r = rng(seed);
  const size = 3 + Math.floor(r() * 8); // 3–10 vrcholů
  const names = ["z", ..."abcdefgh".slice(0, size - 2).split(""), "s"];
  const lines: string[] = [];
  const seen = new Set<string>();
  const m = Math.floor(r() * size * 2.5);
  for (let k = 0; k < m; k++) {
    const u = names[Math.floor(r() * names.length)];
    const v = names[Math.floor(r() * names.length)];
    if (u === v || seen.has(`${u}>${v}`)) continue;
    seen.add(`${u}>${v}`);
    // asi pětina hran s nulovou kapacitou
    const cap = r() < 0.2 ? 0 : 1 + Math.floor(r() * 9);
    lines.push(`${u} ${v} ${cap}`);
  }
  if (!seen.has("z>s")) lines.push("z s 0");
  return netFromText(lines.join("\n"));
}

describe("toky proti nezávislému Edmondsovi–Karpovi (CR-3)", () => {
  it("FordFulkerson (BFS i DFS) a Dinic: velikost toku, platný tok, celý certifikát řezu", () => {
    for (let seed = 1; seed <= 250; seed++) {
      const net = randomFlowNet(seed);
      const want = edmondsKarp(net);
      for (const search of ["bfs", "dfs"] as const) {
        const st = materialize(fordFulkerson(net, { search })).at(-1)!.state;
        expect(st.value, `seed ${seed} ${search}`).toBe(want);
        expect(checkFlow(net, st.f)).toBeNull();
        const cut = st.cut!;
        const A = new Set(cut.A);
        expect(A.has(net.z), `seed ${seed}`).toBe(true);
        expect(A.has(net.s), `seed ${seed}`).toBe(false);
        const across = net.graph.edges
          .filter((e) => A.has(e.u) && !A.has(e.v))
          .map((e) => e.id)
          .sort((a, b) => a - b);
        expect(
          [...cut.edges].sort((a, b) => a - b),
          `seed ${seed}`,
        ).toEqual(across);
        for (const e of net.graph.edges) {
          if (A.has(e.u) && !A.has(e.v)) expect(st.f[e.id]).toBe(e.w);
          if (!A.has(e.u) && A.has(e.v)) expect(st.f[e.id]).toBe(0);
        }
      }
      const d = materialize(dinic(net)).at(-1)!.state;
      expect(d.value, `seed ${seed} dinic`).toBe(want);
      expect(checkFlow(net, d.f)).toBeNull();
    }
  });
});
