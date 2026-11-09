// @vitest-environment jsdom
// Stránka Sčítačka v DOM: výchozí obr. 15.4 (obě sčítačky souběžně), tabulka jako v knize (pozice 7 … 0,
// sloučené bloky, popisky skupin), řetěz krabiček Σ (obr. 15.3), přepnutí bitu klikem = nový výpočet
// (krok 1, pozastaveno), Sečíst(x, y) s Enterem, režimy, (p, q), odkazy a vadný odkaz.
import { createElement as h, StrictMode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type Location,
} from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { AdderPage } from "./AdderPage";

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
      h(Route, { path: "/parallel/adder", element: h(AdderPage) }),
    ),
  );
  const m = await mount(strict ? h(StrictMode, null, tree) : tree);
  const text = () => m.el.textContent ?? "";
  const counter = () => m.el.querySelector(".step-counter")?.textContent ?? "";
  const playing = () =>
    m.el.querySelector(".ctl-play")?.getAttribute("aria-label") ===
    "Pozastavit";
  const variant = (label: string) =>
    [...m.el.querySelectorAll<HTMLButtonElement>(".am-variant")].find(
      (b) => b.textContent === label,
    )!;
  const search = () => new URLSearchParams(loc.current!.search);
  const table = () => m.el.querySelector<HTMLTableElement>(".adder-table");
  const rowText = (cls: string) =>
    [...(table()?.querySelectorAll(`tr.${cls} td.ad-col`) ?? [])]
      .map((td) => td.textContent?.trim())
      .join(" ");
  const bit = (which: "x" | "y", i: number) =>
    m.el.querySelector<HTMLElement>(`.adder-table [data-bit="${which}${i}"]`)!;
  const toEnd = () => click(m.button("Na konec"));
  return {
    m,
    loc,
    text,
    counter,
    playing,
    variant,
    search,
    table,
    rowText,
    bit,
    toEnd,
  };
}

