// @vitest-environment jsdom
/*
 * Stránky stromů jako celek (tenká vrstva nad treeMenu.ts).
 * - SSR: nabídka operací (Vytvořit, Find/Insert/Delete, α, (a,b)), sdílený odkaz (?k=…, ?ab=…, ?alpha=…, ?ex=…),
 *   legenda bez zdvojených vzorků, neznámé :id nevykreslí žádnou stránku.
 * - jsdom (prostředí souboru, nikdy se nepřeskočí): x + Enter v akci spustí operaci (krok 1, přehraje až ▶),
 *   klik na vrchol vyplní x, Vytvořit zapíše vstup do adresy, příklad z knihy postaví strom z obrázku
 *   a předvyplní jeho operace, α a (a,b) se přepínají z nabídky a jdou vrátit.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { act, click, mount as mountNode, type } from "../../core/domTest";
import { ABTreePage } from "./ABTreePage";
import { layoutAB } from "./abtree";
import { AB_BOOK_EXAMPLES } from "./bookExamples";
import { TreePage } from "./TreePage";

const routes = () =>
  h(
    Routes,
    null,
    h(Route, { path: "/", element: h("p", null, "PŘEHLED") }),
    h(Route, { path: "/tree/ab", element: h(ABTreePage) }),
    h(Route, { path: "/tree/:id", element: h(TreePage) }),
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

describe("stránky stromů – SSR", () => {
  it("BB[α] a (a,b): nápověda říká, že odkaz nese klíče, ne přesný tvar (CROSS-01)", () => {
    for (const url of ["/tree/bb", "/tree/ab"])
      expect(text(ssr(url)), url).toContain("odkaz nese klíče, ne přesný tvar");
    for (const url of ["/tree/bst", "/tree/avl", "/tree/splay"])
      expect(text(ssr(url)), url).not.toContain("odkaz nese klíče");
  });

  it("BST, AVL, splay, BB[α]: výchozí příklad a nabídka operací podle pseudokódu, bez starých panelů", () => {
    for (const id of ["bst", "avl", "splay", "bb"]) {
      const html = ssr(`/tree/${id}`);
      const t = text(html);
      for (const s of [
        "Vytvořit",
        "Find(x)",
        "Insert(x)",
        "Delete(x)",
        "↶ Vrátit operaci",
        "Výchozí příklad",
        "Zkuste:",
        "Kopírovat odkaz",
      ]) {
        expect(t, `${id}: ${s}`).toContain(s);
      }
      expect(html, id).toContain('class="action-menu"');
      // staré fieldsety Operace / Vstup a tlačítka nad plátnem jsou pryč
      expect(html, id).not.toContain("<legend>");
      expect(t, id).not.toContain("Náhodný vstup");
      expect(t.indexOf("Vytvořit")).toBeLessThan(t.indexOf("Find(x)"));
      expect(t.indexOf("Find(x)")).toBeLessThan(t.indexOf("Insert(x)"));
      expect(t.indexOf("Insert(x)")).toBeLessThan(t.indexOf("Delete(x)"));
      expect(html, id).toContain('aria-label="Strom s');
      expect(html, id).toContain("sw-removed-dashed");
      expect(html, id).not.toContain('swatch sw-removed"');
    }
    expect(text(ssr("/tree/bb"))).toContain("α = 0,7");
    expect(text(ssr("/tree/avl"))).toContain("znaménko δ");
  });

  it("sdílený odkaz ?k=… postaví strom ze zadaných klíčů, ?alpha= nastaví α", () => {
    expect(ssr("/tree/bst?k=5,abc,3,8")).toContain(
      'aria-label="Strom s 3 vrcholy"',
    );
    expect(text(ssr("/tree/bst?k=5,3,8"))).toContain(
      "Strom ze vstupu v odkazu",
    );
    expect(text(ssr("/tree/bb?alpha=0.8"))).toContain("α = 0,8");
  });

  it("(a,b)-strom: nabídka s (a,b), ?ab= a ?k=, ?ex= příklad z přednášky", () => {
    const t = text(ssr("/tree/ab"));
    for (const s of [
      "Vytvořit",
      "Find(x)",
      "Insert(x)",
      "Delete(x)",
      "(a,b) = (2,3)",
      "Výchozí příklad",
      "Zkuste:",
    ])
      expect(t, s).toContain(s);
    expect(t).toContain("má (a,b) = (2,3)");
    expect(text(ssr("/tree/ab?ab=3,5&k=1,2,3,4,5,6"))).toContain(
      "má (a,b) = (3,5)",
    );
    const ex = AB_BOOK_EXAMPLES[0];
    const html = ssr(`/tree/ab?ex=${ex.id}`);
    expect(text(html)).toContain("má (a,b) = (2,4)");
    expect(html).toContain(
      `aria-label="(a,b)-strom s ${layoutAB(ex.build()).nodes.length} vrcholy"`,
    );
    expect(text(html)).toContain("Příklad z přednášky");
  });

  it("(a,b)-strom: bez ?var= přednášková varianta (staré odkazy beze změny), ?var=kniha varianta z Průvodce 8.3", () => {
    const lecture = text(ssr("/tree/ab?k=1,2,3"));
    expect(lecture).toContain("Varianta: přednáška");
    expect(lecture).toContain("Klíče jsou v listech");
    const book = text(ssr("/tree/ab?var=kniha&k=1,2,3"));
    expect(book).toContain("Varianta: Průvodce");
    expect(book).toContain("Průvodce 8.3");
    expect(book).toContain("Insert(x):   // AbInsert");
    // ?ex= obrázku z knihy přepne na knižní variantu i bez ?var=
    expect(text(ssr("/tree/ab?ex=obr-8-10"))).toContain("Varianta: Průvodce");
  });

  it("neznámé :id nevykreslí žádnou stránku stromu (přesměrování proběhne v efektu, viz jsdom)", () => {
    expect(ssr("/tree/foo")).toBe("");
  });
});

/* ---------------------------------------------------------------- jsdom */

