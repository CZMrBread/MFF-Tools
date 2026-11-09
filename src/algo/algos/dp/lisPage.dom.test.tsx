// @vitest-environment jsdom
/*
 * Stránka NRP (jsdom): výchozí obr. 12.3, odkaz ?a=…, Nrp2(x) Enterem (krok 1, pozastaveno, adresa nese
 * vstup), ↶ Vrátit operaci, Výchozí příklad, tabulka jako jedna zastávka Tabu se šipkami a výběrem
 * podproblému Enterem, konec běhu = obr. 12.3.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { FIG_12_3 } from "./dpBook.fixtures";
import { LisPage } from "./LisPage";

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
const row = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll<HTMLTableRowElement>(".dp-lis-table tr")]
    .find((r) => r.querySelector("th")?.textContent === name)!
    .querySelectorAll("td");

describe("Nejdelší rostoucí podposloupnost – stránka", () => {
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
        h(Routes, null, h(Route, { path: "/dp/lis", element: h(LisPage) })),
        h(Spy),
      ),
    );

  it("výchozí obr. 12.3: nadpis z registru, krok 1 pozastaveno, adresa bez a; na konci T a P z obrázku", async () => {
    page = await open("/dp/lis");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/dp/lis")!.title,
    );
    expect(op(el)).toContain("obr. 12.3");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toBe("");
    expect(row(el, "xᵢ")).toHaveLength(14);
    expect(row(el, "xᵢ")[0].textContent).toBe("−∞");
    await click(page.button("Na konec"));
    expect([...row(el, "T[i]")].map((c) => Number(c.textContent))).toEqual(
      FIG_12_3.T,
    );
    expect([...row(el, "P[i]")].map((c) => Number(c.textContent))).toEqual(
      FIG_12_3.P,
    );
    expect(msg(el)).toContain("3, 14, 15, 35, 38, 46");
    expect(el.querySelector(".dp-chart")).not.toBeNull();
  });

  it("odkaz ?a=1,13,7,15,10 se použije (obr. 12.4) a adresa se nepřepíše", async () => {
    page = await open("/dp/lis?a=1,13,7,15,10");
    expect(op(page.el)).toContain("obr. 12.4");
    expect(row(page.el, "xᵢ")).toHaveLength(6);
    expect(search).toBe("?a=1,13,7,15,10");
    expect(counter(page.el)).toMatch(/^krok 1 \//);
  });

  it("vadný odkaz: výchozí příklad a hláška", async () => {
    page = await open("/dp/lis?a=x,y");
    expect(op(page.el)).toContain("obr. 12.3");
    expect(page.el.textContent).toMatch(/odkazu nejde použít/);
  });

  it("Nrp2(x) Enterem: nový běh na kroku 1 (pozastaveno), adresa nese vstup; ↶ a Výchozí příklad", async () => {
    page = await open("/dp/lis");
    await click(page.button("Nrp2(x1, …, xn)"));
    await type(page.input("x ="), "4 1 3");
    await key(page.input("x ="), { key: "Enter" });
    expect(op(page.el)).toContain("Nrp2(4, 1, 3)");
    expect(counter(page.el)).toMatch(/^krok 1 \//);
    expect(playing(page.el)).toBe(false);
    expect(search).toBe("?a=4,1,3");
    await click(page.button("↶ Vrátit operaci"));
    expect(op(page.el)).toContain("obr. 12.3");
    expect(search).toBe("");
    await click(page.button("Příklady z knihy"));
    await click(page.button("Obr. 12.4 – 1, 13, 7, 15, 10"));
    expect(search).toBe("?a=1,13,7,15,10");
    await click(page.button("Výchozí příklad"));
    expect(op(page.el)).toContain("obr. 12.3");
    expect(search).toBe("");
  });

  it("tabulka je jedna zastávka Tabu; šipka posune fokus, Enter vybere podproblém (řetěz P)", async () => {
    page = await open("/dp/lis");
    await click(page.button("Na konec"));
    const group = page.el.querySelector<HTMLElement>(
      ".dp-lis [data-rove-group]",
    )!;
    const stops = group.querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    const first = stops[0] as HTMLElement;
    first.focus();
    await key(first, { key: "ArrowRight" });
    const now = document.activeElement as HTMLElement;
    expect(now).not.toBe(first);
    expect(now.getAttribute("tabindex")).toBe("0");
    // sloupec 5 vybrat klikem: T[5] = 2 → 65, 89
    const col5 = row(page.el, "xᵢ")[5];
    await click(col5);
    expect(page.el.querySelector(".dp-sel-info")?.textContent).toContain(
      "65, 89",
    );
    expect(col5.className).toContain("dp-sel");
    await key(col5, { key: "Enter" });
    expect(page.el.querySelector(".dp-sel-info")?.textContent).toContain(
      "T[5] = 2",
    );
  });
});
