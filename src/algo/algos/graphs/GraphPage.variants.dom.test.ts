// @vitest-environment jsdom
// Varianty grafového algoritmu na stránce grafů (příprava fáze 4: Bellman-Ford s frontou / po fázích, SCC
// Tarjan / přes Gᵀ…): přepínač „Varianta“ vpravo pod pseudokódem, nová varianta připraví běh na kroku 1
// (nespustí ho), pseudokód varianty, v= v odkazu jen u nevýchozí varianty, neznámá v= → hláška.
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
import { snap } from "../../core/steps";
import type { GraphAlgorithm } from "./algoKit";
import { emptyState } from "./graph";
import { GraphInner } from "./GraphPage";

const fake: GraphAlgorithm = {
  id: "fake",
  title: "Pokusný algoritmus",
  opName: "Pokus",
  description: "Pokusný algoritmus s variantami.",
  complexity: "O(1)",
  pseudocode: ["Řádek fronty", "Konec"],
  needsStart: false,
  legend: [],
  tip: "vyzkoušejte obě varianty – liší se jen zprávou.",
  defaultPreset: "weighted",
  variants: [
    { id: "queue", label: "s frontou", title: "Otevřené vrcholy ve frontě" },
    { id: "phases", label: "po fázích", pseudocode: ["Řádek fáze", "Konec"] },
  ],
  *run(_g, _s, variant) {
    const st = emptyState();
    yield snap(st, 0, `Začátek varianty ${variant}.`);
    yield snap(st, 1, `Hotovo (${variant}).`);
  },
};

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
        h(Route, {
          path: "/graph/:id",
          element: h(GraphInner, { algo: fake }),
        }),
      ),
    ),
  );
  const radio = (label: string) =>
    [...m.el.querySelectorAll<HTMLLabelElement>(".graph-variants label")]
      .find((l) => l.textContent?.trim() === label)!
      .querySelector("input")!;
  const code = () => m.el.querySelector(".viz-code")?.textContent ?? "";
  const counter = () => m.el.querySelector(".step-counter")?.textContent;
  const search = () => new URLSearchParams(loc.current!.search);
  return { m, radio, code, counter, search, loc };
}

describe("GraphPage – varianty algoritmu", () => {
  it("přepínač variant: výchozí první, změna připraví běh na kroku 1 a zapíše v= do odkazu", async () => {
    const p = await open("/graph/fake");
    expect(p.radio("s frontou").checked).toBe(true);
    expect(p.m.el.textContent).toContain("Začátek varianty queue.");
    expect(p.code()).toContain("Řádek fronty");
    await click(p.radio("po fázích"));
    expect(p.radio("po fázích").checked).toBe(true);
    expect(p.m.el.textContent).toContain("Začátek varianty phases.");
    expect(p.code()).toContain("Řádek fáze");
    expect(p.counter()).toMatch(/^krok 1 \/ 2$/);
    expect(p.m.el.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
      "Přehrát",
    );
    expect(p.search().get("v")).toBe("phases");
    // zpět na výchozí variantu: odkaz bez v=
    await click(p.radio("s frontou"));
    expect(p.search().get("v")).toBeNull();
    await p.m.unmount();
  });

  it("odkaz s v= otevře variantu a adresu nepřepíše; neznámá v= → výchozí s hláškou", async () => {
    const p = await open("/graph/fake?v=phases");
    expect(p.radio("po fázích").checked).toBe(true);
    expect(p.m.el.textContent).toContain("Začátek varianty phases.");
    expect(p.loc.current!.search).toBe("?v=phases");
    await p.m.unmount();
    const q = await open("/graph/fake?v=nic");
    expect(q.radio("s frontou").checked).toBe(true);
    expect(q.m.el.querySelector(".input-error")?.textContent).toMatch(
      /Varianta „nic“ neexistuje/,
    );
    await q.m.unmount();
  });
});
