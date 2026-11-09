// @vitest-environment jsdom
// Stránka grafů v DOM (tenká vrstva nad graphActions.ts / graphPageModel.ts a GraphEditor): akce
// s argumentem + Enter spustí algoritmus a přehrávač stojí na kroku 1 (samo se nespustí), ▶ ho rozběhne, klik na vrchol = v₀, příklad
// z knihy postaví graf podle obrázku, ceny hran naráz, jiný algoritmus nad tímtéž grafem, kreslení.
import { createElement as h, StrictMode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type Location,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { click, key, mount, pointer, type } from "../../core/domTest";
import { GraphPage } from "./GraphPage";
import { presetById, type BookPreset } from "./presets";

async function open(path: string, strict = false) {
  const loc = { current: null as Location | null };
  function Probe() {
    loc.current = useLocation();
    return null;
  }
  const tree = h(
    MemoryRouter,
    { initialEntries: [path] },
    h(Probe),
    h(
      Routes,
      null,
      h(Route, { path: "/graph/:id", element: h(GraphPage) }),
      h(Route, { path: "/", element: "PŘEHLED" }),
    ),
  );
  const m = await mount(strict ? h(StrictMode, null, tree) : tree);
  const text = () => m.el.textContent ?? "";
  const playing = () =>
    m.el.querySelector(".ctl-play")?.getAttribute("aria-label") ===
    "Pozastavit";
  const nodes = () => [...m.el.querySelectorAll<SVGGElement>("g.graph-node")];
  const node = (label: string) =>
    nodes().find((n) => n.querySelector("title")?.textContent === label)!;
  const variant = (label: string) =>
    [...m.el.querySelectorAll<HTMLButtonElement>(".am-variant")].find(
      (b) => b.textContent === label,
    )!;
  const search = () => new URLSearchParams(loc.current!.search);
  return { m, loc, text, playing, nodes, node, variant, search };
}

describe("GraphPage (jsdom)", () => {
  it("BFS(v₀): výběr v₀ = 3 a Enter spustí BFS z vrcholu 3, přehrávač stojí na kroku 1 (samo se nespustí), ▶ ho rozběhne, v₀ je v odkazu", async () => {
    const p = await open("/graph/bfs");
    expect(p.playing()).toBe(false);
    await click(p.m.button("BFS(v₀)"));
    const select = p.m.el.querySelector<HTMLSelectElement>(".am-body select")!;
    await type(select, "3");
    await key(select, { key: "Enter" });
    expect(p.text()).toContain("BFS(v₀ = 3)");
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.m.button("Přehrát"));
    expect(p.playing()).toBe(true);
    expect(p.search().get("s")).toBe("3");
    await p.m.unmount();
  });

  it("Jarník: výchozí obr. 7.2 začíná jako kniha ve středu E, odkaz zůstane čistý; Výchozí příklad zase z E", async () => {
    const p = await open("/graph/jarnik");
    expect(p.text()).toContain("Jarník(v₀ = E)");
    await key(p.node("A"), { key: "Enter" });
    expect(p.text()).toContain("Jarník(v₀ = A)");
    expect(p.search().get("s")).toBe("A");
    // Výchozí příklad = tlačítko pod akcemi (Visualizer), ne varianta Vytvořit
    await click(p.m.button("Výchozí příklad"));
    expect(p.text()).toContain("Jarník(v₀ = E)");
    expect(p.loc.current!.search).toBe("");
    await p.m.unmount();
  });

  it("StrictMode (dev): otevření odkazu adresu nepřepíše – ani ručně psaný bez d=, ani vadný; první úprava ji zapíše", async () => {
    const manual = `?g=${encodeURIComponent("x y\ny z")}`;
    const p = await open(`/graph/bfs${manual}`, true);
    expect(p.loc.current!.search).toBe(manual);
    await key(p.node("y"), { key: "Enter" });
    expect(p.search().get("s")).toBe("y");
    await p.m.unmount();
    const broken = `?g=${encodeURIComponent("a b c d e")}`;
    const q = await open(`/graph/bfs${broken}`, true);
    expect(q.text()).toContain("Graf z odkazu nešel použít");
    expect(q.loc.current!.search).toBe(broken);
    await q.m.unmount();
  });

  it("Enter na vrcholu v režimu algoritmu = v₀ a spuštění (bez otevírání nabídky)", async () => {
    const p = await open("/graph/dfs");
    await key(p.node("6"), { key: "Enter" });
    expect(p.text()).toContain("DFS(v₀ = 6)");
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.m.unmount();
  });

  it("Příklady z knihy ▸ Obr. 5.13: graf jako v knize (vrcholy, souřadnice v pořadí), popisek zdroje, stojí na kroku 1", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Příklady z knihy"));
    const scc = presetById("scc") as BookPreset;
    await click(p.variant(scc.label));
    expect(p.nodes()).toHaveLength(scc.nodes.length);
    expect(p.text()).toContain(
      `${scc.label} – Průvodce labyrintem algoritmů, s. ${scc.page}`,
    );
    // pořadí zleva doprava na plátně = pořadí x v knize (kresba bez silového rozložení)
    const px = (g: SVGGElement) =>
      Number(/translate\(([-\d.]+)px/.exec(g.style.transform)![1]);
    const onCanvas = [...p.nodes()]
      .sort((a, b) => px(a) - px(b) || 0)
      .map((g) => g.querySelector("title")!.textContent);
    const inBook = [...scc.nodes]
      .sort((a, b) => a.x - b.x || 0)
      .map((n) => n.label);
    expect(
      onCanvas.map((l) => scc.nodes.find((n) => n.label === l)!.x),
    ).toEqual(inBook.map((l) => scc.nodes.find((n) => n.label === l)!.x));
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.search().get("g")).toBe(scc.text);
    await p.m.unmount();
  });

  it("Délky hran: napsat délky + Enter přenastaví délky v pořadí hran, připraví Dijkstru a zapíše odkaz; ↶ Vrátit operaci vrátí původní graf", async () => {
    const p = await open("/graph/dijkstra");
    await click(p.m.button("Délky hran"));
    const input = p.m.el.querySelector<HTMLInputElement>(".am-body input")!;
    await type(input, "9 8");
    await key(input, { key: "Enter" });
    expect(p.search().get("g")!.split("\n").slice(0, 3)).toEqual([
      "A B 9",
      "A C 8",
      "B C 5",
    ]);
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.m.el.querySelector(".viz-history")?.textContent).toContain(
      "Délky hran",
    );
    await click(p.m.button("↶ Vrátit operaci"));
    expect(p.loc.current!.search).toBe("");
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });

  it("Délky hran s desetinnou čárkou: pole ukazuje čárku, „8,5“ i „7.25“ projde, odkaz g= drží tečku", async () => {
    const p = await open(
      `/graph/dijkstra?g=${encodeURIComponent("A B 2.5\nB C 1\nC A 4")}&d=0&w=1`,
    );
    await click(p.m.button("Délky hran"));
    const input = p.m.el.querySelector<HTMLInputElement>(".am-body input")!;
    expect(input.value).toBe("2,5 1 4");
    await type(input, "8,5 7.25");
    await key(input, { key: "Enter" });
    expect(p.search().get("g")!.split("\n")).toEqual([
      "A B 8.5",
      "B C 7.25",
      "C A 4",
    ]);
    // pole po operaci sleduje nové ceny – zase s čárkou (akce se po provedení mohla sbalit)
    if (!p.m.el.querySelector(".am-body input"))
      await click(p.m.button("Délky hran"));
    expect(
      p.m.el.querySelector<HTMLInputElement>(".am-body input")!.value,
    ).toBe("8,5 7,25 4");
    // štítky hran v kresbě s čárkou
    const labels = [...p.m.el.querySelectorAll(".edge-label")].map(
      (t) => t.textContent,
    );
    expect(labels).toContain("8,5");
    expect(labels).toContain("7,25");
    expect(labels.join(" ")).not.toMatch(/\d\.\d/);
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });

  it("úprava v editoru (Upravit graf → Hotovo) jde vrátit jako jedna operace; ▶ a pak Upravit graf přehrávání pozastaví (GRAPH-10)", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Přehrát"));
    expect(p.playing()).toBe(true);
    await click(p.m.button("Upravit graf"));
    expect(p.playing()).toBe(false);
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: unknown };
    const original = proto.getScreenCTM;
    proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    try {
      const svg = p.m.el.querySelector("svg.graph-svg")!;
      await pointer(p.m.el.querySelector(".graph-bg")!, "pointerdown", {
        clientX: 5,
        clientY: 5,
        timeStamp: 0,
      });
      await pointer(svg, "pointerup", {
        clientX: 5,
        clientY: 5,
        timeStamp: 50,
      });
    } finally {
      proto.getScreenCTM = original;
    }
    expect(p.nodes()).toHaveLength(11);
    await click(p.m.button("Hotovo"));
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".viz-history")?.textContent).toContain(
      "Úprava grafu",
    );
    await click(p.m.button("↶ Vrátit operaci"));
    expect(p.nodes()).toHaveLength(10);
    await p.m.unmount();
  });

  it("neznámé s= v odkazu: hláška nad plátnem, adresa se nepřepíše (GRAPH-11)", async () => {
    const path = "/graph/bfs?g=1+2%0A2+3&s=Z";
    const p = await open(path);
    expect(p.text()).toContain("Vrchol Z v grafu není – začínáme z 1.");
    expect(p.text()).toContain("BFS(v₀ = 1)");
    expect(p.loc.current!.search).toBe("?g=1+2%0A2+3&s=Z");
    await p.m.unmount();
  });

  it("Náhodně s n = 6, m = 40: poznámka, že m je omezené (GRAPH-11)", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Náhodně"));
    await type(p.m.input("vrcholů n ="), "6");
    const m = p.m.input("hran m =");
    await type(m, "40");
    await key(m, { key: "Enter" });
    expect(p.nodes()).toHaveLength(6);
    // výchozí prasátko je orientované: n = 6 → nejvýše 6 · 5 = 30 hran
    expect(p.m.el.querySelector(".action-menu")?.textContent).toContain(
      "m omezeno na největší možný počet hran pro n = 6: m = 30.",
    );
    await p.m.unmount();
  });

  it("Jiný algoritmus ▸ DFS: přepne stránku i s upraveným grafem a v₀, stojí na kroku 1 (nepřehrává se)", async () => {
    const p = await open(`/graph/bfs?g=${encodeURIComponent("x y\ny z")}&s=y`);
    await click(p.m.button("Jiný alg."));
    await click(p.variant("Prohledávání do hloubky (DFS)"));
    expect(p.loc.current!.pathname).toBe("/graph/dfs");
    expect(p.search().get("g")).toBe("x y\ny z");
    expect(p.text()).toContain("DFS(v₀ = y)");
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.m.unmount();
  });

  it("Vytvořit ▸ Prázdný: prázdné plátno v režimu Upravit graf, spuštění je zakázané s důvodem; kreslení (vrcholy i hrana) nic nespouští", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Prázdný – nakreslit"));
    expect(p.nodes()).toHaveLength(0);
    expect(p.m.button("Upravit graf").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(p.m.button("BFS(v₀)").getAttribute("aria-disabled")).toBe("true");
    expect(p.playing()).toBe(false);
    // kreslení: dva klepnutí do prázdna = dva vrcholy, tah z jednoho na druhý = hrana – nic se nespustí
    // jsdom nemá getScreenCTM – plátno 1 : 1 s obrazovkou
    const proto = SVGElement.prototype as unknown as {
      getScreenCTM?: unknown;
    };
    const original = proto.getScreenCTM;
    proto.getScreenCTM = () => ({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    });
    try {
      const svg = () => p.m.el.querySelector("svg.graph-svg")!;
      const tap = async (target: Element, x: number, y: number) => {
        await pointer(target, "pointerdown", {
          clientX: x,
          clientY: y,
          timeStamp: 0,
        });
        await pointer(svg(), "pointerup", {
          clientX: x,
          clientY: y,
          timeStamp: 50,
        });
      };
      await tap(p.m.el.querySelector(".graph-bg")!, 100, 100);
      await tap(p.m.el.querySelector(".graph-bg")!, 300, 100);
      expect(p.nodes()).toHaveLength(2);
      await pointer(p.nodes()[0], "pointerdown", {
        clientX: 100,
        clientY: 100,
      });
      await pointer(svg(), "pointermove", { clientX: 200, clientY: 100 });
      await pointer(svg(), "pointermove", { clientX: 300, clientY: 100 });
      await pointer(svg(), "pointerup", { clientX: 300, clientY: 100 });
      expect(p.m.el.querySelectorAll("g.graph-edge")).toHaveLength(1);
      expect(p.playing()).toBe(false);
      // v editoru přehrávač stojí (G-04): ▶ zakázané, „připraveno“
      expect(p.m.el.querySelector(".step-counter")?.textContent).toBe(
        "připraveno",
      );
    } finally {
      proto.getScreenCTM = original;
    }
    await p.m.unmount();
  });

  it("Prázdný – nakreslit: návod leží na plátně jako překryv, první vrchol neposune plátno (UX-04)", async () => {
    const p = await open("/graph/dfs");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Prázdný – nakreslit"));
    // co leží v plátně nad grafem (posune ho, když zmizí)
    const above = () => {
      const layout = p.m.el.querySelector(".graph-layout")!;
      const out: string[] = [];
      for (
        let e = layout.previousElementSibling;
        e;
        e = e.previousElementSibling
      )
        out.push(`${e.tagName}.${e.className}`);
      return out;
    };
    const hint = p.m.el.querySelector(".graph-empty-hint");
    expect(hint, "návod na plátně").not.toBeNull();
    expect(
      hint!.closest(".graph-layout"),
      "překryv uvnitř .graph-layout",
    ).not.toBeNull();
    const before = above();
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: unknown };
    const original = proto.getScreenCTM;
    proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    try {
      const svg = p.m.el.querySelector("svg.graph-svg")!;
      await pointer(p.m.el.querySelector(".graph-bg")!, "pointerdown", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      await pointer(svg, "pointerup", {
        clientX: 100,
        clientY: 100,
        timeStamp: 50,
      });
    } finally {
      proto.getScreenCTM = original;
    }
    expect(p.nodes()).toHaveLength(1);
    expect(above()).toEqual(before);
    expect(p.m.el.querySelector(".graph-empty-hint")).toBeNull();
    await p.m.unmount();
  });

  it("panel výsledku (zásobník/fronta, T) je od kroku 1 – graf se mezi krokem 1 a 2 nezúží (V-03)", async () => {
    for (const id of ["dfs", "bfs", "dijkstra"]) {
      const p = await open(`/graph/${id}`);
      expect(p.m.el.querySelector(".step-counter")?.textContent, id).toMatch(
        /^krok 1 \/ \d+$/,
      );
      const table = () =>
        p.m.el.querySelector(".graph-layout .graph-result .gtable");
      expect(table(), `${id}: tabulka na kroku 1`).not.toBeNull();
      await click(p.m.button("Krok vpřed"));
      expect(table(), `${id}: tabulka na kroku 2`).not.toBeNull();
      await p.m.unmount();
    }
  });

  it("Kruskal: keříky Union-Find mají v každém kroku barvu komponenty jako vrcholy v kresbě grafu (stejná paleta)", async () => {
    const p = await open("/graph/kruskal");
    const comp = (g: Element) =>
      /\b(?:n|uf)-comp(\d+)\b/.exec(g.getAttribute("class") ?? "")?.[1] ?? null;
    const ufNode = (label: string) =>
      [...p.m.el.querySelectorAll("g.uf-node")].find(
        (g) => g.querySelector("title")?.textContent === label,
      )!;
    const total = Number(
      /\/ (\d+)$/.exec(
        p.m.el.querySelector(".step-counter")!.textContent ?? "",
      )![1],
    );
    let colored = 0;
    for (let i = 1; i <= total; i++) {
      for (const n of p.nodes()) {
        const label = n.querySelector("title")!.textContent!;
        const inGraph = comp(n);
        expect(comp(ufNode(label)), `krok ${i}, vrchol ${label}`).toBe(inGraph);
        if (inGraph !== null) colored++;
      }
      if (i < total) await click(p.m.button("Krok vpřed"));
    }
    expect(colored).toBeGreaterThan(0);
    await p.m.unmount();
  });

  it("přesun vrcholu v režimu algoritmu (Shift+šipka, D3) nechá pozici přehrávání i pauzu – kroky se nepřepočítají", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Krok vpřed"));
    await click(p.m.button("Krok vpřed"));
    const counter = () =>
      p.m.el.querySelector(".step-counter")!.textContent ?? "";
    const before = counter();
    expect(before).toMatch(/^krok 3 \/ \d+$/);
    const at = () => p.node("6").style.transform;
    const was = at();
    await key(p.node("6"), { key: "ArrowRight", shiftKey: true });
    expect(at()).not.toBe(was);
    expect(counter()).toBe(before);
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });

  it("spuštění akce i Prázdný – nakreslit posune plátno do záběru (na telefonu jsou akce pod ním)", async () => {
    const original = Element.prototype.scrollIntoView;
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    try {
      const p = await open("/graph/bfs");
      expect(spy).not.toHaveBeenCalled();
      await click(p.m.button("Příklady z knihy"));
      await click(p.variant(presetById("scc")!.label));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.contexts[0]).toBe(p.m.el.querySelector(".viz-canvas"));
      await click(p.m.button("Vytvořit"));
      await click(p.variant("Prázdný – nakreslit"));
      expect(spy).toHaveBeenCalledTimes(2);
      await p.m.unmount();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("Vytvořit ▸ Náhodně (n = 5, Enter): graf s 5 vrcholy, stojí na kroku 1; Výchozí příklad vrátí prasátko a vyčistí odkaz", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Náhodně"));
    const n = p.m.input("vrcholů n =");
    await type(n, "5");
    await key(n, { key: "Enter" });
    expect(p.nodes()).toHaveLength(5);
    expect(p.playing()).toBe(false);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.search().get("g")).not.toBeNull();
    await click(p.m.button("Výchozí příklad"));
    expect(p.nodes()).toHaveLength(10);
    expect(p.loc.current!.search).toBe("");
    await p.m.unmount();
  });
  it("Příklady z knihy: na výchozím grafu Dijkstry nic zvýrazněné, po obr. 5.5 jen ono; Jiný alg. bez zvýraznění (GRAPH-05)", async () => {
    const p = await open("/graph/dijkstra");
    const pressed = () =>
      [...p.m.el.querySelectorAll<HTMLButtonElement>(".am-variant")]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.textContent);
    await click(p.m.button("Příklady z knihy"));
    expect(pressed()).toEqual([]);
    await click(p.variant("Obr. 5.5 „Prasátko“"));
    await click(p.m.button("Příklady z knihy"));
    if (!p.m.el.querySelector(".am-variant"))
      await click(p.m.button("Příklady z knihy"));
    expect(pressed()).toEqual(["Obr. 5.5 „Prasátko“"]);
    await click(p.m.button("Jiný alg."));
    expect(pressed()).toEqual([]);
    await p.m.unmount();
  });

  it("Upravit graf: sloupec výsledku zůstane (kresba se nezvětší ani neposune), je v něm typ grafu a návod (GRAPH-10)", async () => {
    const p = await open("/graph/dfs");
    expect(p.m.el.querySelector(".graph-layout .graph-result")).not.toBeNull();
    await click(p.m.button("Upravit graf"));
    const col = p.m.el.querySelector(".graph-layout .graph-result");
    expect(col, "sloupec výsledku i v editoru").not.toBeNull();
    expect(col!.querySelector(".ge-hint")?.textContent).toContain(
      "Klik do prázdna",
    );
    expect(col!.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
    expect(p.m.el.querySelector(".graph-editor .ge-toolbar input")).toBeNull();
    await p.m.unmount();
  });
});

