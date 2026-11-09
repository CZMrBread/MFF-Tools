// @vitest-environment jsdom
/*
 * Náhledy modulů na úvodní stránce: každý modul má statickou mini-kresbu výchozího příkladu (skutečný
 * pohled modulu), nebo neutrálního zástupce své skupiny. Náhled je jen obrázek – nic se v něm nedá
 * ovládat ani fokusovat (celá karta je odkaz) – a kreslí se líně, až když je karta blízko záběru.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES, MODULES } from "../registry";
import { ARR_DEFAULT, CNT_DEFAULT } from "../algos/amortized/amortized";
import { LIST_INITIAL } from "../algos/structures/list";
import { ModuleThumb } from "./ModuleThumb";
import { PREVIEWS, placeholderKind, thumbKind } from "./previews";
import type { Preview } from "./previewTypes";
import { kmpPreview } from "../algos/strings/kmp.preview";
import { ahoCorasickPreview } from "../algos/strings/ahoCorasick.preview";
import { rabinKarpPreview } from "../algos/strings/rabinKarp.preview";
import { gatesPreview } from "../algos/parallel/gates.preview";
import { adderPreview } from "../algos/parallel/adder.preview";
import { sortNetPreview } from "../algos/parallel/sortNet.preview";
import { fftPreview } from "../algos/fourier/fft.preview";
import { fftNetPreview } from "../algos/fourier/fftNet.preview";
import { fordFulkersonPreview } from "../algos/flows/fordFulkerson.preview";
import { dinicPreview } from "../algos/flows/dinic.preview";
import { goldbergPreview } from "../algos/flows/goldberg.preview";
import { editDistancePreview } from "../algos/dp/editDistance.preview";
import { lisPreview } from "../algos/dp/lis.preview";
import { hullPreview } from "../algos/geometry/hull.preview";
import { llrbPreview } from "../algos/trees/llrb.preview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INTERACTIVE =
  "a, button, input, select, textarea, [tabindex], .pickable, [contenteditable]";

describe("registr náhledů", () => {
  it("každý modul z registru má náhled nebo zástupce skupiny", () => {
    for (const c of CATEGORIES)
      for (const m of c.modules)
        expect(["preview", "placeholder"], m.path).toContain(thumbKind(m.path));
  });

  it("všechny moduly registru mají skutečný náhled (ne zástupce)", () => {
    const missing = MODULES.filter((m) => !PREVIEWS[m.path]).map((m) => m.path);
    expect(missing).toEqual([]);
  });

  it("moduly fáze 2 mají náhled ve vlastním souboru vedle stránky (stopa ho upravuje sama)", () => {
    expect(PREVIEWS["/string/kmp"]).toBe(kmpPreview);
    expect(PREVIEWS["/string/aho-corasick"]).toBe(ahoCorasickPreview);
    expect(PREVIEWS["/string/rabin-karp"]).toBe(rabinKarpPreview);
    expect(PREVIEWS["/parallel/gates"]).toBe(gatesPreview);
    expect(PREVIEWS["/parallel/adder"]).toBe(adderPreview);
    expect(PREVIEWS["/parallel/sortnet"]).toBe(sortNetPreview);
    expect(PREVIEWS["/fft/fft"]).toBe(fftPreview);
    expect(PREVIEWS["/fft/net"]).toBe(fftNetPreview);
  });

  it("moduly fáze 4 mají náhled ve vlastním souboru stopy (grafové přes GRAPH_ALGOS)", () => {
    expect(PREVIEWS["/flow/ford-fulkerson"]).toBe(fordFulkersonPreview);
    expect(PREVIEWS["/flow/dinic"]).toBe(dinicPreview);
    expect(PREVIEWS["/flow/goldberg"]).toBe(goldbergPreview);
    expect(PREVIEWS["/dp/edit"]).toBe(editDistancePreview);
    expect(PREVIEWS["/dp/lis"]).toBe(lisPreview);
    expect(PREVIEWS["/geom/hull"]).toBe(hullPreview);
    expect(PREVIEWS["/tree/llrb"]).toBe(llrbPreview);
    for (const id of ["bellman-ford", "boruvka", "bridges", "scc"])
      expect(PREVIEWS[`/graph/${id}`], id).toBeDefined();
  });

  it("náhledy nejsou pro cesty, které v registru nejsou (překlep v klíči)", () => {
    const known = new Set(MODULES.map((m) => m.path));
    for (const p of Object.keys(PREVIEWS)) expect(known.has(p), p).toBe(true);
  });

  it("každá skupina má zástupce; neznámý nový modul dostane zástupce své skupiny", () => {
    for (const c of CATEGORIES)
      expect(placeholderKind(c.title), c.title).not.toBe("generic");
    expect(thumbKind("/novy/modul")).toBe("placeholder");
    const { container } = render(
      <ModuleThumb path="/novy/modul" group="Grafy" />,
    );
    const thumb = container.querySelector(".thumb")!;
    expect(thumb.classList.contains("thumb-placeholder")).toBe(true);
    expect(thumb.querySelector("svg")).not.toBeNull();
  });
});

describe("vykreslení náhledů (jsdom bez IntersectionObserver = hned)", () => {
  for (const c of CATEGORIES)
    for (const m of c.modules)
      it(`${m.path}: kresba bez chyby, bez ovládacích prvků, skrytá pro čtečky`, () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const { container } = render(
          <ModuleThumb path={m.path} group={c.title} />,
        );
        const thumb = container.querySelector(".thumb")!;
        expect(thumb, m.path).not.toBeNull();
        expect(thumb.classList.contains("thumb-preview"), m.path).toBe(true);
        expect(thumb.getAttribute("aria-hidden")).toBe("true");
        // skutečná kresba: SVG pohledu nebo (tabulky) HTML pohled
        expect(
          thumb.querySelector("svg, table, .hash-chain, .lf"),
        ).not.toBeNull();
        expect(thumb.querySelectorAll(INTERACTIVE)).toHaveLength(0);
        // kresba něco obsahuje (sloupce, vrcholy, buňky…)
        expect(
          thumb.querySelectorAll("rect, circle, td, .hc-key, .lf-node").length,
          m.path,
        ).toBeGreaterThan(2);
        expect(err).not.toHaveBeenCalled();
        err.mockRestore();
      });
});

describe("líné kreslení (IntersectionObserver)", () => {
  it("kresba vznikne, až když je karta blízko záběru; pak už zůstane", async () => {
    const observers: {
      cb: IntersectionObserverCallback;
      margin?: string;
      disconnected: boolean;
    }[] = [];
    class FakeIO {
      o: (typeof observers)[number];
      constructor(
        cb: IntersectionObserverCallback,
        opts?: IntersectionObserverInit,
      ) {
        this.o = { cb, margin: opts?.rootMargin, disconnected: false };
        observers.push(this.o);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.o.disconnected = true;
      }
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { container } = render(
      <ModuleThumb path="/graph/dfs" group="Grafy" />,
    );
    const thumb = () => container.querySelector(".thumb")!;
    expect(thumb().classList.contains("thumb-pending")).toBe(true);
    expect(thumb().querySelector("svg")).toBeNull();
    expect(observers).toHaveLength(1);
    // s předstihem (kreslí se o kus dřív, než karta vjede do okna)
    expect(observers[0].margin).toMatch(/px/);

    await act(async () =>
      observers[0].cb(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(thumb().querySelector("svg")).toBeNull();
    await act(async () =>
      observers[0].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(thumb().classList.contains("thumb-preview")).toBe(true);
    expect(thumb().querySelector("svg")).not.toBeNull();
    expect(observers[0].disconnected).toBe(true);
  });
});

/* ---------- validace fáze 1 (7. 11. 2026): F2, F6, VAL-05 ---------- */

