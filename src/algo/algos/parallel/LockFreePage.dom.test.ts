// @vitest-environment jsdom
/*
 * Stránka bezzámkového zásobníku v jsdom (tenká vrstva nad lockfreeActions): akce z nabídky se provede
 * jedním klikem (krok 1, přehraje až ▶); karta procesu umí další krok i dokončení operace.
 */
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, mount } from "../../core/domTest";
import { LockFreePage } from "./LockFreePage";
import { moduleByPath } from "../../registry";

const page = () =>
  mount(
    h(
      MemoryRouter,
      { initialEntries: ["/parallel/lockfree"] },
      h(LockFreePage),
    ),
  );
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const history = (el: HTMLElement) =>
  el.querySelector(".viz-history-list")?.textContent ?? "";
const chain = (el: HTMLElement) =>
  [...el.querySelectorAll(".lf-row .lf-node")].map(
    (n) => n.firstChild?.textContent,
  );

describe("LockFreePage (jsdom)", () => {
  it("akce z nabídky jedním klikem: Scénář ABA se připraví na kroku 1; P2: Pop je pak zakázaný s důvodem", async () => {
    const p = await page();
    await click(p.button("Scénář ABA"));
    expect(op(p.el)).toContain("Scénář ABA");
    expect(p.el.querySelector(".ctl-play")!.getAttribute("aria-label")).toBe(
      "Přehrát",
    );
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("Vyprázdnit"));
    await click(p.button("P2: Pop"));
    expect(op(p.el)).toContain("P2: Pop");
    const pop = p.button("P2: Pop");
    expect(pop.getAttribute("aria-disabled")).toBe("true");
    expect(pop.title).toContain("rozpracovanou operaci");
    await p.unmount();
  });

  it("karta procesu: Další krok a Dokončit přímo u procesu (bez nabídky)", async () => {
    const p = await page();
    await click(p.button("P1: Pop"));
    const card = p.el.querySelectorAll<HTMLElement>(".lf-proc")[0];
    const btn = (t: string) =>
      [...card.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === t,
      )!;
    await click(btn("Další krok"));
    expect(history(p.el)).toContain("P1: h ← head");
    await click(
      [
        ...p.el.querySelectorAll<HTMLElement>(".lf-proc"),
      ][0].querySelector<HTMLButtonElement>("button:last-of-type")!,
    );
    expect(history(p.el)).toContain("P1: dokončit Pop");
    await click(p.button("Na konec"));
    expect(chain(p.el)).toEqual(["B", "C"]);
    // nečinný proces už tlačítka na kartě nemá
    expect(
      p.el.querySelectorAll(".lf-proc")[0].querySelectorAll("button"),
    ).toHaveLength(0);
    await p.unmount();
  });
});

describe("nadpis (NEWMODS-13)", () => {
  it("H1 = title z registry", async () => {
    const p = await page();
    expect(p.el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/parallel/lockfree")!.title,
    );
    await p.unmount();
  });
});

describe("↶ Vrátit operaci a nápověda (NEWMODS-20, CROSS-17)", () => {
  it("po ↶ je nadpis operace poslední záznam historie; „Zatím žádná operace“ jen při prázdné historii", async () => {
    const p = await page();
    await click(p.button("P1: Pop"));
    const card = () => p.el.querySelectorAll<HTMLElement>(".lf-proc")[0];
    const next = () =>
      [...card().querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Další krok",
      )!;
    await click(next());
    const before = history(p.el);
    expect(before).toContain("P1: h ← head");
    await click(p.button("↶ Vrátit operaci"));
    expect(op(p.el)).toContain("P1: Pop");
    expect(op(p.el)).not.toContain("Zatím žádná operace");
    await click(p.button("↶ Vrátit operaci"));
    expect(op(p.el)).toContain("Zatím žádná operace");
    await p.unmount();
  });

  it("nápověda říká, že stav dvou procesů nejde sdílet odkazem", async () => {
    const p = await page();
    expect(p.el.textContent).toContain(
      "Stav běhu dvou procesů nejde sdílet odkazem – použijte Scénář ABA.",
    );
    await p.unmount();
  });
});

describe("zvětšení kresby (NEWMODS-09)", () => {
  it("StackView se zoom > 1 zvětší celou kresbu (inline zoom), bez zoom ne", async () => {
    const { StackView } = await import("./LockFreeViews");
    const { initial } = await import("./lockfree");
    const st = initial();
    const m = await mount(h(StackView, { st, zoom: 1.4 }));
    expect(m.el.querySelector<HTMLElement>(".lf")!.style.zoom).toBe("1.4");
    await m.unmount();
    const n = await mount(h(StackView, { st }));
    expect(n.el.querySelector<HTMLElement>(".lf")!.style.zoom).toBe("");
    await n.unmount();
  });

  it("průběh prokládání pod zásobníkem: prázdný po načtení, po scénáři ABA kroky obou procesů a krokuje s přehrávačem", async () => {
    const p = await page();
    const tl = () =>
      p.el.querySelector<SVGSVGElement>('svg[aria-label^="Průběh prokládání"]');
    expect(tl()?.getAttribute("aria-label")).toBe(
      "Průběh prokládání: zatím žádný krok",
    );
    // obrázek, ne zastávka Tabu
    expect(tl()?.getAttribute("role")).toBe("img");
    expect(tl()?.querySelectorAll("[tabindex]")).toHaveLength(0);
    await click(p.button("Scénář ABA"));
    expect(tl()?.getAttribute("aria-label")).toBe(
      "Průběh prokládání: zatím žádný krok",
    );
    await click(p.button("Na konec"));
    const label = tl()?.getAttribute("aria-label") ?? "";
    expect(label).toMatch(
      /^Průběh prokládání: P2: Pop, P2: h = A, P2: s = B, P1: Pop/,
    );
    expect(label.endsWith("P1: CAS ✓, P2: CAS ✓ → A")).toBe(true);
    // v kresbě jsou dráhy P1, P2 a poslední krok
    const texts = [...tl()!.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(["P1", "P2", "CAS ✓ → A"]));
    await p.unmount();
  });
});