describe("GraphPage – editor grafu (oprava 8. 11. 2026)", () => {
  it("v editoru přehrávač neběží: mezerník, ▶ ani Krok vpřed nic neposunou; Hotovo = krok 1, pozastaveno (G-04)", async () => {
    const p = await open("/graph/bfs");
    const counter = () =>
      p.m.el.querySelector(".step-counter")!.textContent ?? "";
    await click(p.m.button("Upravit graf"));
    const before = counter();
    await key(document.body, { key: " " });
    expect(p.playing()).toBe(false);
    expect(counter()).toBe(before);
    await click(p.m.el.querySelector<HTMLButtonElement>(".ctl-play")!);
    expect(p.playing()).toBe(false);
    await click(p.m.button("Krok vpřed"));
    await key(document.body, { key: "ArrowRight" });
    expect(counter()).toBe(before);
    expect(p.playing()).toBe(false);
    await click(p.m.button("Hotovo"));
    expect(counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });

  it("v editoru zůstane sloupec výsledku podle kroku 1 nového běhu ve všech modulech (G-01)", async () => {
    const expected: Record<string, string> = {
      bfs: "Fronta Q",
      dfs: "Zásobník rekurze",
      topo: "Topologické pořadí",
      dijkstra: "Otevřené vrcholy",
      "bellman-ford": "Fronta otevřených vrcholů",
      jarnik: "Hrany vedoucí z T ven",
      boruvka: "Iterace 1",
      kruskal: "Hrany podle váhy",
      bridges: "in a low",
      scc: "Zásobník Z",
    };
    for (const [id, title] of Object.entries(expected)) {
      const p = await open(`/graph/${id}`);
      const col = () => p.m.el.querySelector(".graph-layout .graph-result");
      const vars = col()?.querySelector(".vars")?.textContent ?? null;
      await click(p.m.button("Upravit graf"));
      expect(col()?.textContent, `${id}: tabulka v editoru`).toContain(title);
      expect(col()?.querySelector(".vars")?.textContent ?? null, id).toBe(vars);
      if (id === "kruskal")
        expect(col()!.querySelector(".uf-forest"), id).not.toBeNull();
      // panel editoru (typ grafu, návod) je pořád ve sloupci
      expect(col()!.querySelector(".ge-hint"), id).not.toBeNull();
      await p.m.unmount();
    }
  });

  it("v editoru se sloupec výsledku mění živě podle kroku 1: přidaný vrchol je v lese Union-Find (G-01)", async () => {
    const p = await open("/graph/kruskal");
    await click(p.m.button("Upravit graf"));
    const ufNodes = () =>
      p.m.el.querySelectorAll(".uf-forest g.uf-node").length;
    const before = ufNodes();
    expect(before).toBe(p.nodes().length);
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: unknown };
    const original = proto.getScreenCTM;
    proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    try {
      const svg = p.m.el.querySelector("svg.graph-svg")!;
      await pointer(p.m.el.querySelector(".graph-bg")!, "pointerdown", {
        clientX: 5,
        clientY: 5,
        timeStamp: 0,
      });
      await pointer(svg, "pointerup", {
        clientX: 5,
        clientY: 5,
        timeStamp: 50,
      });
    } finally {
      proto.getScreenCTM = original;
    }
    expect(ufNodes()).toBe(before + 1);
    await p.m.unmount();
  });

  it("Import / export textem je ve sloupci výsledku: po otevření zůstane zásobník i kresba, text jde použít (G-02)", async () => {
    const p = await open("/graph/dfs");
    for (const editing of [false, true]) {
      if (editing) await click(p.m.button("Upravit graf"));
      const col = p.m.el.querySelector(".graph-layout > .graph-result")!;
      const details = col.querySelector<HTMLDetailsElement>("details.ge-text");
      expect(
        details,
        `panel textu ve sloupci (editor: ${editing})`,
      ).not.toBeNull();
      expect(p.m.el.querySelector(".graph-editor .ge-text")).toBeNull();
      details!.open = true;
      expect(col.textContent).toContain("Zásobník rekurze");
      details!.open = false;
    }
    const ta = p.m.el.querySelector<HTMLTextAreaElement>(".ge-text textarea")!;
    await type(ta, `${ta.value}\nQ 1`);
    await click(p.m.button("Použít text"));
    expect(p.node("Q")).toBeTruthy();
    await click(p.m.button("Hotovo"));
    expect(p.m.el.querySelector(".viz-history")?.textContent).toContain(
      "Úprava grafu",
    );
    await p.m.unmount();
  });

  it("↶ Vrátit operaci v editoru nejdřív zahodí sezení úprav (graf jako před vstupem), historie zůstane; další klik vrací operace (G-08)", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Výchozí příklad"));
    const hist = () =>
      p.m.el.querySelector(".viz-history-items")?.textContent ?? "";
    expect(hist()).toContain("Výchozí příklad");
    await click(p.m.button("Upravit graf"));
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: unknown };
    const original = proto.getScreenCTM;
    proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    try {
      const svg = p.m.el.querySelector("svg.graph-svg")!;
      await pointer(p.m.el.querySelector(".graph-bg")!, "pointerdown", {
        clientX: 5,
        clientY: 5,
        timeStamp: 0,
      });
      await pointer(svg, "pointerup", {
        clientX: 5,
        clientY: 5,
        timeStamp: 50,
      });
    } finally {
      proto.getScreenCTM = original;
    }
    expect(p.nodes()).toHaveLength(11);
    await click(p.m.button("↶ Vrátit operaci"));
    expect(p.nodes()).toHaveLength(10);
    expect(hist()).toContain("Výchozí příklad");
    await click(p.m.button("↶ Vrátit operaci"));
    expect(hist()).not.toContain("Výchozí příklad");
    await p.m.unmount();
  });

  it("sloupec výsledku má v editoru zmrazenou šířku ze vstupu do editoru; prázdný graf po Hotovo zůstane vedle kresby (X-07)", async () => {
    const p = await open("/graph/bellman-ford");
    const result = () => p.m.el.querySelector<HTMLElement>(".graph-result")!;
    const proto = HTMLElement.prototype as unknown as {
      offsetWidth: number;
    };
    const desc = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    );
    Object.defineProperty(proto, "offsetWidth", {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains("graph-result")
          ? 251
          : 0;
      },
    });
    try {
      await click(p.m.button("Upravit graf"));
      expect(result().style.width).toBe("251px");
      expect(result().classList.contains("is-frozen")).toBe(true);
      await click(p.m.button("Hotovo"));
      expect(result().style.width).toBe("");
      expect(result().classList.contains("is-frozen")).toBe(false);
    } finally {
      if (desc)
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", desc);
    }
    // prázdný graf po Hotovo: rozložení graf | sloupec zůstane (žádný skok pod kresbu)
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Prázdný – nakreslit"));
    await click(p.m.button("Hotovo"));
    expect(p.nodes()).toHaveLength(0);
    expect(p.m.el.querySelector(".graph-layout .gtable")).not.toBeNull();
    await p.m.unmount();
  });

  it("BFS s vrstvami V₀…Vₖ má Upravit graf; editor vrstvy dočasně vypne a po Hotovo jsou zpět, krok 1, pozastaveno (G-09)", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.input("vrstvy V₀…Vₖ"));
    const layersShown = () =>
      p.m.el.querySelectorAll(".graph-group-label").length > 0;
    expect(layersShown()).toBe(true);
    const mode = p.m.el.querySelector<HTMLButtonElement>(".ge-mode");
    expect(mode, "Upravit graf ve vrstvách").not.toBeNull();
    await click(mode!);
    expect(p.m.button("Upravit graf").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(layersShown()).toBe(false);
    await click(p.m.button("Hotovo"));
    expect(layersShown()).toBe(true);
    expect(p.m.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });
});
