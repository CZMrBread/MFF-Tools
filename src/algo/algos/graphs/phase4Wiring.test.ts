// Příprava fáze 4 (8. 11. 2026): čtyři nové grafové algoritmy (Bellman-Ford, Borůvka, mosty, SCC) – každý ve
// vlastním souboru, zapojený do GRAPH_ALGOS v pořadí knihy; obecná rozšíření GraphAlgorithm (výchozí
// předvolba, varianty s parametrem v=, šipky vlastních tříd, náhled) bez zásahu do sdílených souborů stopami.
import { describe, expect, it } from "vitest";
import type { GraphAlgorithm } from "./algoKit";
import { GRAPH_ALGOS } from "./algorithms";
import { bellmanFord } from "./bellmanFord";
import { boruvka } from "./boruvka";
import { bridges } from "./bridges";
import { scc } from "./scc";
import { weightTerm } from "./graphActions";
import { bellmanFordPresets } from "./bellmanFord.presets";
import { boruvkaPresets } from "./boruvka.presets";
import { bridgesPresets } from "./bridges.presets";
import { sccPresets } from "./scc.presets";
import {
  defaultPresetId,
  defaultVariant,
  variantFromParams,
  variantPseudocode,
  withVariantParam,
} from "./graphPageModel";
import { PRESETS } from "./presets";

const fake = (extra: Partial<GraphAlgorithm>): GraphAlgorithm => ({
  ...bellmanFord,
  id: "fake",
  ...extra,
});

describe("fáze 4 – zapojení grafových algoritmů", () => {
  it("GRAPH_ALGOS v pořadí oddílů knihy (5.2, 5.6, 5.7, 5.8, 5.10, 6.2, 6.3, 7.2, 7.3, 7.4)", () => {
    expect(GRAPH_ALGOS.map((a) => a.id)).toEqual([
      "bfs",
      "dfs",
      "bridges",
      "topo",
      "scc",
      "dijkstra",
      "bellman-ford",
      "jarnik",
      "boruvka",
      "kruskal",
    ]);
  });

  it("nové algoritmy jsou v GRAPH_ALGOS tytéž objekty jako ve vlastních souborech", () => {
    for (const a of [bellmanFord, boruvka, bridges, scc])
      expect(GRAPH_ALGOS).toContain(a);
  });

  it("předvolby stop jsou ve vlastních souborech a dostanou se do PRESETS (zatím prázdné)", () => {
    for (const list of [
      bellmanFordPresets,
      boruvkaPresets,
      bridgesPresets,
      sccPresets,
    ])
      for (const p of list) expect(PRESETS).toContain(p);
  });

  it("výchozí předvolba: GraphAlgorithm.defaultPreset má přednost; nové moduly mají knižní graf, kde ho kniha má", () => {
    expect(defaultPresetId(fake({ defaultPreset: "scc" }))).toBe("scc");
    expect(defaultPresetId(fake({ defaultPreset: undefined }))).toBe(
      "undirected10",
    );
    expect(defaultPresetId(bridges)).toBe("bridges"); // obr. 5.10
    expect(defaultPresetId(scc)).toBe("scc"); // obr. 5.13
    expect(defaultPresetId(boruvka)).toBe("mst3"); // obr. 7.5 = týž graf jako 7.2
  });

  it("ohodnocení hran podle knihy: Bellman-Ford délky, Borůvka váhy", () => {
    expect(weightTerm(bellmanFord).action).toBe("Délky hran");
    expect(weightTerm(boruvka).action).toBe("Váhy hran");
  });
});

describe("fáze 4 – varianty algoritmu (v= v odkazu, jen nové cesty)", () => {
  const algo = fake({
    variants: [
      { id: "queue", label: "s frontou" },
      { id: "phases", label: "po fázích", pseudocode: ["Fáze", "Relaxace"] },
    ],
  });
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it("algoritmus bez variant: žádná varianta, v= se ignoruje i nepíše", () => {
    const plain = fake({ variants: undefined });
    expect(defaultVariant(plain)).toBeNull();
    expect(variantFromParams(plain, params({ v: "x" }))).toEqual({
      variant: null,
      problem: null,
    });
    expect(withVariantParam(plain, { g: "a b" }, null)).toEqual({ g: "a b" });
  });

  it("výchozí = první varianta; v= z odkazu; neznámá → výchozí s hláškou", () => {
    expect(defaultVariant(algo)).toBe("queue");
    expect(variantFromParams(algo, params({}))).toEqual({
      variant: "queue",
      problem: null,
    });
    expect(variantFromParams(algo, params({ v: "phases" }))).toEqual({
      variant: "phases",
      problem: null,
    });
    const bad = variantFromParams(algo, params({ v: "nic" }));
    expect(bad.variant).toBe("queue");
    expect(bad.problem).toMatch(/Varianta „nic“ neexistuje/);
  });

  it("odkaz: výchozí varianta se nepíše, jiná jako v=; prázdný graf (null) zůstane null", () => {
    expect(withVariantParam(algo, {}, "queue")).toEqual({});
    expect(withVariantParam(algo, {}, "phases")).toEqual({ v: "phases" });
    expect(withVariantParam(algo, { g: "a b" }, "phases")).toEqual({
      g: "a b",
      v: "phases",
    });
    expect(withVariantParam(algo, null, "phases")).toBeNull();
  });

  it("pseudokód varianty (jinak pseudokód algoritmu)", () => {
    expect(variantPseudocode(algo, "phases")).toEqual(["Fáze", "Relaxace"]);
    expect(variantPseudocode(algo, "queue")).toBe(algo.pseudocode);
    expect(variantPseudocode(algo, null)).toBe(algo.pseudocode);
  });
});
