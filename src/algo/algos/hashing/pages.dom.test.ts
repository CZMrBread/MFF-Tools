// @vitest-environment jsdom
/*
 * Stránky hešování v DOM: nabídka operací (ActionMenu) pod plátnem – zadat x + Enter spustí operaci
 * a průběh stojí na kroku 1 (přehraje až ▶); klik na klíč v tabulce vyplní x; Vytvořit ▸ Vlastní a Přehešovat zapíšou
 * tabulku do adresy (?t=…).
 */
import { createElement as h, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { act, click, key, mount, type, type Mounted } from "../../core/domTest";
import { BloomPage, CuckooPage } from "./CuckooBloomPage";
import { HashPage } from "./HashPage";

/** adresa stránky (?t=…) – Spy ji zapíše v efektu po každém vykreslení */
const url = { search: "" };
function Spy() {
  const { search } = useLocation();
  useEffect(() => {
    url.search = search;
  }, [search]);
  return null;
}

const app = (url: string) =>
  h(
    MemoryRouter,
    { initialEntries: [url] },
    h(
      Routes,
      null,
      h(Route, { path: "/hash/cuckoo", element: h(CuckooPage) }),
      h(Route, { path: "/hash/bloom", element: h(BloomPage) }),
      h(Route, { path: "/hash/:id", element: h(HashPage) }),
    ),
    h(Spy),
  );

let page: Mounted | null = null;
async function open(url: string) {
  page = await mount(app(url));
  return page;
}
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const op = (p: Mounted) => p.el.querySelector(".viz-op")?.textContent ?? "";
const history = (p: Mounted) =>
  p.el.querySelector(".viz-history-list")?.textContent ?? "";
const playing = (p: Mounted) =>
  p.el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
const enter = (el: HTMLElement) => key(el, { key: "Enter" });
const select = (p: Mounted, label: string) =>
  p.input(label) as unknown as HTMLSelectElement;

describe("řetězení", () => {
  it("nabídka operací je pod plátnem, panel vstupu nad plátnem zmizel", async () => {
    const p = await open("/hash/chaining");
    expect(p.el.querySelector(".action-menu")).not.toBeNull();
    expect(p.el.querySelector(".viz-input")).toBeNull();
    expect(p.el.querySelector("fieldset")).toBeNull();
  });

  it("Insert(x): napsat klíč + Enter provede operaci, stojí na kroku 1", async () => {
    const p = await open("/hash/chaining");
    // po načtení je Insert(x) otevřená (modul čeká na operaci)
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    await type(p.input("x ="), "36");
    await enter(p.input("x ="));
    expect(op(p)).toContain("Insert(36)");
    expect(history(p)).toContain("Insert(36)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(url.search).toContain("36");
  });

  it("klik na klíč v řetězci vyplní x otevřené akce, Provést ji spustí", async () => {
    const p = await open("/hash/chaining");
    await click(p.button("Find(x)"));
    const key28 = [...p.el.querySelectorAll<HTMLElement>(".hc-key")].find(
      (k) => k.textContent === "28",
    )!;
    await click(key28);
    expect(p.input("x =").value).toBe("28");
    await click(p.button("Provést"));
    expect(op(p)).toContain("Find(28)");
  });

  it("Vytvořit ▸ Vlastní: klíče i m v jednom formuláři, Enter postaví tabulku a zapíše ji do adresy", async () => {
    const p = await open("/hash/chaining");
    await click(p.button("Vytvořit"));
    expect(p.input("A =").value).toBe("33, 12, 20, 28, 7, 15");
    await type(select(p, "m ="), "4");
    await type(p.input("A ="), "1, 5, 9");
    await enter(p.input("A ="));
    expect(url.search).toBe("?t=4:mod:1:1,5,9");
    expect(history(p)).toContain("Vytvořit(1, 5, 9)");
    expect(
      p.el.querySelector(".hash-chain")!.getAttribute("aria-label"),
    ).toContain("Tabulka s 4 přihrádkami, 3 klíče");
  });

  it("Přehešovat(m, h) zachová klíče; po Vrátit operaci ukazují pole zase parametry tabulky", async () => {
    const p = await open("/hash/chaining");
    await click(p.button("Přehešovat(m, h)"));
    await type(select(p, "m ="), "16");
    await enter(select(p, "m ="));
    expect(history(p)).toContain("m = 16");
    expect(
      p.el.querySelector(".hash-chain")!.getAttribute("aria-label"),
    ).toContain("Tabulka s 16 přihrádkami, 6 klíčů");
    await click(p.button("↶ Vrátit operaci"));
    expect(select(p, "m =").value).toBe("8");
  });

  it("Výchozí příklad vrátí i pole A", async () => {
    const p = await open("/hash/chaining");
    await click(p.button("Vytvořit"));
    await type(p.input("A ="), "1, 2");
    await enter(p.input("A ="));
    await click(p.button("Výchozí příklad"));
    // Vytvořit zůstává na desktopu po provedení otevřené (sbalí se jen na úzké obrazovce)
    expect(p.input("A =").value).toBe("33, 12, 20, 28, 7, 15");
  });
});

describe("otevřená adresace, kukačka, Bloom", () => {
  it("otevřená adresace: Delete(19) z nabídky a klik na buňku vyplní x", async () => {
    const p = await open("/hash/probing");
    await click(p.button("Delete(x)"));
    await type(p.input("x ="), "19");
    await enter(p.input("x ="));
    expect(op(p)).toContain("Delete(19)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    const cell41 = [...p.el.querySelectorAll<SVGGElement>("g.box")].find(
      (g) => g.querySelector("text")?.textContent === "41",
    )!;
    await click(cell41);
    expect(p.input("x =").value).toBe("41");
  });

  it("kukačka: Find(x) s předvyplněným 57, Vynutit cyklus jedním klikem", async () => {
    const p = await open("/hash/cuckoo");
    await click(p.button("Find(x)"));
    expect(p.input("x =").value).toBe("57");
    await enter(p.input("x ="));
    expect(op(p)).toContain("Find(57)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("Vynutit cyklus"));
    expect(op(p)).toContain("Vynutit cyklus");
  });

  it("Bloom: Lookup(x) + Enter, klik na vložený klíč vyplní x", async () => {
    const p = await open("/hash/bloom");
    await click(p.button("Lookup(x)"));
    await type(p.input("x ="), "5");
    await enter(p.input("x ="));
    expect(op(p)).toContain("Lookup(5)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    const k42 = [...p.el.querySelectorAll<HTMLElement>(".bloom-key")].find(
      (b) => b.textContent === "42",
    )!;
    await click(k42);
    expect(p.input("x =").value).toBe("42");
    await act(async () => {});
  });

  it("Bloom: Vytvořit ▸ Vlastní s m a k zapíše filtr do adresy", async () => {
    const p = await open("/hash/bloom");
    await click(p.button("Vytvořit"));
    await type(select(p, "k ="), "2");
    await type(p.input("A ="), "5, 6");
    await enter(p.input("A ="));
    expect(url.search).toBe("?t=32:2:5,6");
  });
});

describe("po načtení čeká Insert(x) s novým klíčem (TREEHASH-14, CROSS-07/15/16)", () => {
  const cases = [
    { path: "/hash/chaining", x: "36" },
    { path: "/hash/probing", x: "51" },
    { path: "/hash/cuckoo", x: "20" },
    { path: "/hash/bloom", x: "55" },
  ];
  for (const c of cases)
    it(`${c.path}: otevřená Insert(x) = ${c.x}, Enter vloží nový klíč; vpravo pseudokód Insert`, async () => {
      const p = await open(c.path);
      const insert = p.button("Insert(x)");
      expect(insert.getAttribute("aria-expanded")).toBe("true");
      // pseudokód Insert už před první operací (bez zvýrazněného řádku)
      const code = p.el.querySelector(".viz-code .pseudocode")!;
      expect(code.classList.contains("empty")).toBe(false);
      expect(code.querySelectorAll(".pc-line").length).toBeGreaterThan(1);
      expect(code.querySelector(".pc-line.active")).toBeNull();
      const field = p.input("x =");
      expect(field.value).toBe(c.x);
      expect(document.activeElement).not.toBe(field); // fokus se po načtení nekrade
      await enter(field);
      expect(op(p)).toContain(`Insert(${c.x})`);
      expect(playing(p)).toBe(false);
      expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
        /^krok 1 \/ \d+$/,
      );
      await click(p.button("Na konec"));
      expect(p.el.querySelector(".viz-message")?.textContent).not.toMatch(
        /už v tabulce je|už ve filtru/,
      );
      // Find a Delete dál nabízejí existující klíč
      if (c.path !== "/hash/bloom") {
        await click(p.button("Find(x)"));
        expect(p.input("x =").value).not.toBe(c.x);
      }
    });

  it("nadpis = název modulu v registru", async () => {
    const p = await open("/hash/probing");
    expect(p.el.querySelector("h1")?.textContent).toBe(
      "Hešování: otevřená adresace",
    );
  });
});

describe("otevřená adresace: Příklady z knihy ▸ Obr. 11.2 (TREEHASH-09)", () => {
  const cells = (p: Mounted) =>
    [...p.el.querySelectorAll<SVGGElement>(".viz-canvas svg > g.box")]
      .map((g, i) => [i, g.querySelector("text")?.textContent ?? ""] as const)
      .filter(([, t]) => t !== "")
      .map(([i, t]) => `${i}:${t}`)
      .join(" ");

  it("prázdná tabulka m = 10, x mod m, pak Insert 75, 36, 14, 42, 24, 95, 17 – každá čeká na Provést", async () => {
    const p = await open("/hash/probing");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    await click(p.button("Provést"));
    expect(cells(p)).toBe("");
    expect(url.search).toContain("t=10:mod");
    for (const x of [75, 36, 14, 42, 24, 95, 17]) {
      // další operace z obrázku je předvyplněná a otevřená, nic se nespustilo samo
      expect(p.input("x =").value).toBe(String(x));
      expect(playing(p)).toBe(false);
      await click(p.button("Provést"));
      expect(op(p)).toContain(`Insert(${x})`);
      expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
        /^krok 1 \/ \d+$/,
      );
    }
    await click(p.button("Na konec"));
    expect(cells(p)).toBe("2:42 4:14 5:75 6:36 7:24 8:95 9:17");
  });

  it("odkaz t=10:… se načte", async () => {
    const p = await open("/hash/probing?t=10:mod:1:42,14,75");
    expect(cells(p)).toBe("2:42 4:14 5:75");
  });
});
