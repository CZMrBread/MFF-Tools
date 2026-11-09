// Nabídka operací stránky grafů (čistá funkce graphActionDefs): Příklady z knihy, Vytvořit, spuštění
// algoritmu s v₀, ceny hran, jiný algoritmus na tomtéž grafu.
import { describe, expect, it, vi } from "vitest";
import {
  goNote,
  initialMenu,
  menuReducer,
  prepareGo,
} from "../../core/actionModel";
import {
  bfs,
  dijkstra,
  GRAPH_ALGOS,
  jarnik,
  kruskal,
  topo,
} from "./algorithms";
import { parseGraph } from "./graph";
import { graphActionDefs, type GraphActionHandlers } from "./graphActions";
import { defaultPresetId, loadPresetGraph } from "./graphPageModel";
import { isBookPreset, presetOffered, PRESETS } from "./presets";

const handlers = (): GraphActionHandlers => ({
  loadPreset: vi.fn(),
  random: vi.fn(),
  empty: vi.fn(),
  run: vi.fn(),
  setWeights: vi.fn(),
  switchAlgo: vi.fn(),
});
const G = parseGraph("10 2 4\n2 1 5\n1 10 6", false, true);
const byId = (defs: ReturnType<typeof graphActionDefs>, id: string) =>
  defs.find((d) => d.id === id)!;

