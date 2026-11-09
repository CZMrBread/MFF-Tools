// @vitest-environment jsdom
/**
 * Tenká DOM vrstva stránky třídění: nabídka operací (ActionMenu) místo dřívějšího NumberInput – zadání
 * vstupu + Enter spustí třídění a přehrávání, klik na sloupec vyplní P[i] ← x, generátory jedním klikem.
 */
import { createElement as h, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { SortingPage } from "./SortingPage";

let search = "";
function Spy() {
  const now = useLocation().search;
  useEffect(() => {
    search = now;
  });
  return null;
}

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

async function open(url: string) {
  page = await mount(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(Routes, null, h(Route, { path: "/sort/:id", element: h(SortingPage) })),
      h(Spy),
    ),
  );
  return page;
}
const op = (p: Mounted) => p.el.querySelector(".viz-op")?.textContent ?? "";
const playing = (p: Mounted) =>
  p.el.querySelector('[aria-label="Pozastavit"]') !== null;

describe("SortingPage – nabídka operací", () => {
  it("po otevření není rozbalená žádná akce (běh je připravený); Vytvořit ▸ Vlastní má pole P = vstup z odkazu (CROSS-06)", async () => {
    const p = await open("/sort/quick?a=5,3,9");
    expect(
      p.el.querySelector('.action-menu [aria-expanded="true"]'),
    ).toBeNull();
    expect(p.el.querySelector(".action-menu input")).toBeNull();
    await click(p.button("Vytvořit"));
    expect(p.input("P =").value).toBe("5, 3, 9");
    expect(p.el.textContent).not.toContain("Vstupní pole");
    expect(p.el.querySelector(".action-menu")).not.toBeNull();
    expect(playing(p)).toBe(false);
  });

  it("spuštění (P = … a Enter) posune plátno do záběru – na telefonu je nabídka pod ním", async () => {
    const original = Element.prototype.scrollIntoView;
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    try {
      const p = await open("/sort/quick");
      expect(spy).not.toHaveBeenCalled();
      await click(p.button("Vytvořit"));
      const field = p.input("P =");
      await type(field, "4, 2, 8, 1");
      await key(field, { key: "Enter" });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.contexts[0]).toBe(p.el.querySelector(".viz-canvas"));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("P = … a Enter: vstup se použije, zapíše do adresy třídění stojí na kroku 1", async () => {
    const p = await open("/sort/quick");
    await click(p.button("Vytvořit"));
    const field = p.input("P =");
    await type(field, "4, 2, 8, 1");
    await key(field, { key: "Enter" });
    expect(op(p)).toContain("Quicksort(4, 2, 8, 1)");
    expect(search).toBe("?a=4,2,8,1");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
  });

  it("klik na sloupec vyplní x a i akce P[i] ← x; Enter prvek přepíše (krok 1)", async () => {
    const p = await open("/sort/bubble?a=5,3,9");
    const bars = p.el.querySelectorAll<SVGGElement>(".bar.pickable");
    expect(bars).toHaveLength(3);
    await click(bars[1]);
    const x = p.input("x =");
    expect(x.value).toBe("3");
    expect(p.input("na pozici i =").value).toBe("2");
    await type(x, "7");
    await key(x, { key: "Enter" });
    expect(op(p)).toContain("Bubblesort(5, 7, 9)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
  });

  it("Setříděné jedním klikem: stejná délka, vzestupně, krok 1, nepřehrává se", async () => {
    const p = await open("/sort/insert?a=9,1,5,7");
    await click(p.button("Vytvořit"));
    await click(p.button("Setříděné"));
    expect(op(p)).toContain("Insertsort(1, 2, 3, 4)");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
  });

  it("Quicksort(P) vrátí stejný vstup na krok 1 a čeká na ▶", async () => {
    const p = await open("/sort/quick?a=3,1,2");
    expect(playing(p)).toBe(false);
    await click(p.button("Krok vpřed"));
    await click(p.button("Krok vpřed"));
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 3 \//,
    );
    await click(p.button("Quicksort(P)"));
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(op(p)).toContain("Quicksort(3, 1, 2)");
    await click(p.button("Přehrát"));
    expect(playing(p)).toBe(true);
  });

  it("P[i] ← x a ↶ Vrátit operaci vrátí původní pole i adresu; Výchozí příklad je jen pod akcemi (CROSS-04/05)", async () => {
    const p = await open("/sort/bubble?a=5,3,9");
    expect(p.button("↶ Vrátit operaci").disabled).toBe(true);
    await click(p.button("P[i] ← x"));
    await type(p.input("x ="), "7");
    await type(p.input("na pozici i ="), "2");
    await key(p.input("x ="), { key: "Enter" });
    expect(op(p)).toContain("Bubblesort(5, 7, 9)");
    expect(search).toBe("?a=5,7,9");
    expect(p.el.querySelector(".viz-history-list")?.textContent).toContain(
      "P[2] ← 7",
    );
    await click(p.button("↶ Vrátit operaci"));
    expect(op(p)).toContain("Bubblesort(5, 3, 9)");
    expect(search).toBe("?a=5,3,9");
    expect(playing(p)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    // Výchozí příklad: výchozí vstup, adresa bez ?a= jen u výchozího vstupu (jde vrátit)
    await click(p.button("Výchozí příklad"));
    expect(op(p)).not.toContain("Bubblesort(5, 3, 9)");
    await click(p.button("↶ Vrátit operaci"));
    expect(op(p)).toContain("Bubblesort(5, 3, 9)");
    await click(p.button("Vytvořit"));
    const variants = [...p.el.querySelectorAll(".action-menu button")].map(
      (b) => b.textContent?.trim(),
    );
    expect(variants).not.toContain("Výchozí příklad");
  });

  it("kresba popisuje hlavní řadu podle knihy a legenda říká, co je P (SORTDS-13)", async () => {
    const row = async (url: string) => {
      const p = await open(url);
      const t = p.el.querySelector(".viz-canvas .array-label")?.textContent;
      const legend = p.el.querySelector(".legend")?.textContent ?? "";
      await p.unmount();
      page = null;
      return { t, legend };
    };
    const counting = await row("/sort/counting");
    expect(counting.t).toBe("vstup x₁ … xₙ → výstup v₁ … vₙ");
    expect(counting.legend).toContain("P = x₁ … xₙ");
    expect((await row("/sort/merge")).t).toBe("a₁ … aₙ");
    expect((await row("/sort/heap")).t).toBe("x₁ … xₙ");
    const quick = await row("/sort/quick");
    expect(quick.legend).toContain("P = x₁ … xₙ");
  });
});
