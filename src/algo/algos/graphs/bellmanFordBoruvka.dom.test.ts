// @vitest-environment jsdom
// Stránky /graph/bellman-ford a /graph/boruvka (fáze 4, stopa graphsA): výchozí příklad, varianta „po
// fázích“ v odkazu (v=phases), krok 1 pozastavený, tabulka fronty / iterace vedle grafu, přechod krokem.
import { createElement as h } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type Location,
} from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, mount } from "../../core/domTest";
import { GraphPage } from "./GraphPage";

async function open(path: string) {
  const loc = { current: null as Location | null };
  function Probe() {
    loc.current = useLocation();
    return null;
  }
  const m = await mount(
    h(
      MemoryRouter,
      { initialEntries: [path] },
      h(Probe),
      h(
        Routes,
        null,
        h(Route, { path: "/graph/:id", element: h(GraphPage) }),
        h(Route, { path: "/", element: h("p", null, "přehled") }),
      ),
    ),
  );
  const text = () => m.el.textContent ?? "";
  const counter = () => m.el.querySelector(".step-counter")?.textContent;
  const next = () =>
    click(m.el.querySelector<HTMLButtonElement>("[aria-label='Krok vpřed']")!);
  const radio = (label: string) =>
    [...m.el.querySelectorAll<HTMLLabelElement>(".graph-variants label")]
      .find((l) => l.textContent?.trim() === label)!
      .querySelector("input")!;
  return { m, text, counter, next, radio, loc };
}

describe("Bellman–Ford na stránce grafů", () => {
  it("výchozí příklad se zápornou hranou, krok 1 pozastavený, přepínač variant fronta / po fázích", async () => {
    const p = await open("/graph/bellman-ford");
    expect(p.m.el.querySelector("h1")?.textContent).toBe(
      "Bellmanův–Fordův algoritmus",
    );
    expect(p.counter()).toMatch(/^krok 1 \//);
    expect(p.m.el.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
      "Přehrát",
    );
    expect(p.radio("fronta (kniha)").checked).toBe(true);
    expect(p.text()).toContain("v ← nejstarší otevřený vrchol");
    // tabulka fronty je vidět od kroku 1 (prázdná), graf vedle ní neposkočí
    expect(p.text()).toContain("Fronta otevřených vrcholů");
    await p.next();
    expect(p.counter()).toMatch(/^krok 2 \//);
    expect(p.text()).toContain("h(s) = 0");
    await click(p.radio("po fázích (cv. 4)"));
    expect(p.counter()).toMatch(/^krok 1 \//);
    expect(p.text()).toContain("Pro fáze i = 1, …, n:");
    expect(new URLSearchParams(p.loc.current!.search).get("v")).toBe("phases");
    await p.m.unmount();
  });

  it("odkaz v=phases otevře variantu po fázích", async () => {
    const p = await open("/graph/bellman-ford?v=phases");
    expect(p.radio("po fázích (cv. 4)").checked).toBe(true);
    expect(p.text()).toContain("Nezměnilo-li se ve fázi i žádné h, skončíme.");
    await p.m.unmount();
  });
});

describe("Borůvka na stránce grafů", () => {
  it("výchozí je obr. 7.5 (mřížka 3 × 3), krok 1 pozastavený, tabulka iterace", async () => {
    const p = await open("/graph/boruvka");
    expect(p.m.el.querySelector("h1")?.textContent).toBe("Borůvkův algoritmus");
    expect(p.counter()).toMatch(/^krok 1 \//);
    expect(p.text()).toContain("T ← (V, ∅)");
    expect(p.m.el.querySelectorAll(".graph-node")).toHaveLength(9);
    expect(p.m.el.querySelectorAll(".graph-variants")).toHaveLength(0);
    for (let i = 0; i < 3; i++) await p.next();
    expect(p.text()).toContain(
      "Iterace 1: nejlehčí hrana z každé komponenty ven",
    );
    await p.m.unmount();
  });
});

describe("vadný odkaz grafových modulů fáze 4 hlásí nad plátnem, adresu nepřepíše (UX-09)", () => {
  for (const [path, re] of [
    ["/graph/bellman-ford?s=zz", /Vrchol zz v grafu není/],
    ["/graph/bellman-ford?v=xyz", /Varianta „xyz“ neexistuje/],
    ["/graph/scc?v=nic", /Varianta „nic“ neexistuje/],
  ] as const)
    it(path, async () => {
      const p = await open(path);
      expect(p.m.el.querySelector(".input-error")?.textContent ?? "").toMatch(
        re,
      );
      expect(`${p.loc.current!.pathname}${p.loc.current!.search}`).toBe(path);
      expect(p.counter()).toMatch(/^krok 1 \//);
    });
});
