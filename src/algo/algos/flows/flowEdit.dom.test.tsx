// @vitest-environment jsdom
/*
 * Toky v režimu „Upravit graf“ (chyba vlastníka 8. 11. 2026: „Při editu zmizí residuální graf nebo
 * u goldberga ten graf druhej“). Zrušené UX-02: v editoru zůstane druhá kresba (síť rezerv r, vrstevnatá
 * síť R, výšky) ve stejném rozložení jako v běhu a živě ukazuje krok 1 nového běhu upravené sítě; přepínač
 * Kresba jde přepnout; přehrávač stojí na kroku 1 (mezerník ani Krok vpřed ho neposunou); Hotovo = nový
 * běh na kroku 1, pozastaveno. Neplatná síť (chybí stok, prázdná) = krátká nápověda v druhém panelu.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { DinicPage } from "./DinicPage";
import { FordFulkersonPage } from "./FordFulkersonPage";
import { GoldbergPage } from "./GoldbergPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const open = async (url: string) => {
  page = await mount(
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
    ),
  );
  return page;
};

const MODULES = [
  {
    path: "/flow/ford-fulkerson",
    second: "Síť rezerv r",
    radio: "flow-view-ff",
    only: "rezervy",
  },
  {
    path: "/flow/dinic",
    second: "Síť rezerv R po vrstvách",
    radio: "flow-view-dinic",
    only: "rezervy",
  },
  {
    path: "/flow/goldberg",
    second: "Výšky vrcholů",
    radio: "gb-view-goldberg",
    only: "vysky",
  },
] as const;

const second = (el: HTMLElement, label: string) =>
  el.querySelector<HTMLElement>(`section[aria-label="${label}"]`);
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
const viewRadio = (el: HTMLElement, name: string, value: string) =>
  el.querySelector<HTMLInputElement>(
    `input[name="${name}"][value="${value}"]`,
  )!;
const layoutOf = (el: HTMLElement) => {
  const lay = el.querySelector<HTMLElement>(".flow-layout")!;
  return {
    cls: lay.className,
    panels: [...lay.querySelectorAll<HTMLElement>(":scope > .flow-panel")].map(
      (p) => p.className,
    ),
  };
};
const netSvg = (el: HTMLElement) =>
  el.querySelector<SVGSVGElement>(".flow-panel-net svg.graph-svg")!;
const textarea = (el: HTMLElement) =>
  el.querySelector<HTMLTextAreaElement>(".flow-panel-net textarea")!;
/** Import / export textem: nový text sítě (v editoru patří k sezení úprav) */
async function importText(p: Mounted, text: string) {
  await type(textarea(p.el), text);
  await click(p.button("Použít text"));
}
/** smaže vrchol z klávesnice (Enter = výběr, Delete = smazat) */
async function deleteVertex(el: HTMLElement, label: string) {
  const v = [...netSvg(el).querySelectorAll<SVGGElement>("g.graph-node")].find(
    (g) => (g.getAttribute("aria-label") ?? "").startsWith(`Vrchol ${label}`),
  );
  if (!v) throw new Error(`vrchol ${label} nenalezen`);
  await key(v, { key: "Enter" });
  await key(v, { key: "Delete" });
}
const edgeTexts = (root: Element | null) =>
  [...(root?.querySelectorAll(".graph-edge .edge-label") ?? [])].map(
    (t) => t.textContent,
  );