describe("stránky stromů v DOM (jsdom)", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }

  async function mount(url: string) {
    const m = await mountNode(
      h(MemoryRouter, { initialEntries: [url] }, routes(), h(Spy)),
    );
    const el = m.el;
    return {
      ...m,
      select: (label: string) => m.input(label) as unknown as HTMLSelectElement,
      op: () => el.querySelector(".viz-op")?.textContent ?? "",
      history: () => el.querySelector(".viz-history-list")?.textContent ?? "",
      playing: () =>
        el.querySelector(".ctl-play")?.getAttribute("aria-label") ===
        "Pozastavit",
      svgLabel: () =>
        el.querySelector("svg.tree-svg")!.getAttribute("aria-label"),
      /** vrchol stromu podle klíče */
      node: (key: string) =>
        [...el.querySelectorAll<SVGGElement>("g.tree-node")].find(
          (g) => g.querySelector("text")?.textContent === key,
        )!,
      /** klíč v kořeni (vrchol s nejmenší souřadnicí y) */
      rootKey: () => {
        const ys = [...el.querySelectorAll<SVGGElement>("g.tree-node")].map(
          (g) => ({
            y: Number(/,\s*(-?[\d.]+)px/.exec(g.style.transform)![1]),
            key: g.querySelector("text")!.textContent,
          }),
        );
        return ys.sort((a, b) => a.y - b.y)[0].key;
      },
    };
  }
  const enter = (input: HTMLElement) =>
    act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

  it("AVL: Insert(x) z nabídky, x + Enter spustí operaci (krok 1, pozastaveno); historie a krok zpět", async () => {
    const p = await mount("/tree/avl");
    // Insert(x) je po načtení rozbalený (CROSS-06)
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    // Insert nabízí nový klíč (27 = dvojitá rotace), ne klíč, který už ve stromu je (UX-03)
    expect(p.input("x =").value).toBe("27");
    await type(p.input("x ="), "-5");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Insert(−5)");
    expect(p.playing()).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.history()).toContain("Insert(−5)");
    await click(p.button("↶ Vrátit operaci"));
    expect(p.history()).toContain("zatím žádná operace");
    await p.unmount();
  });

  it("klik na vrchol vyplní x otevřené akce (po načtení Insert(x)), Provést operaci spustí", async () => {
    const p = await mount("/tree/bst");
    await click(p.button("Find(x)"));
    await click(p.node("60"));
    expect(p.input("x =").value).toBe("60");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Find(60)");
    // otevřená akce Delete(x) dostane klíč z kliknutí
    await click(p.button("Delete(x)"));
    await click(p.node("25"));
    expect(p.input("x =").value).toBe("25");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Delete(25)");
    await p.unmount();
  });

  it("sdílený strom bez výchozího x: x je první klíč z odkazu", async () => {
    const p = await mount("/tree/bst?k=5,3,8");
    await click(p.button("Find(x)"));
    expect(p.input("x =").value).toBe("5");
    await p.unmount();
  });

  it("BST: Vytvořit ▸ Vlastní zapíše klíče do adresy, Prázdný zakáže Find a Delete, Výchozí příklad vše vrátí", async () => {
    const p = await mount("/tree/bst");
    await click(p.button("Vytvořit"));
    expect(p.input("klíče =").value).toBe("40, 20, 60, 10, 30, 50, 70, 25");
    expect(p.button("Vlastní").title).toContain("nejvýše 40");
    await type(p.input("klíče ="), "9 4 7 4");
    await enter(p.input("klíče ="));
    // čárky v odkazu mohou být nezakódované (E7) – porovnáváme dekódovaně
    expect(decodeURIComponent(search)).toBe("?k=9,4,7");
    expect(p.input("klíče =").value).toBe("9, 4, 7");
    expect(p.svgLabel()).toBe("Strom s 3 vrcholy");
    expect(p.history()).toContain("Postavit (3 klíče)");
    await click(p.button("Prázdný"));
    expect(search).toBe("");
    expect(p.button("Find(x)").getAttribute("aria-disabled")).toBe("true");
    expect(p.button("Delete(x)").title).toContain("prázdný");
    expect(p.button("Insert(x)").getAttribute("aria-disabled")).toBeNull();
    await click(p.button("Výchozí příklad"));
    expect(p.svgLabel()).toBe("Strom s 8 vrcholy");
    // Vytvořit zůstalo otevřené (na počítači se po provedení nesbalí) – zpět na pole A
    await click(p.button("Vlastní"));
    expect(p.input("klíče =").value).toBe("40, 20, 60, 10, 30, 50, 70, 25");
    await p.unmount();
  });

  it("AVL: příklad z knihy obr. 8.6 postaví strom z obrázku a předvyplní Delete(8); Provést ho připraví na kroku 1", async () => {
    const p = await mount("/tree/avl");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    await type(p.select("Obrázek"), "obr-8-6");
    await click(p.button("Postavit"));
    expect(p.svgLabel()).toBe("Strom s 8 vrcholy");
    expect(p.rootKey()).toBe("6");
    expect(p.history()).toContain("Příklad: Obr. 8.6");
    expect(decodeURIComponent(search)).toBe("?k=6,2,7,1,4,8,3,5");
    expect(p.el.textContent).toContain("s. 193");
    // operace z obrázku je otevřená a předvyplněná
    expect(p.input("x =").value).toBe("8");
    await click(p.button("Provést"));
    expect(p.op()).toContain("Delete(8)");
    expect(p.playing()).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.unmount();
  });

  it("BST: obr. 8.2 provede po Delete(2) předvyplněním Delete(4) a pak Delete(3)", async () => {
    const p = await mount("/tree/bst");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    await type(p.select("Obrázek"), "obr-8-2");
    await click(p.button("Postavit"));
    expect(p.input("x =").value).toBe("2");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Delete(2)");
    expect(p.input("x =").value).toBe("4");
    await enter(p.input("x ="));
    expect(p.input("x =").value).toBe("3");
    await enter(p.input("x ="));
    expect(p.history()).toContain("Delete(3)");
    await p.unmount();
  });

  it("BB[α]: α se volí v nabídce, zapíše se do adresy a jen z nabízených hodnot", async () => {
    const p = await mount("/tree/bb");
    await click(p.button("α = 0,7"));
    const options = [...p.el.querySelectorAll(".am-variant")].map((b) =>
      Number(b.textContent!.replace(",", ".")),
    );
    expect(options.every((a) => a > 0.5 && a < 1)).toBe(true);
    expect(
      p.button("0,7").getAttribute("aria-pressed"),
      "zvolená je aktuální α",
    ).toBe("true");
    await click(p.button("0,6"));
    expect(search).toBe("?alpha=0.6");
    expect(p.button("α = 0,6")).toBeTruthy();
    await p.unmount();
  });

  it("(a,b)-strom: přepnutí parametrů zachová klíče, zapíše se do historie a jde vrátit", async () => {
    const p = await mount("/tree/ab");
    await click(p.button("(a,b) = (2,3)"));
    await click(p.button("(3,5)"));
    expect(p.el.querySelector(".viz-desc-body")!.textContent).toContain(
      "má (a,b) = (3,5)",
    );
    expect(p.history()).toContain("(a,b) = (3,5)");
    expect(decodeURIComponent(search)).toBe("?ab=3,5");
    await click(p.button("↶ Vrátit operaci"));
    expect(p.el.querySelector(".viz-desc-body")!.textContent).toContain(
      "má (a,b) = (2,3)",
    );
    expect(p.button("(a,b) = (2,3)")).toBeTruthy();
    expect(search).toBe("");
    await p.unmount();
  });

  it("(a,b)-strom: Delete(x) + Enter, klik na klíč vyplní x", async () => {
    const p = await mount("/tree/ab");
    await click(p.button("Delete(x)"));
    expect(p.input("x =").value).toBe("41");
    const cell = [...p.el.querySelectorAll("g.mtree-node text")].find(
      (t) => t.textContent === "58",
    )!;
    await click(cell as SVGElement);
    expect(p.input("x =").value).toBe("58");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Delete(58)");
    expect(p.playing()).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await p.unmount();
  });

  it("(a,b)-strom: klíče jsou fokusovatelná tlačítka (roving tabindex), Enter na „Klíč 41“ vyplní x ve Find(x) a nic nepřehraje (TREEHASH-05)", async () => {
    const p = await mount("/tree/ab");
    const keys = [
      ...p.el.querySelectorAll<SVGElement>(".mtree-node [role=button]"),
    ];
    // každý klíč listu i oddělovač
    expect(keys.length).toBeGreaterThanOrEqual(9);
    // roving tabindex (D3): kresba je jedna zastávka Tabu, ostatní klíče -1 (šipky mezi nimi)
    expect(keys.filter((k) => k.getAttribute("tabindex") === "0").length).toBe(
      1,
    );
    for (const k of keys)
      expect(k.getAttribute("tabindex")).toMatch(/^(0|-1)$/);
    await click(p.button("Find(x)"));
    await type(p.input("x ="), "5");
    const k41 = keys.find(
      (k) => k.getAttribute("aria-label") === "Klíč 41 – vybrat",
    )!;
    expect(k41).toBeTruthy();
    await act(async () => {
      k41.focus();
      k41.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(p.input("x =").value).toBe("41");
    expect(p.playing()).toBe(false);
    await p.unmount();
  });

  it("(a,b)-strom: příklad z přednášky přepne na (2,4), zapíše ?ex= a předvyplní Insert(4)", async () => {
    const p = await mount("/tree/ab");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z přednášky"));
    await type(p.select("Snímek"), "l03-insert");
    await click(p.button("Postavit"));
    expect(p.el.querySelector(".viz-desc-body")!.textContent).toContain(
      "má (a,b) = (2,4)",
    );
    expect(search).toContain("ex=l03-insert");
    expect(decodeURIComponent(search)).toContain("ab=2,4");
    expect(p.input("x =").value).toBe("4");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Insert(4)");
    await p.unmount();
  });

  it("(a,b)-strom: přepnutí varianty zapíše ?var=kniha a historii, jde vrátit", async () => {
    const p = await mount("/tree/ab");
    await click(p.button("Varianta: přednáška"));
    await click(p.button("Průvodce 8.3 (klíče ve vrcholech)"));
    expect(search).toContain("var=kniha");
    expect(p.button("Varianta: Průvodce")).toBeTruthy();
    expect(p.history()).toContain("Varianta: Průvodce 8.3");
    expect(p.el.querySelector(".viz-desc-body")!.textContent).toContain(
      "Průvodce 8.3",
    );
    // operace v knižní variantě: krok 1, nic se nepřehrává
    await click(p.button("Find(x)"));
    await type(p.input("x ="), "41");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Find(41)");
    expect(p.playing()).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("↶ Vrátit operaci"));
    await click(p.button("↶ Vrátit operaci"));
    expect(p.button("Varianta: přednáška")).toBeTruthy();
    expect(search).toBe("");
    await p.unmount();
  });

  it("(a,b)-strom: příklad z knihy obr. 8.10 přepne na knižní variantu, zapíše ?ex= a předvyplní Delete(5)", async () => {
    const p = await mount("/tree/ab");
    await click(p.button("Vytvořit"));
    await click(p.button("Příklady z knihy"));
    await type(p.select("Obrázek"), "obr-8-10");
    await click(p.button("Postavit"));
    expect(search).toContain("ex=obr-8-10");
    expect(search).toContain("var=kniha");
    expect(p.button("Varianta: Průvodce")).toBeTruthy();
    expect(p.input("x =").value).toBe("5");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Delete(5)");
    expect(p.playing()).toBe(false);
    await p.unmount();
  });

  it("(a,b)-strom: odkaz ?ex= rozbalí operaci příkladu s jejím x (ne Insert) – obr. 8.9 i snímek L03/6", async () => {
    for (const [id, x] of [
      ["obr-8-9", "5"],
      ["l03-delete", "4"],
    ]) {
      const p = await mount(`/tree/ab?ex=${id}`);
      expect(p.button("Delete(x)").getAttribute("aria-expanded"), id).toBe(
        "true",
      );
      expect(p.input("x =").value, id).toBe(x);
      await enter(p.input("x ="));
      expect(p.op(), id).toContain(`Delete(${x})`);
      expect(p.playing(), id).toBe(false);
      await p.unmount();
    }
  });

  it("(a,b)-strom: odkaz ?ex=obr-8-8 rozbalí Insert s x z příkladu (6), ne s nabízeným novým klíčem", async () => {
    const p = await mount("/tree/ab?ex=obr-8-8");
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    expect(p.input("x =").value).toBe("6");
    await enter(p.input("x ="));
    expect(p.op()).toContain("Insert(6)");
    expect(p.playing()).toBe(false);
    await p.unmount();
  });

  it("neznámé :id přesměruje na přehled", async () => {
    const p = await mount("/tree/foo");
    expect(p.el.textContent).toBe("PŘEHLED");
    await p.unmount();
  });
});
