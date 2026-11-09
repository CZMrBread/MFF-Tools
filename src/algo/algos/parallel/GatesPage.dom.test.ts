// @vitest-environment jsdom
// Stránka Hradlové sítě v DOM: výchozí obr. 15.1, přepnutí vstupu klikem = nový výpočet (krok 1,
// pozastaveno), Spočítat(vstupy) + Enter, Další vstup, pravdivostní tabulka, příklady z knihy, kreslení
// (nic se nespouští), neúplná síť, odkazy (net / c / in), vadný odkaz.
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
import { GatesPage } from "./GatesPage";

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
      h(Route, { path: "/parallel/gates", element: h(GatesPage) }),
    ),
  );
  const m = await mount(strict ? h(StrictMode, null, tree) : tree);
  const text = () => m.el.textContent ?? "";
  const counter = () => m.el.querySelector(".step-counter")?.textContent ?? "";
  const playing = () =>
    m.el.querySelector(".ctl-play")?.getAttribute("aria-label") ===
    "Pozastavit";
  const node = (id: string) =>
    m.el.querySelector<SVGGElement>(`[data-node="${id}"]`)!;
  const variant = (label: string) =>
    [...m.el.querySelectorAll<HTMLButtonElement>(".am-variant")].find(
      (b) => b.textContent === label,
    )!;
  const search = () => new URLSearchParams(loc.current!.search);
  const toEnd = () => click(m.button("Na konec"));
  return { m, loc, text, counter, playing, node, variant, search, toEnd };
}