describe("AdderPage (jsdom)", () => {
  it("výchozí = obr. 15.4, obě sčítačky souběžně: stojí na kroku 1 z 11, adresa se nepřepíše", async () => {
    const p = await open("/parallel/adder", true);
    expect(p.m.el.querySelector("h1")?.textContent).toBe(
      "Sčítačka (školní a paralelní)",
    );
    expect(p.counter()).toBe("krok 1 / 11");
    expect(p.playing()).toBe(false);
    expect(p.loc.current!.search).toBe("");
    // hlavička pozic 7 … 0 a popisky skupin jako v knize
    expect(
      [...p.table()!.querySelectorAll("tr.ad-pos th.ad-col")].map(
        (t) => t.textContent,
      ),
    ).toEqual(["7", "6", "5", "4", "3", "2", "1", "0"]);
    expect(
      [...p.table()!.querySelectorAll("th.ad-group")].map((t) => t.textContent),
    ).toEqual(["pozice", "vstup", "bloky", "přenosy", "výstup"]);
    expect(p.rowText("ad-x")).toBe("0 1 1 1 0 1 0 0");
    expect(p.rowText("ad-y")).toBe("0 0 1 1 1 0 1 1");
    // řetěz krabiček Σ (obr. 15.3) – 8 krabiček
    expect(p.m.el.querySelectorAll(".adder-chain .ad-box")).toHaveLength(8);
    expect(p.text()).toContain("školní 8 hladin (Θ(n))");
    expect(p.text()).toContain("Obr. 15.4 Průvodce (s. 390)");
    await p.m.unmount();
  });

  it("na konci: bloky sloučené přes 1, 2, 4, 8 sloupců, přenosy na hranicích, výstup 1 0 1 0 1 1 1 1", async () => {
    const p = await open("/parallel/adder");
    await p.toEnd();
    const spans = (lvl: number) =>
      [
        ...p
          .table()!
          .querySelectorAll<HTMLTableCellElement>(
            `tr.ad-blocks-${lvl} td.ad-col`,
          ),
      ].map((td) => `${td.colSpan}:${td.textContent?.trim()}`);
    expect(spans(0)).toEqual([
      "1:0",
      "1:<",
      "1:1",
      "1:1",
      "1:<",
      "1:<",
      "1:<",
      "1:<",
    ]);
    expect(spans(1)).toEqual(["2:0", "2:1", "2:<", "2:<"]);
    expect(spans(2)).toEqual(["4:0", "4:<"]);
    expect(spans(3)).toEqual(["8:0"]);
    expect(p.rowText("ad-carry-3")).toBe("1 1 0 0");
    expect(p.rowText("ad-carry-2")).toBe("1 0");
    expect(p.rowText("ad-out")).toBe("1 0 1 0 1 1 1 1");
    expect(p.text()).toContain("116 + 59 = 175");
    expect(p.text()).toMatch(/školní 8 hladin.*paralelní 9 hladin/);
    await p.m.unmount();
  });

  it("klik na bit přepne x₀: nový výpočet od kroku 1, pozastavený; odkaz nese x a y, pole akce se změní", async () => {
    const p = await open("/parallel/adder");
    await p.toEnd();
    expect(p.bit("x", 0).getAttribute("aria-pressed")).toBe("false");
    await click(p.bit("x", 0));
    expect(p.counter()).toBe("krok 1 / 11");
    expect(p.playing()).toBe(false);
    expect(p.bit("x", 0).getAttribute("aria-pressed")).toBe("true");
    expect(p.search().get("x")).toBe("01110101");
    expect(p.search().get("y")).toBe("00111011");
    await p.toEnd();
    expect(p.text()).toContain("117 + 59 = 176");
    // Enter na bitu y₇
    await key(p.bit("y", 7), { key: "Enter" });
    expect(p.search().get("y")).toBe("10111011");
    await click(p.m.button("Sečíst(x, y)"));
    const fields = p.m.el.querySelectorAll<HTMLInputElement>(".am-body input");
    expect(fields[0].value).toBe("01110101");
    expect(fields[1].value).toBe("10111011");
    await p.m.unmount();
  });

  it("Sečíst(x, y) s Enterem: 101 + 11 se doplní na n = 4; přehrávač stojí, ▶ ho rozběhne", async () => {
    const p = await open("/parallel/adder");
    await click(p.m.button("Sečíst(x, y)"));
    const fields = p.m.el.querySelectorAll<HTMLInputElement>(".am-body input");
    await type(fields[0], "101");
    await type(fields[1], "11");
    await key(fields[1], { key: "Enter" });
    expect(p.table()!.querySelectorAll("tr.ad-pos th.ad-col")).toHaveLength(4);
    expect(p.search().get("x")).toBe("0101");
    expect(p.search().get("y")).toBe("0011");
    expect(p.text()).toContain("doplněno zleva nulami na n = 4");
    expect(p.counter()).toBe("krok 1 / 9");
    expect(p.playing()).toBe(false);
    await click(p.m.button("Přehrát"));
    expect(p.playing()).toBe(true);
    await p.m.unmount();
  });

  it("Režim: paralelní bez řetězu (10 kroků, m=par), školní bez tabulky bloků (10 kroků, m=school)", async () => {
    const p = await open("/parallel/adder");
    await click(p.m.button("Režim"));
    await click(p.variant("Paralelní (obr. 15.4)"));
    expect(p.counter()).toBe("krok 1 / 10");
    expect(p.search().get("m")).toBe("par");
    expect(p.m.el.querySelector(".adder-chain")).toBeNull();
    if (!p.variant("Školní (obr. 15.3)")) await click(p.m.button("Režim"));
    await click(p.variant("Školní (obr. 15.3)"));
    expect(p.counter()).toBe("krok 1 / 10");
    expect(p.search().get("m")).toBe("school");
    expect(p.table()).toBeNull();
    expect(p.m.el.querySelectorAll(".adder-chain .ad-box")).toHaveLength(8);
    await p.toEnd();
    expect(p.text()).toContain("z₈ = c₈ = 0");
    await p.m.unmount();
  });

  it("Příklady z knihy a Vytvořit ▸ Nejhorší přenos (n = 16: paralelní 11 hladin proti 16)", async () => {
    const p = await open("/parallel/adder");
    await click(p.m.button("Příklady z knihy"));
    await click(p.variant("Jednobitové bloky (s. 388): 0011 + 0101"));
    expect(p.search().get("x")).toBe("0011");
    await p.toEnd();
    expect(
      [...p.table()!.querySelectorAll("tr.ad-blocks-0 td.ad-col")].map((t) =>
        t.textContent?.trim(),
      ),
    ).toEqual(["0", "<", "<", "1"]);
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Nejhorší přenos"));
    const go = [
      ...p.m.el.querySelectorAll<HTMLButtonElement>(".am-body button"),
    ].find((b) => b.textContent === "Provést");
    if (go) await click(go);
    expect(p.search().get("x")).toBe("0111111111111111");
    expect(p.counter()).toBe("krok 1 / 18");
    expect(p.text()).toContain("paralelní 2·log₂ 16 + 3 = 11 hladin");
    await p.m.unmount();
  });

  it("odkaz x, y, m=par a pq=1 (kódování (p, q) u bloků); při otevření se nepřepisuje", async () => {
    const p = await open("/parallel/adder?x=1111&y=0001&m=par&pq=1", true);
    expect(p.counter()).toBe("krok 1 / 8");
    expect(p.loc.current!.search).toBe("?x=1111&y=0001&m=par&pq=1");
    await p.toEnd();
    expect(
      p.m.el.querySelectorAll(".adder-table .ad-pq").length,
    ).toBeGreaterThan(0);
    expect(p.text()).toContain("15 + 1 = 16");
    const pq = p.m.input("(p, q)");
    await click(pq);
    expect(p.search().get("pq")).toBeNull();
    expect(p.m.el.querySelectorAll(".adder-table .ad-pq")).toHaveLength(0);
    await p.m.unmount();
  });

  it("vadný odkaz → výchozí příklad a hláška", async () => {
    const p = await open("/parallel/adder?x=12&y=1");
    expect(p.text()).toContain("Vstup z odkazu nešel použít");
    expect(p.rowText("ad-x")).toBe("0 1 1 1 0 1 0 0");
    await p.m.unmount();
  });
});

describe("Výchozí příklad (CROSS-04)", () => {
  it("tlačítko Výchozí příklad vrátí obr. 15.4 v režimu Obě a vyčistí adresu; stojí na kroku 1", async () => {
    const p = await open("/parallel/adder?x=0011&y=0101&m=school");
    expect(p.search().get("x")).toBe("0011");
    await click(p.m.button("Výchozí příklad"));
    expect(p.loc.current!.search).toBe("");
    expect(p.table()).not.toBeNull();
    expect(p.counter()).toMatch(/^krok 1 \/ \d+$/);
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });
});

describe("školní režim (NEWMODS-10)", () => {
  it("pod řetězem krabiček je písemné sčítání; v režimu Obě ne", async () => {
    const p = await open("/parallel/adder?m=school");
    expect(p.m.el.querySelector(".adder-chain-svg")).not.toBeNull();
    expect(p.m.el.querySelector(".adder-written")).not.toBeNull();
    await p.m.unmount();
    const q = await open("/parallel/adder");
    expect(q.m.el.querySelector(".adder-written")).toBeNull();
    await q.m.unmount();
  });
});
