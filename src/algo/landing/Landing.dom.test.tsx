// @vitest-environment jsdom
/*
 * Úvodní stránka /algo/#/ (přehled modulů): karty všech modulů po skupinách, filtr Vše / Bc. / Mgr.,
 * hledání jako v levé liště, řada „Naposledy otevřené“ (klíč algo-recent) a kotvy na skupiny.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlgoPage } from "../AlgoPage";
import { CATEGORIES, MODULES, formatSource, moduleByPath } from "../registry";
import { RECENT_KEY } from "./recent";
import { groupAnchorId } from "./landingModel";

const wait = (ms = 20) =>
  act(() => new Promise<void>((r) => setTimeout(r, ms)));

let scrolled: Element[] = [];
beforeEach(() => {
  localStorage.clear();
  scrolled = [];
  // jsdom scrollIntoView nemá
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  cleanup();
  window.location.hash = "";
  localStorage.clear();
});

async function openHome() {
  window.location.hash = "#/";
  const r = render(<AlgoPage />);
  await wait();
  const main = r.container.querySelector("main")!;
  return { ...r, main };
}
const cards = (main: Element) => [
  ...main.querySelectorAll<HTMLAnchorElement>(".home-cat a.card"),
];
const levelButton = (main: Element, label: string) =>
  [...main.querySelectorAll<HTMLButtonElement>(".level-filter button")].find(
    (b) => b.textContent?.trim() === label,
  )!;
const nameOf = (a: Element) =>
  (a.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await wait(30);
}

describe("úvodní stránka – karty", () => {
  it("každý modul má kartu = odkaz s přístupným názvem, štítkem, zdrojem a náhledem", async () => {
    const { main } = await openHome();
    const list = cards(main);
    expect(list).toHaveLength(MODULES.length);
    expect(list.map((a) => a.getAttribute("href"))).toEqual(
      MODULES.map((m) => "#" + m.path),
    );
    for (const a of list) {
      const m = moduleByPath(a.getAttribute("href")!.slice(1))!;
      expect(nameOf(a), m.path).toBe(m.title);
      expect(a.querySelector(".level-tag")?.textContent).toBe(
        m.level === "bc" ? "Bc." : "Mgr.",
      );
      expect(a.querySelector(".card-source")?.textContent).toBe(
        formatSource(m.source),
      );
      expect(a.querySelector(".card-desc")?.textContent).toBe(m.desc);
      expect(a.querySelector(".thumb")).not.toBeNull();
      // v odkazu nesmí být další ovládací prvek
      expect(a.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(
        0,
      );
    }
    // skupiny v pořadí registru, každá s nadpisem
    expect(
      [...main.querySelectorAll(".home-cat h2")].map((h) => h.textContent),
    ).toEqual(CATEGORIES.map((c) => c.title));
  });

  it("přepínač Vše / Bc. / Mgr. filtruje jen karty (levá lišta zůstává celá)", async () => {
    const { main, container } = await openHome();
    const navLinks = () => container.querySelectorAll("nav.sidebar ul a");
    expect(levelButton(main, "Vše").getAttribute("aria-pressed")).toBe("true");

    await act(async () => fireEvent.click(levelButton(main, "Mgr.")));
    expect(levelButton(main, "Mgr.").getAttribute("aria-pressed")).toBe("true");
    expect(levelButton(main, "Vše").getAttribute("aria-pressed")).toBe("false");
    expect(cards(main)).toHaveLength(13);
    for (const a of cards(main))
      expect(a.querySelector(".level-mgr")).not.toBeNull();
    expect(navLinks()).toHaveLength(MODULES.length);

    await act(async () => fireEvent.click(levelButton(main, "Bc.")));
    expect(cards(main)).toHaveLength(MODULES.length - 13);
    expect(
      [...main.querySelectorAll(".home-cat h2")].map((h) => h.textContent),
    ).not.toContain("Hešování");

    await act(async () => fireEvent.click(levelButton(main, "Vše")));
    expect(cards(main)).toHaveLength(MODULES.length);
  });

  it("hledání (bez diakritiky, i tagy) zúží karty; Enter otevře první výsledek", async () => {
    const { main, container } = await openHome();
    const search = main.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    expect(search.getAttribute("aria-label")).toBe("Hledat modul");
    await act(async () =>
      fireEvent.change(search, { target: { value: "jarnik" } }),
    );
    expect(cards(main).map(nameOf)).toEqual(["Jarníkův (Primův) algoritmus"]);
    expect(cards(main)).toHaveLength(1);
    expect(main.querySelector(".search-count")?.textContent).toMatch(
      /Nalezeno: 1 modul/,
    );

    await act(async () =>
      fireEvent.change(search, { target: { value: "lifo" } }),
    );
    expect(cards(main).map((a) => a.getAttribute("href"))).toContain(
      "#/ds/stack",
    );

    await act(async () =>
      fireEvent.change(search, { target: { value: "xyz123" } }),
    );
    expect(cards(main)).toHaveLength(0);
    expect(main.querySelector(".search-count")?.textContent).toMatch(
      /Nic nenalezeno/,
    );

    await act(async () =>
      fireEvent.change(search, { target: { value: "lifo" } }),
    );
    await act(async () => fireEvent.keyDown(search, { key: "Enter" }));
    await wait(30);
    expect(window.location.hash).toBe("#/ds/stack");
    // nadpis stránky = název modulu v registru (CROSS-14)
    expect(container.querySelector("h1")?.textContent).toBe("Zásobník");
  });
});

describe("úvodní stránka – hledání: živá oblast a Esc (validace F1, F6)", () => {
  it("živá oblast počtu výsledků (role=status) existuje už před prvním psaním – čtečka ohlásí i první výsledek", async () => {
    const { main } = await openHome();
    const status = main.querySelector(".search-count");
    expect(status).not.toBeNull();
    expect(status!.getAttribute("role")).toBe("status");
    expect(status!.textContent).toBe("");
    const search = main.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    await act(async () =>
      fireEvent.change(search, { target: { value: "jarnik" } }),
    );
    // tentýž prvek, jen nový text
    expect(main.querySelector(".search-count")).toBe(status);
    expect(status!.textContent).toMatch(/Nalezeno: 1 modul/);
  });

  it("Esc v hledání vymaže pole a vrátí všechny karty", async () => {
    const { main } = await openHome();
    const search = main.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    await act(async () =>
      fireEvent.change(search, { target: { value: "jarnik" } }),
    );
    expect(cards(main)).toHaveLength(1);
    await act(async () => fireEvent.keyDown(search, { key: "Escape" }));
    expect(search.value).toBe("");
    expect(cards(main)).toHaveLength(MODULES.length);
  });
});

describe("úvodní stránka – Naposledy otevřené (algo-recent)", () => {
  it("neznámá cesta (#/sort/foo) se do historie nezapíše", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["/graph/dfs"]));
    await openHome();
    await go("#/sort/foo");
    await go("#/");
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual([
      "/graph/dfs",
    ]);
  });

  it("bez historie se řada neukazuje", async () => {
    const { main } = await openHome();
    expect(main.querySelector(".home-recent")).toBeNull();
    expect(main.textContent).not.toContain("Naposledy otevřené");
    // nový návštěvník dostane místo historie „Kde začít“
    expect(main.querySelector(".home-start h2")?.textContent).toBe("Kde začít");
    // klávesy včetně kresby (roving tabindex, D3)
    const keys = main.querySelector(".home-keys")?.textContent ?? "";
    expect(keys).toMatch(/^Klávesy: mezerník přehrát \/ pauza/);
    expect(keys).toContain("Tab");
    expect(keys).toContain("Enter vybere");
    expect(keys).toContain("Shift+šipky");
    expect(keys).toContain("Esc");
  });

  it("otevření modulu se zapíše; přehled ukáže poslední 4, nejnovější první", async () => {
    const { container } = await openHome();
    for (const p of [
      "/sort/quick",
      "/graph/dfs",
      "/tree/avl",
      "/ds/heap",
      "/hash/bloom",
      "/graph/dfs",
    ])
      await go("#" + p);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual([
      "/graph/dfs",
      "/hash/bloom",
      "/ds/heap",
      "/tree/avl",
    ]);
    await go("#/");
    const main = container.querySelector("main")!;
    const row = main.querySelector(".home-recent")!;
    expect(row.querySelector("h2")?.textContent).toBe("Naposledy otevřené");
    const links = [...row.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#/graph/dfs",
      "#/hash/bloom",
      "#/ds/heap",
      "#/tree/avl",
    ]);
    // řada nepočítá do karet skupin
    expect(cards(main)).toHaveLength(MODULES.length);
  });

  it("uložená historie z dřívějška se ukáže hned po otevření", async () => {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(["/tree/splay", "/sort/heap"]),
    );
    const { main } = await openHome();
    expect(
      [...main.querySelectorAll(".home-recent a")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["#/tree/splay", "#/sort/heap"]);
    // kdo už něco otevřel, má řadu historie místo „Kde začít“
    expect(main.querySelector(".home-start")).toBeNull();
  });

  it("poškozený JSON v localStorage stránku neshodí a řada se neukáže", async () => {
    localStorage.setItem(RECENT_KEY, "{nejson");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await openHome();
    expect(cards(main)).toHaveLength(MODULES.length);
    expect(main.querySelector(".home-recent")).toBeNull();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("stávající klíče (algo-theme, algo-speed) zůstanou beze změny", async () => {
    localStorage.setItem("algo-theme", "dark");
    localStorage.setItem("algo-speed", "300");
    await openHome();
    await go("#/sort/quick");
    expect(localStorage.getItem("algo-theme")).toBe("dark");
    expect(localStorage.getItem("algo-speed")).toBe("300");
  });
});

describe("úvodní stránka – kotvy na skupiny", () => {
  it("čip pro každou skupinu s počtem modulů; klik posune ke skupině a dá na ni fokus", async () => {
    const { main } = await openHome();
    const nav = main.querySelector('nav[aria-label="Skupiny modulů"]')!;
    const chips = [...nav.querySelectorAll<HTMLButtonElement>("button")];
    expect(chips.map((b) => b.textContent)).toEqual(
      CATEGORIES.map((c) => `${c.title}${c.modules.length}`),
    );
    const trees = CATEGORIES.find((c) => c.title === "Vyhledávací stromy")!;
    const chip = chips.find((b) => b.textContent?.startsWith(trees.title))!;
    // Vyhledávací stromy mají 5 modulů
    expect(chip.getAttribute("aria-label")).toBe(
      `${trees.title}: ${trees.modules.length} modulů`,
    );
    // klik nemění adresu (HashRouter: #skupina by byla cesta)
    const before = window.location.hash;
    await act(async () => fireEvent.click(chip));
    expect(window.location.hash).toBe(before);
    const section = document.getElementById(groupAnchorId(trees.title))!;
    expect(section).not.toBeNull();
    expect(scrolled).toContain(section);
    expect(document.activeElement).toBe(section.querySelector("h2"));
  });

  it("čipy se řídí filtrem: Mgr. → jen skupiny s Mgr. moduly a jejich počty", async () => {
    const { main } = await openHome();
    await act(async () => fireEvent.click(levelButton(main, "Mgr.")));
    const chips = [
      ...main.querySelectorAll('nav[aria-label="Skupiny modulů"] button'),
    ].map((b) => b.textContent);
    expect(chips).not.toContain("Třídění7");
    expect(chips).toContain("Hešování4");
  });
});

describe("úvodní stránka – hledání přežije návrat Zpět (CROSS-11)", () => {
  it("hledat „strom“ + Mgr., klik na kartu, Zpět → pole i filtr obnovené, adresa beze změny", async () => {
    const { main, container } = await openHome();
    const search = main.querySelector<HTMLInputElement>("input[type=search]")!;
    await act(async () =>
      fireEvent.change(search, { target: { value: "strom" } }),
    );
    await act(async () => fireEvent.click(levelButton(main, "Mgr.")));
    const expected = cards(main).map((a) => a.getAttribute("href"));
    expect(expected.length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("#/");
    const keys = Object.keys(localStorage);

    const card = cards(main).find(
      (a) => a.getAttribute("href") === "#/tree/bb",
    )!;
    await act(async () => fireEvent.click(card));
    await wait(30);
    expect(window.location.hash).toBe("#/tree/bb");

    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 50));
    });
    await wait(30);
    const main2 = container.querySelector("main")!;
    expect(window.location.hash).toBe("#/");
    expect(
      main2.querySelector<HTMLInputElement>("input[type=search]")!.value,
    ).toBe("strom");
    expect(levelButton(main2, "Mgr.").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(cards(main2).map((a) => a.getAttribute("href"))).toEqual(expected);
    // žádný nový klíč localStorage (algo-recent zapisuje otevření modulu už dřív)
    expect(
      Object.keys(localStorage).filter(
        (k) => !keys.includes(k) && k !== RECENT_KEY,
      ),
    ).toEqual([]);
  });
});
