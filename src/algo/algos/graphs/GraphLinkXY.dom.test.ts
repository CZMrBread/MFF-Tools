// @vitest-environment jsdom
// Odkaz grafu nese souřadnice ručně kreslených a přesunutých vrcholů (xy=, D2): nakreslit, přesunout,
// zkopírovat adresu, otevřít znovu → stejná kresba, přehrávač stojí na kroku 1. Odkaz s xy se při otevření
// nepřepisuje (StrictMode), přesun vrcholu se do adresy zapíše až po dotažení (bez zahlcení historie).
import { createElement as h, StrictMode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type Location,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, click, mount, pointer } from "../../core/domTest";
import { GraphPage } from "./GraphPage";

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
  const nodes = () => [...m.el.querySelectorAll<SVGGElement>("g.graph-node")];
  const label = (n: Element) => n.querySelector("title")?.textContent ?? "";
  const drawing = () =>
    Object.fromEntries(nodes().map((n) => [label(n), n.style.transform]));
  const playing = () =>
    m.el.querySelector(".ctl-play")?.getAttribute("aria-label") ===
    "Pozastavit";
  const counter = () => m.el.querySelector(".step-counter")?.textContent ?? "";
  const svg = () => m.el.querySelector("svg.graph-svg")!;
  return { m, loc, nodes, drawing, playing, counter, svg };
}

/** počká, až se odložený zápis adresy po přesunu provede */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });

// jsdom nemá getScreenCTM – plátno 1 : 1 s obrazovkou
const proto = SVGElement.prototype as unknown as { getScreenCTM?: unknown };
let original: unknown;
beforeEach(() => {
  original = proto.getScreenCTM;
  proto.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
});
afterEach(() => {
  proto.getScreenCTM = original;
});

describe("xy= v odkazu grafu (jsdom)", () => {
  it("nakreslit, přesunout vrchol, zkopírovat adresu → nová stránka má stejnou kresbu a stojí na kroku 1", async () => {
    const p = await open("/graph/bfs");
    await click(p.m.button("Vytvořit"));
    const empty = [
      ...p.m.el.querySelectorAll<HTMLButtonElement>(".am-variant"),
    ].find((b) => b.textContent === "Prázdný – nakreslit")!;
    await click(empty);
    const tap = async (x: number, y: number) => {
      await pointer(p.m.el.querySelector(".graph-bg")!, "pointerdown", {
        clientX: x,
        clientY: y,
        timeStamp: 0,
      });
      await pointer(p.svg(), "pointerup", {
        clientX: x,
        clientY: y,
        timeStamp: 50,
      });
    };
    await tap(100, 100);
    await tap(300, 100);
    await tap(200, 250);
    expect(p.nodes()).toHaveLength(3);
    // hrana z prvního na druhý
    await pointer(p.nodes()[0], "pointerdown", { clientX: 100, clientY: 100 });
    await pointer(p.svg(), "pointermove", { clientX: 200, clientY: 100 });
    await pointer(p.svg(), "pointermove", { clientX: 300, clientY: 100 });
    await pointer(p.svg(), "pointerup", { clientX: 300, clientY: 100 });
    // přesun třetího vrcholu tahem do prázdna
    await pointer(p.nodes()[2], "pointerdown", { clientX: 200, clientY: 250 });
    await pointer(p.svg(), "pointermove", { clientX: 160, clientY: 280 });
    await pointer(p.svg(), "pointerup", {
      clientX: 120,
      clientY: 300,
      timeStamp: 400,
    });
    await settle();
    await click(p.m.button("Hotovo"));
    await settle();
    const search = p.loc.current!.search;
    const q = new URLSearchParams(search);
    expect(q.get("g")).toBe("0 1\n2");
    expect(q.get("xy")).toMatch(/^-?\d+(_-?\d+){5}$/);
    // jen bezpečné znaky – adresa se nekóduje (%)
    expect(search).toMatch(/xy=[-\d_]+(&|$)/);
    const drawn = p.drawing();
    expect(p.playing()).toBe(false);
    await p.m.unmount();

    const r = await open(`/graph/bfs${search}`);
    expect(r.drawing()).toEqual(drawn);
    expect(r.playing()).toBe(false);
    expect(r.counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(r.m.el.textContent).not.toContain("nešly použít");
    await settle();
    expect(r.loc.current!.search).toBe(search);
    await r.m.unmount();
  });

  it("odkaz s xy se v StrictMode při otevření nepřepíše; přesun vrcholu výchozího příkladu zapíše jen xy", async () => {
    const link = "?g=1+2%0A2+3&d=0&w=0&xy=100_100_500_900_900_100";
    const p = await open(`/graph/bfs${link}`, true);
    await settle();
    expect(p.loc.current!.search).toBe(link);
    await p.m.unmount();

    const d = await open("/graph/dfs");
    expect(d.loc.current!.search).toBe("");
    await click(d.m.button("Upravit graf"));
    const six = d
      .nodes()
      .find((n) => n.querySelector("title")?.textContent === "6")!;
    const box = six.style.transform.match(/-?[\d.]+/g)!.map(Number);
    await pointer(six, "pointerdown", { clientX: box[0], clientY: box[1] });
    await pointer(d.svg(), "pointermove", {
      clientX: box[0] + 10,
      clientY: box[1] - 10,
    });
    await pointer(d.svg(), "pointerup", {
      clientX: box[0] + 22,
      clientY: box[1] - 22,
      timeStamp: 400,
    });
    await settle();
    const q = new URLSearchParams(d.loc.current!.search);
    expect([...q.keys()]).toEqual(["xy"]);
    expect(d.playing()).toBe(false);
    await d.m.unmount();
  });

  it("vadné xy: hláška nad plátnem, graf rozložen automaticky, adresa se nepřepíše", async () => {
    const link = "?g=1+2%0A2+3&d=0&w=0&xy=1_2";
    const p = await open(`/graph/bfs${link}`);
    expect(p.m.el.textContent).toContain(
      "Souřadnice vrcholů z odkazu nešly použít – graf je rozložen automaticky.",
    );
    expect(p.nodes()).toHaveLength(3);
    await settle();
    expect(p.loc.current!.search).toBe(link);
    await p.m.unmount();
  });
});