describe("graphActionDefs", () => {
  it("pořadí akcí: Vytvořit, Příklady z knihy, spuštění algoritmu, (ceny hran), jiný algoritmus", () => {
    const h = handlers();
    expect(graphActionDefs(dijkstra, G, 0, h).map((d) => d.id)).toEqual([
      "create",
      "book",
      "run",
      "weights",
      "algo",
    ]);
    const unweighted = parseGraph("a b", false, false);
    expect(graphActionDefs(bfs, unweighted, 0, h).map((d) => d.id)).toEqual([
      "create",
      "book",
      "run",
      "algo",
    ]);
  });

  it("Příklady z knihy: každá knižní předvolba je varianta bez argumentů (klik = načíst), s číslem obrázku a stranou", () => {
    const h = handlers();
    const book = byId(graphActionDefs(bfs, G, 0, h), "book");
    const ids = PRESETS.filter(isBookPreset).map((p) => p.id);
    expect(book.variants!.map((v) => v.id)).toEqual(ids);
    expect(book.variants!.every((v) => !v.args?.length)).toBe(true);
    expect(book.variants![0].label).toBe("Obr. 5.5 „Prasátko“");
    expect(book.variants![0].title).toBe(
      "Průvodce labyrintem algoritmů, s. 113",
    );
    book.run({}, "scc");
    expect(h.loadPreset).toHaveBeenCalledWith("scc");
  });

  it("Topologické uspořádání: výchozí je obr. 5.13, menší „DAG (plánování činností)“ zůstává v příkladech (vlastník 7. 11. 2026)", () => {
    expect(defaultPresetId(topo)).toBe("condensation");
    const h = handlers();
    const create = byId(graphActionDefs(topo, G, 0, h), "create");
    const dag = create.variants!.find((v) => v.id === "dag");
    expect(dag?.label).toBe("DAG (plánování činností)");
    create.run({}, "dag");
    expect(h.loadPreset).toHaveBeenCalledWith("dag");
  });

  it("Vytvořit: Náhodně (n, m), Prázdný a další příklady; Výchozí příklad je tlačítko Visualizeru, ne varianta", () => {
    const h = handlers();
    const create = byId(graphActionDefs(bfs, G, 0, h), "create");
    const v = create.variants!;
    expect(v.slice(0, 2).map((x) => x.label)).toEqual([
      "Náhodně",
      "Prázdný – nakreslit",
    ]);
    expect(v.map((x) => x.label)).not.toContain("Výchozí příklad");
    expect(v.slice(2).map((x) => x.id)).toEqual(
      PRESETS.filter((p) => !isBookPreset(p) && presetOffered(p, bfs.id)).map(
        (p) => p.id,
      ),
    );
    expect(v[0].args!.map((a) => a.name)).toEqual(["n", "m"]);
    create.run({ n: 5, m: 7 }, "random");
    expect(h.random).toHaveBeenCalledWith(5, 7);
    create.run({}, "empty");
    expect(h.empty).toHaveBeenCalled();
    create.run({}, "cycle");
    expect(h.loadPreset).toHaveBeenCalledWith("cycle");
  });

  it("Vytvořit nabízí jen předvolby určené pro daný algoritmus (UX-07: záporné hrany jen u Bellmana–Forda)", () => {
    const ids = (algoId: string) =>
      byId(
        graphActionDefs(
          GRAPH_ALGOS.find((a) => a.id === algoId)!,
          G,
          0,
          handlers(),
        ),
        "create",
      ).variants!.map((x) => x.id);
    expect(ids("dijkstra")).not.toContain("negative");
    expect(ids("dijkstra")).not.toContain("negative-cycle");
    expect(ids("bellman-ford")).toEqual(
      expect.arrayContaining(["negative", "negative-cycle"]),
    );
    expect(ids("topo")).not.toContain("bridges-root");
    expect(ids("bridges")).toContain("bridges-root");
    expect(ids("bridges")).not.toContain("scc-cross");
    expect(ids("scc")).toContain("scc-cross");
    expect(ids("boruvka")).toContain("equal-triangle");
    expect(ids("kruskal")).toContain("equal-triangle");
    expect(ids("bfs")).not.toContain("equal-triangle");
    // obecné předvolby zůstávají všem
    for (const a of GRAPH_ALGOS) expect(ids(a.id)).toContain("cycle");
  });

  it("Vytvořit ▸ Náhodně: m nad největší možný počet → poznámka (⚠ pod akcemi)", () => {
    const h = handlers();
    const defs = graphActionDefs(bfs, parseGraph("a b", false, false), 0, h);
    const create = byId(defs, "create");
    expect(create.notice?.({ n: 6, m: 40 }, "random")).toBe(
      "m omezeno na největší možný počet hran pro n = 6: m = 15.",
    );
    expect(create.notice?.({ n: 6, m: 7 }, "random")).toBeNull();
    expect(create.notice?.({}, "empty")).toBeNull();
  });

  it("spuštění: BFS(v₀) s nabídkou vrcholů seřazených jako sousedé a výchozím v₀; Enter (prepareGo) předá popisek", () => {
    const h = handlers();
    const defs = graphActionDefs(bfs, G, 0, h);
    const run = byId(defs, "run");
    expect(run.label).toBe("BFS(v₀)");
    // potvrzení akce = „Provést“ (výchozí text ActionMenu), ne „▶ Spustit“ – nic se nepřehrává samo
    expect(run.goLabel ?? "Provést").toBe("Provést");
    const v0 = run.args![0];
    expect(v0.kind === "choice" && v0.options.map((o) => o.value)).toEqual([
      "1",
      "2",
      "10",
    ]);
    // výchozí v₀ = aktuální počáteční vrchol (id 0 = „10“)
    let st = initialMenu(defs);
    let r = prepareGo(run, st);
    expect(r.ok && r.values).toEqual({ v0: "10" });
    st = menuReducer(st, { type: "text", name: "v0", text: "2" });
    r = prepareGo(run, st);
    expect(r.ok).toBe(true);
    if (r.ok) run.run(r.values, r.variant);
    expect(h.run).toHaveBeenCalledWith("2");
  });

  it("spuštění bez v₀ (Kruskal, topologické uspořádání) je akce bez argumentů; prázdný graf ji zakáže s důvodem", () => {
    const h = handlers();
    for (const algo of [kruskal, topo]) {
      const run = byId(graphActionDefs(algo, G, 0, h), "run");
      expect(run.label).toBe(algo.shortOpName ?? algo.opName);
      expect(run.args ?? []).toEqual([]);
      run.run({}, null);
      expect(h.run).toHaveBeenLastCalledWith(null);
    }
    const empty = { ...G, nodes: [], edges: [] };
    expect(
      byId(graphActionDefs(bfs, empty, 0, h), "run").disabledReason,
    ).toMatch(/^Graf je prázdný/);
  });

  it("ceny hran: seznam v pořadí hran (popsané v title), výchozí = dnešní ceny; bez hran zakázané", () => {
    const h = handlers();
    const w = byId(graphActionDefs(dijkstra, G, 0, h), "weights");
    expect(w.label).toBe("Délky hran");
    expect(w.title).toBe("Délky v pořadí hran 10–2, 2–1, 1–10");
    const arg = w.args![0];
    // text s desetinnou čárkou (čárka v seznamu by se pletla s oddělovačem) – čte ho parseWeights
    expect(arg.kind === "text" && arg.default).toBe("4 5 6");
    w.run({ w: "1 2 3" }, null);
    expect(h.setWeights).toHaveBeenCalledWith([1, 2, 3]);
    const noEdges = parseGraph("A", false, true);
    expect(
      byId(graphActionDefs(dijkstra, noEdges, 0, h), "weights").disabledReason,
    ).toBeTruthy();
  });

  it("terminologie: Dijkstra „Délky hran“, Jarník a Kruskal „Váhy hran“, ostatní „Ceny hran“", () => {
    const h = handlers();
    expect(byId(graphActionDefs(dijkstra, G, 0, h), "weights").label).toBe(
      "Délky hran",
    );
    for (const a of [jarnik, kruskal]) {
      const w = byId(graphActionDefs(a, G, 0, h), "weights");
      expect(w.label, a.id).toBe("Váhy hran");
      expect(w.args![0].label, a.id).toBe("váhy =");
    }
    expect(byId(graphActionDefs(bfs, G, 0, h), "weights").label).toBe(
      "Ceny hran",
    );
  });

  it("krátké popisky (lišta akcí na 1280 na jeden řádek), plné jméno v title", () => {
    const h = handlers();
    const DAG = parseGraph("a b", true, false);
    const run = byId(graphActionDefs(topo, DAG, 0, h), "run");
    expect(run.label).toBe("Topo. uspořádání");
    expect(run.title).toContain("Topologické uspořádání");
    const other = byId(graphActionDefs(bfs, G, 0, h), "algo");
    expect(other.label).toBe("Jiný alg.");
    expect(other.title).toContain("Jiný algoritmus");
  });

  it("jiný algoritmus: varianty = ostatní grafové algoritmy (klik = přepnout i s grafem)", () => {
    const h = handlers();
    const a = byId(graphActionDefs(bfs, G, 0, h), "algo");
    expect(a.variants!.map((v) => v.id)).toEqual(
      GRAPH_ALGOS.filter((x) => x.id !== "bfs").map((x) => x.id),
    );
    expect(a.variants!.every((v) => !v.args?.length)).toBe(true);
    a.run({}, "dfs");
    expect(h.switchAlgo).toHaveBeenCalledWith("dfs");
  });
});

