// @vitest-environment jsdom
/*
 * Stránka k-d stromu v jsdom (tenká vrstva nad kdPageModel): RangeQuery z nabídky (Enter = Provést,
 * stojí na kroku 1, nepřehrává se samo), klepnutí do roviny přidá bod, tah v rovině spustí dotaz, Build(P) jedním klikem.
 * jsdom nemá getScreenCTM – vrací se jednotková matice, takže clientX/Y = px ve viewBoxu roviny.
 */
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { click, key, mount, pointer, type } from "../../core/domTest";
import { KdTreePage } from "./KdTreePage";

const proto = SVGElement.prototype as unknown as Record<string, unknown>;
const had = "getScreenCTM" in proto;
const original = proto.getScreenCTM;
beforeAll(() => {
  proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
});
afterAll(() => {
  if (had) proto.getScreenCTM = original;
  else delete proto.getScreenCTM;
});

/** rovina 0–100 → px (360 px, okraj 20, y nahoru) */
const px = (x: number, y: number) => ({
  clientX: 20 + x * 3.2,
  clientY: 340 - y * 3.2,
});
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";
const playLabel = (el: HTMLElement) =>
  el.querySelector(".ctl-play")!.getAttribute("aria-label");
const plane = (el: HTMLElement) =>
  el.querySelector<SVGSVGElement>("svg.kd-plane")!;
const nPoints = (el: HTMLElement) => el.querySelectorAll(".kd-pt").length;

const URL3 = "/geom/kdtree?pts=10,20,30,40,70,80&q=10,40,20,90";

