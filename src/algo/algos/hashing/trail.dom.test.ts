// @vitest-environment jsdom
/*
 * Stopa pod řadou buněk (E6) ve sdílené kresbě .viz-trail: řádky pod sloupci prohlížených buněk, spojené
 * šipkami. Je jen obrázek (aria-hidden, bez zastávek Tabu) – roving tabindex tabulky (jedna zastávka,
 * šipky po buňkách) zůstává. Místo pro stopu je vyhrazené už před první operací (s nápovědou), takže
 * kresba na desktopu vyplní výšku plátna.
 */
import {
  createElement as h,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasFitContext } from "../../core/canvasFit";
import { mount, type Mounted } from "../../core/domTest";
import { materialize } from "../../core/steps";
import { blBuild, blOp } from "./bloom";
import { ckBuild, ckOp } from "./cuckoo";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CuckooPage } from "./CuckooBloomPage";
import { BloomView, CuckooView } from "./CuckooBloomViews";
import { HashPage } from "./HashPage";
import { ChainView, ProbeView } from "./HashViews";
import { buildTable, hashOp } from "./tables";
import {
  BLOOM_DEFAULT,
  CHAIN_DEFAULT,
  CUCKOO_DEFAULT,
  PROBE_DEFAULT,
} from "./ui";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const probe = () =>
  buildTable(
    PROBE_DEFAULT.m,
    PROBE_DEFAULT.fnId,
    PROBE_DEFAULT.seed,
    PROBE_DEFAULT.keys,
    true,
  ).state;
const cuckoo = () =>
  ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys).state;
/** x-ová souřadnice z transform="translate(x, y)" */
const tx = (el: Element) =>
  Number(/translate\(([\d.]+)/.exec(el.getAttribute("transform") ?? "")?.[1]);
const svgH = (p: Mounted) =>
  Number(p.el.querySelector("svg")!.getAttribute("height"));
/** buňky stopy (bez řádků s nápovědou) */
const trailCells = (p: Mounted) => [
  ...p.el.querySelectorAll(".viz-trail .tr-cell"),
];

/** Plátno v režimu jedné obrazovky (CanvasFitContext) se zadanou výškou – jsdom sám rozměry nepočítá. */
function FitCanvas({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node)
        Object.defineProperty(node, "clientHeight", {
          configurable: true,
          value: height,
        });
      setEl(node);
    },
    [height],
  );
  return h(
    "div",
    { ref, className: "viz-canvas" },
    el ? h(CanvasFitContext.Provider, { value: el }, children) : null,
  );
}
const fit = (height: number, child: ReactNode) =>
  h(FitCanvas, { height, children: child });

