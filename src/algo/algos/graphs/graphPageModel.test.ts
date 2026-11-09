import { describe, expect, it } from "vitest";
import {
  bfs,
  dfs,
  dijkstra,
  GRAPH_ALGOS,
  jarnik,
  kruskal,
  topo,
  type GraphAlgorithm,
} from "./algorithms";
import {
  parseGraph,
  parseGraphInput,
  randomEdgeRange,
  type Graph,
} from "./graph";
import {
  buildGraph,
  defaultPresetId,
  defaultSpec,
  effectiveSpec,
  keepRowVisible,
  legendForStyle,
  loadPresetGraph,
  opTitleFor,
  pageParams,
  pageStartLabel,
  presetIndex,
  presetMatch,
  randomEdgeNote,
  randomPageGraph,
  sourceCaption,
  specFromParams,
  specToParams,
  startByLabel,
  startIndex,
  startLabels,
  formatWeights,
  parseWeights,
  weightsOrder,
  withWeights,
} from "./graphPageModel";
import { presetById, presetGraph, PRESETS } from "./presets";

const params = (o: Record<string, string>) => new URLSearchParams(o);

describe("graphPageModel", () => {
  it("výchozí příklad: platný, neprázdný, odpovídá předvolbě a vynucenému typu grafu", () => {
    for (const algo of GRAPH_ALGOS) {
      const s = defaultSpec(algo);
      const parsed = parseGraphInput(s.text, s.directed, s.weighted);
      expect(parsed.errors, algo.id).toEqual([]);
      expect(parsed.graph.nodes.length, algo.id).toBeGreaterThan(1);
      if (algo.directed !== undefined) expect(s.directed).toBe(algo.directed);
      if (algo.weighted !== undefined) expect(s.weighted).toBe(algo.weighted);
      expect(presetIndex(algo, s), algo.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("presetIndex: přesná shoda textu i typu, jinak −1; vynucený typ se bere v úvahu", () => {
    const p = PRESETS[1];
    expect(
      presetIndex(bfs, { text: p.text, directed: false, weighted: false }),
    ).toBe(1);
    expect(
      presetIndex(bfs, { text: p.text, directed: true, weighted: false }),
    ).toBe(-1);
    expect(
      presetIndex(bfs, {
        text: p.text + "\n11 12",
        directed: false,
        weighted: false,
      }),
    ).toBe(-1);
    // topo vynucuje orientovaný graf – předvolba „Neorientovaný graf“ je tam pořád „tatáž“
    expect(
      presetIndex(topo, { text: p.text, directed: false, weighted: false }),
    ).toBe(1);
  });

  it("odkaz: tam a zpět zachová graf, typ i v₀; výchozí příklad adresu vyčistí", () => {
    for (const algo of GRAPH_ALGOS) {
      expect(specToParams(algo, defaultSpec(algo), null), algo.id).toEqual({});
      const spec = effectiveSpec(algo, {
        text: "p q 3\nq r 1\nr s 2",
        directed: true,
        weighted: true,
      });
      const out = specToParams(algo, spec, "q");
      const back = specFromParams(algo, params(out));
      expect(back.problem).toBeNull();
      expect(back.spec).toEqual(spec);
      expect(back.startLabel).toBe(algo.needsStart ? "q" : null);
      // vynucený typ se do adresy nepíše
      expect("d" in out, algo.id).toBe(algo.directed === undefined);
      expect("w" in out, algo.id).toBe(algo.weighted === undefined);
    }
    // výchozí graf s jiným v₀ adresu potřebuje (jen u algoritmů se startem)
    expect(specToParams(dijkstra, defaultSpec(dijkstra), "C")).toMatchObject({
      s: "C",
    });
    expect(specToParams(kruskal, defaultSpec(kruskal), "C")).toEqual({});
  });

  it("odkaz: chybějící, prázdný nebo vadný graf → výchozí příklad; neznámé příznaky → typ jako bez příznaku", () => {
    expect(specFromParams(bfs, params({}))).toEqual({
      spec: defaultSpec(bfs),
      startLabel: null,
      problem: null,
    });
    expect(specFromParams(bfs, params({ g: "   " })).spec).toEqual(
      defaultSpec(bfs),
    );
    const bad = specFromParams(dijkstra, params({ g: "A B x", s: "B" }));
    expect(bad.spec).toEqual(defaultSpec(dijkstra));
    expect(bad.startLabel).toBeNull();
    expect(bad.problem).toMatch(
      /^Graf z odkazu nešel použít \(Řádek 1: cena „x“ není číslo\.\)/,
    );
    // neznámý příznak = jako chybějící: typ staré verze (BFS neorientovaný), viz níže
    expect(
      specFromParams(bfs, params({ g: "a b", d: "ano" })).spec.directed,
    ).toBe(false);
    // vynucený typ grafu nejde z adresy přebít
    expect(
      specFromParams(topo, params({ g: "a b", d: "0" })).spec.directed,
    ).toBe(true);
  });

  it("startByLabel a opTitleFor: v₀ podle názvu (jinak první vrchol), název operace s argumentem", () => {
    const g = parseGraph("x y\ny z", false, false);
    expect(startByLabel(g, "z")).toBe(2);
    expect(startByLabel(g, "neni")).toBe(0);
    expect(startByLabel(g, null)).toBe(0);
    expect(opTitleFor(bfs, g, 1)).toBe("BFS(v₀ = y)");
    expect(opTitleFor(kruskal, g, 1)).toBe("Kruskal");
    expect(opTitleFor(topo, g, 0)).toBe("Topologické uspořádání");
  });
});

describe("graphPageModel – legenda ve stylu knihy", () => {
  it("styl knihy: zpětná, dopředná a příčná hrana se v legendě sloučí do jedné tečkované „nestromové“ položky", () => {
    const items = [
      { cls: "sw-open", label: "otevřený" },
      { cls: "sw-tree", label: "stromová hrana", shape: "line" as const },
      { cls: "sw-back", label: "zpětná hrana", shape: "line-dashed" as const },
      {
        cls: "sw-forward",
        label: "dopředná hrana",
        shape: "line-dashed" as const,
      },
      { cls: "sw-cross", label: "příčná hrana", shape: "line-dashed" as const },
    ];
    expect(legendForStyle(items, "color")).toEqual(items);
    const book = legendForStyle(items, "book");
    expect(book.map((l) => l.cls)).toEqual(["sw-open", "sw-tree", "sw-seen"]);
    expect(book[2].label).toMatch(
      /^nestromová hrana .*zpětná, dopředná, příčná/,
    );
    expect(book[2].shape).toBe("line-dashed");
    // bez nestromových hran se nic nepřidá
    expect(legendForStyle(items.slice(0, 2), "book")).toEqual(
      items.slice(0, 2),
    );
  });
});

describe("graphPageModel – knižní předvolby", () => {
  const pigText = "0 1\n0 3\n0 9\n1 2\n1 3\n3 4\n5 3\n6 0\n6 3\n6 7\n8 6\n9 6";
  /** struktura grafu bez souřadnic */
  const shape = (g: Graph) => ({
    nodes: g.nodes.map((n) => [n.id, n.label]),
    edges: g.edges.map((e) => [e.u, e.v, e.w]),
    directed: g.directed,
    weighted: g.weighted,
  });

  it("výchozí předvolba: DFS i BFS = prasátko, Jarník a Kruskal = obr. 7.2, topologické uspořádání = graf komponent z obr. 5.13", () => {
    const pick = (a: GraphAlgorithm) =>
      PRESETS[presetIndex(a, defaultSpec(a))].id;
    expect(pick(dfs)).toBe("pig");
    expect(pick(bfs)).toBe("pig");
    expect(pick(jarnik)).toBe("mst3");
    expect(pick(kruskal)).toBe("mst3");
    expect(pick(topo)).toBe("condensation");
    // výchozí graf stránky je nakreslený podle knihy
    const g = buildGraph(defaultSpec(bfs)).graph;
    expect(g.aspect).toBeCloseTo(11 / 7, 3);
    expect(g.nodes.find((n) => n.label === "2")).toMatchObject({ x: 0, y: 0 });
  });

  it("odkaz z dnešního buildu (prasátko na BFS) dá stejný graf – a nově v kresbě z knihy", () => {
    // tvar adresy, který dnes píše specToParams (#/graph/bfs?g=…&d=1&w=0)
    const url = `g=${encodeURIComponent(pigText)}&d=1&w=0&s=3`;
    const st = specFromParams(bfs, new URLSearchParams(url));
    expect(st.problem).toBeNull();
    expect(st.startLabel).toBe("3");
    const g = buildGraph(st.spec).graph;
    expect(shape(g)).toEqual(shape(parseGraph(pigText, true, false)));
    expect(g.aspect).toBeCloseTo(11 / 7, 3);
  });

  it("odkaz z dnešního buildu s vlastním grafem dá přesně tentýž graf i rozložení jako dřív", () => {
    const text = "A B 4\nA C 2\nB C 5\nB D 10\nC E 3";
    const url = `g=${encodeURIComponent(text)}&s=C`;
    for (const algo of [dijkstra, jarnik]) {
      const st = specFromParams(algo, new URLSearchParams(url));
      expect(st.startLabel).toBe("C");
      const g = buildGraph(st.spec).graph;
      expect(g).toEqual(parseGraph(text, false, true));
    }
  });

  it("upravené prasátko: odkaz nese p=pig, takže knižní souřadnice přežijí i znovuotevření stránky", () => {
    const text = pigText + "\n9 10";
    const spec = { text, directed: true, weighted: false, layout: "pig" };
    const out = specToParams(dfs, spec, null);
    expect(out).toMatchObject({ g: text, p: "pig" });
    const back = specFromParams(dfs, new URLSearchParams(out));
    expect(back.spec.layout).toBe("pig");
    const g = buildGraph(back.spec).graph;
    expect(g.nodes.find((n) => n.label === "2")).toMatchObject({ x: 0, y: 0 });
    expect(g.aspect).toBeCloseTo(11 / 7, 3);
    // neznámá předloha se ignoruje
    expect(
      specFromParams(dfs, new URLSearchParams({ g: text, p: "nic" })).spec
        .layout,
    ).toBeUndefined();
    // přesná knižní předvolba odkaz s p nepotřebuje
    expect(
      specToParams(
        bfs,
        { text: pigText, directed: true, weighted: false, layout: "pig" },
        null,
      ),
    ).toEqual({});
  });

  it("buildGraph s předchozím grafem: přetažené i knižní souřadnice zůstanou vrcholům se stejným jménem", () => {
    const first = buildGraph(defaultSpec(dfs)).graph;
    const moved = {
      ...first,
      nodes: first.nodes.map((n) =>
        n.label === "4" ? { ...n, x: 0.5, y: 0.5 } : n,
      ),
    };
    const next = buildGraph(
      { text: pigText + "\n4 7", directed: true, weighted: false },
      moved,
    ).graph;
    expect(next.nodes.find((n) => n.label === "4")).toMatchObject({
      x: 0.5,
      y: 0.5,
    });
    expect(next.nodes.find((n) => n.label === "2")).toMatchObject({
      x: 0,
      y: 0,
    });
  });
});

describe("graphPageModel – editor na plátně (krok D2)", () => {
  const pig = () => loadPresetGraph(bfs, "pig");

  it("loadPresetGraph: knižní předvolba = přesně kresba z knihy a předloha p; textová silově, bez předlohy", () => {
    const { graph, layout } = pig();
    expect(layout).toBe("pig");
    expect(graph).toEqual(presetGraph(presetById("pig")!));
    const w = loadPresetGraph(dijkstra, "weighted");
    expect(w.layout).toBeUndefined();
    expect(w.graph.aspect).toBeUndefined();
    expect(w.graph.weighted).toBe(true);
    // vynucený typ: topologické uspořádání dostane i neorientovanou předvolbu jako orientovanou
    expect(loadPresetGraph(topo, "undirected10").graph.directed).toBe(true);
    // Kruskal: knižní mřížka i s cenami a souřadnicemi z obr. 7.2
    const mst = loadPresetGraph(kruskal, "mst3").graph;
    expect(mst.aspect).toBeDefined();
    expect(mst.edges.map((e) => e.w)).toEqual([
      10, 6, 7, 8, 2, 5, 4, 0, 3, 9, 1, 11,
    ]);
    expect(() => loadPresetGraph(bfs, "neni")).toThrow();
  });

  it("presetMatch: knižní i textová předvolba se pozná podle struktury (souřadnice nehrají roli); úprava → −1", () => {
    const { graph } = pig();
    expect(PRESETS[presetMatch(bfs, graph)].id).toBe("pig");
    const moved = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, x: 0.5 })),
    };
    expect(PRESETS[presetMatch(bfs, moved)].id).toBe("pig");
    expect(presetMatch(bfs, { ...graph, edges: graph.edges.slice(1) })).toBe(
      -1,
    );
    expect(presetMatch(bfs, { ...graph, directed: false })).toBe(-1);
    // neohodnocený graf: zapomenuté ceny po vypnutí „ohodnocený“ shodu nekazí
    expect(
      PRESETS[
        presetMatch(bfs, {
          ...graph,
          edges: graph.edges.map((e) => ({ ...e, w: 7 })),
        })
      ].id,
    ).toBe("pig");
  });

  it("pageParams: výchozí příklad adresu vyčistí, předvolba nese svůj text (jako dřívější odkazy), úprava text z kresby + p", () => {
    for (const algo of GRAPH_ALGOS) {
      const g = buildGraph(defaultSpec(algo)).graph;
      expect(pageParams(algo, g, null, undefined), algo.id).toEqual({});
      // výchozí v₀ = start knižní předvolby (Jarník: E), jinak první vrchol
      const layout = presetById(defaultPresetId(algo))?.id;
      expect(
        pageParams(
          algo,
          g,
          pageStartLabel(algo, g, layout, null) ?? g.nodes[0].label,
          layout,
        ),
        algo.id,
      ).toEqual({});
    }
    const { graph } = pig();
    expect(pageParams(bfs, graph, "3", "pig")).toEqual({
      g: presetById("pig")!.text,
      d: "1",
      w: "0",
      s: "3",
    });
    const edited = { ...graph, edges: graph.edges.slice(0, 2) };
    const out = pageParams(dfs, edited, null, "pig");
    expect(out).toMatchObject({
      // izolované vrcholy na konci v pořadí vrcholů grafu
      g: "0 1\n0 3\n9\n2\n4\n5\n6\n7\n8",
      p: "pig",
    });
    // tam a zpět: stejná struktura i knižní souřadnice
    const back = specFromParams(dfs, new URLSearchParams(out!));
    const rebuilt = buildGraph(back.spec).graph;
    expect(
      rebuilt.edges.map((e) => [
        rebuilt.nodes[e.u].label,
        rebuilt.nodes[e.v].label,
      ]),
    ).toEqual([
      ["0", "1"],
      ["0", "3"],
    ]);
    expect(rebuilt.nodes.find((n) => n.label === "2")).toMatchObject({
      x: 0,
      y: 0,
    });
    // prázdný graf adresu nemá (otevřel by se výchozí příklad)
    expect(
      pageParams(bfs, { ...graph, nodes: [], edges: [] }, null, "pig"),
    ).toBeNull();
  });

  it("sourceCaption: knižní předvolba s číslem strany, upravená s dovětkem, vlastní graf bez popisku", () => {
    const { graph } = pig();
    expect(sourceCaption(bfs, graph, "pig")).toBe(
      "Obr. 5.5 „Prasátko“ – Průvodce labyrintem algoritmů, s. 113",
    );
    expect(
      sourceCaption(bfs, { ...graph, edges: graph.edges.slice(1) }, "pig"),
    ).toBe(
      "Obr. 5.5 „Prasátko“ – Průvodce labyrintem algoritmů, s. 113 (upraveno)",
    );
    expect(
      sourceCaption(bfs, { ...graph, aspect: undefined }, "pig"),
    ).toBeNull();
    expect(sourceCaption(bfs, graph, undefined)).toBeNull();
    const mst = loadPresetGraph(jarnik, "mst3");
    expect(sourceCaption(jarnik, mst.graph, mst.layout)).toMatch(
      /^Obr\. 7\.2 .*s\. \d+\. .+/,
    );
  });

  it("startLabels: popisky vrcholů seřazené jako sousedé (čísla podle velikosti)", () => {
    const g = parseGraph("10 2\n2 1\nb a", false, false);
    expect(startLabels(g)).toEqual(["1", "2", "10", "a", "b"]);
    expect(startIndex(g, "b")).toBe(3); // id vrcholu, ne pořadí v nabídce
    expect(startIndex(g, "neni")).toBe(0);
    expect(startIndex(g, null)).toBe(0);
  });

  it("withWeights: ceny v pořadí hran, chybějící zůstanou, graf se nemutuje; weightsOrder popíše pořadí", () => {
    const g = parseGraph("A B 4\nB C 5\nC A 6", false, true);
    const next = withWeights(g, [1, 2]);
    expect(next.edges.map((e) => e.w)).toEqual([1, 2, 6]);
    expect(g.edges.map((e) => e.w)).toEqual([4, 5, 6]);
    expect(next.weighted).toBe(true);
    expect(weightsOrder(g)).toBe("A–B, B–C, C–A");
    expect(weightsOrder({ ...g, directed: true })).toBe("A→B, B→C, C→A");
  });

  it("formatWeights: ceny pro pole „Ceny hran“ s desetinnou čárkou a typografickým minus, oddělené mezerou", () => {
    expect(formatWeights([4, 2.5, -1, 0.1 + 0.2, -0])).toBe("4 2,5 −1 0,3 0");
    expect(formatWeights([])).toBe("");
  });

  it("parseWeights: desetinná čárka i tečka, oddělovač mezera / středník / čárka s mezerou; pořadí hran se neposune", () => {
    const ok = (text: string, max = 5) => {
      const r = parseWeights(text, max);
      expect(r.error, text).toBeNull();
      return r.values;
    };
    expect(ok("4 2,5 −1")).toEqual([4, 2.5, -1]);
    expect(ok("4 2.5 7")).toEqual([4, 2.5, 7]);
    // dřívější zápis pole („4, 2, 7“) dál platí: čárka s mezerou za ní odděluje
    expect(ok("4, 2, 7")).toEqual([4, 2, 7]);
    expect(ok("4; 2,5;7")).toEqual([4, 2.5, 7]);
    expect(ok("váhy = 4 2,5")).toEqual([4, 2.5]);
    expect(ok("  -0  3,  ")).toEqual([0, 3]);
    expect(ok("−9999 9999")).toEqual([-9999, 9999]);
    expect(ok(formatWeights([1.25, -3, 0.5]))).toEqual([1.25, -3, 0.5]);
    expect(parseWeights("4 2,5", 5).note).toBeNull();
  });

  it("parseWeights: neplatné slovo, dvě desetinné čárky, číslo mimo rozsah i prázdný vstup = chyba (Provést zablokované)", () => {
    const err = (text: string) => {
      const r = parseWeights(text, 3);
      expect(r.error, text).not.toBeNull();
      return r.error!;
    };
    expect(err("1 x 3")).toMatch(/‚x‘ není číslo/);
    // „4,2,7“ není tři čísla, ale nečitelné číslo – hláška poradí mezeru
    expect(err("4,2,7")).toMatch(/‚4,2,7‘ není číslo.*mezer/);
    expect(err("1e3")).toMatch(/není číslo/);
    expect(err("10000")).toMatch(/‚10000‘ je mimo rozsah/);
    expect(err("10000")).toContain("od −9999 do 9999");
    expect(err("   ")).toMatch(/Zadejte/);
    expect(err("váhy =")).toMatch(/Zadejte/);
  });

  it("parseWeights: víc čísel než hran – použijí se první, poznámka to řekne", () => {
    const r = parseWeights("1 2,5 3 4", 3);
    expect(r.error).toBeNull();
    expect(r.values).toEqual([1, 2.5, 3]);
    expect(r.note).toBe("Použito prvních 3 z 4 čísel (jedno na hranu).");
  });

  it("randomPageGraph: n vrcholů, počet hran se ořízne do povoleného rozsahu, typ podle grafu i algoritmu", () => {
    const g = randomPageGraph(
      topo,
      { directed: false, weighted: false },
      6,
      999,
      1,
    );
    expect(g.nodes).toHaveLength(6);
    expect(g.directed).toBe(true);
    expect(g.edges.length).toBe(randomEdgeRange(6, true, true).max);
    const w = randomPageGraph(
      dijkstra,
      { directed: false, weighted: false },
      5,
      0,
      2,
    );
    expect(w.weighted).toBe(true);
    expect(w.edges.length).toBe(randomEdgeRange(5, false, false).min);
  });
});

