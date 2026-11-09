// @vitest-environment jsdom
/*
 * Stránka Goldbergova algoritmu (jsdom): výchozí obr. 14.2 stojí na kroku 1, vedle sítě kresba výšek,
 * přepínač varianty (14.6 nejvyšší vrchol) mění pseudokód i odkaz a připraví nový běh na kroku 1,
 * konec s maximálním tokem, „Kresba“, Upravit graf / Hotovo a Jiný alg. se stejnou sítí.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, mount, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { GoldbergPage } from "./GoldbergPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

describe("Goldbergův algoritmus – stránka", () => {
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
          h(Route, { path: "/flow/goldberg", element: h(GoldbergPage) }),
          h(Route, { path: "/flow/dinic", element: h("p", null, "Dinic") }),
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
  const heights = (el: HTMLElement) =>
    el.querySelector<HTMLElement>(".flow-panel-res .gb-svg");
  const radio = (el: HTMLElement, value: string) =>
    el.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`)!;

  it("výchozí obr. 14.2: nadpis z registru, krok 1, pozastaveno, prázdná adresa, pseudokód a kresba výšek", async () => {
    page = await open("/flow/goldberg");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/flow/goldberg")!.title,
    );
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toBe("");
    expect(code(el)).toContain("Algoritmus Goldberg");
    expect(msg(el)).toContain("Počáteční výšky: h(z) ← n = 6");
    expect(heights(el)).not.toBeNull();
    // příklad nemá v knize obrázek – poznámka to říká
    expect(el.textContent).toContain(
      "Kniha k Goldbergovu algoritmu příklad nemá",
    );
    // u vrcholů sítě výška (krok 1 = výšky), přebytek až s vlnou (krok 2)
    const netText = () =>
      el.querySelector(".flow-panel-net")?.textContent ?? "";
    expect(netText()).toContain("h 6");
    expect(netText()).not.toContain("+10");
    await click(page.button("Krok vpřed"));
    expect(netText()).toContain("h 0 · +10");
  });

  it("varianta nejvyšší vrchol: odkaz v=nejvyssi, pseudokód 14.6, nový běh na kroku 1", async () => {
    page = await open("/flow/goldberg");
    const el = page.el;
    await click(page.button("Krok vpřed"));
    await click(radio(el, "nejvyssi"));
    expect(search).toBe("?v=nejvyssi");
    expect(code(el)).toContain("vezmeme nejvyšší z nich");
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(playing(el)).toBe(false);
    expect(
      el.querySelector(".viz-op-title, .viz-op")?.textContent ?? el.textContent,
    ).toContain("nejvyšší vrchol");
  });

  it("odkaz ?ex=obr-14-3: konec s tokem 2 a řezem; stále pozastaveno", async () => {
    page = await open("/flow/goldberg?ex=obr-14-3");
    const el = page.el;
    expect(search).toBe("?ex=obr-14-3");
    await click(page.button("Na konec"));
    expect(msg(el)).toMatch(
      /Hotovo – žádný vrchol kromě z a s nemá přebytek, vlna je tok: maximální tok \|f\| = 2/,
    );
    expect(el.querySelector(".vars")?.textContent).toContain("|f|");
    expect(playing(el)).toBe(false);
  });

  it("obr. 14.7 (široká síť): kresby pod sebou (flow-stack), obr. 14.2 vedle sebe", async () => {
    page = await open("/flow/goldberg?ex=obr-14-7");
    expect(
      page.el.querySelector(".flow-layout")!.classList.contains("flow-stack"),
    ).toBe(true);
    await page.unmount();
    page = await open("/flow/goldberg");
    expect(
      page.el.querySelector(".flow-layout")!.classList.contains("flow-stack"),
    ).toBe(false);
  });

  it("Kresba = jen síť skryje výšky; Upravit graf → editor i s výškami (zrušené UX-02), Hotovo → nový běh na kroku 1", async () => {
    page = await open("/flow/goldberg");
    const el = page.el;
    await click(radio(el, "sit"));
    expect(heights(el)).toBeNull();
    await click(radio(el, "obe"));
    expect(heights(el)).not.toBeNull();
    await click(page.button("Krok vpřed"));
    await click(page.button("Upravit graf"));
    expect(heights(el)).not.toBeNull();
    expect(el.querySelector(".ge-panel")).not.toBeNull();
    await click(page.button("Hotovo"));
    expect(heights(el)).not.toBeNull();
    expect(counter(el)).toMatch(/^krok 1 \//);
    expect(playing(el)).toBe(false);
  });

  it("Příklady z knihy ▸ obr. 14.7: nový běh na kroku 1 a ex= v odkazu; ↶ Vrátit operaci vrátí obr. 14.2", async () => {
    page = await open("/flow/goldberg");
    const el = page.el;
    const book = [...el.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (b) => b.textContent?.trim() === "Příklady z knihy",
    )!;
    await click(book);
    const item = [
      ...el.querySelectorAll<HTMLElement>(
        "button, [role=menuitemradio], [role=option]",
      ),
    ].find((b) => b.textContent?.trim().startsWith("Obr. 14.7"))!;
    await click(item);
    const go = el.querySelector<HTMLButtonElement>(".am-go");
    if (go && search === "") await click(go);
    expect(search).toBe("?ex=obr-14-7");
    expect(counter(el)).toMatch(/^krok 1 \//);
    await click(page.button("↶ Vrátit operaci"));
    expect(search).toBe("");
  });

  it("Jiný alg. ▸ Dinicův algoritmus: tatáž síť na stránce Dinica", async () => {
    page = await open("/flow/goldberg?ex=obr-14-3");
    const el = page.el;
    const other = [
      ...el.querySelectorAll<HTMLButtonElement>(".am-action"),
    ].find((b) => b.textContent?.trim() === "Jiný alg.")!;
    await click(other);
    const item = [
      ...el.querySelectorAll<HTMLElement>(
        "button, [role=menuitemradio], [role=option]",
      ),
    ].find((b) => b.textContent?.trim() === "Dinicův algoritmus")!;
    await click(item);
    const go = el.querySelector<HTMLButtonElement>(".am-go");
    if (go && path !== "/flow/dinic") await click(go);
    expect(path).toBe("/flow/dinic");
    expect(search).toBe("?ex=obr-14-3");
  });
});
