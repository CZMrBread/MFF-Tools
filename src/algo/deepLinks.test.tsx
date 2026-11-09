// @vitest-environment jsdom
/*
 * Staré sdílené odkazy ~smolad/algo/#/… musí po sloučení do hlavní aplikace dát
 * stejný modul i vstup jako samostatné algo/ (hash router zůstává uvnitř stránky).
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";
import { CATEGORIES, moduleByPath } from "./registry";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function topbarTitle(container: HTMLElement): string | null | undefined {
  return container.querySelector(".topbar-title")?.textContent;
}

/** odkaz otevře připravený běh, ale nepřehraje ho – stojí na kroku 1, ▶ ho spustí */
function expectStopped(container: HTMLElement) {
  expect(container.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
    "Přehrát",
  );
  expect(container.querySelector(".step-counter")?.textContent).toMatch(
    /^krok 1 \/ \d+$/,
  );
}

describe("staré odkazy #/… v AlgoPage", () => {
  it("#/sort/quick?a=5,3,9 otevře Quicksort se vstupem 5, 3, 9", async () => {
    window.location.hash = "#/sort/quick?a=5,3,9";
    const { container } = render(<AlgoPage />);
    await screen.findAllByText(moduleByPath("/sort/quick")!.title);
    expect(topbarTitle(container)).toBe(moduleByPath("/sort/quick")!.title);
    // vstup z odkazu se použil a adresa ho nese dál beze změny
    expect(window.location.hash).toBe("#/sort/quick?a=5,3,9");
    // po otevření není rozbalená žádná akce; pole P ukáže Vytvořit ▸ Vlastní
    expect(container.querySelector(".action-menu input")).toBeNull();
    await clickEl(buttonByText(container, "Vytvořit"));
    const field = container.querySelector<HTMLInputElement>(
      "input[type=text], textarea",
    );
    expect(field?.value.split(/[^\d]+/).filter(Boolean)).toEqual([
      "5",
      "3",
      "9",
    ]);
    expect(container.textContent).toContain("Quicksort(5, 3, 9)");
    expectStopped(container);
  });

  it("vadný odkaz třídění (#/sort/quick?a=abc,500): hláška jako u grafu, adresa se nepřepíše (UX-06)", async () => {
    window.location.hash = "#/sort/quick?a=abc,500";
    const { container } = render(<AlgoPage />);
    await screen.findAllByText(moduleByPath("/sort/quick")!.title);
    const notice = container.querySelector(".viz-canvas .input-error");
    expect(notice?.textContent).toMatch(
      /^Vstup z odkazu nešel použít \(.*abc.*500.*\) – zobrazen výchozí příklad\.$/,
    );
    expect(window.location.hash).toBe("#/sort/quick?a=abc,500");
    expectStopped(container);
  });

  it("odkaz třídění s částí neplatných hodnot: platné se použijí, zbytek se ohlásí (Ignorováno: …)", async () => {
    window.location.hash = "#/sort/quick?a=5,x,9";
    const { container } = render(<AlgoPage />);
    await screen.findAllByText(moduleByPath("/sort/quick")!.title);
    expect(container.textContent).toContain("Quicksort(5, 9)");
    expect(
      container.querySelector(".viz-canvas .input-warn")?.textContent,
    ).toBe("Vstup z odkazu – ignorováno: x.");
  });

  it("#/graph/dfs?g=…&s=… otevře DFS s grafem a v₀ z odkazu", async () => {
    window.location.hash = "#/graph/dfs?g=A+B%0AB+C%0AC+A&d=0&w=0&s=B";
    const { container } = render(<AlgoPage />);
    await screen.findAllByText(moduleByPath("/graph/dfs")!.title);
    expect(topbarTitle(container)).toBe(moduleByPath("/graph/dfs")!.title);
    const text = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(text?.value).toBe("A B\nB C\nC A");
    expect(container.textContent).toContain("DFS(v₀ = B)");
    expectStopped(container);
  });

  // moduly fáze 2 (kap. 13, 15, 17): vlastní líně načtená stránka, odkaz stojí jako ostatní
  const PHASE2 = [
    "/string/kmp",
    "/string/aho-corasick",
    "/string/rabin-karp",
    "/parallel/gates",
    "/parallel/adder",
    "/parallel/sortnet",
    "/fft/fft",
    "/fft/net",
  ];
  for (const path of PHASE2)
    it(`#${path} otevře svůj modul (nadpis, horní lišta, stojí)`, async () => {
      const m = moduleByPath(path);
      expect(m, path).toBeDefined();
      window.location.hash = "#" + path;
      const { container } = render(<AlgoPage />);
      await screen.findAllByText(m!.title);
      expect(topbarTitle(container)).toBe(m!.title);
      await waitFor(
        () =>
          expect(container.querySelector(".viz h1")?.textContent).toContain(
            m!.title,
          ),
        { timeout: 10000 },
      );
      expect(window.location.hash).toBe("#" + path);
      expect(
        container.querySelector(".ctl-play")?.getAttribute("aria-label"),
      ).not.toBe("Pozastavit");
      expect(container.querySelector(".step-counter")?.textContent).toMatch(
        /^(krok 1 \/ \d+|připraveno)$/,
      );
      // modul je v menu ve své skupině
      const group = CATEGORIES.find((c) =>
        c.modules.some((x) => x.path === path),
      );
      expect(group?.title, path).toMatch(
        /^(Textové algoritmy|Paralelní algoritmy|Fourierova transformace)$/,
      );
    });

  // moduly fáze 4 (8. 11. 2026): každý otevře svou stránku a stojí; odkazy s parametry testují stopy ve svých souborech
  const PHASE4: [string, RegExp][] = [
    ["/flow/ford-fulkerson", /^Toky v sítích$/],
    ["/flow/dinic", /^Toky v sítích$/],
    ["/flow/goldberg", /^Toky v sítích$/],
    ["/graph/bellman-ford", /^Grafy$/],
    ["/graph/boruvka", /^Grafy$/],
    ["/graph/bridges", /^Grafy$/],
    ["/graph/scc", /^Grafy$/],
    ["/dp/edit", /^Dynamické programování$/],
    ["/dp/lis", /^Dynamické programování$/],
    ["/geom/hull", /^Geometrie$/],
    ["/tree/llrb", /^Vyhledávací stromy$/],
  ];
  for (const [path, groupTitle] of PHASE4)
    it(`#${path} otevře svůj modul (nadpis, horní lišta, stojí) – fáze 4`, async () => {
      const m = moduleByPath(path);
      expect(m, path).toBeDefined();
      window.location.hash = "#" + path;
      const { container } = render(<AlgoPage />);
      await screen.findAllByText(m!.title);
      expect(topbarTitle(container)).toBe(m!.title);
      await waitFor(
        () =>
          expect(container.querySelector(".viz h1")?.textContent).toBe(
            m!.title,
          ),
        { timeout: 10000 },
      );
      expect(window.location.hash).toBe("#" + path);
      expect(
        container.querySelector(".ctl-play")?.getAttribute("aria-label"),
      ).not.toBe("Pozastavit");
      expect(container.querySelector(".step-counter")?.textContent).toMatch(
        /^(krok 1 \/ \d+|připraveno)$/,
      );
      const group = CATEGORIES.find((c) =>
        c.modules.some((x) => x.path === path),
      );
      expect(group?.title, path).toMatch(groupTitle);
    });

  // sdílené odkazy nových modulů s parametry: vstup z adresy se použije, adresa se nepřepíše, stojí na kroku 1
  const PHASE2_LINKS: {
    hash: string;
    path: string;
    check: (el: HTMLElement) => void;
  }[] = [
    {
      hash: "#/string/kmp?j=ana&s=bananas",
      path: "/string/kmp",
      check: (el) => expect(el.textContent).toContain("bananas"),
    },
    {
      hash: "#/string/aho-corasick?j=barbarossa&s=barbarbarossa",
      path: "/string/aho-corasick",
      check: (el) =>
        expect(el.querySelector("a.ac-to-kmp")?.getAttribute("href")).toContain(
          "j=barbarossa",
        ),
    },
    {
      hash: "#/string/rabin-karp?j=kokos&s=clanekokokosu&p=31&n=17",
      path: "/string/rabin-karp",
      check: (el) =>
        expect(el.querySelector(".viz-op")?.textContent).toContain(
          "falešná shoda",
        ),
    },
    {
      hash: "#/parallel/gates?net=or-chain&n=3&in=010",
      path: "/parallel/gates",
      check: (el) => {
        expect(el.querySelectorAll(".cnode-gate")).toHaveLength(2);
        expect(el.querySelector(".step-counter")?.textContent).toBe(
          "krok 1 / 4",
        );
      },
    },
    {
      hash: "#/parallel/adder?x=1111&y=0001&m=par&pq=1",
      path: "/parallel/adder",
      check: (el) =>
        expect(el.querySelector(".step-counter")?.textContent).toBe(
          "krok 1 / 8",
        ),
    },
    {
      hash: "#/parallel/sortnet?net=bubble&a=5,2,4,1,3&lay=seq",
      path: "/parallel/sortnet",
      check: (el) => {
        expect(el.querySelectorAll(".sn-comp")).toHaveLength(10);
        expect(el.querySelector(".step-counter")?.textContent).toBe(
          "krok 1 / 12",
        );
      },
    },
    {
      hash: "#/fft/fft?op=mul&p=1,2,3&q=4,5,6&d=alg",
      path: "/fft/fft",
      check: (el) => expect(el.querySelector(".fft-table.mul")).not.toBeNull(),
    },
    {
      hash: "#/fft/net?x=0,1,2,3,4,5,6,7&f=z17",
      path: "/fft/net",
      check: (el) => expect(el.textContent).toContain("ℤ₁₇"),
    },
  ];
  for (const link of PHASE2_LINKS)
    it(`${link.hash} použije vstup z odkazu, adresu nepřepíše a stojí na kroku 1`, async () => {
      const m = moduleByPath(link.path)!;
      window.location.hash = link.hash;
      const { container } = render(<AlgoPage />);
      await waitFor(
        () =>
          expect(container.querySelector(".viz h1")?.textContent).toContain(
            m.title,
          ),
        { timeout: 10000 },
      );
      expect(container.querySelector(".viz-canvas .input-error")).toBeNull();
      link.check(container);
      expect(window.location.hash).toBe(link.hash);
      expectStopped(container);
    });

  // nadpis stránky = název modulu v rejstříku (upřesnění je v popisu), CROSS-14
  const STRUCT_PATHS = [
    "/sort/bubble",
    "/sort/counting",
    "/ds/stack",
    "/ds/queue",
    "/ds/list",
    "/ds/heap",
    "/ds/segtree",
    "/ds2/array",
    "/ds2/counter",
    "/cache/paging",
    "/tree/bst",
    "/tree/avl",
    "/tree/bb",
    "/tree/splay",
    "/tree/ab",
    "/geom/kdtree",
  ];
  for (const path of STRUCT_PATHS)
    it(`#${path}: nadpis H1 je název modulu z rejstříku`, async () => {
      const m = moduleByPath(path)!;
      window.location.hash = "#" + path;
      const { container } = render(<AlgoPage />);
      await waitFor(
        () => expect(container.querySelector(".viz h1")).not.toBeNull(),
        { timeout: 10000 },
      );
      expect(container.querySelector(".viz h1")?.textContent).toBe(m.title);
    });

  // před první operací ukazuje panel pseudokód hlavní (otevřené) akce, bez zvýrazněného řádku (SORTDS-15)
  const IDLE_CODE: [string, RegExp][] = [
    ["/ds/stack", /Push/],
    ["/ds/queue", /Enqueue/],
    ["/ds/list", /Find/],
    ["/ds/heap", /Insert/],
    ["/ds/segtree", /IntCanon/],
    ["/ds2/array", /Insert/],
    ["/ds2/counter", /Increment/],
    ["/tree/bst", /Insert/],
    ["/tree/ab", /Insert/],
  ];
  for (const [path, head] of IDLE_CODE)
    it(`#${path}: po načtení je v panelu pseudokód hlavní akce, žádný řádek není aktivní, stojí`, async () => {
      window.location.hash = "#" + path;
      const { container } = render(<AlgoPage />);
      await waitFor(
        () => expect(container.querySelector(".viz h1")).not.toBeNull(),
        { timeout: 10000 },
      );
      const lines = container.querySelectorAll(
        ".viz-code .pseudocode .pc-line",
      );
      expect(lines.length, path).toBeGreaterThan(0);
      expect(lines[0].textContent, path).toMatch(head);
      expect(container.querySelector(".viz-code .pc-line.active")).toBeNull();
      expect(container.querySelector(".viz-code .pseudocode.empty")).toBeNull();
      expect(
        container.querySelector(".ctl-play")?.getAttribute("aria-label"),
      ).not.toBe("Pozastavit");
    });

  // „Kopírovat odkaz“ = aktuální stav: po operaci se stav zapíše do adresy (replace), nové vykreslení
  // z adresy dá stejný obsah; otevření stránky adresu nepřepíše ani ve StrictMode (CROSS-01)
  const clickEl = (el: Element) =>
    act(async () => {
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  const buttonByText = (el: HTMLElement, text: string) => {
    const b = [...el.querySelectorAll("button")].find(
      (x) => x.textContent?.trim() === text,
    );
    if (!b) throw new Error(`tlačítko „${text}“ nenalezeno`);
    return b;
  };
  async function fill(el: HTMLElement, label: string, value: string) {
    const l = [...el.querySelectorAll(".viz-actions label")].find((x) =>
      x.textContent?.trim().startsWith(label),
    );
    const input = l?.querySelector("input") as HTMLInputElement | null;
    if (!input) throw new Error(`pole „${label}“ nenalezeno`);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  /** provede akci z nabídky jako uživatel: otevřít, vyplnit pole, Provést; pak skočit na konec běhu */
  async function perform(
    el: HTMLElement,
    label: string,
    fields: Record<string, string> = {},
  ) {
    const b = buttonByText(el, label);
    const expandable = b.hasAttribute("aria-expanded");
    if (!expandable || b.getAttribute("aria-expanded") !== "true")
      await clickEl(b);
    if (expandable) {
      for (const [k, v] of Object.entries(fields)) await fill(el, k, v);
      await clickEl(buttonByText(el, "Provést"));
    }
    const end = el.querySelector('[aria-label="Na konec"]');
    if (end) await clickEl(end);
  }
  async function open(hash: string) {
    window.location.hash = hash;
    const r = render(
      <StrictMode>
        <AlgoPage />
      </StrictMode>,
    );
    await waitFor(
      () => expect(r.container.querySelector(".viz h1")).not.toBeNull(),
      { timeout: 10000 },
    );
    return r.container;
  }
  const svgLabel = (el: HTMLElement) =>
    el.querySelector(".viz-canvas svg[aria-label]")?.getAttribute("aria-label");
  const nodeLabels = (el: HTMLElement) =>
    [...el.querySelectorAll(".viz-canvas g.tree-node")].map(
      (g) => g.querySelector("text")?.textContent,
    );
  // graf ceny operací (amortizace) je historie běhu, ne stav struktury – odkaz ji nenese
  const svgTexts = (el: HTMLElement) =>
    [
      ...el.querySelectorAll('.viz-canvas svg:not([aria-label^="Graf:"]) text'),
    ].map((t) => t.textContent);
  const sorted = (xs: (string | null | undefined)[]) => [...xs].sort();
  const abKeysOf = (el: HTMLElement) =>
    sorted(
      [...el.querySelectorAll(".viz-canvas .mtree-node")]
        .filter((g) => !g.nextElementSibling || true)
        .flatMap((g) =>
          [...g.querySelectorAll("[role=button]")].map((k) => k.textContent),
        ),
    );

  const STATE_LINKS: {
    path: string;
    ops: [string, Record<string, string>][];
    param: string;
    sig: (el: HTMLElement) => unknown;
  }[] = [
    {
      path: "/ds/stack",
      ops: [["Push(x)", { "x =": "7" }]],
      param: "a=",
      sig: svgLabel,
    },
    { path: "/ds/queue", ops: [["Dequeue", {}]], param: "a=", sig: svgLabel },
    {
      path: "/ds/list",
      ops: [["InsertFirst(x)", { "x =": "33" }]],
      param: "a=",
      sig: svgLabel,
    },
    {
      path: "/ds/heap",
      ops: [["Insert(x)", { "x =": "2" }]],
      param: "a=",
      sig: nodeLabels,
    },
    {
      path: "/ds/segtree",
      ops: [["IntUpdate(i, x)", { "i =": "3", "x =": "0" }]],
      param: "a=",
      sig: nodeLabels,
    },
    {
      path: "/ds2/array",
      ops: [["Insert(x)", { "x =": "9" }]],
      param: "a=",
      sig: svgTexts,
    },
    {
      path: "/ds2/counter",
      ops: [["Increment", {}]],
      param: "v=",
      sig: svgTexts,
    },
    {
      path: "/tree/bst",
      ops: [
        ["Insert(x)", { "x =": "27" }],
        ["Delete(x)", { "x =": "20" }],
        ["Find(x)", { "x =": "60" }],
      ],
      param: "k=",
      sig: (el) => sorted(nodeLabels(el)),
    },
    {
      path: "/tree/avl",
      ops: [
        ["Insert(x)", { "x =": "27" }],
        ["Delete(x)", { "x =": "10" }],
      ],
      param: "k=",
      sig: (el) => sorted(nodeLabels(el)),
    },
    {
      path: "/tree/splay",
      ops: [
        ["Find(x)", { "x =": "70" }],
        ["Insert(x)", { "x =": "33" }],
        ["Delete(x)", { "x =": "40" }],
      ],
      param: "k=",
      sig: (el) => sorted(nodeLabels(el)),
    },
    {
      path: "/tree/bb",
      ops: [["Insert(x)", { "x =": "71" }]],
      param: "k=",
      sig: (el) => sorted(nodeLabels(el)),
    },
    {
      path: "/tree/ab",
      ops: [
        ["Insert(x)", { "x =": "50" }],
        ["Delete(x)", { "x =": "5" }],
      ],
      param: "k=",
      sig: abKeysOf,
    },
  ];
  for (const t of STATE_LINKS)
    it(`#${t.path}: po operaci nese adresa aktuální stav (${t.param}) a odkaz ho obnoví`, async () => {
      let el = await open("#" + t.path);
      // otevření (StrictMode) adresu nepřepíše
      expect(window.location.hash).toBe("#" + t.path);
      const before = t.sig(el);
      for (const [label, fields] of t.ops) await perform(el, label, fields);
      const after = t.sig(el);
      expect(after, "operace změnila stav").not.toEqual(before);
      const hash = window.location.hash;
      expect(hash).toContain(t.param);
      // operace ani zápis adresy nic nepřehrály
      expect(
        el.querySelector(".ctl-play")?.getAttribute("aria-label"),
      ).not.toBe("Pozastavit");
      cleanup();
      el = await open(hash);
      expect(window.location.hash).toBe(hash);
      expect(t.sig(el)).toEqual(after);
    });

  it("#/ds/stack: ↶ Vrátit operaci zapíše stav před operací, návrat na výchozí stav adresu vyčistí", async () => {
    const el = await open("#/ds/stack");
    await perform(el, "Push(x)", { "x =": "7" });
    expect(decodeURIComponent(window.location.hash)).toBe(
      "#/ds/stack?a=5,12,8,7",
    );
    await perform(el, "Pop");
    // zpět ve výchozím stavu → adresa bez parametru
    expect(window.location.hash).toBe("#/ds/stack");
    await clickEl(buttonByText(el, "↶ Vrátit operaci"));
    expect(decodeURIComponent(window.location.hash)).toContain("a=5,12,8,7");
    await clickEl(buttonByText(el, "↶ Vrátit operaci"));
    expect(window.location.hash).toBe("#/ds/stack");
  });

  // otevřená akce po načtení (CROSS-06): třídění nic, stromy a nafukovací pole Insert(x), počítadlo Increment
  const OPEN_ON_LOAD: [string, string | null][] = [
    ["/sort/quick", null],
    ["/sort/counting", null],
    ["/ds2/array", "Insert(x)"],
    ["/ds2/counter", "Increment"],
    ["/tree/bst", "Insert(x)"],
    ["/tree/avl", "Insert(x)"],
    ["/tree/splay", "Insert(x)"],
    ["/tree/bb", "Insert(x)"],
    ["/tree/ab", "Insert(x)"],
  ];
  for (const [path, label] of OPEN_ON_LOAD)
    it(`#${path}: po načtení je otevřená ${label ?? "žádná akce"}, přehrávač stojí`, async () => {
      const el = await open("#" + path);
      await waitFor(() =>
        expect(
          el.querySelector(".am-item.open .am-action")?.textContent ?? null,
        ).toBe(label),
      );
      expect(window.location.hash).toBe("#" + path);
      expect(el.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
        "Přehrát",
      );
      expect(el.querySelector(".step-counter")?.textContent).toMatch(
        /^(krok 1 \/ \d+|připraveno)$/,
      );
    });

  it("#/geom/kdtree?q=10,60,10,60 otevře postavený strom s připraveným RangeQuery na kroku 1, nepřehrává (TREEHASH-12)", async () => {
    const el = await open("#/geom/kdtree?q=10,60,10,60");
    expect(el.querySelector(".viz-op")?.textContent).toContain(
      "RangeQuery([10, 60] × [10, 60])",
    );
    expectStopped(el);
    expect(window.location.hash).toBe("#/geom/kdtree?q=10,60,10,60");
  });

  it("neznámá cesta vede na přehled s upozorněním jako dřív", async () => {
    window.location.hash = "#/sort/foo";
    render(<AlgoPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.location.hash).toBe("#/");
  });
});
