// @vitest-environment jsdom
/*
 * Stránka Fordova–Fulkersonova algoritmu (jsdom): výchozí příklad obr. 14.2 stojí na kroku 1, síť f/c
 * a síť rezerv vedle sebe, odkazy ?ex=…, ?cesta=, ?v=po-smeru, operace s z a s (krok 1, pozastaveno),
 * příklady z knihy a ↶ Vrátit operaci, přepínač kresby, párování, vadný odkaz a jedna zastávka Tabu na kresbu.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { FordFulkersonPage } from "./FordFulkersonPage";
import { DinicPage } from "./DinicPage";
import { GoldbergPage } from "./GoldbergPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

describe("Fordův–Fulkersonův algoritmus – stránka", () => {
  let search = "";
  let path = "";
  function Spy() {
    const loc = useLocation();
    search = loc.search;
    path = loc.pathname;
    return null;
  }
  const open = (url: string) =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(
          Routes,
          null,
          h(Route, {
            path: "/flow/ford-fulkerson",
            element: h(FordFulkersonPage),
          }),
          h(Route, { path: "/flow/dinic", element: h(DinicPage) }),
          h(Route, { path: "/flow/goldberg", element: h(GoldbergPage) }),
        ),
        h(Spy),
      ),
    );

  const counter = (el: HTMLElement) =>
    el.querySelector(".step-counter")?.textContent ?? "";
  const playing = (el: HTMLElement) =>
    el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
  const code = (el: HTMLElement) =>
    el.querySelector(".viz-code .pseudocode")?.textContent ?? "";
  const op = (el: HTMLElement) =>
    el.querySelector(".viz-op")?.textContent ?? "";
  const msg = (el: HTMLElement) =>
    el.querySelector(".viz-message")?.textContent ?? "";
  const panel = (el: HTMLElement, cls: string) =>
    el.querySelector<HTMLElement>(`.flow-panel-${cls}`);
  const edgeLabels = (root: Element | null) =>
    [...(root?.querySelectorAll(".graph-edge .edge-label") ?? [])].map(
      (t) => t.textContent,
    );
  const radio = (el: HTMLElement, label: string) => {
    const l = [...el.querySelectorAll("label")].find(
      (x) => x.textContent?.trim() === label,
    );
    const i = l?.querySelector("input");
    if (!i) throw new Error(`přepínač „${label}“ nenalezen`);
    return i;
  };
  const action = (el: HTMLElement, label: string) => {
    const b = [...el.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (x) => x.textContent?.trim().startsWith(label),
    );
    if (!b) throw new Error(`akce „${label}“ nenalezena`);
    return b;
  };
  const variant = (el: HTMLElement, label: string) => {
    const b = [
      ...el.querySelectorAll<HTMLButtonElement>(".am-variants button"),
    ].find((x) => x.textContent?.trim() === label);
    if (!b) throw new Error(`varianta „${label}“ nenalezena`);
    return b;
  };
  const go = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>(".am-go")!;

  it("výchozí příklad obr. 14.2: nadpis z registru, síť f/c a síť rezerv, krok 1, pozastaveno", async () => {
    page = await open("/flow/ford-fulkerson");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/flow/ford-fulkerson")!.title,
    );
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toBe("");
    const net = panel(el, "net");
    expect(edgeLabels(net)).toEqual([
      "0/10",
      "0/10",
      "0/7",
      "0/5",
      "0/9",
      "0/3",
      "0/10",
      "0/10",
    ]);
    // síť rezerv: 16 oblouků (dvojice), u nulového toku r = c po směru a 0 v protisměru
    expect(edgeLabels(panel(el, "res"))).toHaveLength(16);
    expect(code(el)).toContain("FordFulkerson");
    expect(op(el)).toContain("FordFulkerson(z, s)");
    expect(op(el)).toContain("BFS");
    // legenda vysvětluje cestu a řez
    expect(el.querySelector(".swatch.sw-flow-path")).not.toBeNull();
    expect(el.querySelector(".swatch.sw-flow-cut")).not.toBeNull();
  });

  it("odkaz ?ex=obr-14-4: tok 16 z obr. 14.2 vpravo, DFS, adresa se nepřepíše; Další ukáže cestu zbcads", async () => {
    page = await open("/flow/ford-fulkerson?ex=obr-14-4");
    const el = page.el;
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(search).toBe("?ex=obr-14-4");
    expect(op(el)).toContain("DFS");
    expect(edgeLabels(panel(el, "net"))).toContain("6/10");
    expect(msg(el)).toMatch(/obr\. 14\.2 vpravo/);
    await click(page.button("Krok vpřed"));
    expect(msg(el)).toMatch(/z → b → c → a → d → s/);
    // na síti je hrana a→c použitá proti směru
    expect(
      panel(el, "net")!.querySelectorAll(".graph-edge.e-path-back"),
    ).toHaveLength(1);
    expect(playing(el)).toBe(false);
  });

  it("operace FordFulkerson(z, s) připraví nový běh – krok 1, pozastaveno", async () => {
    page = await open("/flow/ford-fulkerson");
    const el = page.el;
    await click(page.button("Krok vpřed"));
    expect(counter(el)).toMatch(/^krok 2 \//);
    await click(action(el, "FordFulkerson"));
    await click(go(el));
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(playing(el)).toBe(false);
  });

  it("hledání DFS a varianta jen po směru: nový běh, pseudokód varianty, odkaz cesta= a v=", async () => {
    page = await open("/flow/ford-fulkerson?ex=obr-14-3");
    const el = page.el;
    expect(op(el)).toContain("DFS");
    await click(radio(el, "jen po směru (str. 354)"));
    expect(code(el)).toContain("jen po směru");
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(search).toBe("?ex=obr-14-3&v=po-smeru");
    await click(radio(el, "BFS"));
    expect(search).toBe("?ex=obr-14-3&cesta=bfs&v=po-smeru");
    expect(op(el)).toContain("BFS");
    // konec varianty po směru na obr. 14.3 s DFS: varování, maximum je 2
    await click(radio(el, "DFS"));
    await click(page.button("Na konec"));
    expect(msg(el)).toMatch(/maximální tok má velikost 2/);
  });

  it("Příklady z knihy ▸ Obr. 14.6, pak ↶ Vrátit operaci; Párování z bipartitního grafu", async () => {
    page = await open("/flow/ford-fulkerson");
    const el = page.el;
    await click(action(el, "Příklady z knihy"));
    await click(variant(el, "Obr. 14.6 Párování"));
    expect(search).toBe("?ex=obr-14-6");
    // síť párování: kresba jen síť (síť rezerv se 44 oblouky by byla změť), bez popisků 1/1 (UX-05)
    expect(
      el.querySelector<HTMLInputElement>('input[name="flow-view-ff"]:checked')
        ?.value,
    ).toBe("sit");
    expect(edgeLabels(panel(el, "net"))).toHaveLength(0);
    expect(el.querySelector(".viz-history")?.textContent).toContain(
      "Obr. 14.6 Párování",
    );
    await click(page.button("↶ Vrátit operaci"));
    expect(search).toBe("");
    expect(edgeLabels(panel(el, "net"))).toHaveLength(8);

    await click(action(el, "Vytvořit"));
    await click(variant(el, "Párování"));
    await type(page.input("hrany ="), "A X, B X, B Y");
    await click(go(el));
    expect(search).toMatch(/^\?g=/);
    await click(page.button("Na konec"));
    expect(msg(el)).toMatch(/párování \(2\): A–X, B–Y/);
    expect(
      panel(el, "net")!.querySelectorAll(".graph-edge.e-match"),
    ).toHaveLength(2);
  });

  it("kresba: jen síť schová síť rezerv", async () => {
    page = await open("/flow/ford-fulkerson");
    const el = page.el;
    expect(panel(el, "res")).not.toBeNull();
    await click(radio(el, "jen síť"));
    expect(panel(el, "res")).toBeNull();
    await click(radio(el, "jen rezervy"));
    expect(panel(el, "res")).not.toBeNull();
    expect(panel(el, "net")!.hidden).toBe(true);
  });

  it("vadný odkaz: hláška a výchozí příklad", async () => {
    page = await open("/flow/ford-fulkerson?g=z%20s%202.5");
    const el = page.el;
    expect(el.querySelector(".input-error")?.textContent).toMatch(/celé číslo/);
    expect(edgeLabels(panel(el, "net"))).toHaveLength(8);
  });

  it("každá kresba má nejvýš jednu zastávku Tabu", async () => {
    page = await open("/flow/ford-fulkerson");
    for (const svg of page.el.querySelectorAll("svg")) {
      const stops = [...svg.querySelectorAll("[tabindex]")].filter(
        (x) => x.getAttribute("tabindex") === "0",
      );
      expect(stops.length).toBeLessThanOrEqual(1);
    }
  });

  it("Jiný alg. ▸ Dinicův algoritmus: tatáž síť na stránce Dinica", async () => {
    page = await open("/flow/ford-fulkerson?ex=obr-14-3");
    const el = page.el;
    await click(action(el, "Jiný alg."));
    await click(variant(el, "Dinicův algoritmus"));
    expect(path).toBe("/flow/dinic");
    expect(search).toBe("?ex=obr-14-3");
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/flow/dinic")!.title,
    );
    expect(counter(el)).toMatch(/^krok 1 \//);
  });

  it("Jiný alg. ▸ Goldbergův algoritmus: tatáž síť na stránce Goldberga (V-8)", async () => {
    page = await open("/flow/ford-fulkerson?ex=obr-14-3");
    const el = page.el;
    await click(action(el, "Jiný alg."));
    await click(variant(el, "Goldbergův algoritmus"));
    expect(path).toBe("/flow/goldberg");
    expect(search).toBe("?ex=obr-14-3");
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/flow/goldberg")!.title,
    );
    expect(counter(el)).toMatch(/^krok 1 \//);
  });
});