describe("KdTreePage (jsdom)", () => {
  let search = "";
  function Spy() {
    search = decodeURIComponent(useLocation().search);
    return null;
  }
  const page = (url: string) =>
    mount(h(MemoryRouter, { initialEntries: [url] }, h(KdTreePage), h(Spy)));

  it("RangeQuery(Q): pole mají meze z adresy, Enter v poli spustí dotaz (krok 1, pozastaveno); adresa se zapíše", async () => {
    const p = await page(URL3);
    await click(p.button("RangeQuery(Q)"));
    expect(
      ["x od", "x do", "y od", "y do"].map((l) => p.input(l).value),
    ).toEqual(["10", "40", "20", "90"]);
    await type(p.input("x do"), "80");
    await key(p.input("x do"), { key: "Enter" });
    expect(op(p.el)).toContain("RangeQuery([10, 80] × [20, 90])");
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(search).toContain("q=10,80,20,90");
    await p.unmount();
  });

  it("Vytvořit ▸ Náhodně: pole n má počet bodů, Enter vygeneruje nové body a připraví stavbu (krok 1)", async () => {
    const p = await page("/geom/kdtree?n=5&seed=3");
    await click(p.button("Vytvořit"));
    await click(p.button("Náhodně"));
    expect(p.input("n =").value).toBe("5");
    await type(p.input("n ="), "8");
    await key(p.input("n ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(8);
    expect(op(p.el)).toContain("Build(P), n = 8");
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(search).toContain("n=8");
    expect(search).not.toContain("pts=");
    await p.unmount();
  });

  it("klepnutí do prázdna přidá bod a strom se hned přestaví (bez přehrávání); klepnutí na bod ho NEsmaže, ale vybere; × ho smaže", async () => {
    const p = await page(URL3);
    const at = px(50, 55);
    await pointer(plane(p.el), "pointerdown", at);
    await pointer(plane(p.el), "pointerup", at);
    expect(nPoints(p.el)).toBe(4);
    expect(msg(p.el)).toContain("Přidán bod (50, 55).");
    expect(p.el.querySelectorAll(".kd-split")).toHaveLength(4);
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(search).toContain("pts=10,20,30,40,70,80,50,55");
    const on = px(30, 40);
    // klik 14 px vedle bodu ho vybere, nesmaže
    await pointer(plane(p.el), "pointerdown", {
      ...on,
      clientX: on.clientX + 14,
    });
    await pointer(plane(p.el), "pointerup", {
      ...on,
      clientX: on.clientX + 14,
    });
    expect(nPoints(p.el)).toBe(4);
    expect(
      plane(p.el).querySelector(".kd-pt.is-selected text")?.textContent,
    ).toBe("30,40");
    const c = plane(p.el).querySelector(".plane-del circle")!;
    const del = {
      clientX: Number(c.getAttribute("cx")),
      clientY: Number(c.getAttribute("cy")),
    };
    await pointer(plane(p.el), "pointerdown", del);
    await pointer(plane(p.el), "pointerup", del);
    expect(nPoints(p.el)).toBe(3);
    expect(msg(p.el)).toContain("Odebrán bod (30, 40).");
    expect(plane(p.el).querySelector(".plane-del")).toBeNull();
    await p.unmount();
  });

  it("tah bodu: během tahu rovina ukazuje bod na novém místě i přestavěné dělení, viewBox se nemění; chycení vedle středu bez skoku", async () => {
    const p = await page(URL3);
    const svg = plane(p.el);
    const vb = svg.getAttribute("viewBox");
    const from = px(30, 40);
    await pointer(svg, "pointerdown", { ...from, clientX: from.clientX + 12 });
    await pointer(svg, "pointermove", {
      clientX: from.clientX + 12 + 48,
      clientY: from.clientY - 32,
    });
    const dragged = svg.querySelector(".kd-pt.is-dragged");
    expect(dragged?.querySelector("text")?.textContent).toBe("45,50");
    expect(svg.classList.contains("is-dragging")).toBe(true);
    expect(svg.getAttribute("viewBox")).toBe(vb);
    // dělicí přímka kořene (medián x = přesunutý bod) už stojí na x = 45
    const xs = [...svg.querySelectorAll("line.kd-split")].map((l) =>
      l.getAttribute("x1"),
    );
    expect(xs).toContain(String(20 + 45 * 3.2));
    await pointer(svg, "pointerup", {
      clientX: from.clientX + 12 + 48,
      clientY: from.clientY - 32,
    });
    expect(search).toContain("pts=10,20,45,50,70,80");
    expect(svg.classList.contains("is-dragging")).toBe(false);
    await p.unmount();
  });

  it("obdélník Q: tah rohu změní obě meze, tah hrany jednu, tah vnitřku ho posune – vždy RangeQuery na kroku 1", async () => {
    // URL3: Q = [10, 40] × [20, 90]
    const p = await page(URL3);
    const svg = plane(p.el);
    expect(svg.querySelectorAll(".kd-q-handle")).toHaveLength(4);
    const drag = async (
      from: { clientX: number; clientY: number },
      dx: number,
      dy: number,
    ) => {
      const to = { clientX: from.clientX + dx, clientY: from.clientY + dy };
      await pointer(svg, "pointerdown", from);
      await pointer(svg, "pointermove", to);
      expect(svg.querySelector(".kd-query-draft")).not.toBeNull();
      await pointer(svg, "pointerup", to);
    };
    // pravý horní roh Q = (40, 90) → o 10 doprava a 10 dolů
    await drag(px(40, 90), 32, 32);
    expect(op(p.el)).toContain("RangeQuery([10, 50] × [20, 80])");
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(playLabel(p.el)).toBe("Přehrát");
    // pravá hrana (x = 50) o 10 doleva
    await drag(px(50, 50), -32, 0);
    expect(op(p.el)).toContain("RangeQuery([10, 40] × [20, 80])");
    // vnitřek: posun o (−5, +5)
    await drag(px(25, 65), -16, -16);
    expect(op(p.el)).toContain("RangeQuery([5, 35] × [25, 85])");
    expect(search).toContain("q=5,35,25,85");
    await click(p.button("↶ Vrátit operaci"));
    expect(search).toContain("q=10,40,20,80");
    await p.unmount();
  });

  it("rovina je jedna zastávka Tabu: šipky po bodech, Enter bod vybere, Shift+šipka ho posune, Delete ho smaže", async () => {
    const p = await page(URL3);
    const stops = plane(p.el).querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    const first = stops[0] as SVGGElement;
    expect(first.getAttribute("aria-label")).toMatch(/\(10, 20\)/);
    first.focus();
    await key(first, { key: "Enter" });
    expect(first.classList.contains("is-selected")).toBe(true);
    expect(nPoints(p.el)).toBe(3);
    await key(first, { key: "ArrowRight", shiftKey: true });
    expect(search).toContain("pts=11,20,30,40,70,80");
    const now = plane(p.el).querySelector('[tabindex="0"]') as SVGGElement;
    await key(now, { key: "Delete" });
    expect(nPoints(p.el)).toBe(2);
    expect(msg(p.el)).toContain("Odebrán bod (11, 20).");
    await p.unmount();
  });

  it("tah z prázdna v rovině = RangeQuery s natáhnutým obdélníkem, stojí na kroku 1 a meze jsou i v polích", async () => {
    const p = await page(URL3);
    const a = px(5, 95);
    const b = px(60, 50);
    await pointer(plane(p.el), "pointerdown", a);
    await pointer(plane(p.el), "pointermove", b);
    expect(p.el.querySelector(".kd-query-draft")).not.toBeNull();
    await pointer(plane(p.el), "pointerup", b);
    expect(op(p.el)).toContain("RangeQuery([5, 60] × [50, 95])");
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("RangeQuery(Q)"));
    expect(
      ["x od", "x do", "y od", "y do"].map((l) => p.input(l).value),
    ).toEqual(["5", "60", "50", "95"]);
    await p.unmount();
  });

  it("Build(P) jedním klikem připraví stavbu na kroku 1, nepřehrává se sama", async () => {
    const p = await page(URL3);
    await click(p.button("Build(P)"));
    expect(op(p.el)).toContain("Build(P), n = 3");
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.unmount();
  });
});

describe("KdTreePage – jednotné akce, historie a stavba (UX test fáze 3)", () => {
  let search = "";
  function Spy() {
    search = decodeURIComponent(useLocation().search);
    return null;
  }
  const page = (url: string) =>
    mount(h(MemoryRouter, { initialEntries: [url] }, h(KdTreePage), h(Spy)));

  it("Vytvořit: Vlastní · Náhodně · Prázdná rovina (Výchozí příklad je jen pod akcemi); body v závorkách (CROSS-02, TREEHASH-16)", async () => {
    const p = await page(URL3);
    await click(p.button("Vytvořit"));
    const variants = [
      ...p.el.querySelectorAll(
        ".action-menu [role=radio], .action-menu .am-variant, .action-menu button",
      ),
    ]
      .map((b) => b.textContent?.trim())
      .filter(
        (t) =>
          t === "Vlastní" ||
          t === "Náhodně" ||
          t === "Prázdná rovina" ||
          t === "Výchozí příklad",
      );
    expect(variants).toEqual(["Vlastní", "Náhodně", "Prázdná rovina"]);
    const field = p.input("body =");
    expect(field.value).toBe("(10, 20), (30, 40), (70, 80)");
    await type(field, "(5,6), (50,60); 90 10");
    await key(field, { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    expect(search).toContain("pts=5,6,50,60,90,10");
    // lichý počet čísel: chyba u pole, nic se nestane
    if (p.button("Vytvořit").getAttribute("aria-expanded") !== "true")
      await click(p.button("Vytvořit"));
    await type(p.input("body ="), "(1,2), (3)");
    expect(p.el.querySelector(".action-menu")?.textContent).toContain(
      "poslední bod nemá y",
    );
    await key(p.input("body ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    await p.unmount();
  });

  it("přesun bodu jde vrátit ↶ Vrátit operaci (poloha i adresa); Výchozí příklad je v řádku pod akcemi", async () => {
    const p = await page(URL3);
    expect(p.button("↶ Vrátit operaci").disabled).toBe(true);
    await pointer(plane(p.el), "pointerdown", px(30, 40));
    await pointer(plane(p.el), "pointermove", px(45, 50));
    await pointer(plane(p.el), "pointerup", px(45, 50));
    expect(msg(p.el)).toContain("přesunut na (45, 50)");
    expect(search).toContain("pts=10,20,45,50,70,80");
    expect(p.el.querySelector(".viz-history-list")?.textContent).toContain(
      "přesunut",
    );
    await click(p.button("↶ Vrátit operaci"));
    expect(search).toContain("pts=10,20,30,40,70,80");
    const labels = [...p.el.querySelectorAll(".kd-pt text")].map(
      (t) => t.textContent,
    );
    expect(labels).toContain("30,40");
    expect(labels).not.toContain("45,50");
    expect(playLabel(p.el)).toBe("Přehrát");
    expect(
      p.el.querySelector(".viz-history .viz-history-buttons")?.textContent,
    ).toContain("Výchozí příklad");
  });

  it("popisek bodu u pravého okraje roviny se překlopí doleva – nepřeteče přes okraj do sloupce stromu", async () => {
    const p = await page("/geom/kdtree?pts=95,88,10,20,50,50");
    const label = (t: string) =>
      [...p.el.querySelectorAll(".kd-pt text")].find(
        (e) => e.textContent === t,
      );
    expect(label("95,88")?.getAttribute("text-anchor")).toBe("end");
    expect(label("10,20")?.getAttribute("text-anchor") ?? "start").toBe(
      "start",
    );
    await p.unmount();
  });

  it("během stavby se náhled Q nekreslí a místo „prázdný strom“ je krátké „Strom se staví (▶)“ – vejde se do úzkého sloupce (TREEHASH-15)", async () => {
    const p = await page("/geom/kdtree?pts=10,20,30,40,70,80");
    expect(op(p.el)).toContain("Build(P)");
    expect(p.el.querySelector(".kd-query-preview")).toBeNull();
    expect(p.el.querySelector(".kd-tree-col")?.textContent).toContain(
      "Strom se staví (▶)",
    );
    expect(p.el.querySelector(".kd-tree-col")?.textContent).not.toContain(
      "prázdný strom",
    );
    await p.unmount();
  });
});

describe("KdTreePage – rozložení: rovina a strom vedle sebe na desktopu", () => {
  it("strom a proměnné jsou ve sloupci .kd-tree-col vedle roviny v .kd-layout", async () => {
    const p = await mount(
      h(MemoryRouter, { initialEntries: ["/geom/kdtree"] }, h(KdTreePage)),
    );
    const layout = p.el.querySelector(".kd-layout")!;
    expect(layout).not.toBeNull();
    expect(layout.querySelector(":scope > .kd-plane")).not.toBeNull();
    const col = layout.querySelector(":scope > .kd-tree-col")!;
    expect(col).not.toBeNull();
    expect(col.querySelector(".tree-svg")).not.toBeNull();
    await p.unmount();
  });
});
