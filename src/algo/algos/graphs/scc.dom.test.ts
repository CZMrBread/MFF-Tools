// @vitest-environment jsdom
// Silně souvislé komponenty na stránce grafů (/graph/scc): Tarjan na obr. 5.13 po otevření stojí na kroku 1,
// zásobník Z v panelu výsledku, komponenty obarvené; odkaz v=kosaraju otevře variantu přes Gᵀ (5.9)
// s vlastním pseudokódem, přepnutí zpět na Tarjana připraví běh na kroku 1 a v= z odkazu zmizí.
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
      h(Routes, null, h(Route, { path: "/graph/:id", element: h(GraphPage) })),
    ),
  );
  const node = (label: string) =>
    [...m.el.querySelectorAll<SVGGElement>("g.graph-node")].find(
      (n) => n.querySelector("title")?.textContent === label,
    )!;
  const radio = (label: string) =>
    [...m.el.querySelectorAll<HTMLLabelElement>(".graph-variants label")]
      .find((l) => l.textContent?.trim() === label)!
      .querySelector("input")!;
  const counter = () => m.el.querySelector(".step-counter")?.textContent ?? "";
  const code = () => m.el.querySelector(".viz-code")?.textContent ?? "";
  return {
    m,
    loc,
    node,
    radio,
    counter,
    code,
    text: () => m.el.textContent ?? "",
  };
}

const compOf = (el: Element) =>
  [...el.classList].find((c) => c.startsWith("n-comp"));

describe("/graph/scc (jsdom)", () => {
  it("Tarjan na obr. 5.13: krok 1 pozastaveno, zásobník Z, na konci tři barevné komponenty", async () => {
    const p = await open("/graph/scc");
    expect(p.radio("Tarjan (5.10)").checked).toBe(true);
    expect(p.counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(p.text()).toContain("Zásobník Z");
    expect(p.code()).toContain("KSST");
    await click(p.m.button("Na konec"));
    expect(p.text()).toContain(
      "Hotovo: 3 komponenty silné souvislosti – {d, e, f}, {c}, {a, b}",
    );
    const [a, b, c, d, e, f] = ["a", "b", "c", "d", "e", "f"].map((l) =>
      compOf(p.node(l)),
    );
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(d).toBe(e);
    expect(e).toBe(f);
    expect(new Set([a, c, d]).size).toBe(3);
    await p.m.unmount();
  });

  it("odkaz v=kosaraju: varianta přes Gᵀ s pseudokódem z 5.9; zpět na Tarjana = krok 1 a odkaz bez v=", async () => {
    const p = await open("/graph/scc?v=kosaraju");
    expect(p.radio("přes Gᵀ (5.9)").checked).toBe(true);
    expect(p.code()).toContain("Sestrojíme graf Gᵀ s obrácenými hranami.");
    await click(p.m.button("Na konec"));
    expect(p.text()).toContain("{d, e, f}, {c}, {a, b}");
    expect(p.text()).toContain("kořeny = d, c, a");
    await click(p.radio("Tarjan (5.10)"));
    expect(p.counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(p.m.el.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
      "Přehrát",
    );
    expect(new URLSearchParams(p.loc.current!.search).get("v")).toBeNull();
    await p.m.unmount();
  });
});