describe("GatesPage (jsdom)", () => {
  it("výchozí příklad = obr. 15.1 (x = 1, y = 0, z = 1): stojí na kroku 1 z 5, adresa se nepřepíše; na konci q = 1", async () => {
    const p = await open("/parallel/gates", true);
    expect(p.m.el.querySelector("h1")?.textContent).toBe("Hradlové sítě");
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(5);
    expect(p.counter()).toBe("krok 1 / 5");
    expect(p.playing()).toBe(false);
    expect(p.loc.current!.search).toBe("");
    expect(p.text()).toContain("Takt 0 (S₀): vstupy x = 1, y = 0, z = 1.");
    expect(p.text()).toContain("hloubka 5 vrstev (S₀…S₄) · velikost 5 hradel");
    // tečkované vrstvy S₀ … S₄ a aktivní vrstva podbarvená
    expect(p.m.el.querySelectorAll(".clayer-label")).toHaveLength(5);
    expect(p.m.el.querySelector(".clayer-label.hot")?.textContent).toBe("S0");
    await p.toEnd();
    expect(p.text()).toContain("Výsledek: q = 1.");
    expect(p.node("q").getAttribute("class")).toContain("done");
    await p.m.unmount();
  });

  it("klik na vstup přepne bit: nový výpočet od kroku 1, pozastavený; odkaz nese in=", async () => {
    const p = await open("/parallel/gates");
    await p.toEnd();
    await click(p.node("x") as unknown as HTMLElement);
    expect(p.counter()).toBe("krok 1 / 5");
    expect(p.playing()).toBe(false);
    expect(p.node("x").getAttribute("aria-pressed")).toBe("false");
    expect(p.search().get("in")).toBe("001");
    await p.toEnd();
    expect(p.text()).toContain("Výsledek: q = 0.");
    // Enter na vstupu y
    await key(p.node("y"), { key: "Enter" });
    expect(p.search().get("in")).toBe("011");
    expect(p.counter()).toBe("krok 1 / 5");
    await p.m.unmount();
  });

  it("Spočítat(vstupy) s Enterem a Další vstup; přehrávač stojí, ▶ ho rozběhne", async () => {
    const p = await open("/parallel/gates");
    await click(p.m.button("Spočítat(vstupy)"));
    const field = p.m.el.querySelector<HTMLInputElement>(".am-body input")!;
    await type(field, "110");
    await key(field, { key: "Enter" });
    expect(p.text()).toContain("Výpočet sítě (x = 1, y = 1, z = 0)");
    expect(p.counter()).toBe("krok 1 / 5");
    expect(p.playing()).toBe(false);
    await click(p.m.button("Další vstup"));
    expect(p.text()).toContain("Výpočet sítě (x = 1, y = 1, z = 1)");
    expect(p.counter()).toBe("krok 1 / 5");
    await click(p.m.button("Přehrát"));
    expect(p.playing()).toBe(true);
    await p.m.unmount();
  });

  it("pravdivostní tabulka: 8 řádků, aktuální zvýrazněný, klik na řádek = tento vstup", async () => {
    const p = await open("/parallel/gates");
    const rows = () => [
      ...p.m.el.querySelectorAll<HTMLTableRowElement>(".ctruth tbody tr"),
    ];
    expect(rows()).toHaveLength(8);
    expect(rows()[5].classList.contains("hl")).toBe(true);
    expect(
      rows()
        .map((r) => r.lastElementChild!.textContent)
        .join(""),
    ).toBe("00010111");
    await click(rows()[3]);
    expect(p.search().get("in")).toBe("011");
    expect(rows()[3].classList.contains("hl")).toBe(true);
    expect(p.counter()).toBe("krok 1 / 5");
    await p.m.unmount();
  });

  it("pravdivostní tabulka zůstává tabulkou (řádky bez role=button); výběr klávesnicí tlačítkem v první buňce", async () => {
    const p = await open("/parallel/gates");
    const rows = [
      ...p.m.el.querySelectorAll<HTMLTableRowElement>(".ctruth tbody tr"),
    ];
    for (const r of rows) {
      expect(r.getAttribute("role")).toBeNull();
      expect(r.getAttribute("tabindex")).toBeNull();
    }
    const use = rows[2].querySelector<HTMLButtonElement>(
      "td:first-child button",
    )!;
    expect(use).not.toBeNull();
    expect(use.getAttribute("aria-label")).toBe(
      "x = 0, y = 1, z = 0 → q = 0 – použít jako vstup",
    );
    expect(rows[5].querySelector("button")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
    await click(use);
    expect(p.search().get("in")).toBe("010");
    expect(p.counter()).toBe("krok 1 / 5");
    await p.m.unmount();
  });

  it("Příklady z knihy: xor ze čtyř nand a or stromem (tok shora dolů); odkaz net=", async () => {
    const p = await open("/parallel/gates");
    await click(p.m.button("Příklady z knihy"));
    await click(p.variant("Cv. 15.1.4 xor ze čtyř nand"));
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(4);
    expect(p.search().get("net")).toBe("xor-nand");
    expect(p.counter()).toBe("krok 1 / 5");
    // akce zůstala otevřená (široké okno jsdom) – jinak ji otevřít znovu
    if (!p.variant("Obr. 15.2 vpravo: or stromem (n = 8)"))
      await click(p.m.button("Příklady z knihy"));
    await click(p.variant("Obr. 15.2 vpravo: or stromem (n = 8)"));
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(7);
    expect(p.text()).toContain("hloubka 5 vrstev (S₀…S₄) · velikost 7 hradel");
    await p.m.unmount();
  });

  it("kreslení nic nespouští; neúplná síť zakáže výpočet a řekne proč", async () => {
    const p = await open("/parallel/gates");
    await click(p.m.button("Upravit síť"));
    await click(p.m.button("XOR"));
    expect(p.playing()).toBe(false);
    expect(p.text()).toContain("velikost 6 hradel");
    expect(p.m.button("Spočítat(vstupy)").getAttribute("aria-disabled")).toBe(
      "true",
    );
    await click(p.m.button("▶ Spočítat"));
    expect(p.text()).toContain("Hradlo X1 nemá zapojený 1. vstup.");
    expect(p.playing()).toBe(false);
    // smazat nové hradlo → zase jde počítat
    await click(p.m.button("Upravit síť"));
    await key(p.node("X1"), { key: "Delete" });
    await click(p.m.button("▶ Spočítat"));
    expect(p.counter()).toBe("krok 1 / 5");
    await p.m.unmount();
  });

  it("Vytvořit ▸ Vlastní: síť textem na jeden řádek; odkaz c=", async () => {
    const p = await open("/parallel/gates");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Vlastní"));
    const field = p.m.el.querySelector<HTMLInputElement>(".am-body input")!;
    await type(field, "in a, b; G = nor(a, b); out q = G");
    await key(field, { key: "Enter" });
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(1);
    expect(p.search().get("c")).toBe("in a, b; G = nor(a, b); out q = G");
    expect(p.counter()).toBe("krok 1 / 3");
    await p.m.unmount();
  });

  it("Vytvořit ▸ Vlastní s chybou: hláška u pole hned při psaní, Enter nic nenačte a formulář zůstane", async () => {
    const p = await open("/parallel/gates");
    const gates = p.m.el.querySelectorAll(".cnode-gate").length;
    const steps = p.counter();
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Vlastní"));
    const field = p.m.el.querySelector<HTMLInputElement>(".am-body input")!;
    await type(field, "in x; A1 = and(x, Q); out q = A1");
    const msg = () => p.m.el.querySelector(".am-body .am-msg");
    expect(msg()?.textContent).toBe(
      "Příkaz 2: vstup „Q“ hradla A1 neexistuje.",
    );
    await key(field, { key: "Enter" });
    expect(msg()?.getAttribute("role")).toBe("alert");
    expect(p.m.el.querySelector(".am-body input")).not.toBeNull();
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(gates);
    expect(p.counter()).toBe(steps);
    await p.m.unmount();
  });

  it("odkaz net=or-chain&n=3&in=010 otevře síť; vadný odkaz ukáže hlášku a adresu nepřepíše", async () => {
    const p = await open("/parallel/gates?net=or-chain&n=3&in=010");
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(2);
    expect(p.node("x2").getAttribute("aria-pressed")).toBe("true");
    expect(p.counter()).toBe("krok 1 / 4");
    await p.m.unmount();
    const q = await open("/parallel/gates?c=in%20a;%20G%20=%20andd(a,a)");
    expect(q.text()).toContain("Síť z odkazu nešla použít");
    expect(q.m.el.querySelectorAll(".cnode-gate")).toHaveLength(5);
    expect(q.loc.current!.search).toBe("?c=in%20a;%20G%20=%20andd(a,a)");
    await q.m.unmount();
  });
});

describe("Výchozí příklad a ↶ Vrátit operaci (CROSS-04, CROSS-05)", () => {
  it("Vytvořit ▸ Or stromem a ↶ vrátí obr. 15.1; Výchozí příklad = obr. 15.1; přehrávač stojí na kroku 1", async () => {
    const p = await open("/parallel/gates");
    await click(p.m.button("Vytvořit"));
    await click(p.variant("Or stromem(n)"));
    const go = p.m.el.querySelector<HTMLButtonElement>(".am-go")!;
    await click(go);
    expect(p.m.el.querySelectorAll(".cnode-gate").length).not.toBe(5);
    expect(p.m.el.querySelector(".viz-history")?.textContent).toContain(
      "Or stromem",
    );
    await click(p.m.button("↶ Vrátit operaci"));
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(5);
    expect(p.playing()).toBe(false);
    if (!p.variant("Or stromem(n)")) await click(p.m.button("Vytvořit"));
    await click(p.variant("Or stromem(n)"));
    await click(p.m.el.querySelector<HTMLButtonElement>(".am-go")!);
    await click(p.m.button("Výchozí příklad"));
    expect(p.m.el.querySelectorAll(".cnode-gate")).toHaveLength(5);
    expect(p.counter()).toBe("krok 1 / 5");
    expect(p.playing()).toBe(false);
    await p.m.unmount();
  });
});

describe("polohy vrcholů v odkazu (xy=)", () => {
  /** polohy všech vrcholů kresby (obdélník pro klik nese střed vrcholu) */
  const where = (el: HTMLElement) =>
    Object.fromEntries(
      [...el.querySelectorAll<SVGGElement>("[data-node]")].map((g) => {
        const r = g.querySelector(".cnode-hit")!;
        return [
          g.getAttribute("data-node"),
          `${r.getAttribute("x")},${r.getAttribute("y")}`,
        ];
      }),
    );

  it("ručně posunuté hradlo → Kopírovat odkaz nese xy=; odkaz v novém okně = stejné polohy, krok 1, pozastaveno", async () => {
    const p = await open("/parallel/gates");
    const start = where(p.m.el);
    await click(p.m.button("Upravit síť"));
    await key(p.node("A2"), { key: "ArrowRight", shiftKey: true });
    await key(p.node("A2"), { key: "ArrowDown", shiftKey: true });
    await click(p.m.button("▶ Spočítat"));
    const moved = where(p.m.el);
    expect(moved.A2).not.toBe(start.A2);
    expect(moved.A1).toBe(start.A1);
    expect(p.search().get("net")).toBe("maj");
    expect(p.search().get("xy")).toMatch(/^[0-9._-]+$/);
    const link = p.loc.current!.search;
    await p.m.unmount();

    const q = await open(`/parallel/gates${link}`, true);
    expect(where(q.m.el)).toEqual(moved);
    expect(q.loc.current!.search).toBe(link);
    expect(q.counter()).toBe("krok 1 / 5");
    expect(q.playing()).toBe(false);
    expect(q.m.el.querySelector(".input-error")).toBeNull();
    await q.m.unmount();
  });

  it("starý odkaz c= bez xy= = automatické rozvržení jako dřív; adresa se nepřepíše", async () => {
    const c = "in a, b; G = nor(a, b); out q = G";
    const p = await open(`/parallel/gates?c=${encodeURIComponent(c)}`);
    const q = await open(
      `/parallel/gates?c=${encodeURIComponent(c)}&xy=${"0.0_0.100_220.60_340.-20"}`,
    );
    expect(where(q.m.el)).not.toEqual(where(p.m.el));
    expect(p.search().get("xy")).toBeNull();
    expect(p.m.el.querySelector(".input-error")).toBeNull();
    await p.m.unmount();
    await q.m.unmount();
  });

  it("vadné xy= se ignoruje: síť jako bez něj, poznámka, adresa se nepřepíše, přehrávač stojí", async () => {
    const ref = await open("/parallel/gates?net=maj");
    const p = await open("/parallel/gates?net=maj&xy=1.2_zz", true);
    expect(where(p.m.el)).toEqual(where(ref.m.el));
    expect(p.text()).toContain("Polohy vrcholů z odkazu (xy=)");
    expect(p.loc.current!.search).toBe("?net=maj&xy=1.2_zz");
    expect(p.counter()).toBe("krok 1 / 5");
    expect(p.playing()).toBe(false);
    await ref.m.unmount();
    await p.m.unmount();
  });
});
