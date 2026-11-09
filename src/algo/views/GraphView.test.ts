// GraphView: smyčky, násobné hrany, popisky vrcholů, štítky cen, tah a klávesnice, tabulka pomocné struktury.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bfs, dfs, topo } from "../algos/graphs/algorithms";
import { emptyState, parseGraph, type Graph } from "../algos/graphs/graph";
import { materialize } from "../core/steps";
import { GraphView, TableView } from "./GraphView";
import { cellKey } from "./tableCells";
import { isBookPreset, presetGraph, PRESETS } from "../algos/graphs/presets";
import { flowPresetById, presetNet } from "../algos/flows/flowPresets";
import {
  drawingExtent,
  edgeGeometry,
  LABEL_GAP_X,
  LABEL_GAP_Y,
  graphViewport,
  GRAPH_MIN_W,
  GRAPH_MIN_W_FIXED,
  graphCanvasMinWidth,
  graphMinWidth,
  keyMove,
  nodeLabel,
  R,
  subLabelSides,
  weightLabelWidth,
} from "./graphGeometry";

const html = (g: Graph, onMove?: () => void) =>
  renderToStaticMarkup(
    createElement(GraphView, { graph: g, state: emptyState(), onMove }),
  );
/** cesty hran bez šipek v <defs> */
const paths = (h: string) =>
  [...h.matchAll(/<path d="(M[^"]*)"/g)]
    .map((m) => m[1])
    .filter((d) => !d.startsWith("M0,0 L10,5"));
const points = (d: string) => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const pts = new Set<string>();
  for (let i = 0; i + 1 < nums.length; i += 2)
    pts.add(`${nums[i].toFixed(1)},${nums[i + 1].toFixed(1)}`);
  return pts;
};

/** body na křivce cesty „M… L…“, „M… Q…“ nebo „M… C…“ (řídicí body mimo plátno nevadí) */
const curvePoints = (d: string): [number, number][] => {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const P: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) P.push([n[i], n[i + 1]]);
  const out: [number, number][] = [];
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    const u = 1 - t;
    const c =
      P.length === 2
        ? [u, t]
        : P.length === 3
          ? [u * u, 2 * u * t, t * t]
          : [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push([
      c.reduce((s, w, j) => s + w * P[j][0], 0),
      c.reduce((s, w, j) => s + w * P[j][1], 0),
    ]);
  }
  return out;
};

