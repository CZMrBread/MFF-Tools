/**
 * Kouřový test stránky grafů: pro každý algoritmus se vykreslí první krok výchozího příkladu
 * (bez prohlížeče – statický render, efekty neběží).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { GRAPH_ALGOS, kruskal, legendFor } from "./algorithms";
import { parseGraph } from "./graph";
import {
  buildGraph,
  defaultPresetId,
  defaultSpec,
  pageStartLabel,
} from "./graphPageModel";
import { weightTerm } from "./graphActions";
import { GraphPage } from "./GraphPage";
import { moduleByPath } from "../../registry";
import { UF_MAX_COLS, ufForestLayout } from "../../views/ufForestLayout";

const render = (path: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/graph/:id",
          element: createElement(GraphPage),
        }),
        createElement(Route, { path: "/", element: "PŘEHLED" }),
      ),
    ),
  );

describe("GraphPage", () => {
  it("vykreslí výchozí příklad každého algoritmu: nadpis, graf, legendu běhu, tip, název operace a ovládání", () => {
    for (const algo of GRAPH_ALGOS) {
      const html = render(`/graph/${algo.id}`);
      expect(html, algo.id).toContain(moduleByPath(`/graph/${algo.id}`)!.title);
      expect(html, algo.id).toContain("graph-svg");
      // ovládání po vzoru VisuAlgo: nabídka operací pod plátnem, editor grafu na plátně, text sbalený
      for (const label of [
        "Příklady z knihy",
        ">Vytvořit<",
        "Jiný alg.",
        "Upravit graf",
        "Import / export textem",
        "Použít text",
        "Kopírovat odkaz",
        "Zkuste:",
      ])
        expect(html, `${algo.id}: ${label}`).toContain(label);
      // legenda = jen třídy, které výchozí běh opravdu použije
      const s = defaultSpec(algo);
      const g = parseGraph(s.text, s.directed, s.weighted);
      // v₀ jako v knize (Jarník na obr. 7.2: E), jinak první vrchol
      const v0 =
        pageStartLabel(algo, g, defaultPresetId(algo), null) ??
        g.nodes[0].label;
      const v0Id = g.nodes.find((n) => n.label === v0)!.id;
      const legend = legendFor(algo, materialize(algo.run(g, v0Id)), g);
      for (const l of legend)
        expect(html, `${algo.id}: ${l.cls}`).toContain(`swatch ${l.cls}`);
      // výběr počátečního vrcholu jen tam, kde ho algoritmus potřebuje; název operace s argumentem
      expect(html.includes("počáteční vrchol"), algo.id).toBe(algo.needsStart);
      expect(html.includes(`>${algo.opName}(v₀)</button>`), algo.id).toBe(
        algo.needsStart,
      );
      expect(html, algo.id).toContain(
        algo.needsStart
          ? `${algo.opName}(v₀ = ${v0})`
          : `<b>${algo.opName}</b>`,
      );
      // výchozí příklad je platný vstup – žádná chybová hláška, knižní předvolba bez „(upraveno)“
      expect(html, algo.id).not.toContain("input-error");
      expect(html, algo.id).not.toContain("(upraveno)");
      // vynucený typ grafu je vysvětlený
      if (algo.directed !== undefined || algo.weighted !== undefined)
        expect(html, algo.id).toContain("(typ vyžaduje algoritmus)");
      // ceny hran naráz jen u ohodnoceného grafu
      expect(
        html.includes(`>${weightTerm(algo).action}</button>`),
        algo.id,
      ).toBe(s.weighted);
    }
  });

  it("knižní předvolba: popisek zdroje pod obrázkem, akce „Příklady z knihy“ a přepínače styl knihy (DFS) / vrstvy (BFS)", () => {
    const bfsHtml = render("/graph/bfs");
    expect(bfsHtml).toContain('data-am-id="book"');
    expect(bfsHtml).toContain(
      "Obr. 5.5 „Prasátko“ – Průvodce labyrintem algoritmů, s. 113",
    );
    expect(bfsHtml).toContain("vrstvy V₀…Vₖ");
    expect(bfsHtml).not.toContain("styl knihy");
    const dfsHtml = render("/graph/dfs");
    expect(dfsHtml).toContain("styl knihy");
    expect(dfsHtml).not.toContain("vrstvy V₀…Vₖ");
    // kresba podle knihy: vrchol 2 v levém horním rohu kresby (letterbox), ne silové rozložení
    expect(render("/graph/jarnik")).toContain("Obr. 7.2 Mřížka 3 × 3");
    // vlastní graf popisek zdroje nemá
    const own = render(`/graph/bfs?g=${encodeURIComponent("x y")}`);
    expect(own).not.toContain("Průvodce labyrintem algoritmů, s.");
  });

  it("neznámé id algoritmu přesměruje na přehled (dříve se tiše zobrazil BFS)", () => {
    // Navigate přesměruje až v efektu – statický render tedy nic nevykreslí a hlavně nespadne
    expect(render("/graph/neexistuje")).not.toContain("Prohledávání do šířky");
  });

  it("vstup z odkazu: graf, typ i počáteční vrchol; vadný odkaz → výchozí příklad s vysvětlením", () => {
    const html = render(
      `/graph/bfs?g=${encodeURIComponent("x y\ny z\nz w")}&d=1&s=y`,
    );
    expect(html).toContain("BFS(v₀ = y)");
    // vlastní graf: bez popisku zdroje, text hran v panelu Import / export, typ z odkazu
    expect(html).not.toContain("graph-source");
    expect(html).toContain("x y\ny z\nz w</textarea>");
    expect(html).toContain("Graf: 4 vrcholy, 3 hrany, orientovaný,");
    const bad = render(`/graph/dijkstra?g=${encodeURIComponent("A B x")}`);
    expect(bad).toContain("Graf z odkazu nešel použít");
    expect(bad).toContain("Dijkstra(v₀ = A)");
  });
});

describe("GraphPage – rozložení na jednu obrazovku", () => {
  it("zdroj obrázku a popis grafu jsou ve sbalené nápovědě, přepínač zobrazení vpravo pod pseudokódem", () => {
    const html = render("/graph/dfs");
    const canvasStart = html.indexOf('class="viz-canvas"');
    const canvasEnd = html.indexOf('class="viz-actions"');
    const canvas = html.slice(canvasStart, canvasEnd);
    expect(canvas).not.toContain("graph-source");
    expect(canvas).not.toContain("12 hran, orientovaný");
    expect(canvas).not.toContain("styl knihy");
    const more = html.slice(html.indexOf('<details class="viz-more"'));
    expect(more).toContain("graph-source");
    expect(more).toContain("12 hran, orientovaný");
    const options = html.slice(html.indexOf('class="viz-options"'));
    expect(options).toContain("styl knihy");
    expect(html.indexOf('class="viz-options"')).toBeLessThan(
      html.indexOf('<details class="viz-more"'),
    );
    expect(render("/graph/bfs")).toMatch(
      /class="viz-options"[\s\S]*vrstvy V₀…Vₖ/,
    );
  });
});

describe("GraphPage – výsledek běhu vedle grafu", () => {
  it("tabulka hran (Kruskal) a proměnné jsou v .graph-result vedle grafu uvnitř .graph-layout", () => {
    const html = render("/graph/kruskal");
    const layout = html.indexOf('class="graph-layout"');
    const graph = html.indexOf("graph-svg");
    const result = html.search(/class="graph-result[ "]/);
    const table = html.indexOf('class="gtable"');
    expect(layout).toBeGreaterThan(0);
    expect(graph).toBeGreaterThan(layout);
    expect(result).toBeGreaterThan(graph);
    expect(table).toBeGreaterThan(result);
  });

  it("Kruskal: nad tabulkou hran les keříků Union-Find už od kroku 1 (E5), výška podle nejvyššího lesa běhu; ostatní algoritmy ho nemají", () => {
    const html = render("/graph/kruskal");
    const result = html.search(/class="graph-result[ "]/);
    const table = html.indexOf('class="gtable"');
    const forest = html.indexOf("uf-forest");
    // les je v panelu výsledku první – na menších obrazovkách by pod dlouhou tabulkou zůstal mimo záběr
    expect(forest).toBeGreaterThan(result);
    expect(table).toBeGreaterThan(forest);
    // výchozí obr. 7.2: 9 vrcholů, na začátku samé kořeny hloubky 0
    expect(html.match(/class="uf-node/g)).toHaveLength(9);
    expect(html).toContain("Union-Find, 9 keříků:");
    // výška kresby = nejvyšší les za celý běh → panel se mezi kroky nepřeskládá
    const g = buildGraph(defaultSpec(kruskal)).graph;
    const steps = materialize(kruskal.run(g, 0));
    const tallest = Math.max(
      ...steps.map((s) => ufForestLayout(s.state.uf!.parent, UF_MAX_COLS).h),
    );
    const first = ufForestLayout(steps[0].state.uf!.parent, UF_MAX_COLS).h;
    expect(tallest).toBeGreaterThan(first);
    const svg = /<svg class="viz-ufforest uf-svg"[^>]*>/.exec(html)![0];
    expect(svg).toContain(`height="${tallest}"`);
    const widest = Math.max(
      ...steps.map((s) => ufForestLayout(s.state.uf!.parent, UF_MAX_COLS).w),
    );
    expect(svg).toContain(`width="${widest}"`);
    for (const algo of GRAPH_ALGOS.filter((a) => a.id !== "kruskal"))
      expect(render(`/graph/${algo.id}`), algo.id).not.toContain("uf-forest");
  });
});

describe("nadpis stránky = název modulu v registru (NEWMODS-13)", () => {
  it("H1 každého grafového algoritmu je title z registry", () => {
    for (const algo of GRAPH_ALGOS) {
      const html = render(`/graph/${algo.id}`);
      const h1 = /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1] ?? "";
      expect(h1.replace(/<[^>]+>/g, ""), algo.id).toBe(
        moduleByPath(`/graph/${algo.id}`)!.title,
      );
    }
  });
});
