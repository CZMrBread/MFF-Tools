// @vitest-environment jsdom
/*
 * Stránky zásobníku, fronty, seznamu, haldy a intervalového stromu jako celek.
 * - SSR (vždy): stránka se vykreslí s předvyplněným příkladem, nabídkou operací pod plátnem a historií;
 *   sdílený odkaz (?a=…) postaví strukturu ze zadaných čísel; neznámé :id přesměruje.
 * - jsdom (prostředí souboru, nikdy se nepřeskočí): hlavní akce je po otevření rozbalená, Enter v poli
 *   spustí operaci a ta stojí na kroku 1 (přehraje až ▶), Vytvořit / MakeHeap / Build zapíší vstup do adresy, příklady
 *   z knihy postaví strukturu z obrázku, klik na prvek plátna vyplní argument.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HeapPage } from "./HeapPage";
import { ListPage } from "./ListPage";
import { SegTreePage } from "./SegTreePage";

const routes = () =>
  h(
    Routes,
    null,
    h(Route, { path: "/", element: h("p", null, "PŘEHLED") }),
    h(Route, { path: "/ds/heap", element: h(HeapPage) }),
    h(Route, { path: "/ds/segtree", element: h(SegTreePage) }),
    h(Route, { path: "/ds/:id", element: h(ListPage) }),
  );

const ssr = (url: string) =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, routes()));
/** text bez značek (fmtMath vkládá <sub>) */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