describe("otevřená adresace: stopa sond pod buňkami (.viz-trail)", () => {
  it("na telefonu a v náhledu úvodní stránky (bez režimu jedné obrazovky) bez operace žádná stopa ani nápověda", async () => {
    page = await mount(h(ProbeView, { st: probe(), onPick: () => {} }));
    expect(page.el.querySelector(".viz-trail")).toBeNull();
    const cellRow = page.el.querySelector("svg > g.box rect")!;
    expect(svgH(page)).toBe(Number(cellRow.getAttribute("height")) + 34);
  });

  it("na desktopu kresba vyplní volnou výšku plátna už před první operací", async () => {
    page = await mount(
      fit(600, h(ProbeView, { st: probe(), onPick: () => {} })),
    );
    // místo plátna 600 − rezerva 16
    expect(svgH(page)).toBe(584);
    expect(page.el.querySelector(".viz-trail .tr-label")).not.toBeNull();
    // vyhrazené místo nepůsobí prázdně: pod každou buňkou tečkovaná dráha, kudy povede stopa
    const lanes = [...page.el.querySelectorAll(".viz-trail line.tr-lane")];
    expect(lanes).toHaveLength(16);
    const cells = [...page.el.querySelectorAll("svg > g.box")];
    const W = Number(cells[0].querySelector("rect")!.getAttribute("width"));
    expect(Number(lanes[3].getAttribute("x1"))).toBe(tx(cells[3]) + W / 2);
  });

  it("Insert(51): 6 řádků pod buňkami 3–8, poslední je vložený klíč; jen obrázek", async () => {
    const st = probe();
    materialize(hashOp(st, 51, "insert", true));
    page = await mount(fit(600, h(ProbeView, { st, onPick: () => {} })));
    const trail = page.el.querySelector(".viz-trail")!;
    expect(trail.getAttribute("aria-hidden")).toBe("true");
    const steps = trailCells(page);
    expect(steps).toHaveLength(6);
    // každý řádek je pod svou buňkou (stejná x) a níž než předchozí
    const cells = [...page.el.querySelectorAll("svg > g.box")];
    expect(steps.map(tx)).toEqual([3, 4, 5, 6, 7, 8].map((i) => tx(cells[i])));
    expect(steps.map((s) => s.getAttribute("class"))).toEqual([
      ...Array(5).fill("tr-cell"),
      "tr-cell is-ok",
    ]);
    expect(steps[0].textContent).toBe("1");
    expect(steps[5].textContent).toBe("6");
    // šipky mezi sondami, poslední zvýrazněná; nápověda zmizí
    const arrows = [...trail.querySelectorAll("path.tr-arrow")];
    expect(arrows).toHaveLength(5);
    expect(arrows[4].getAttribute("class")).toContain("is-hot");
    expect(arrows[0].getAttribute("marker-end")).toMatch(/^url\(#/);
    expect(trail.querySelector(".tr-label")).toBeNull();
    // výška kresby se se stopou nemění (místo bylo vyhrazené), zastávky Tabu se nepřidaly
    expect(svgH(page)).toBe(584);
    expect(trail.querySelector("[tabindex]")).toBeNull();
    expect(page.el.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("probíhající sonda je zvýrazněná (is-hot)", async () => {
    const steps = materialize(hashOp(probe(), 51, "insert", true));
    const mid = steps.find((s) => s.state.trail.length === 3)!.state;
    page = await mount(fit(600, h(ProbeView, { st: mid })));
    const cls = trailCells(page).map((s) => s.getAttribute("class"));
    expect(cls).toEqual(["tr-cell", "tr-cell", "tr-cell is-hot"]);
  });

  it("náhrobek is-done s †, prázdná buňka ∅, uložení do náhrobku is-ok s klíčem", async () => {
    const st = probe();
    materialize(hashOp(st, 19, "delete", true));
    materialize(hashOp(st, 51, "insert", true));
    page = await mount(h(ProbeView, { st }));
    const steps = trailCells(page);
    expect(steps.map((s) => s.getAttribute("class"))).toEqual([
      "tr-cell",
      "tr-cell is-done",
      "tr-cell",
      "tr-cell",
      "tr-cell",
      "tr-cell",
      "tr-cell is-ok",
    ]);
    expect(steps[1].textContent).toBe("2 †");
    expect(steps[5].textContent).toBe("6 ∅");
    expect(steps[6].textContent).toBe("51");
  });
});

describe("kukačka: stopa vyhazování pod buňkami (.viz-trail)", () => {
  it("před operací nápověda o cestě vyhazování, kresba vyplní plátno", async () => {
    page = await mount(fit(500, h(CuckooView, { st: cuckoo() })));
    expect(trailCells(page)).toHaveLength(0);
    expect(
      page.el.querySelector(".viz-trail .tr-label")?.textContent,
    ).toContain("vyhaz");
    expect(svgH(page)).toBe(484);
  });

  it("nízké plátno (1280 × 720): krátká stopa má čitelné řádky, ne nejmenší 16 px", async () => {
    const st = cuckoo();
    materialize(ckOp(st, 20, "insert"));
    page = await mount(fit(300, h(CuckooView, { st })));
    const rect = page.el.querySelector(".viz-trail .tr-cell rect")!;
    expect(Number(rect.getAttribute("height"))).toBeGreaterThanOrEqual(18);
  });

  it("Insert(20): řádky s klíči, které se stěhují; první je 20 pod buňkou 14", async () => {
    const st = cuckoo();
    materialize(ckOp(st, 20, "insert"));
    page = await mount(h(CuckooView, { st, onPick: () => {} }));
    const trail = page.el.querySelector(".viz-trail")!;
    expect(trail.getAttribute("aria-hidden")).toBe("true");
    const steps = trailCells(page);
    // na telefonu stopa jen tak vysoká, jak je potřeba
    expect(steps.length).toBe(st.trail.length);
    expect(steps[0].textContent).toBe("20");
    const cells = [...page.el.querySelectorAll("svg > g.box")];
    expect(tx(steps[0])).toBe(tx(cells[14]));
    expect(steps[steps.length - 1].getAttribute("class")).toBe("tr-cell is-ok");
    expect(trail.querySelectorAll("path.tr-arrow")).toHaveLength(
      steps.length - 1,
    );
    expect(trail.querySelector("[tabindex]")).toBeNull();
  });
});

describe("Bloomův filtr: matice klíč → bity pod filtrem", () => {
  const bloom = () =>
    blBuild(BLOOM_DEFAULT.m, BLOOM_DEFAULT.k, BLOOM_DEFAULT.keys).state;

  it("výchozí filtr: řádek pro každý vložený klíč, značky pod jeho bity; jen obrázek", async () => {
    page = await mount(fit(600, h(BloomView, { st: bloom() })));
    const trail = page.el.querySelector(".viz-trail")!;
    expect(trail.getAttribute("aria-hidden")).toBe("true");
    const rows = [...trail.querySelectorAll("[data-key]")];
    expect(rows.map((r) => r.getAttribute("data-key"))).toEqual([
      "17",
      "42",
      "99",
    ]);
    // značka bitu leží pod bitem (stejná x)
    const bits = [...page.el.querySelectorAll("svg > g.box")];
    const mark = rows[0].querySelector("[data-bit]")!;
    expect(tx(mark)).toBe(tx(bits[Number(mark.getAttribute("data-bit"))]));
    // kresba vyplní plátno
    expect(svgH(page)).toBe(584);
    expect(trail.querySelector("[tabindex]")).toBeNull();
  });

  it("nízké plátno (1280 × 720): tři klíče mají čitelné řádky, ne nejmenší 16 px", async () => {
    page = await mount(fit(300, h(BloomView, { st: bloom() })));
    const label = page.el.querySelector(".viz-trail [data-key] .tr-cell rect")!;
    expect(Number(label.getAttribute("height"))).toBeGreaterThanOrEqual(22);
  });

  it("bez režimu jedné obrazovky (telefon, náhled) bez matice", async () => {
    page = await mount(h(BloomView, { st: bloom() }));
    expect(page.el.querySelector(".viz-trail")).toBeNull();
  });

  it("prázdný filtr: nápověda místo matice", async () => {
    page = await mount(
      fit(600, h(BloomView, { st: blBuild(32, 3, []).state })),
    );
    expect(page.el.querySelector(".viz-trail [data-key]")).toBeNull();
    expect(
      page.el.querySelector(".viz-trail .tr-label")?.textContent,
    ).toContain("bity");
  });

  it("Insert(55): řádek 55 je zvýrazněný (is-hot)", async () => {
    const st = bloom();
    const steps = materialize(blOp(st, 55, "insert"));
    page = await mount(fit(600, h(BloomView, { st: steps[0].state })));
    const row = page.el.querySelector('.viz-trail [data-key="55"]')!;
    expect(row.querySelector(".tr-cell")?.getAttribute("class")).toContain(
      "is-hot",
    );
  });
});

describe("řetězení vyplní výšku plátna", () => {
  it("m = 8 na vysokém plátně: řádky 56 px a větší písmo klíčů", async () => {
    const st = buildTable(
      CHAIN_DEFAULT.m,
      CHAIN_DEFAULT.fnId,
      CHAIN_DEFAULT.seed,
      CHAIN_DEFAULT.keys,
      false,
    ).state;
    page = await mount(fit(600, h(ChainView, { st })));
    const chain = page.el.querySelector<HTMLElement>(".hash-chain")!;
    expect(chain.style.getPropertyValue("--algo-hc-row-h")).toBe("56px");
    // větší písmo má jen číslo uvnitř klíče – šipka mezi klíči (::before) zůstane malá a nepřekryje je
    const key = page.el.querySelector<HTMLElement>(".hc-key")!;
    expect(key.style.fontSize).toBe("");
    expect(key.querySelector<HTMLElement>("span")!.style.fontSize).toBe("24px");
    expect(key.textContent).toBe("33");
    // mezi klíči řetězce je místo na šipku (CSS dává jen 8 px – šipka by klíče překrývala)
    const chainKeys = [
      ...page.el.querySelectorAll<HTMLElement>(".hc-row:nth-child(5) .hc-key"),
    ];
    expect(chainKeys.map((k) => k.textContent)).toEqual(["12", "20", "28"]);
    expect(chainKeys[0].style.marginLeft).toBe("");
    expect(chainKeys[1].style.marginLeft).toBe("16px");
  });
});

describe("legenda vysvětlí stopu pod tabulkou", () => {
  const page$ = (path: string, el: ReturnType<typeof h>) =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(Routes, null, h(Route, { path: "/hash/:id", element: el })),
      ),
    );

  it("otevřená adresace: pořadí sond; kukačka: cesta vyhazování", async () => {
    page = await page$("/hash/probing", h(HashPage));
    expect(page.el.querySelector(".legend")?.textContent).toContain(
      "pod tabulkou pořadí sond",
    );
    await page.unmount();
    page = await page$("/hash/cuckoo", h(CuckooPage));
    expect(page.el.querySelector(".legend")?.textContent).toContain(
      "pod tabulkou cesta vyhazovaných klíčů",
    );
  });
});
