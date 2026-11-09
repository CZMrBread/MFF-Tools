// @vitest-environment jsdom
/*
 * Stránka konvexního obalu v jsdom (tenká vrstva nad hull.ts / hullPageModel.ts): výchozí obr. 16.1,
 * Příklady z knihy, přepnutí zametání ↔ provázek, klepnutí do roviny, klávesnice na bodech, odkaz, historie.
 * Přehrávač po každé změně stojí na kroku 1. jsdom nemá getScreenCTM – jednotková matice, clientX/Y = px
 * ve viewBoxu roviny.
 */
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { click, key, mount, pointer, type } from "../../core/domTest";
import { HullPage } from "./HullPage";

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

/** rovina 0–100 → px (400 px, okraj 22, y nahoru) */
const px = (x: number, y: number) => ({
  clientX: 22 + x * 3.56,
  clientY: 378 - y * 3.56,
});
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const paused = (el: HTMLElement) =>
  el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Přehrát";
const plane = (el: HTMLElement) =>
  el.querySelector<SVGSVGElement>("svg.hull-plane")!;
const nPoints = (el: HTMLElement) => el.querySelectorAll(".hull-pt").length;
const code = (el: HTMLElement) =>
  el.querySelector(".pseudocode")?.textContent ?? "";
/** otevře akci (když už otevřená je – v jsdom zůstává po provedení otevřená –, znovu ji nezavře) */
async function openAction(el: HTMLElement, label: string) {
  const b = [...el.querySelectorAll<HTMLButtonElement>(".am-action")].find(
    (x) => x.textContent?.trim() === label,
  );
  if (!b) throw new Error(`akce „${label}“ nenalezena`);
  if (b.getAttribute("aria-expanded") !== "true") await click(b);
}
/** klepnutí (stisk a puštění na stejném místě) */
async function tap(
  target: Element,
  at: { clientX: number; clientY: number },
  extra: { pointerType?: string; pointerId?: number } = {},
) {
  await pointer(target, "pointerdown", { ...at, ...extra });
  await pointer(target, "pointerup", { ...at, ...extra });
}
const atStep1 = (el: HTMLElement) =>
  /^krok 1 \/ \d+$/.test(counter(el)) && paused(el);