describe("toky – v editoru zůstane druhá kresba (zrušené UX-02, F-01/F-02/F-08)", () => {
  it.each(MODULES)(
    "$path: po Upravit graf je vidět $second, Kresba jde přepnout, rozložení beze změny",
    async ({ path, second: label, radio, only }) => {
      const p = await open(path);
      const el = p.el;
      await click(viewRadio(el, radio, "obe"));
      const run = layoutOf(el);
      expect(second(el, label)).not.toBeNull();
      expect(el.querySelector(".vars")).not.toBeNull();
      await click(p.button("Upravit graf"));
      expect(second(el, label), "druhý panel v editoru").not.toBeNull();
      // F-03: stejné třídy rozložení a stejné panely jako v běhu, editor nepřidá třetí sloupec
      expect(layoutOf(el)).toEqual(run);
      expect(el.querySelector(".flow-panel-edit")).toBeNull();
      // řádek proměnných zůstane (krok 1, |f| = 0) – výška se nemění
      expect(el.querySelector(".vars")).not.toBeNull();
      // Kresba: přepínač v editoru povolený a funguje
      const r = viewRadio(el, radio, "sit");
      expect(r.closest("fieldset")!.disabled).toBe(false);
      await click(r);
      expect(second(el, label)).toBeNull();
      await click(viewRadio(el, radio, "obe"));
      expect(second(el, label)).not.toBeNull();
      // „jen rezervy / výšky“ v editoru: síť zůstane vidět (kreslí se na ní), po Hotovo jen druhá kresba
      await click(viewRadio(el, radio, only));
      expect(second(el, label)).not.toBeNull();
      expect(el.querySelector<HTMLElement>(".flow-panel-net")!.hidden).toBe(
        false,
      );
      await click(p.button("Hotovo"));
      expect(el.querySelector<HTMLElement>(".flow-panel-net")!.hidden).toBe(
        true,
      );
      expect(viewRadio(el, radio, only).checked).toBe(true);
    },
  );

  it.each(MODULES)(
    "$path: přehrávač v editoru stojí na kroku 1 (mezerník ani Krok vpřed ho neposunou); Hotovo = krok 1, pozastaveno",
    async ({ path }) => {
      const p = await open(path);
      const el = p.el;
      await click(p.button("Krok vpřed"));
      await click(p.button("Krok vpřed"));
      expect(counter(el)).toMatch(/^krok 3 \//);
      await click(p.button("Upravit graf"));
      expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
      await click(p.button("Krok vpřed"));
      await key(document.body, { key: " " });
      await key(document.body, { key: "ArrowRight" });
      await key(document.body, { key: "End" });
      expect(counter(el)).toMatch(/^krok 1 \//);
      expect(playing(el)).toBe(false);
      await click(p.button("Hotovo"));
      expect(counter(el)).toMatch(/^krok 1 \//);
      expect(playing(el)).toBe(false);
    },
  );
});

describe("toky – druhá kresba v editoru se živě mění s úpravou sítě (krok 1 nového běhu)", () => {
  it("FordFulkerson: nová hrana = 2 nové oblouky sítě rezerv, změněná kapacita = nové r (r = c při nulovém toku)", async () => {
    const p = await open("/flow/ford-fulkerson");
    const el = p.el;
    const res = () => second(el, "Síť rezerv r");
    await click(p.button("Upravit graf"));
    expect(res()!.querySelectorAll(".graph-edge")).toHaveLength(16);
    const base = textarea(el).value;
    await importText(p, `${base}\nc d 4`);
    expect(res()!.querySelectorAll(".graph-edge")).toHaveLength(18);
    expect(edgeTexts(res())).toContain("4");
    await importText(p, base.replace("z a 10", "z a 13"));
    expect(res()!.querySelectorAll(".graph-edge")).toHaveLength(16);
    expect(edgeTexts(res())).toContain("13");
    expect(el.querySelector(".vars")?.textContent).toContain("|f|");
  });

  it("FordFulkerson obr. 14.4: v editoru rezervy toku 16 (krok 1) – stejné jako krok 1 po Hotovo", async () => {
    const p = await open("/flow/ford-fulkerson?ex=obr-14-4");
    const el = p.el;
    const res = () => edgeTexts(second(el, "Síť rezerv r"));
    const run = res();
    await click(p.button("Upravit graf"));
    const editing = res();
    expect(editing).toEqual(run);
    await click(p.button("Hotovo"));
    expect(res()).toEqual(editing);
    // nápověda editoru vysvětluje, že kresba ukazuje krok 1 (u obr. 14.4 tok 16)
  });

  it("Dinic: nová hrana změní vrstevnatou síť R nulového toku", async () => {
    const p = await open("/flow/dinic?ex=obr-14-2");
    const el = p.el;
    const res = () => second(el, "Síť rezerv R po vrstvách");
    await click(p.button("Upravit graf"));
    const before = res()!.querySelectorAll(".graph-edge").length;
    expect(before).toBeGreaterThan(0);
    await importText(p, `${textarea(el).value}\nz s 4`);
    expect(res()!.querySelectorAll(".graph-edge").length).toBe(before + 1);
    expect(edgeTexts(res())).toContain("4");
  });

  it("Goldberg: nový vrchol = o sloupec víc, ze z vedou hrany s rezervou dolů (h(z) = n)", async () => {
    const p = await open("/flow/goldberg");
    const el = p.el;
    const hs = () => second(el, "Výšky vrcholů")!;
    await click(p.button("Upravit graf"));
    const n0 = hs().querySelectorAll(".gb-node").length;
    await importText(p, `${textarea(el).value}\nz x 3\nx s 2`);
    expect(hs().querySelectorAll(".gb-node")).toHaveLength(n0 + 1);
    expect(hs().querySelectorAll(".gb-arc.gb-down").length).toBeGreaterThan(0);
    expect(hs().textContent).toContain(`n = ${n0 + 1}`);
  });
});

describe("toky – neplatná síť v editoru: nápověda v druhém panelu, panel nezmizí (F-09)", () => {
  it.each(MODULES)(
    "$path: smazaný stok s → poznámka „Stok s v síti chybí“; z = s a prázdná síť → text chyby",
    async ({ path, second: label }) => {
      const p = await open(path);
      const el = p.el;
      await click(p.button("Upravit graf"));
      await deleteVertex(el, "s");
      expect(second(el, label)).not.toBeNull();
      expect(second(el, label)!.textContent).toMatch(
        /Stok s v síti chybí – použije se /,
      );
      // celou síť pryč (Import / export textem s jediným vrcholem) → z = s
      await importText(p, "z");
      expect(second(el, label)).not.toBeNull();
      expect(second(el, label)!.textContent).toMatch(
        /Zdroj z a stok s musí být různé vrcholy/,
      );
      await deleteVertex(el, "z");
      expect(second(el, label)!.textContent).toMatch(/Síť je prázdná/);
      expect(
        el.querySelector(".error-boundary, [role=alert].crash"),
      ).toBeNull();
    },
  );
});

describe("toky – síť párování v editoru bez popisků „1“ (F-10)", () => {
  it.each(MODULES)(
    "$path: obr. 14.6 v editoru bez jedniček u hran; výchozí síť popisky kapacit má",
    async ({ path }) => {
      const p = await open(`${path}?ex=obr-14-6`);
      const el = p.el;
      await click(p.button("Upravit graf"));
      expect(edgeTexts(el.querySelector(".flow-panel-net"))).toEqual([]);
      await p.unmount();
      page = null;
      const q = await open(`${path}?ex=obr-14-3`);
      await click(q.button("Upravit graf"));
      expect(
        edgeTexts(q.el.querySelector(".flow-panel-net")).length,
      ).toBeGreaterThan(0);
    },
  );
});

describe("toky – síť párování na menším desktopu: vidět síť s párováním (F-06)", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });
  const smallDesktop = () => {
    window.matchMedia = ((q: string) => ({
      matches: !q.includes("1600px"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };
  it.each(MODULES)(
    "$path?ex=obr-14-6: na konci běhu je v síti vidět párování",
    async ({ path }) => {
      smallDesktop();
      const p = await open(`${path}?ex=obr-14-6`);
      const el = p.el;
      await click(p.button("Na konec"));
      const net = el.querySelector<HTMLElement>(".flow-panel-net")!;
      expect(net.hidden).toBe(false);
      expect(net.querySelectorAll(".graph-edge.e-match").length).toBe(4);
      // vedle sebe, ne pod sebou
      expect(
        el.querySelector(".flow-layout")!.classList.contains("flow-stack"),
      ).toBe(false);
    },
  );
});

describe("toky – rozložení se během úprav nepřeskládá (F-03)", () => {
  it("Dinic obr. 14.2: nová hrana z → s by vrstvy zúžila (vedle sebe) – v editoru zůstanou pod sebou, nové rozložení až po Hotovo", async () => {
    const p = await open("/flow/dinic?ex=obr-14-2");
    const el = p.el;
    const stack = () =>
      el.querySelector(".flow-layout")!.classList.contains("flow-stack");
    expect(stack()).toBe(true);
    await click(p.button("Upravit graf"));
    await importText(p, `${textarea(el).value}\nz s 7`);
    expect(stack()).toBe(true);
    await click(p.button("Hotovo"));
    expect(stack()).toBe(false);
  });

  it("FordFulkerson obr. 14.6 (jen síť): kapacita 2 udělá ze sítě párování obyčejnou síť – v editoru kresba zůstane, po Hotovo výchozí obě", async () => {
    const p = await open("/flow/ford-fulkerson?ex=obr-14-6");
    const el = p.el;
    expect(second(el, "Síť rezerv r")).toBeNull();
    await click(p.button("Upravit graf"));
    await importText(p, textarea(el).value.replace("z L1 1", "z L1 2"));
    expect(second(el, "Síť rezerv r")).toBeNull();
    await click(p.button("Hotovo"));
    expect(second(el, "Síť rezerv r")).not.toBeNull();
  });
});

describe("toky – v editoru má každá kresba nejvýš jednu zastávku Tabu (roving tabindex)", () => {
  it.each(MODULES)("$path", async ({ path, second: label }) => {
    const p = await open(path);
    await click(p.button("Upravit graf"));
    expect(second(p.el, label)).not.toBeNull();
    for (const svg of p.el.querySelectorAll("svg")) {
      const stops = [...svg.querySelectorAll("[tabindex]")].filter(
        (x) => x.getAttribute("tabindex") === "0",
      );
      expect(stops.length).toBeLessThanOrEqual(1);
    }
  });
});