describe("GraphView – hrany", () => {
  it("smyčka (hrana u u, kterou parseGraph přijímá) je viditelná křivka i se štítkem ceny", () => {
    const g = parseGraph("a a 7\na b 1", true, true);
    const h = html(g);
    const ds = paths(h);
    expect(ds).toHaveLength(2);
    expect(points(ds[0]).size, ds[0]).toBeGreaterThan(1);
    expect(ds[0]).toMatch(/ C/);
    // štítek ceny smyčky leží mimo kruh vrcholu
    const [geo] = edgeGeometry(g, 900, 440);
    const a = g.nodes[0];
    expect(Math.hypot(geo.lx - a.x * 900, geo.ly - a.y * 440)).toBeGreaterThan(
      R + 8,
    );
  });

  it("dvě smyčky na témže vrcholu se nepřekrývají", () => {
    const g = parseGraph("a a\na a", true, false);
    const [p, q] = edgeGeometry(g, 900, 440);
    expect(p.d).not.toBe(q.d);
  });

  it("násobné hrany v neorientovaném grafu se nepřekrývají – i zapsané obráceně („a b“ a „b a“)", () => {
    for (const text of [
      "a b 1\na b 5",
      "a b 1\nb a 5",
      "a b 1\nb a 5\na b 2",
    ]) {
      const ds = paths(html(parseGraph(text, false, true)));
      expect(new Set(ds).size, text).toBe(ds.length);
      // štítky cen různých hran nejsou na stejném místě
      const geo = edgeGeometry(parseGraph(text, false, true), 900, 440);
      expect(new Set(geo.map((e) => `${e.lx},${e.ly}`)).size, text).toBe(
        geo.length,
      );
    }
  });

  it("orientovaný graf: dvě souhlasné hrany a→b i protisměrná dvojice a→b, b→a se kreslí jako různé oblouky", () => {
    for (const text of ["a b\na b", "a b\nb a"]) {
      const ds = paths(html(parseGraph(text, true, false)));
      expect(ds).toHaveLength(2);
      expect(ds[0]).not.toBe(ds[1]);
      for (const d of ds) expect(d).toMatch(/ Q/);
    }
  });

  it("jediná hrana mezi dvojicí zůstává rovná a končí na okraji kružnic", () => {
    const g: Graph = {
      nodes: [
        { id: 0, label: "a", x: 0.25, y: 0.5 },
        { id: 1, label: "b", x: 0.75, y: 0.5 },
      ],
      edges: [{ id: 0, u: 0, v: 1, w: 1 }],
      directed: false,
      weighted: false,
    };
    const [e] = edgeGeometry(g, 1000, 400);
    expect(e.d).toBe(`M${250 + R},200 L${750 - R},200`);
  });

  it("popisky dvou křížících se hran se nepřekrývají – jeden se posune po své hraně (UX-04)", () => {
    // a→d a b→c se kříží přesně uprostřed (obr. 14.2): oba popisky by ležely na průsečíku
    const g: Graph = {
      nodes: [
        { id: 0, label: "a", x: 0.2, y: 0.2 },
        { id: 1, label: "b", x: 0.2, y: 0.8 },
        { id: 2, label: "c", x: 0.8, y: 0.2 },
        { id: 3, label: "d", x: 0.8, y: 0.8 },
      ],
      edges: [
        { id: 0, u: 0, v: 3, w: 5 },
        { id: 1, u: 1, v: 2, w: 9 },
      ],
      directed: true,
      weighted: true,
    };
    const [p, q] = edgeGeometry(g, 900, 440);
    const apart =
      Math.abs(p.lx - q.lx) >= LABEL_GAP_X ||
      Math.abs(p.ly - q.ly) >= LABEL_GAP_Y;
    expect(apart).toBe(true);
    // popisek zůstane na své (rovné) hraně
    for (const [e, geo] of [
      [g.edges[0], p],
      [g.edges[1], q],
    ] as const) {
      const a = g.nodes[e.u];
      const b = g.nodes[e.v];
      const cross =
        (b.x * 900 - a.x * 900) * (geo.ly - a.y * 440) -
        (b.y * 440 - a.y * 440) * (geo.lx - a.x * 900);
      const len = Math.hypot(b.x * 900 - a.x * 900, b.y * 440 - a.y * 440);
      expect(Math.abs(cross) / len).toBeLessThan(0.2); // px od přímky (zaokrouhlení na 0,1 px)
    }
    // hrana bez kolize má popisek dál uprostřed
    const single = edgeGeometry({ ...g, edges: [g.edges[0]] }, 900, 440)[0];
    expect(single.lx).toBe(450);
  });

  it("obr. 14.2 (síť toků): žádné dva popisky hran se nepřekrývají (UX-04)", () => {
    const net = presetNet(flowPresetById("obr-14-2")!).graph;
    const W = 900;
    const H = Math.round(W / (net.aspect ?? 2));
    const geo = edgeGeometry(net, W, H);
    for (let i = 0; i < geo.length; i++)
      for (let j = i + 1; j < geo.length; j++) {
        const close =
          Math.abs(geo[i].lx - geo[j].lx) < LABEL_GAP_X &&
          Math.abs(geo[i].ly - geo[j].ly) < LABEL_GAP_Y;
        expect(close, `${i} × ${j}`).toBe(false);
      }
  });

  it("popisek pod vrcholem (in/low…) se vyhne hranám: dolů → vpravo, dolů a šikmo vpravo → vlevo (UX-08)", () => {
    // vrchol 0 uprostřed; hrany do směrů v úhlech (0° = vpravo, 90° = dolů)
    const star = (...deg: number[]) => {
      const nodes = [{ id: 0, label: "v", x: 0.5, y: 0.5 }];
      deg.forEach((d, i) =>
        nodes.push({
          id: i + 1,
          label: String(i + 1),
          x: 0.5 + 0.3 * Math.cos((d * Math.PI) / 180),
          y: 0.5 + 0.3 * Math.sin((d * Math.PI) / 180),
        }),
      );
      const g: Graph = {
        nodes,
        edges: deg.map((_, i) => ({ id: i, u: 0, v: i + 1, w: 1 })),
        directed: false,
        weighted: false,
      };
      return subLabelSides(
        g,
        g.nodes.map((n) => ({ x: n.x * 600, y: n.y * 600 })),
      )[0];
    };
    expect(star(0, 180, -90)).toBe("below");
    expect(star(90)).toBe("right");
    expect(star(90, 30)).toBe("left"); // a na obr. 5.10: hrany a–b dolů a a–c šikmo dolů vpravo
    expect(star(-30, 30, -120, 115)).toBe("left"); // g na obr. 5.10: mosty g–j, g–k vpravo, h vlevo dole
    expect(star(90, 150)).toBe("right");
  });

  it("štítek ceny je široký podle textu (2.75, 1000 nepřetečou)", () => {
    expect(weightLabelWidth("7")).toBe(22);
    expect(weightLabelWidth("2.75")).toBeGreaterThanOrEqual(4 * 6.5);
    expect(weightLabelWidth("1000")).toBeGreaterThan(weightLabelWidth("10"));
  });

  it("štítek ceny má českou desetinnou čárku a typografické minus (E3)", () => {
    const g = parseGraph("A B 2.5\nB C -3\nA C 0.1", false, true);
    const out = html(g);
    const labels = [
      ...out.matchAll(/<text[^>]*class="edge-label"[^>]*>([^<]*)</g),
    ].map((m) => m[1]);
    expect(labels).toEqual(["2,5", "−3", "0,1"]);
  });
});