describe("počáteční vrchol podle knihy (BookPreset.start)", () => {
  it('initial start for jarnik = "E" (obr. 7.2 začíná ve středu E), Kruskal start nemá', () => {
    expect(presetById("mst3")).toMatchObject({ start: "E" });
    const { graph, layout } = loadPresetGraph(jarnik, defaultPresetId(jarnik));
    expect(layout).toBe("mst3");
    expect(pageStartLabel(jarnik, graph, layout, null)).toBe("E");
    expect(opTitleFor(jarnik, graph, startIndex(graph, "E"))).toBe(
      "Jarník(v₀ = E)",
    );
    // výslovná volba má přednost
    expect(pageStartLabel(jarnik, graph, layout, "A")).toBe("A");
    // algoritmus bez v₀ a graf bez knižní předlohy
    expect(pageStartLabel(kruskal, graph, layout, null)).toBeNull();
    expect(pageStartLabel(jarnik, graph, undefined, null)).toBeNull();
  });

  it("prasátko začíná v 0 (obr. 5.8, 5.9)", () => {
    const { graph, layout } = loadPresetGraph(bfs, "pig");
    expect(pageStartLabel(bfs, graph, layout, null)).toBe("0");
  });

  it("odkaz zůstane čistý, když v₀ = start předvolby; jiný v₀ se zapíše", () => {
    const { graph, layout } = loadPresetGraph(jarnik, "mst3");
    expect(pageParams(jarnik, graph, "E", layout)).toEqual({});
    expect(pageParams(jarnik, graph, "A", layout)).toMatchObject({ s: "A" });
    // a naopak: odkaz bez s= otevře předvolbu z E
    const back = specFromParams(jarnik, params({}));
    expect(back.startLabel).toBeNull();
  });
});