/** Dočasně podstrčí náhled modulu (nový objekt – cache podle objektu ho bere jako nový). */
function withPreview(
  path: string,
  preview: Preview,
  body: () => Promise<void> | void,
) {
  const saved = PREVIEWS[path];
  PREVIEWS[path] = preview;
  const restore = () => {
    PREVIEWS[path] = saved!;
  };
  try {
    const r = body();
    return r instanceof Promise ? r.finally(restore) : (restore(), r);
  } catch (e) {
    restore();
    throw e;
  }
}

describe("náhledy se nepočítají znovu (F2)", () => {
  it("kresba náhledu se spočítá jednou – ani překreslení, ani nové připojení karty (filtr) ji nepočítá znovu", () =>
    withPreview(
      "/sort/quick",
      {
        render: vi.fn(() => (
          <svg className="t">
            <rect />
          </svg>
        )),
      },
      () => {
        const p = PREVIEWS["/sort/quick"]!;
        const r = render(<ModuleThumb path="/sort/quick" group="Třídění" />);
        r.rerender(<ModuleThumb path="/sort/quick" group="Třídění" />);
        r.unmount();
        render(<ModuleThumb path="/sort/quick" group="Třídění" />);
        expect(p.render).toHaveBeenCalledTimes(1);
      },
    ));

  it("karta, kterou filtr skryje a znovu ukáže, nečeká znovu na IntersectionObserver (kresba nebliká)", async () => {
    const cbs: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          cbs.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const first = render(
      <ModuleThumb path="/tree/avl" group="Vyhledávací stromy" />,
    );
    await act(async () =>
      cbs[0]!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    first.unmount();
    const again = render(
      <ModuleThumb path="/tree/avl" group="Vyhledávací stromy" />,
    );
    const thumb = again.container.querySelector(".thumb")!;
    expect(thumb.classList.contains("thumb-preview")).toBe(true);
    expect(thumb.querySelector("svg")).not.toBeNull();
  });
});

describe("chyba kresby náhledu (F6)", () => {
  it("výjimka v kresbě → zástupce skupiny, přehled nespadne", () =>
    withPreview(
      "/graph/bfs",
      {
        render: () => {
          throw new Error("rozbitý náhled");
        },
      },
      () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const { container } = render(
          <ModuleThumb path="/graph/bfs" group="Grafy" />,
        );
        const thumb = container.querySelector(".thumb")!;
        expect(thumb.querySelector(".ph-svg"), "zástupce").not.toBeNull();
        err.mockRestore();
      },
    ));
});