describe("GraphView – vrcholy", () => {
  it("různé vrcholy mají v obrázku rozlišitelné popisky (dříve „vrcho…“ třikrát) a celý název v <title>", () => {
    const g = parseGraph("vrchol1 vrchol2\nvrchol2 vrchol3", false, false);
    const h = html(g);
    const shown = [...h.matchAll(/class="node-label"[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(shown).toHaveLength(3);
    expect(new Set(shown).size).toBe(3);
    for (const n of g.nodes) expect(h).toContain(`<title>${n.label}</title>`);
  });

  it("nodeLabel: krátké celé, dlouhé jako začátek…konec; delší popisek = větší kruh", () => {
    expect(nodeLabel("a")).toEqual({ text: "a", r: R, font: 13 });
    expect(nodeLabel("snídaně").text).toBe("snídaně");
    expect(nodeLabel("vrcholcislo12").text).toBe("vrch…o12");
    expect(nodeLabel("vrcholcislo12").text).not.toBe(
      nodeLabel("vrcholcislo13").text,
    );
    expect(nodeLabel("snídaně").r).toBeGreaterThan(R);
  });

  it("přetahovatelný graf: vrcholy mají větší neviditelný úchop, fokus z klávesnice (roving tabindex – jedna zastávka Tabu) a třídu draggable (touch-action jen na vrcholech)", () => {
    const g = parseGraph("a b", false, false);
    const h = html(g, () => {});
    expect(h).toMatch(/class="graph-svg draggable"/);
    expect(h.match(/class="node-hit"/g)).toHaveLength(2);
    expect(
      h.match(/<g[^>]*class="graph-node [^"]*"[^>]*tabindex="0"/g),
    ).toHaveLength(1);
    expect(
      h.match(/<g[^>]*class="graph-node [^"]*"[^>]*tabindex="-1"/g),
    ).toHaveLength(1);
    // bez onMove nic z toho
    const ro = html(g);
    expect(ro).not.toMatch(/node-hit|tabindex|draggable/);
    expect(ro).toMatch(/role="img" aria-label="Graf s 2 vrcholy a 1 hranou"/);
  });

  it("keyMove: šipky posouvají vrchol o 0,02 (Shift 0,08) a drží ho v mezích", () => {
    expect(keyMove("ArrowRight", false, 0.5, 0.5)).toEqual({ x: 0.52, y: 0.5 });
    expect(keyMove("ArrowUp", true, 0.5, 0.5)).toEqual({ x: 0.5, y: 0.42 });
    expect(keyMove("ArrowLeft", false, 0.03, 0.5)!.x).toBe(0.03);
    expect(keyMove("Enter", false, 0.5, 0.5)).toBeNull();
  });

  it("šířka plátna roste s počtem vrcholů, nejméně GRAPH_MIN_W", () => {
    expect(graphMinWidth(4)).toBe(GRAPH_MIN_W);
    expect(graphMinWidth(60)).toBeGreaterThan(GRAPH_MIN_W);
  });

  it("graphCanvasMinWidth: malý graf bez souřadnic se vejde do změřené šířky (telefon), ne pod GRAPH_MIN_W_FIXED", () => {
    expect(graphCanvasMinWidth(7, 350)).toBe(350);
    expect(graphCanvasMinWidth(7, 200)).toBe(GRAPH_MIN_W_FIXED);
    expect(graphCanvasMinWidth(7, 900)).toBe(GRAPH_MIN_W);
    // nezměřeno (SSR, skrytý prvek) → dosavadní minimum
    expect(graphCanvasMinWidth(7, 0)).toBe(GRAPH_MIN_W);
    // velký graf se dál posouvá vodorovně…
    expect(graphCanvasMinWidth(60, 350)).toBe(graphMinWidth(60));
    // …ale při kreslení (a prázdný graf) se plátno vždy vejde celé – kreslí se prstem na celé ploše
    expect(graphCanvasMinWidth(60, 350, { editing: true })).toBe(350);
    expect(graphCanvasMinWidth(0, 350)).toBe(350);
  });

  it("GraphView: graf se 7 vrcholy bez souřadnic na šířce 350 px má svg nejvýš 350 px", () => {
    const g = parseGraph("A B\nB C\nC D\nD E\nE F\nF G\nG A", false, false);
    const h = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state: emptyState(), width: 350 }),
    );
    const w = Number(/<svg[^>]*\swidth="(\d+)"/.exec(h)![1]);
    expect(w).toBeLessThanOrEqual(350);
  });
});