describe("odkaz s g= bez d=/w= (ručně psaný): typ grafu jako ve staré verzi", () => {
  it("BFS: neorientovaný (dřívější výchozí), i když je dnes výchozí orientované prasátko", () => {
    const st = specFromParams(bfs, params({ g: "x y\ny z" }));
    expect(st.spec.directed).toBe(false);
    expect(st.spec.weighted).toBe(false);
    // výslovné d=1 platí
    expect(
      specFromParams(bfs, params({ g: "x y", d: "1" })).spec.directed,
    ).toBe(true);
  });

  it("ostatní algoritmy: stejné typy jako dřív (DFS orientovaný, kostry a Dijkstra ohodnocené neorientované)", () => {
    const of = (algo: GraphAlgorithm) => {
      const s = specFromParams(algo, params({ g: "x y 2" })).spec;
      return [s.directed, s.weighted];
    };
    expect(of(dfs)).toEqual([true, false]);
    expect(of(topo)).toEqual([true, false]);
    expect(of(dijkstra)).toEqual([false, true]);
    expect(of(jarnik)).toEqual([false, true]);
    expect(of(kruskal)).toEqual([false, true]);
  });
});

describe("hlášky ke vstupu (GRAPH-11)", () => {
  it("neznámé s= v odkazu: hláška nad plátnem, začíná se z prvního vrcholu", () => {
    const r = specFromParams(bfs, params({ g: "1 2\n2 3", s: "Z" }));
    expect(r.startLabel).toBeNull();
    expect(r.problem).toBe("Vrchol Z v grafu není – začínáme z 1.");
    // výchozí graf (bez g=) a Jarník: začíná se jako v knize z E
    expect(specFromParams(jarnik, params({ s: "Q" })).problem).toBe(
      "Vrchol Q v grafu není – začínáme z E.",
    );
    // známé s= i algoritmus bez v₀: žádná hláška
    expect(
      specFromParams(bfs, params({ g: "1 2", s: "2" })).problem,
    ).toBeNull();
    expect(
      specFromParams(topo, params({ g: "1 2", s: "Z" })).problem,
    ).toBeNull();
  });

  it("Náhodně: m mimo rozsah → poznámka, na kolik se m upravilo", () => {
    expect(
      randomEdgeNote(bfs, { directed: false, weighted: false }, 6, 40),
    ).toBe("m omezeno na největší možný počet hran pro n = 6: m = 15.");
    expect(
      randomEdgeNote(bfs, { directed: false, weighted: false }, 6, 2),
    ).toBe("m zvýšeno na n − 1 = 5 (náhodný graf je souvislý).");
    expect(
      randomEdgeNote(bfs, { directed: false, weighted: false }, 6, 7),
    ).toBeNull();
  });
});

describe("keepRowVisible – zvýrazněný řádek tabulky v záběru panelu výsledku (E5)", () => {
  const panel = { top: 100, bottom: 500 };
  it("řádek v záběru → posun beze změny", () => {
    expect(keepRowVisible(panel, { top: 200, bottom: 228 }, 40)).toBe(40);
  });
  it("řádek pod spodním okrajem → posun dolů přesně o přesah", () => {
    expect(keepRowVisible(panel, { top: 490, bottom: 518 }, 40)).toBe(58);
  });
  it("řádek nad horním okrajem (nebo pod lepícím lesem nahoře) → posun nahoru", () => {
    expect(keepRowVisible(panel, { top: 80, bottom: 108 }, 40)).toBe(20);
    // les lepí nahoře (sticky, 150 px): řádek na 200 je pod ním schovaný
    expect(keepRowVisible(panel, { top: 200, bottom: 228 }, 140, 150)).toBe(90);
  });
  it("posun nikdy není záporný", () => {
    expect(keepRowVisible(panel, { top: 0, bottom: 28 }, 10)).toBe(0);
  });
});