describe("HTML náhled se vejde do karty (VAL-05)", () => {
  /** jsdom nemá rozložení – podstrčí velikost náhledu a přirozenou velikost HTML pohledu (při zoom 1) */
  function stubSizes(
    box: { w: number; h: number },
    content: { w: number; h: number },
  ) {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const r = (w: number, h: number) =>
        ({
          width: w,
          height: h,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: w,
          bottom: h,
        }) as DOMRect;
      if (this.classList.contains("thumb-art")) return r(box.w, box.h);
      if (this.parentElement?.classList.contains("thumb-art")) {
        const z = Number(this.style.zoom || "1");
        return r(content.w * z, content.h * z);
      }
      return orig.call(this);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = orig;
    };
  }
  const zoomOf = (c: HTMLElement) =>
    Number(
      (c.querySelector(".thumb-art")!.firstElementChild as HTMLElement).style
        .zoom,
    );

  it("vysoký obsah (bezzámkový zásobník na telefonu) se zmenší, aby se vešel celý", () => {
    const restore = stubSizes({ w: 338, h: 134 }, { w: 600, h: 318 });
    try {
      const { container } = render(
        <ModuleThumb path="/parallel/lockfree" group="Paralelní algoritmy" />,
      );
      const z = zoomOf(container);
      expect(z).toBeLessThanOrEqual(134 / 318 + 1e-9);
      expect(z).toBeGreaterThan(0.3);
    } finally {
      restore();
    }
  });

  it("obsah, který se vejde, zůstane v běžném měřítku 0,5", () => {
    const restore = stubSizes({ w: 338, h: 134 }, { w: 500, h: 200 });
    try {
      const { container } = render(
        <ModuleThumb path="/parallel/lockfree" group="Paralelní algoritmy" />,
      );
      expect(zoomOf(container)).toBe(0.5);
    } finally {
      restore();
    }
  });
});

describe("náhledy kreslí výchozí příklad stránky ze sdílených konstant (F9)", () => {
  it("zásobník / fronta / seznam: LIST_INITIAL; nafukovací pole: ARR_DEFAULT; počítadlo: CNT_DEFAULT", () => {
    const thumb = (path: string, group: string) =>
      render(<ModuleThumb path={path} group={group} />).container;
    const stack = thumb("/ds/stack", "Datové struktury");
    const values = [...stack.querySelectorAll(".box")].map((b) =>
      b.textContent?.trim(),
    );
    // vrchol zásobníku nahoře – pořadí kresby nehraje roli, jen hodnoty
    expect([...values].sort()).toEqual(LIST_INITIAL.map(String).sort());
    const arr = thumb("/ds2/array", "Datové struktury");
    for (const v of ARR_DEFAULT)
      expect(arr.textContent, String(v)).toContain(String(v));
    const cnt = thumb("/ds2/counter", "Datové struktury");
    // bity kreslené s váhou: „0 2⁵ 0 2⁴ … 1 2⁰“
    const bits = [
      ...(cnt.textContent ?? "").matchAll(/([01])2[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g),
    ].map((m) => m[1]);
    expect(parseInt(bits.join(""), 2)).toBe(CNT_DEFAULT);
  });
});

describe("náhledy se ve skupině liší (CROSS-09, SORTDS-11)", () => {
  for (const c of CATEGORIES)
    it(`${c.title}: žádné dva moduly nemají shodnou kresbu`, () => {
      const seen = new Map<string, string>();
      for (const m of c.modules) {
        const { container } = render(
          <ModuleThumb path={m.path} group={c.title} />,
        );
        const html = container.querySelector(".thumb")!.innerHTML;
        expect(seen.get(html), `${m.path} = ${seen.get(html)}`).toBeUndefined();
        seen.set(html, m.path);
        cleanup();
      }
    });

  it("třídění ukazuje mezistav vlastního běhu (ne výchozí pole bez značek)", () => {
    const sorted = (path: string) => {
      const { container } = render(<ModuleThumb path={path} group="Třídění" />);
      const n = container.querySelectorAll(".bar-sorted, .sorted").length;
      cleanup();
      return n;
    };
    // bubble po 1. průchodu: maximum je na konci (zeleně); select po 3 kolech: 3 hotové
    expect(sorted("/sort/bubble")).toBeGreaterThanOrEqual(1);
    expect(sorted("/sort/select")).toBeGreaterThanOrEqual(3);
  });
});
