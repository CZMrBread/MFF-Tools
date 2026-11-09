// @vitest-environment jsdom
/*
 * Stránka Dinicova algoritmu (jsdom): výchozí příklad obr. 14.7 stojí na kroku 1, pseudokód podle
 * procedury (Dinic → ČištěníSítě → BlokujícíTok), vrstvy obtažené jako na obrázku, šedivé a tečkované hrany
 * po čištění, odkaz ?ex=obr-14-2, upravit síť a Hotovo = nový běh na kroku 1.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, mount, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { DinicPage } from "./DinicPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

describe("Dinicův algoritmus – stránka", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
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
          h(Route, { path: "/flow/dinic", element: h(DinicPage) }),
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
  const msg = (el: HTMLElement) =>
    el.querySelector(".viz-message")?.textContent ?? "";
  const res = (el: HTMLElement) =>
    el.querySelector<HTMLElement>(".flow-panel-res");
  /** kroky vpřed, dokud zpráva neodpovídá `re` (nejvýš `max`) */
  async function stepUntil(p: Mounted, re: RegExp, max = 60) {
    for (let i = 0; i < max && !re.test(msg(p.el)); i++)
      await click(p.button("Krok vpřed"));
    expect(msg(p.el)).toMatch(re);
  }

  it("výchozí obr. 14.7: nadpis, krok 1, pozastaveno, prázdná adresa, pseudokód Dinic", async () => {
    page = await open("/flow/dinic");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/flow/dinic")!.title,
    );
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toBe("");
    expect(code(el)).toContain("Algoritmus Dinic");
    expect(res(el)).not.toBeNull();
    // tip neodkazuje na čísla řádků knihy (aplikace čísluje vlastní) – UX-10
    const tip =
      el.querySelector(".viz-tip")?.textContent ?? el.textContent ?? "";
    expect(tip).not.toMatch(/ř\. \d/);
    expect(tip).toContain("Odstraníme hrany do předchozích vrstev");
  });

  it("čištění: pseudokód ČištěníSítě, vrstvy obtažené, po vyčištění šedivé a tečkované hrany", async () => {
    page = await open("/flow/dinic");
    const el = page.el;
    await stepUntil(page, /^Vrstvy podle vzdálenosti/);
    expect(code(el)).toContain("Procedura ČištěníSítě");
    expect(res(el)!.querySelectorAll(".graph-group")).toHaveLength(6);
    await stepUntil(page, /^F = ∅/);
    expect(res(el)!.querySelectorAll(".graph-edge.e-r-gray")).toHaveLength(5);
    expect(res(el)!.querySelectorAll(".graph-edge.e-r-dead")).toHaveLength(6);
    expect(res(el)!.querySelectorAll(".graph-node.n-gone")).toHaveLength(5);
    await stepUntil(page, /^g ← nulový tok/);
    expect(code(el)).toContain("Procedura BlokujícíTok");
    expect(el.querySelector(".vars")?.textContent).toContain("|g|");
  });

  it("odkaz ?ex=obr-14-2: konec po dvou fázích s tokem 18", async () => {
    page = await open("/flow/dinic?ex=obr-14-2");
    const el = page.el;
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(search).toBe("?ex=obr-14-2");
    await click(page.button("Na konec"));
    expect(msg(el)).toMatch(/^✓ Hotovo – maximální tok \|f\| = 18 po 2 fázích/);
    expect(playing(el)).toBe(false);
  });

  it("Upravit síť: vrstevnatá síť R v editoru zůstane (zrušené UX-02); Hotovo připraví nový běh na kroku 1", async () => {
    page = await open("/flow/dinic");
    const el = page.el;
    await click(page.button("Krok vpřed"));
    await click(page.button("Upravit graf"));
    expect(res(el)).not.toBeNull();
    expect(el.querySelector(".ge-panel")).not.toBeNull();
    await click(page.button("Hotovo"));
    expect(res(el)).not.toBeNull();
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(playing(el)).toBe(false);
  });
  it("Vytvořit ▸ Náhodně z obr. 14.7 (menší síť): stránka se vykreslí a stojí na kroku 1", async () => {
    page = await open("/flow/dinic");
    const el = page.el;
    await click(page.button("Krok vpřed"));
    const create = [...el.querySelectorAll<HTMLButtonElement>(".am-action")][0];
    await click(create);
    await click(el.querySelector<HTMLButtonElement>(".am-go")!);
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(playing(el)).toBe(false);
    expect(search).toMatch(/^\?g=/);
    expect(res(el)!.querySelectorAll(".graph-node").length).toBeGreaterThan(2);
  });

  describe("menší desktop (1366 × 768): výchozí kresba jen R", () => {
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
    const checked = (el: HTMLElement) =>
      el.querySelector<HTMLInputElement>(
        'input[name="flow-view-dinic"]:checked',
      )?.value;

    it("kresba R je jedna zastávka Tabu (šipky po vrcholech) a „Upravit síť“ je po ruce", async () => {
      smallDesktop();
      page = await open("/flow/dinic");
      const el = page.el;
      expect(checked(el)).toBe("rezervy");
      const stops = [
        ...res(el)!.querySelectorAll<HTMLElement>("svg [tabindex]"),
      ].filter((x) => x.tabIndex >= 0);
      expect(stops).toHaveLength(1);
      expect(stops[0].getAttribute("aria-label")).toMatch(/^Vrchol /);
      await click(page.button("Upravit síť"));
      expect(el.querySelector(".ge-panel")).not.toBeNull();
      // v editoru je vidět síť (kreslí se na ní) i R; volba Kresba zůstane a jde přepnout (zrušené UX-02)
      expect(checked(el)).toBe("rezervy");
      expect(el.querySelector<HTMLElement>(".flow-panel-net")!.hidden).toBe(
        false,
      );
      expect(res(el)).not.toBeNull();
      expect(
        el.querySelector('input[name="flow-view-dinic"]')?.closest("fieldset")
          ?.disabled,
      ).toBe(false);
      await click(page.button("Hotovo"));
      expect(checked(el)).toBe("rezervy");
      expect(el.querySelector<HTMLElement>(".flow-panel-net")!.hidden).toBe(
        true,
      );
      expect(counter(el)).toMatch(/^krok 1 \//);
      expect(playing(el)).toBe(false);
    });
  });
});