describe("HullPage (jsdom)", () => {
  let search = "";
  function Spy() {
    search = decodeURIComponent(useLocation().search);
    return null;
  }
  const page = (url = "/geom/hull") =>
    mount(h(MemoryRouter, { initialEntries: [url] }, h(HullPage), h(Spy)));

  it("výchozí příklad obr. 16.1: 21 jabloní, KonvexníObal na kroku 1, pozastaveno, adresa beze změny", async () => {
    const p = await page();
    expect(p.el.querySelector("h1")?.textContent).toBe("Konvexní obal");
    expect(nPoints(p.el)).toBe(21);
    expect(atStep1(p.el)).toBe(true);
    expect(op(p.el)).toContain("KonvexníObal");
    expect(code(p.el)).toContain("orientovaný doleva");
    expect(p.el.querySelector(".legend")?.textContent).toContain(
      "horní obálka H",
    );
    expect(msg(p.el)).toContain("Setřídíme 21 bodů");
    expect(search).toBe("");
    await p.unmount();
  });

  it("Na konec: obal z 10 jabloní (obr. 16.1), zpráva Hotovo, panel vypíše obal", async () => {
    const p = await page();
    await click(p.button("Na konec"));
    expect(p.el.querySelector("polygon.hull-final")).not.toBeNull();
    expect(p.el.querySelectorAll(".hull-pt.on-hull")).toHaveLength(10);
    expect(msg(p.el)).toMatch(/Hotovo/);
    expect(p.el.querySelector(".hull-panel")?.textContent).toContain("Obal:");
    await p.unmount();
  });

  it("krokování ukáže zametací přímku, obálky a determinant s desetinnou čárkou bez ASCII minus", async () => {
    const p = await page();
    for (let i = 0; i < 12 && !p.el.querySelector(".hull-det-value"); i++)
      await click(p.button("Další"));
    expect(p.el.querySelector(".hull-sweep")).not.toBeNull();
    const det = p.el.querySelector(".hull-det-value");
    expect(det?.textContent).toMatch(/det M/);
    expect(p.el.querySelector(".hull-panel")?.textContent).not.toMatch(/-\d/);
    expect(paused(p.el)).toBe(true);
    await p.unmount();
  });

  it("Příklady z knihy ▸ obr. 16.2 přepne na provázkový algoritmus; odkaz nese pts a v=wrap", async () => {
    const p = await page();
    await click(p.button("Příklady z knihy"));
    await click(p.button("Obr. 16.2 – provázkový algoritmus"));
    expect(nPoints(p.el)).toBe(7);
    expect(op(p.el)).toContain("Provázkový");
    expect(code(p.el)).toContain("nejlevější bod");
    expect(atStep1(p.el)).toBe(true);
    expect(search).toContain("v=wrap");
    expect(search).toContain("pts=");
    expect(p.el.querySelector(".viz-more")?.textContent).toContain("Obr. 16.2");
    await p.unmount();
  });

  it("akce KonvexníObal a Provázkový přepnou algoritmus na stejných bodech (krok 1)", async () => {
    const p = await page();
    await click(p.button("Provázkový"));
    expect(op(p.el)).toContain("Provázkový");
    expect(atStep1(p.el)).toBe(true);
    expect(search).toBe("?v=wrap");
    await click(p.button("KonvexníObal"));
    expect(op(p.el)).toContain("KonvexníObal");
    expect(search).toBe("");
    await p.unmount();
  });

  it("klepnutí do prázdna přidá bod; klepnutí na bod ho NEsmaže, ale vybere (× u bodu, pole x, y); × bod smaže, ↶ vrátí", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10,50,90");
    expect(nPoints(p.el)).toBe(3);
    await tap(plane(p.el), px(50, 40));
    expect(nPoints(p.el)).toBe(4);
    expect(search).toContain("pts=10,10,90,10,50,90,50,40");
    expect(atStep1(p.el)).toBe(true);
    expect(p.el.textContent).toContain("Přidán bod (50, 40)");
    // klik na bod (i 15 px vedle kruhu) bod nesmaže – vybere ho
    const at = px(10, 10);
    await tap(plane(p.el), { clientX: at.clientX + 15, clientY: at.clientY });
    expect(nPoints(p.el)).toBe(4);
    expect(plane(p.el).querySelectorAll(".hull-pt.is-selected")).toHaveLength(
      1,
    );
    expect(
      plane(p.el)
        .querySelector(".hull-pt.is-selected")
        ?.getAttribute("aria-label"),
    ).toMatch(/\(10, 10\)/);
    // výběr vyplní pole x, y (sdílí je Přidat bod i Odebrat bod)
    await openAction(p.el, "Odebrat bod(x, y)");
    expect([p.input("x =").value, p.input("y =").value]).toEqual(["10", "10"]);
    // × u vybraného bodu ho smaže
    const del = plane(p.el).querySelector<SVGGElement>(".plane-del")!;
    expect(del).not.toBeNull();
    const c = del.querySelector("circle")!;
    await tap(plane(p.el), {
      clientX: Number(c.getAttribute("cx")),
      clientY: Number(c.getAttribute("cy")),
    });
    expect(nPoints(p.el)).toBe(3);
    expect(search).toContain("pts=90,10,50,90,50,40");
    expect(plane(p.el).querySelector(".plane-del")).toBeNull();
    await click(p.button("↶ Vrátit operaci"));
    expect(nPoints(p.el)).toBe(4);
    await p.unmount();
  });

  it("tah bodu: chycený 15 px vedle středu jede s ukazatelem bez skoku, kresba se během tahu nepřeměřuje; puštění = přesun, krok 1", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10,50,90,50,40");
    const svg = plane(p.el);
    const vb = svg.getAttribute("viewBox");
    const from = px(50, 40);
    const dot = () =>
      [...svg.querySelectorAll<SVGGElement>(".hull-pt")]
        .find((g) => g.classList.contains("is-dragged"))
        ?.querySelector("circle");
    await pointer(svg, "pointerdown", {
      clientX: from.clientX + 15,
      clientY: from.clientY,
    });
    await pointer(svg, "pointermove", {
      clientX: from.clientX + 17,
      clientY: from.clientY,
    });
    // pod prahem (2 px) se nic nehýbe
    expect(dot()).toBeUndefined();
    await pointer(svg, "pointermove", {
      clientX: from.clientX + 15 + 71.2,
      clientY: from.clientY - 35.6,
    });
    const c = dot()!;
    expect(Number(c.getAttribute("cx"))).toBeCloseTo(from.clientX + 71.2, 5);
    expect(Number(c.getAttribute("cy"))).toBeCloseTo(from.clientY - 35.6, 5);
    expect(svg.classList.contains("is-dragging")).toBe(true);
    expect(svg.getAttribute("viewBox")).toBe(vb);
    // souřadnice taženého bodu (zaokrouhlené) u kurzoru
    expect(svg.querySelector(".plane-drag-label")?.textContent).toBe(
      "(70, 50)",
    );
    // popisek bᵢ taženého bodu ustoupí souřadnicím
    expect(svg.querySelector(".hull-pt.is-dragged .hull-label")).toBeNull();
    await pointer(svg, "pointerup", {
      clientX: from.clientX + 15 + 71.2,
      clientY: from.clientY - 35.6,
    });
    expect(search).toContain("pts=10,10,90,10,50,90,70,50");
    expect(p.el.textContent).toContain("Bod (50, 40) přesunut na (70, 50)");
    expect(atStep1(p.el)).toBe(true);
    expect(svg.classList.contains("is-dragging")).toBe(false);
    expect(svg.getAttribute("viewBox")).toBe(vb);
    await click(p.button("↶ Vrátit operaci"));
    expect(search).toContain("pts=10,10,90,10,50,90,50,40");
    await p.unmount();
  });

  it("bod puštěný mimo rovinu zůstane na jejím okraji (ne mimo, kresba se nezmenší)", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10,50,90,50,40");
    const svg = plane(p.el);
    const from = px(50, 40);
    await pointer(svg, "pointerdown", from);
    await pointer(svg, "pointermove", {
      clientX: from.clientX + 900,
      clientY: from.clientY - 900,
    });
    await pointer(svg, "pointerup", {
      clientX: from.clientX + 900,
      clientY: from.clientY - 900,
    });
    expect(search).toContain("pts=10,10,90,10,50,90,100,100");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 400");
    await p.unmount();
  });

  it("prst: úchop 44 px – tah 30 px vedle bodu ho přesune, ťuknutí 30 px vedle přidá nový bod", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10,50,90,50,40");
    const svg = plane(p.el);
    const from = px(50, 40);
    const touch = { pointerType: "touch", pointerId: 7 };
    await pointer(svg, "pointerdown", {
      ...touch,
      clientX: from.clientX + 30,
      clientY: from.clientY,
    });
    await pointer(svg, "pointermove", {
      ...touch,
      clientX: from.clientX + 30,
      clientY: from.clientY + 35.6,
    });
    await pointer(svg, "pointerup", {
      ...touch,
      clientX: from.clientX + 30,
      clientY: from.clientY + 35.6,
    });
    expect(search).toContain("pts=10,10,90,10,50,90,50,30");
    const at = px(50, 30);
    await pointer(svg, "pointerdown", {
      ...touch,
      clientX: at.clientX + 30,
      clientY: at.clientY,
    });
    await pointer(svg, "pointerup", {
      ...touch,
      clientX: at.clientX + 30,
      clientY: at.clientY,
    });
    expect(nPoints(p.el)).toBe(5);
    await p.unmount();
  });

  it("rovina je jedna zastávka Tabu; Enter bod vybere (nesmaže), Delete ho smaže, Shift+šipka ho posune", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10,50,90");
    const stops = plane(p.el).querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    const first = stops[0] as SVGGElement;
    expect(first.getAttribute("aria-label")).toMatch(/b₁ \(10, 10\)/);
    first.focus();
    await key(first, { key: "ArrowRight", shiftKey: true });
    expect(search).toContain("pts=11,10,90,10,50,90");
    expect(atStep1(p.el)).toBe(true);
    const again = plane(p.el).querySelector('[tabindex="0"]') as SVGGElement;
    await key(again, { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    expect(again.classList.contains("is-selected")).toBe(true);
    await key(again, { key: "Delete" });
    expect(nPoints(p.el)).toBe(2);
    await p.unmount();
  });

  it("Vytvořit ▸ Vlastní: totožné body vynechá s upozorněním; Prázdná rovina ukáže návod", async () => {
    const p = await page();
    await click(p.button("Vytvořit"));
    await click(p.button("Vlastní"));
    await type(p.input("body ="), "(10, 10), (10, 10), (50, 60), (80, 20)");
    await key(p.input("body ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    expect(p.el.textContent).toMatch(/totožný bod/);
    expect(atStep1(p.el)).toBe(true);
    await openAction(p.el, "Vytvořit");
    await click(p.button("Prázdná rovina"));
    expect(nPoints(p.el)).toBe(0);
    expect(msg(p.el)).toMatch(/Žádné body/);
    expect(search).toContain("pts=none");
    await p.unmount();
  });

  it("Vytvořit ▸ Na kružnici: všechny body leží na obalu", async () => {
    const p = await page();
    await click(p.button("Vytvořit"));
    await click(p.button("Na kružnici"));
    await type(p.input("n ="), "9");
    await key(p.input("n ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(9);
    await click(p.button("Na konec"));
    expect(p.el.querySelectorAll(".hull-pt.on-hull")).toHaveLength(9);
    await p.unmount();
  });

  it("Přidat bod(x, y) z nabídky (pro klávesnici); obsazené místo hlásí chybu", async () => {
    const p = await page("/geom/hull?pts=10,10,90,10");
    await click(p.button("Přidat bod(x, y)"));
    await type(p.input("x ="), "40");
    await type(p.input("y ="), "70");
    await key(p.input("y ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    expect(search).toContain("40,70");
    await openAction(p.el, "Přidat bod(x, y)");
    await type(p.input("x ="), "10");
    await type(p.input("y ="), "10");
    await key(p.input("y ="), { key: "Enter" });
    expect(nPoints(p.el)).toBe(3);
    expect(p.el.textContent).toContain("Bod (10, 10) už v rovině je.");
    await p.unmount();
  });

  it("odkaz s v=wrap otevře provázek na kroku 1; vadný odkaz ukáže hlášku a výchozí příklad", async () => {
    const p = await page("/geom/hull?pts=10,10,50,90,90,10&v=wrap");
    expect(nPoints(p.el)).toBe(3);
    expect(op(p.el)).toContain("Provázkový");
    expect(atStep1(p.el)).toBe(true);
    await p.unmount();
    const q = await page("/geom/hull?pts=1,2,3");
    expect(nPoints(q.el)).toBe(21);
    expect(q.el.textContent).toContain("Body z odkazu nešly použít");
    await q.unmount();
  });

  it("Výchozí příklad vrátí obr. 16.1 se zametáním a smaže parametry adresy", async () => {
    const p = await page("/geom/hull?pts=10,10,50,90,90,10&v=wrap");
    await click(p.button("Výchozí příklad"));
    expect(nPoints(p.el)).toBe(21);
    expect(op(p.el)).toContain("KonvexníObal");
    expect(search).toBe("");
    expect(atStep1(p.el)).toBe(true);
    await p.unmount();
  });
});