describe("stránky – SSR", () => {
  it("zásobník, fronta a seznam: výchozí příklad, nabídka operací pod plátnem (ActionMenu), jednotné popisky", () => {
    const html = ssr("/ds/stack");
    const stack = text(html);
    for (const t of [
      "Vytvořit",
      "Push(x)",
      "Pop",
      "↶ Vrátit operaci",
      "Výchozí příklad",
      "Zkuste:",
      "Kopírovat odkaz",
    ]) {
      expect(stack, t).toContain(t);
    }
    // akce jsou v doku pod plátnem, ne v panelu vstupu nad ním
    expect(html).toContain('class="viz-actions"');
    expect(html).not.toContain('class="viz-input"');
    expect(html.indexOf('class="viz-canvas"')).toBeLessThan(
      html.indexOf('class="action-menu"'),
    );
    expect(html).toContain('aria-label="Zásobník: 5, 12, 8"');
    expect(text(ssr("/ds/queue"))).toContain("Enqueue(x)");
    expect(text(ssr("/ds/queue"))).toContain("Dequeue");
    const list = text(ssr("/ds/list"));
    for (const t of [
      "Find(x)",
      "Delete(x)",
      "InsertFirst(x)",
      "InsertAfter(k, x)",
    ])
      expect(list, t).toContain(t);
  });

  it("neznámé :id nevykreslí žádnou stránku struktury (přesměrování proběhne v efektu, viz jsdom)", () => {
    expect(ssr("/ds/constructor")).toBe("");
  });

  it("halda: strom i pole z výchozího příkladu, nabídka operací pod plátnem, legenda se znaky", () => {
    const html = ssr("/ds/heap");
    const t = text(html);
    for (const s of [
      "Vytvořit",
      "MakeHeap(A)",
      "Insert(x)",
      "ExtractMin",
      "nejvýše 31",
      "aktuální vrchol i",
    ])
      expect(t, s).toContain(s);
    expect(html).toContain("legend-glyph");
    expect(html).toContain('class="viz-actions"');
    expect(html).not.toContain('class="viz-input"');
  });

  it("halda: výchozí příklad je obr. 4.2 z Průvodce", () => {
    const html = ssr("/ds/heap");
    expect(html).toContain(
      'aria-label="Halda jako strom: 0, 2, 2, 3, 4, 3, 5, 9, 6, 7, 8, 4"',
    );
    expect(text(html)).toContain("obr. 4.2");
  });

  it("intervalový strom: výchozí příklad je obr. 4.6 z Průvodce (posloupnost 3 1 4 1 5 9 2 6)", () => {
    const t = text(ssr("/ds/segtree"));
    expect(t).toContain("obr. 4.6");
    expect(t).toContain("3 1 4 1 5 9 2 6");
  });

  it("intervalový strom: dotaz a změna prvku v nabídce pod plátnem, dolní indexy listů", () => {
    const html = ssr("/ds/segtree");
    const t = text(html);
    for (const s of [
      "Vytvořit",
      "Build(A)",
      "Min⟨i, j⟩",
      "IntUpdate(i, x)",
      "x₀",
      "x₇",
      "nejvýše 16",
    ])
      expect(t, s).toContain(s);
    expect(html).toContain('class="viz-actions"');
    expect(html).not.toContain('class="viz-input"');
  });

  it("halda: vrcholy mají unikátní přístupné názvy s klíčem i indexem (SORTDS-16)", () => {
    const html = ssr("/ds/heap?a=1,1,2,2,3");
    const labels = [
      ...html.matchAll(/class="tree-node[^"]*"[^>]*aria-label="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(labels.length).toBe(5);
    expect(new Set(labels).size).toBe(5);
    expect(labels).toContain("Vrchol s klíčem 2, index 3 – vybrat");
  });

  it("intervalový strom: popisek vrcholu nese index („5 · ⟨2,4⟩“, listy „8 · x₀“), přístupný název i minimum (SORTDS-08)", () => {
    const html = ssr("/ds/segtree");
    const subs = [
      ...html.matchAll(/<text[^>]*class="tree-sub"[^>]*>([^<]*)</g),
    ].map((m) => m[1]);
    expect(subs).toContain("5 · ⟨2,4⟩");
    expect(subs).toContain("8 · x₀");
    expect(subs).toContain("1 · ⟨0,8⟩");
    expect(html).toContain('aria-label="Vrchol 5 ⟨2,4⟩, minimum 1 – vybrat"');
  });

  it("sdílený odkaz ?a=… postaví strukturu ze zadaných čísel (neplatné tokeny přeskočí)", () => {
    expect(ssr("/ds/stack?a=4,abc,9")).toContain('aria-label="Zásobník: 4, 9"');
    // halda se ze sdílených čísel postaví (MakeHeap), v kořeni je minimum
    expect(ssr("/ds/heap?a=15,3,9,1")).toContain(
      'aria-label="Halda jako strom: 1, 3, 9, 15"',
    );
    expect(ssr("/ds/segtree?a=4,1,3")).toContain(
      'aria-label="Intervalový strom nad 4 listy, minimum 1"',
    );
  });
});

/* ---------------------------------------------------------------- jsdom */

describe("stránky v DOM (jsdom)", async () => {
  // DOM dodává prostředí jsdom (hlavička souboru) – test se nikdy potichu nepřeskočí
  const dom = { window };
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useLocation } = await import("react-router-dom");

  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }

  async function mount(url: string) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(h(MemoryRouter, { initialEntries: [url] }, routes(), h(Spy))),
    );
    return {
      el,
      unmount: () => act(async () => root.unmount()),
      input: (label: string) =>
        [...el.querySelectorAll("label")]
          .find((l) => l.textContent?.startsWith(label))!
          .querySelector("input, select")! as HTMLInputElement,
      button: (t: string) =>
        [...el.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === t,
        )!,
      op: () => el.querySelector(".viz-op")?.textContent ?? "",
      history: () => el.querySelector(".viz-history-list")?.textContent ?? "",
    };
  }
  type Page = Awaited<ReturnType<typeof mount>>;
  const type = async (input: HTMLInputElement, value: string) => {
    const isSelect = input.tagName === "SELECT";
    const proto = isSelect
      ? dom.window.HTMLSelectElement.prototype
      : dom.window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(
        new dom.window.Event(isSelect ? "change" : "input", { bubbles: true }),
      );
    });
  };
  const enter = (input: HTMLInputElement) =>
    act(async () => {
      input.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
  const click = (b: Element) =>
    act(async () => {
      b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
  const playing = (p: Page) =>
    p.el.querySelector(".ctl-play")!.getAttribute("aria-label") ===
    "Pozastavit";
  const treeLabel = (p: Page) =>
    p.el.querySelector("svg.tree-svg")!.getAttribute("aria-label");
  /** prvek plátna podle začátku přístupného názvu („Vrchol s klíčem 9,“) */
  const pickable = (p: Page, label: string) =>
    [...p.el.querySelectorAll("[role=button]")].find((g) =>
      g.getAttribute("aria-label")?.startsWith(label),
    )!;

  it("halda: Insert(x) je po otevření rozbalené s x = 1 z obr. 4.2; Enter = Insert(1), stojí na kroku 1; krok zpět", async () => {
    const p = await mount("/ds/heap");
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    expect(p.input("x =").value).toBe("1");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Insert(1)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.history()).toContain("Insert(1)");
    await click(p.button("↶ Vrátit operaci"));
    expect(p.history()).toContain("zatím žádná operace");
    await p.unmount();
  });

  it("halda: MakeHeap(A) zapíše výslednou haldu do adresy, Vytvořit ▸ Prázdná ho smaže a ExtractMin zakáže", async () => {
    const p = await mount("/ds/heap");
    await click(p.button("MakeHeap(A)"));
    expect(document.activeElement).toBe(p.input("A ="));
    await type(p.input("A ="), "9 4 7");
    await enter(p.input("A ="));
    expect(p.op()).toContain("MakeHeap(9, 4, 7)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    // adresa nese aktuální stav – výslednou haldu (odkaz z ní postaví stejnou haldu), CROSS-01
    expect(search).toBe("?a=4,9,7");
    await click(p.button("Vytvořit"));
    await click(p.button("Prázdná"));
    expect(search).toBe("");
    expect(p.history()).toContain("Vyprázdnit");
    expect(p.button("ExtractMin").getAttribute("aria-disabled")).toBe("true");
    expect(p.button("ExtractMin").title).toContain("prázdná");
    await p.unmount();
  });

  it("halda: Vytvořit ▸ Příklady z knihy postaví haldu z obrázku; obr. 4.2 předvyplní Insert(1)", async () => {
    const p = await mount("/ds/heap?a=5,3");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    const fig = p.input("Obrázek") as unknown as HTMLSelectElement;
    expect([...fig.options].map((o) => o.textContent)).toEqual([
      "Obr. 4.1 – halda a její očíslování",
      "Obr. 4.2 – vkládání do haldy, Insert(1)",
      "Obr. 4.3 – mazání z haldy, ExtractMin",
    ]);
    await type(p.input("Obrázek"), "obr-4-3");
    await click(p.button("Provést"));
    expect(treeLabel(p)).toBe(
      "Halda jako strom: 0, 1, 2, 4, 3, 3, 5, 9, 6, 7, 8, 4, 6",
    );
    expect(p.history()).toContain("Vytvořit(obr. 4.3)");
    expect(p.el.textContent).toContain("kořen 0 je doplněný");
    expect(search).toBe("?a=0,1,2,4,3,3,5,9,6,7,8,4,6");
    await type(p.input("Obrázek"), "obr-4-2");
    await click(p.button("Provést"));
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    expect(p.input("x =").value).toBe("1");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Insert(1)");
    await p.unmount();
  });

  it("halda: řádek proměnných n/i/o drží místo po celou operaci – na posledním kroku kresba neposkočí (VAL-03)", async () => {
    const p = await mount("/ds/heap");
    await enter(p.input("x ="));
    const last = [...p.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Na konec",
    )!;
    expect(p.el.querySelector(".vars"), "krok 1").not.toBeNull();
    await click(last);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok (\d+) \/ \1$/,
    );
    const vars = p.el.querySelector(".vars");
    expect(vars, "poslední krok: řádek zůstal").not.toBeNull();
    expect(vars!.getAttribute("aria-hidden")).toBe("true");
    await p.unmount();
  });

  it("halda: klik na vrchol stromu i na sloupec pole vyplní x u Insert(x)", async () => {
    const p = await mount("/ds/heap");
    await click(pickable(p, "Vrchol s klíčem 9,"));
    expect(p.input("x =").value).toBe("9");
    expect(document.activeElement).toBe(p.button("Provést"));
    const bars = p.el.querySelectorAll("svg.array-svg [role=button]");
    await click(bars[4]);
    expect(p.input("x =").value).toBe("4");
    await p.unmount();
  });

  it("neznámé :id přesměruje na přehled", async () => {
    const p = await mount("/ds/constructor");
    expect(p.el.textContent).toBe("PŘEHLED");
    await p.unmount();
  });

  it("Vytvořit ▸ Vlastní zapíše vstup do adresy; Výchozí příklad vrátí strukturu, pole A i adresu", async () => {
    const p = await mount("/ds/stack");
    await click(p.button("Vytvořit"));
    await click(p.button("Vlastní"));
    expect(p.input("A =").value).toBe("5, 12, 8");
    await type(p.input("A ="), "A = 1, 2");
    await enter(p.input("A ="));
    expect(search).toBe("?a=1,2");
    expect(p.history()).toContain("Vytvořit(1, 2)");
    await click(p.button("Výchozí příklad"));
    expect(search).toBe("");
    expect(p.input("A =").value).toBe("5, 12, 8");
    expect(
      p.el.querySelector("svg.boxlist-svg")!.getAttribute("aria-label"),
    ).toBe("Zásobník: 5, 12, 8");
    await p.unmount();
  });

  it("zásobník: Push(x) je po otevření rozbalené, Enter = Provést, průběh stojí na kroku 1; Prázdný a Pop na prázdném", async () => {
    const p = await mount("/ds/stack");
    expect(p.button("Push(x)").getAttribute("aria-expanded")).toBe("true");
    await type(p.input("x ="), "42");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Push(42)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("Vytvořit"));
    await click(p.button("Prázdný"));
    expect(p.history()).toContain("Vyprázdnit");
    // Pop na prázdném zůstává povolený (ukazuje chybovou větev pseudokódu), jen to řekne
    const pop = p.button("Pop");
    expect(pop.getAttribute("aria-disabled")).toBeNull();
    expect(pop.title).toContain("Pop skončí chybou");
    await p.unmount();
  });

  it("plný zásobník: Push(x) je zakázaný a vysvětlí proč", async () => {
    const p = await mount("/ds/stack?a=1,2,3,4,5,6,7,8,9,10,11,12");
    const push = p.button("Push(x)");
    expect(push.getAttribute("aria-disabled")).toBe("true");
    expect(push.title).toContain("plný");
    await p.unmount();
  });

  it("fronta: Enqueue(x) je po otevření rozbalené, Enter ho provede (krok 1)", async () => {
    const p = await mount("/ds/queue");
    expect(p.button("Enqueue(x)").getAttribute("aria-expanded")).toBe("true");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Enqueue(7)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.unmount();
  });

  it("seznam: Find(x) je rozbalené s předvyplněným prvkem ze seznamu; InsertAfter(k, x) má dvě pole", async () => {
    const p = await mount("/ds/list");
    expect(p.button("Find(x)").getAttribute("aria-expanded")).toBe("true");
    expect(p.input("x =").value).toBe("12");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Find(12)");
    await click(p.button("InsertAfter(k, x)"));
    await type(p.input("k ="), "2");
    await enter(p.input("k ="));
    expect(p.op()).toContain("InsertAfter(2, 12)");
    await p.unmount();
  });

  it("seznam: klik na krabičku vyplní x u Delete(x) a pozici k u InsertAfter(k, x)", async () => {
    const p = await mount("/ds/list");
    await click(p.button("Delete(x)"));
    const boxes = () => p.el.querySelectorAll<SVGGElement>("g.box");
    await click(boxes()[2]);
    expect(p.input("x =").value).toBe("8");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Delete(8)");
    await click(p.button("InsertAfter(k, x)"));
    await click(boxes()[1]);
    expect(p.input("k =").value).toBe("2");
    await p.unmount();
  });

  it("intervalový strom: Min⟨i, j⟩ je rozbalený; Enter v poli j spustí dotaz se zadanými mezemi (krok 1)", async () => {
    const p = await mount("/ds/segtree");
    expect(p.button("Min⟨i, j⟩").getAttribute("aria-expanded")).toBe("true");
    const j = p.input("j =");
    await type(j, "7");
    await enter(j);
    expect(p.op()).toContain("Min⟨2, 7⟩");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.unmount();
  });

  it("intervalový strom: klik na vrchol vyplní jeho interval do dotazu, u IntUpdate klik na list index", async () => {
    const p = await mount("/ds/segtree");
    // vrchol 5 = interval ⟨2, 4⟩ (min(4, 1) = 1)
    const nodes = () => p.el.querySelectorAll("g.tree-node");
    await click(nodes()[4]);
    expect(p.input("i =").value).toBe("2");
    expect(p.input("j =").value).toBe("4");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Min⟨2, 4⟩");
    await click(p.button("IntUpdate(i, x)"));
    // vrchol 11 = list x₃
    await click(nodes()[10]);
    expect(p.input("i =").value).toBe("3");
    await type(p.input("x ="), "0");
    await enter(p.input("x ="));
    expect(p.op()).toContain("IntUpdate(3, 0)");
    await p.unmount();
  });

  it("intervalový strom: Build(A) zapíše vstup do adresy; Příklady z knihy vrátí obr. 4.6", async () => {
    const p = await mount("/ds/segtree");
    await click(p.button("Build(A)"));
    await type(p.input("A ="), "4 1 3");
    await enter(p.input("A ="));
    expect(p.op()).toContain("Build(4, 1, 3)");
    expect(search).toBe("?a=4,1,3");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    await click(p.button("Provést"));
    expect(p.history()).toContain("Vytvořit(obr. 4.6)");
    expect(search).toBe("");
    expect(treeLabel(p)).toBe("Intervalový strom nad 8 listy, minimum 1");
    await p.unmount();
  });
});