describe("GraphView – kresba podle knihy", () => {
  const two = (aspect?: number): Graph => ({
    nodes: [
      { id: 0, label: "a", x: 0, y: 0 },
      { id: 1, label: "b", x: 1, y: 1 },
    ],
    edges: [{ id: 0, u: 0, v: 1, w: 1 }],
    directed: true,
    weighted: false,
    aspect,
  });

  it("graphViewport bez poměru stran: osy zvlášť jako dřív (x·W, y·H)", () => {
    const vp = graphViewport(900, 440);
    expect(vp.H).toBe(440);
    expect(vp.toPx(0.5, 0.25)).toEqual({ x: 450, y: 110 });
    expect(vp.fromPx(450, 110)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("graphViewport s poměrem stran: kresba se nezdeformuje (letterbox), vejde se do plátna a je uprostřed", () => {
    for (const [W, aspect] of [
      [900, 11 / 7],
      [360, 11 / 7],
      [1200, 3],
      [600, 0.867],
    ]) {
      const vp = graphViewport(W, 440, aspect);
      const a = vp.toPx(0, 0);
      const b = vp.toPx(1, 1);
      expect((b.x - a.x) / (b.y - a.y), `${W}/${aspect}`).toBeCloseTo(
        aspect,
        6,
      );
      // okraj na kružnici vrcholu a popisek pod ním
      expect(a.x).toBeGreaterThanOrEqual(R);
      expect(a.y).toBeGreaterThanOrEqual(R);
      expect(b.x).toBeLessThanOrEqual(W - R);
      expect(b.y).toBeLessThanOrEqual(vp.H - R - 10);
      expect(vp.H).toBeLessThanOrEqual(440);
      // vodorovně na střed
      expect(a.x + b.x).toBeCloseTo(W, 6);
      // zpětný převod (tah myší)
      const back = vp.fromPx(b.x, b.y);
      expect(back.x).toBeCloseTo(1, 9);
      expect(back.y).toBeCloseTo(1, 9);
    }
    // široká kresba na úzkém plátně: výška se zmenší, ať pod grafem nezůstane prázdný pruh
    expect(graphViewport(360, 440, 3).H).toBeLessThan(250);
  });

  it("knižní předvolby: oblouky i smyčky (obr. 5.4) se celé vejdou do plátna, poměr stran zůstane", () => {
    for (const p of PRESETS.filter(isBookPreset))
      for (const W of [360, 900]) {
        const g = presetGraph(p);
        const vp = graphViewport(W, 440, g.aspect, drawingExtent(g));
        const geo = edgeGeometry(g, W, vp.H, () => R, vp.toPx);
        for (const e of geo)
          for (const [x, y] of curvePoints(e.d)) {
            expect(x, `${p.id} ${W}: ${e.d}`).toBeGreaterThanOrEqual(0);
            expect(x, `${p.id} ${W}: ${e.d}`).toBeLessThanOrEqual(W);
            expect(y, `${p.id} ${W}: ${e.d}`).toBeGreaterThanOrEqual(0);
            expect(y, `${p.id} ${W}: ${e.d}`).toBeLessThanOrEqual(vp.H);
          }
        const a = vp.toPx(0, 0);
        const b = vp.toPx(1, 1);
        expect((b.x - a.x) / (b.y - a.y), p.id).toBeCloseTo(g.aspect!, 6);
      }
  });

  it("edgeGeometry používá mapování se zachovaným poměrem stran", () => {
    const g = two(2);
    const vp = graphViewport(900, 440, 2);
    const [e] = edgeGeometry(g, 900, vp.H, () => R, vp.toPx);
    const a = vp.toPx(0, 0);
    const b = vp.toPx(1, 1);
    expect(e.lx).toBeCloseTo((a.x + b.x) / 2, 0);
    expect(e.ly).toBeCloseTo((a.y + b.y) / 2, 0);
  });

  it("ohnutá hrana (bend): oblouk doprava ve směru jízdy, záporný doleva; bez bend rovná", () => {
    const g: Graph = {
      nodes: [
        { id: 0, label: "a", x: 0.2, y: 0.5 },
        { id: 1, label: "b", x: 0.8, y: 0.5 },
      ],
      edges: [
        { id: 0, u: 0, v: 1, w: 1, bend: 0.4 },
        { id: 1, u: 0, v: 1, w: 1, bend: -0.4 },
        { id: 2, u: 0, v: 1, w: 1 },
      ],
      directed: true,
      weighted: false,
    };
    const [p, q, r] = edgeGeometry(g, 1000, 400);
    expect(p.d).toMatch(/ Q/);
    expect(q.d).toMatch(/ Q/);
    // a → b vede doprava (+x), „doprava ve směru jízdy“ je na obrazovce dolů (+y)
    expect(p.ly).toBeGreaterThan(200 + 30);
    expect(q.ly).toBeLessThan(200 - 30);
    // hrana bez bend se mezi ohnutými nerozprostírá (bend určuje tvar přesně)
    expect(r.d).toMatch(/ L/);
  });

  it("smyčka s bend = směr ve stupních (180 doleva, 0 doprava)", () => {
    const g: Graph = {
      nodes: [{ id: 0, label: "a", x: 0.5, y: 0.5 }],
      edges: [
        { id: 0, u: 0, v: 0, w: 1, bend: 180 },
        { id: 1, u: 0, v: 0, w: 1, bend: 0 },
      ],
      directed: true,
      weighted: false,
    };
    const [left, right] = edgeGeometry(g, 1000, 400);
    expect(left.lx).toBeLessThan(500 - R);
    expect(Math.abs(left.ly - 200)).toBeLessThan(R);
    expect(right.lx).toBeGreaterThan(500 + R);
  });

  it("GraphView s poměrem stran: vrcholy na místech podle graphViewport, výška plátna podle kresby", () => {
    const g = two(2);
    const h = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state: emptyState(), width: 900 }),
    );
    const vp = graphViewport(900, 440, 2);
    const b = vp.toPx(1, 1);
    expect(h).toContain(`translate(${b.x}px, ${b.y}px)`);
    expect(h).toContain(`height="${vp.H}"`);
  });

  it("styl knihy (DFS): nestromové hrany tečkovaně bez barvy třídy, typ hrany jen v popisku", () => {
    const g = parseGraph("a b\nb c\nc a\na c", true, false);
    const st = materialize(dfs.run(g, 0)).at(-1)!.state;
    const book = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state: st, edgeStyle: "book" }),
    );
    expect(book).toMatch(/class="graph-edge e-back book-nontree"/);
    expect(book).toMatch(/stroke-dasharray:\s*1(\.\d+)? 4/);
    expect(book).toContain(">zpětná<");
    expect(book).toContain(">dopředná<");
    // stromová hrana zůstává plná a bez popisku
    expect(book.match(/edge-class-label/g)).toHaveLength(2);
    // výchozí barevný styl popisky typů nemá
    const color = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state: st }),
    );
    expect(color).not.toContain("edge-class-label");
    expect(color).not.toContain("book-nontree");
  });

  it("popisek pod vrcholem (in/out, D) má světlý lem, aby byl čitelný i přes hranu", () => {
    const g = parseGraph("a b", true, false);
    const st = materialize(dfs.run(g, 0)).at(-1)!.state;
    const h = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state: st }),
    );
    expect(h).toMatch(/class="node-sub" style="[^"]*paint-order:stroke/);
  });

  it("skupiny vrcholů (vrstvy BFS): tečkovaný zaoblený obdélník kolem vrcholů a popisek nad ním", () => {
    const g = parseGraph("a b\nb c", false, false);
    const h = renderToStaticMarkup(
      createElement(GraphView, {
        graph: g,
        state: emptyState(),
        groups: [
          { label: "V₀", nodes: [0] },
          { label: "V₁", nodes: [1, 2] },
        ],
      }),
    );
    expect(h.match(/class="graph-group"/g)).toHaveLength(2);
    // sloupce vrstev mají jako v knize stejnou výšku (fullHeight)
    const col = renderToStaticMarkup(
      createElement(GraphView, {
        graph: g,
        state: emptyState(),
        groups: [
          { label: "V₀", nodes: [0], fullHeight: true },
          { label: "V₁", nodes: [1, 2], fullHeight: true },
        ],
      }),
    );
    const rects = [
      ...col.matchAll(
        /<rect x="[^"]*" y="([^"]*)" width="[^"]*" height="([^"]*)"/g,
      ),
    ];
    expect(rects).toHaveLength(2);
    expect(rects[0][1]).toBe(rects[1][1]);
    expect(rects[0][2]).toBe(rects[1][2]);
    expect(h).toContain(">V₀<");
    expect(h).toContain(">V₁<");
    expect(h).toMatch(/<rect[^>]*rx="[1-9]/);
  });
});

describe("TableView", () => {
  it("prázdná fronta / zásobník / seznam se vykreslí jako „(prázdné)“, ne jako řádek bez buněk", () => {
    const g = parseGraph("a b", false, false);
    const tables = [bfs, dfs].map(
      (algo) => materialize(algo.run(g, 0)).at(-1)!.state.table!,
    );
    tables.push(
      materialize(topo.run(parseGraph("a b", true, false), 0))[0].state.table!,
    );
    for (const table of tables) {
      const h = renderToStaticMarkup(createElement(TableView, { table }));
      expect(h).toContain(">(prázdné)<");
      expect(h).not.toMatch(/<tr[^>]*><\/tr>|<li[^>]*><\/li>/);
    }
  });

  it("široká tabulka je v obalu .table-scroll", () => {
    const h = renderToStaticMarkup(
      createElement(TableView, {
        table: {
          title: "Fronta",
          header: ["v"],
          rows: [["a"], ["b"]],
          highlight: 1,
        },
      }),
    );
    expect(h).toMatch(/<div class="table-scroll"><table>/);
    expect(h).toMatch(/<tr class="hl"><td>b<\/td><\/tr>/);
  });

  it("cellMarks zvýrazní jednotlivé buňky (cellKey(řádek, sloupec) → třída); bez nich beze změny", () => {
    const table = {
      title: "Tabulka",
      header: ["i", "y"],
      rows: [
        ["0", "8"],
        ["1", "0"],
      ],
    };
    const plain = renderToStaticMarkup(createElement(TableView, { table }));
    expect(plain).not.toMatch(/<td class=/);
    const h = renderToStaticMarkup(
      createElement(TableView, {
        table: {
          ...table,
          highlight: 0,
          cellMarks: {
            [cellKey(1, 1)]: "cell-hot",
            [cellKey(0, 0)]: "cell-done",
          },
        },
      }),
    );
    expect(h).toMatch(
      /<tr class="hl"><td class="cell-done">0<\/td><td>8<\/td><\/tr>/,
    );
    expect(h).toMatch(
      /<tr class=""><td>1<\/td><td class="cell-hot">0<\/td><\/tr>/,
    );
    expect(cellKey(3, 12)).toBe("3:12");
  });
});

describe("GraphView – popisek stavu mimo svislou hranu", () => {
  it("vrchol se svislou hranou dolů má popisek vpravo (text-anchor start), ostatní pod sebou", () => {
    const g: Graph = {
      directed: true,
      weighted: false,
      nodes: [
        { id: 0, label: "a", x: 0, y: 0 },
        { id: 1, label: "b", x: 0, y: 1 },
        { id: 2, label: "c", x: 1, y: 1 },
      ],
      edges: [
        { id: 0, u: 0, v: 1, w: 1 },
        { id: 1, u: 1, v: 2, w: 1 },
      ],
      aspect: 1,
    };
    const state = {
      ...emptyState(),
      nodeSub: { 0: "D=0", 1: "D=1", 2: "D=2" },
    };
    const h = renderToStaticMarkup(
      createElement(GraphView, { graph: g, state, width: 500 }),
    );
    const subs = [...h.matchAll(/<text([^>]*)class="node-sub"[^>]*>([^<]*)</g)];
    const attrs = (t: string) => subs.find((m) => m[2] === t)![1];
    expect(attrs("D=0")).toMatch(/text-anchor="start"/);
    expect(attrs("D=1")).toMatch(/text-anchor="middle"/);
    expect(attrs("D=2")).toMatch(/text-anchor="middle"/);
  });
});
