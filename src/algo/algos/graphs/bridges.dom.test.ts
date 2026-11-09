// @vitest-environment jsdom
// Mosty a artikulace na stránce grafů (/graph/bridges): obr. 5.10 po otevření stojí na kroku 1, na konci
// běhu jsou mosty a artikulace podle knihy vidět v kresbě, tabulka in/low a legenda; vlastní příklad
// „Kořen jako artikulace“ z nabídky Vytvořit připraví nový běh na kroku 1.
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, mount } from "../../core/domTest";
import { GraphPage } from "./GraphPage";

async function open(path: string) {
  const m = await mount(
    h(
      MemoryRouter,
      { initialEntries: [path] },
      h(Routes, null, h(Route, { path: "/graph/:id", element: h(GraphPage) })),
    ),
  );
  const node = (label: string) =>
    [...m.el.querySelectorAll<SVGGElement>("g.graph-node")].find(
      (n) => n.querySelector("title")?.textContent === label,
    )!;
  const counter = () => m.el.querySelector(".step-counter")?.textContent ?? "";
  return { m, node, counter, text: () => m.el.textContent ?? "" };
}

describe("/graph/bridges (jsdom)", () => {
  it("obr. 5.10: krok 1 pozastaveno; na konci mosty c–d, g–j, g–k a artikulace c, d, g v kresbě i v hlášce", async () => {
    const p = await open("/graph/bridges");
    expect(p.m.el.querySelector("h1")?.textContent).toBe("Mosty a artikulace");
    expect(p.counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(p.m.el.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
      "Přehrát",
    );
    await click(p.m.button("Na konec"));
    expect(p.text()).toContain(
      "Hotovo. Mosty: c–d, g–j, g–k. Artikulace: c, d, g.",
    );
    for (const l of ["c", "d", "g"])
      expect(p.node(l).classList.contains("n-art"), l).toBe(true);
    for (const l of ["a", "e", "j"])
      expect(p.node(l).classList.contains("n-art"), l).toBe(false);
    expect(p.m.el.querySelectorAll("g.graph-edge.e-bridge")).toHaveLength(3);
    // tabulka in / low a legenda s mostem a artikulací
    const heads = [...p.m.el.querySelectorAll(".gtable th")].map(
      (t) => t.textContent,
    );
    expect(heads).toEqual(["v", "in", "low", "p"]);
    const legend = p.m.el.querySelector(".legend")?.textContent ?? "";
    expect(legend).toContain("most");
    expect(legend).toContain("artikulace");
    await p.m.unmount();
  });

  it("Vytvořit ▸ Kořen jako artikulace: nový běh na kroku 1, na konci artikulace 1 a 4", async () => {
    const p = await open("/graph/bridges");
    await click(p.m.button("Vytvořit"));
    const item = [
      ...p.m.el.querySelectorAll<HTMLButtonElement>(".am-variant"),
    ].find((b) => b.textContent === "Kořen jako artikulace (nesouvislý)")!;
    expect(item).toBeDefined();
    await click(item);
    expect(p.counter()).toMatch(/^krok 1 \/ \d+$/);
    await click(p.m.button("Na konec"));
    expect(p.text()).toContain(
      "Hotovo. Mosty: 1–4, 4–5, 6–7. Artikulace: 1, 4.",
    );
    await p.m.unmount();
  });
});
