// @vitest-environment jsdom
/*
 * Stránka Editační vzdálenost (jsdom): výchozí obr. 12.5, odkaz ?x=…&y=…, Edit2(x, y) Enterem (krok 1,
 * pozastaveno, adresa nese slova), ↶ a Výchozí příklad, konec = tabulka obr. 12.5 a zarovnání slov,
 * tabulka jako jedna zastávka Tabu, výběr podproblému klikem a Enterem.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { FIG_12_5 } from "./dpBook.fixtures";
import { EditDistancePage } from "./EditDistancePage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
/** hodnoty tabulky po řádcích (bez záhlaví) */
const table = (el: HTMLElement) =>
  [...el.querySelectorAll(".dp-edit-table tbody tr")].map((r) =>
    [...r.querySelectorAll("td")].map((c) =>
      Number(c.querySelector(".dp-v")?.textContent),
    ),
  );
const cell = (el: HTMLElement, r: number, c: number) =>
  el.querySelectorAll(".dp-edit-table tbody tr")[r].querySelectorAll("td")[
    c
  ] as HTMLElement;

describe("Editační vzdálenost – stránka", () => {
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
          h(Route, { path: "/dp/edit", element: h(EditDistancePage) }),
        ),
        h(Spy),
      ),
    );

  it("výchozí obr. 12.5: nadpis z registru, krok 1, adresa prázdná; na konci tabulka z obrázku a úpravy", async () => {
    page = await open("/dp/edit");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/dp/edit")!.title,
    );
    expect(op(el)).toContain("Edit2(poutník, potemník) – obr. 12.5");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toBe("");
    // záhlaví: písmena y a prázdný okrajový sloupec
    const heads = [...el.querySelectorAll(".dp-edit-table thead th")].map(
      (t) => t.textContent,
    );
    expect(heads.join("")).toBe("potemník");
    await click(page.button("Na konec"));
    expect(table(el)).toEqual(FIG_12_5.T);
    expect(msg(el)).toContain("L(poutník, potemník) = 3");
    expect(el.querySelector(".dp-align")?.textContent).toContain("pout–ník");
  });

  it("odkaz ?x=koule&y=kdoule se použije a adresa se nepřepíše; vadný = výchozí s hláškou", async () => {
    page = await open("/dp/edit?x=koule&y=kdoule");
    expect(op(page.el)).toContain("Edit2(koule, kdoule)");
    expect(search).toBe("?x=koule&y=kdoule");
    expect(counter(page.el)).toMatch(/^krok 1 \//);
    await page.unmount();
    page = await open("/dp/edit?x=dv%C4%9B%20slova&y=b");
    expect(op(page.el)).toContain("obr. 12.5");
    expect(page.el.textContent).toMatch(/odkazu nejde použít/);
  });

  it("Edit2(x, y) Enterem: krok 1 pozastaveno, adresa nese slova; ↶ a Výchozí příklad", async () => {
    page = await open("/dp/edit");
    await click(page.button("Edit2(x, y)"));
    await type(page.input("x ="), "kos");
    await type(page.input("y ="), "kosa");
    await key(page.input("y ="), { key: "Enter" });
    expect(op(page.el)).toContain("Edit2(kos, kosa)");
    expect(counter(page.el)).toMatch(/^krok 1 \//);
    expect(playing(page.el)).toBe(false);
    expect(search).toBe("?x=kos&y=kosa");
    await click(page.button("↶ Vrátit operaci"));
    expect(op(page.el)).toContain("obr. 12.5");
    expect(search).toBe("");
    await click(page.button("Příklady z knihy"));
    await click(page.button("Str. 306 – koule → boule"));
    expect(search).toBe("?x=koule&y=boule");
    await click(page.button("Výchozí příklad"));
    expect(search).toBe("");
  });

  it("tabulka je jedna zastávka Tabu; šipky chodí po buňkách; klik / Enter vybere podproblém", async () => {
    page = await open("/dp/edit");
    await click(page.button("Na konec"));
    const group = page.el.querySelector<HTMLElement>(
      ".dp-edit [data-rove-group]",
    )!;
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    const first = group.querySelector<HTMLElement>('[tabindex="0"]')!;
    first.focus();
    // jsdom nemá rozvržení – šipka jde podle pořadí v DOM
    await key(first, { key: "ArrowRight" });
    expect(document.activeElement).not.toBe(first);
    await click(cell(page.el, 2, 2));
    expect(page.el.querySelector(".dp-sel-info")?.textContent).toContain(
      "T[3, 3] = 3",
    );
    expect(cell(page.el, 2, 2).className).toContain("dp-sel");
    await key(cell(page.el, 4, 5), { key: "Enter" });
    expect(page.el.querySelector(".dp-sel-info")?.textContent).toContain(
      "přípony jsou stejné",
    );
  });
});
