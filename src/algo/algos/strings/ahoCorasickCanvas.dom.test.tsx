// @vitest-environment jsdom
// Plátno Aho–Corasickové (NEWMODS-04): strom má celou výšku vlevo, vpravo sloupec s tabulkou stavů
// (~8 řádků, posouvá se uvnitř k aktivnímu stavu), pásem σ se závorkami a řádkem „Ohlášeno“.
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../../core/domTest";
import { materialize } from "../../core/steps";
import { acSteps } from "./ahoCorasick";
import { AcCanvas } from "./ahoCorasickCanvas";
import { FIG_13_2 } from "./bookStrings.fixtures";

const steps = materialize(acSteps([...FIG_13_2.words], "barbara", "search"));

describe("AcCanvas – rozložení stránky", () => {
  it("s tabulkou: strom vlevo, v pravém sloupci tabulka, pás σ a Ohlášeno (v tomto pořadí)", async () => {
    const st = steps[steps.length - 1].state;
    const m = await mount(h(AcCanvas, { st, slots: 7 }));
    const layout = m.el.querySelector(".ac-layout.with-table")!;
    const kids = [...layout.children].map((c) => c.className);
    expect(kids[0]).toContain("automaton-view");
    const side = layout.querySelector(":scope > .ac-side-col")!;
    expect(side).not.toBeNull();
    const order = [...side.children].map((c) =>
      c.classList.contains("ac-side")
        ? "table"
        : c.classList.contains("strip-view")
          ? "strip"
          : c.classList.contains("ac-line")
            ? "line"
            : c.className,
    );
    expect(order).toEqual(["table", "strip", "line"]);
    // všechny 4 výskyty mají popisek závorky (i „ara“)
    const labels = [...m.el.querySelectorAll(".strip-bracket text")].map(
      (t) => t.textContent,
    );
    expect(labels.sort()).toEqual(["ara", "bar", "bar", "barbara"]);
    await m.unmount();
  });

  it("bez tabulky (náhled) zůstává pás σ za stromem mimo sloupec", async () => {
    const st = steps[steps.length - 1].state;
    const m = await mount(
      h(AcCanvas, { st, slots: 7, table: false, line: false, width: 300 }),
    );
    expect(m.el.querySelector(".ac-side-col")).toBeNull();
    expect(
      m.el.querySelector(":scope > div > .strip-view, :scope > .strip-view"),
    ).not.toBeNull();
    await m.unmount();
  });

  it("tabulka se posune (scrollTop kontejneru) k aktivnímu stavu, okno ne", async () => {
    const st = steps[steps.length - 1].state;
    const m = await mount(h(AcCanvas, { st, slots: 7 }));
    const box = m.el.querySelector<HTMLElement>(".ac-side")!;
    const row = box.querySelector<HTMLElement>(
      "tr.row-cur, tr.row-hot, tr.row-new",
    );
    expect(row).not.toBeNull();
    // jsdom neumí rozvržení: kontejner 100 px, aktivní řádek 300 px pod jeho horním okrajem
    Object.defineProperty(box, "clientHeight", {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(box, "scrollHeight", {
      value: 400,
      configurable: true,
    });
    box.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 100,
        height: 100,
        left: 0,
        right: 0,
        width: 0,
      }) as DOMRect;
    row!.getBoundingClientRect = () =>
      ({
        top: 300,
        bottom: 317,
        height: 17,
        left: 0,
        right: 0,
        width: 0,
      }) as DOMRect;
    const scrollY = window.scrollY;
    // nový krok (jiný stav) spustí posun
    await m.render(
      h(AcCanvas, { st: steps[steps.length - 2].state, slots: 7 }),
    );
    await m.render(h(AcCanvas, { st, slots: 7 }));
    expect(box.scrollTop).toBeGreaterThan(0);
    expect(window.scrollY).toBe(scrollY);
    await m.unmount();
  });
});