describe("tipy stránky grafů odkazují na ovládání, které na stránce je", () => {
  it("žádná „předvolba“ ani „Náhodný vstup“; přepínač orientace jen přes „Upravit graf“", () => {
    for (const algo of GRAPH_ALGOS) {
      expect(algo.tip, algo.id).not.toMatch(/předvolb|Náhodný vstup|Postavit/);
      if (/škrtn/.test(algo.tip))
        expect(algo.tip, algo.id).toContain("Upravit graf");
    }
  });
});

describe("zvýraznění variant a přísné ceny (GRAPH-05, GRAPH-06)", () => {
  it("Příklady z knihy: zvýrazněná je jen právě načtená knižní předvolba; Jiný alg. nic", () => {
    const h = handlers();
    const book = PRESETS.filter(isBookPreset)[0];
    const g = loadPresetGraph(dijkstra, book.id).graph;
    const defs = graphActionDefs(dijkstra, g, 0, h);
    expect(byId(defs, "book").selectedVariant).toBe(book.id);
    expect(byId(defs, "algo").selectedVariant).toBeNull();
    // graf mimo knihu (výchozí Dijkstra): nic zvýrazněné
    const own = graphActionDefs(dijkstra, G, 0, h);
    expect(byId(own, "book").selectedVariant).toBeNull();
  });

  it("ceny hran: neplatné slovo („1 x 3“) zablokuje Provést s hláškou, graf se nezmění", () => {
    const h = handlers();
    const defs = graphActionDefs(dijkstra, G, 0, h);
    const w = byId(defs, "weights");
    let st = initialMenu(defs);
    st = menuReducer(st, { type: "text", name: "w", text: "1 x 3" });
    const r = prepareGo(w, st);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("x");
    expect(h.setWeights).not.toHaveBeenCalled();
  });

  it("ceny hran s desetinnou čárkou: výchozí text s čárkou, čárka i tečka na vstupu, „4,2,7“ zablokuje, přebytek ohlásí", () => {
    const h = handlers();
    const D = parseGraph("A B 2.5\nB C -1\nC A 4", false, true);
    const defs = graphActionDefs(dijkstra, D, 0, h);
    const w = byId(defs, "weights");
    const arg = w.args![0];
    expect(arg.kind === "text" && arg.default).toBe("2,5 −1 4");
    let st = initialMenu(defs);
    const go = (text: string) => {
      st = menuReducer(st, { type: "text", name: "w", text });
      return prepareGo(w, st);
    };
    const r = go("1,5 2.25 3");
    expect(r.ok).toBe(true);
    if (r.ok) w.run(r.values, r.variant);
    expect(h.setWeights).toHaveBeenLastCalledWith([1.5, 2.25, 3]);
    const bad = go("4,2,7");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/‚4,2,7‘ není číslo/);
    expect(go("1 2 3 4").ok).toBe(true);
    expect(goNote(w, st)).toBe("Použito prvních 3 z 4 čísel (jedno na hranu).");
  });

  it("pole cen je široké podle počtu hran (dnešní ceny se vejdou, ale ne přes celý řádek)", () => {
    const ch = (g: ReturnType<typeof parseGraph>) => {
      const arg = byId(graphActionDefs(kruskal, g, 0, handlers()), "weights")
        .args![0];
      const m = /^(\d+)ch$/.exec(arg.width ?? "");
      expect(m, arg.width).not.toBeNull();
      return { w: Number(m![1]), text: arg.kind === "text" ? arg.default : "" };
    };
    const grid = loadPresetGraph(kruskal, "mst3").graph;
    const big = ch(grid);
    expect(big.w).toBeGreaterThanOrEqual(big.text.length + 2);
    expect(big.w).toBeLessThanOrEqual(36);
    const small = ch(parseGraph("A B 1", false, true));
    expect(small.w).toBeGreaterThanOrEqual(10);
    expect(small.w).toBeLessThan(big.w);
  });
});
