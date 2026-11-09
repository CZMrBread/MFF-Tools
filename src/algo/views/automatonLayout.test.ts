// Rozvržení vyhledávacího automatu (AutomatonView): lineární podle obr. 13.1 a obecné hrany pro strom (AC).
import { describe, expect, it } from "vitest";
import { acBuild } from "../algos/strings/ahoCorasick";
import { FIG_13_1, FIG_13_2 } from "../algos/strings/bookStrings.fixtures";
import {
  curveEdge,
  linearAutomaton,
  trieAutomaton,
  trieSlots,
} from "./automatonLayout";

const names = (w: string) =>
  Array.from({ length: w.length + 1 }, (_, s) => (s ? w.slice(0, s) : "ε"));

describe("linearAutomaton – obr. 13.1", () => {
  const L = linearAutomaton(
    names("barbarossa"),
    [...FIG_13_1.letters],
    [...FIG_13_1.Z],
    1000,
  );

  it("stavy v jedné řadě zleva doprava, uvnitř plátna", () => {
    expect(L.nodes).toHaveLength(11);
    for (let s = 1; s < 11; s++)
      expect(L.nodes[s].x).toBeGreaterThan(L.nodes[s - 1].x);
    for (const n of L.nodes) {
      expect(n.x - L.r).toBeGreaterThanOrEqual(0);
      expect(n.x + L.r).toBeLessThanOrEqual(L.W);
      expect(n.y).toBe(L.nodes[0].y);
    }
  });

  it("dopředné hrany s písmeny ι[s] pod nimi", () => {
    const fwd = L.edges.filter((e) => e.kind === "fwd");
    expect(fwd.map((e) => e.label).join("")).toBe("barbarossa");
    for (const e of fwd) expect(e.ly).toBeGreaterThan(L.nodes[0].y);
  });

  it("zpětné hrany: nad řadou právě 1→0, 4→1, 5→2, 6→3; sběrnice do ε pod řadou z 2, 3, 7, 8, 9, 10", () => {
    const back = L.edges.filter((e) => e.kind === "back");
    const above = back
      .filter((e) => e.side === "above")
      .map((e) => [e.from, e.to]);
    const below = back.filter((e) => e.side === "below").map((e) => e.from);
    expect(above).toEqual(FIG_13_1.arcsAbove.map((x) => [...x]));
    expect(below).toEqual([...FIG_13_1.bus]);
    for (const e of back) {
      expect(e.d).toMatch(/^M/);
      expect(e.arrow.split(" ")).toHaveLength(3);
    }
  });

  it("nespočtená zpětná hrana (null) se nekreslí – stavba po krocích (bootstrapping)", () => {
    const part = linearAutomaton(
      names("kokos"),
      [..."kokos"],
      [null, 0, 0, null, null, null],
      600,
    );
    expect(
      part.edges.filter((e) => e.kind === "back").map((e) => e.from),
    ).toEqual([1, 2]);
  });

  it("jména stavů se ukážou, jen když se vejdou mezi sousední stavy", () => {
    const wide = linearAutomaton(
      names("kokos"),
      [..."kokos"],
      [null, 0, 0, 1, 2, 0],
      900,
    );
    expect(wide.nodes.every((n) => n.showName)).toBe(true);
    const narrow = linearAutomaton(
      names("abrakadabrakadab"),
      [..."abrakadabrakadab"],
      Array(17).fill(0),
      500,
    );
    expect(narrow.nodes[12].showName).toBe(false);
    expect(narrow.nodes[0].showName).toBe(true);
  });
});

describe("linearAutomaton – vzhled jako obr. 13.1", () => {
  it("SVG vyplní šířku obalu, řada stavů je uprostřed", () => {
    const L = linearAutomaton(
      names("kokos"),
      [..."kokos"],
      [null, 0, 0, 1, 2, 0],
      1200,
    );
    expect(L.W).toBe(1200);
    const left = L.nodes[0].x;
    const right = L.W - L.nodes.at(-1)!.x;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it("jméno posledního stavu je vidět vždy (barbarossa); nad skrytými jmény je jednou „…“", () => {
    const L = linearAutomaton(
      names("barbarossa"),
      [...FIG_13_1.letters],
      [...FIG_13_1.Z],
      700,
    );
    expect(L.nodes.at(-1)!.showName).toBe(true);
    const hidden = L.nodes.filter((n) => !n.showName).map((n) => n.id);
    expect(hidden.length).toBeGreaterThan(0);
    const dots = L.nodes.filter((n) => n.ellipsis).map((n) => n.id);
    expect(dots).toHaveLength(1);
    expect(hidden).toContain(dots[0]);
    // poslední jméno se vejde do plátna
    expect(L.nodes.at(-1)!.x + 5 * 7.2).toBeLessThanOrEqual(L.W);
  });
});

describe("curveEdge – obecná hrana mezi kroužky (strom Aho-Corasickové)", () => {
  it("začíná a končí na obvodu kroužků; šipka míří do cíle", () => {
    const e = curveEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2, 10);
    const start = e.d.slice(1).split(" ")[0].split(",").map(Number);
    expect(Math.hypot(start[0], start[1])).toBeCloseTo(10, 0);
    expect(curveEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 10).d).toBe(
      "M10,0 L90,0",
    );
    const tip = e.arrow.split(" ")[0].split(",").map(Number);
    expect(Math.hypot(tip[0] - 100, tip[1])).toBeCloseTo(10, 0);
  });
});

describe("trieSlots – automatické rozvržení stromu (obr. 13.2)", () => {
  const A = acBuild([...FIG_13_2.words]);
  const id = (name: string) => A.nodes.find((n) => n.name === name)!.id;
  const T = trieSlots(A.nodes);

  it("listy po sobě jdoucí sloty (DFS, abecedně), vnitřní vrchol uprostřed synů, y = hloubka", () => {
    expect(T.slots).toBe(2);
    expect(T.depth).toBe(7);
    expect(["arab", "baraba", "barbara"].map((n) => T.x[id(n)])).toEqual([
      0, 1, 2,
    ]);
    // řetěz a – ar – ara – arab je svislý, kořen leží mezi a a b
    for (const n of ["a", "ar", "ara"]) expect(T.x[id(n)]).toBe(0);
    expect(T.x[id("bara")]).toBe(1);
    expect(T.x[id("barb")]).toBe(2);
    expect(T.x[id("bar")]).toBe(1.5);
    expect(T.x[0]).toBe(0.75);
    expect(T.x[0]).toBeGreaterThan(T.x[id("a")]);
    expect(T.x[0]).toBeLessThan(T.x[id("b")]);
  });

  it("jedna jehla = svislá cesta", () => {
    const K = trieSlots(acBuild(["kokos"]).nodes);
    expect(K.slots).toBe(0);
    expect(new Set(K.x).size).toBe(1);
  });
});

describe("trieAutomaton – kresba stromu Aho-Corasickové", () => {
  const A = acBuild([...FIG_13_2.words]);
  const id = (name: string) => A.nodes.find((n) => n.name === name)!.id;
  const base = {
    back: A.back,
    short: A.short,
    width: 700,
    levelH: 50,
    names: true,
  };

  it("hrany: 14 dopředných s písmenem, 14 zpětných, 4 zkratky; vše uvnitř plátna", () => {
    const L = trieAutomaton(A.nodes, base);
    const kinds = (k: string) => L.edges.filter((e) => e.kind === k);
    expect(kinds("fwd")).toHaveLength(14);
    expect(kinds("back")).toHaveLength(14);
    expect(kinds("short")).toHaveLength(4);
    for (const e of kinds("fwd")) expect(e.label).toBe(A.nodes[e.to].ch);
    for (const n of L.nodes) {
      expect(n.x - L.r).toBeGreaterThanOrEqual(0);
      expect(n.x + L.r).toBeLessThanOrEqual(L.W);
      expect(n.y + L.r).toBeLessThanOrEqual(L.H);
      expect(n.y - L.r).toBeGreaterThanOrEqual(0);
    }
    // hladiny shora dolů po levelH
    expect(L.nodes[id("barbara")].y - L.nodes[0].y).toBeCloseTo(7 * 50, 5);
  });

  it("kroužky a písmo rostou s výškou hladiny (velký monitor), u nízké zůstanou základní", () => {
    const low = trieAutomaton(A.nodes, { ...base, levelH: 26 });
    const high = trieAutomaton(A.nodes, { ...base, width: 1200, levelH: 72 });
    expect(low.r).toBe(10);
    expect(low.zoom ?? 1).toBe(1);
    expect(high.r).toBeGreaterThanOrEqual(14);
    expect(high.zoom).toBeCloseTo(high.r / 10, 5);
    // větší kroužky se pořád vejdou mezi hladiny a do plátna
    for (const n of high.nodes) {
      expect(n.x - high.r).toBeGreaterThanOrEqual(0);
      expect(n.x + high.r).toBeLessThanOrEqual(high.W);
    }
    expect(2 * high.r + 6).toBeLessThanOrEqual(72);
  });

  it("vrcholy téže hladiny nejsou blíž než dva poloměry a mezera", () => {
    const L = trieAutomaton(A.nodes, { ...base, width: 200 });
    const byDepth = new Map<number, number[]>();
    for (const n of A.nodes)
      byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), L.nodes[n.id].x]);
    for (const xs of byDepth.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(2 * L.r + 8);
    }
  });

  it("jména stavů vedle kroužku (uvnitř plátna), bez jmen kresba užší", () => {
    const L = trieAutomaton(A.nodes, base);
    for (const n of L.nodes) {
      expect(n.showName).toBe(true);
      expect(n.nameX).toBeDefined();
      expect(n.nameY).toBeDefined();
    }
    const bare = trieAutomaton(A.nodes, { ...base, names: false, width: 0 });
    const named = trieAutomaton(A.nodes, { ...base, width: 0 });
    expect(bare.nodes.every((n) => !n.showName)).toBe(true);
    expect(bare.W).toBeLessThan(named.W);
  });

  it("knižní předvolba: polohy vrcholů z obr. 13.2 (±0,005)", () => {
    const coords = A.nodes.map((n) => FIG_13_2.coords[n.name]);
    const L = trieAutomaton(A.nodes, { ...base, coords });
    const xs = L.nodes.map((n) => n.x);
    const ys = L.nodes.map((n) => n.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    for (const n of A.nodes) {
      const [cx, cy] = FIG_13_2.coords[n.name];
      expect((L.nodes[n.id].x - x0) / w).toBeCloseTo(cx, 2);
      expect((L.nodes[n.id].y - y0) / h).toBeCloseTo(cy, 2);
    }
  });

  it("ruční ohyb hrany (knižní předvolba) přebije automatický", () => {
    const key = `back:${id("barbara")}-${id("bara")}`;
    const auto = trieAutomaton(A.nodes, base).edges.find((e) => e.key === key);
    const bent = trieAutomaton(A.nodes, {
      ...base,
      bends: { [key]: 0.6 },
    }).edges.find((e) => e.key === key);
    expect(bent!.d).not.toBe(auto!.d);
  });

  it("stavba po krocích: jen vrcholy id < visible a hrany mezi nimi; nespočtené Zpět se nekreslí", () => {
    const back = A.back.map((b, i) => (i < 4 ? b : null));
    const L = trieAutomaton(A.nodes, {
      ...base,
      back,
      short: A.nodes.map(() => null),
      visible: 7,
    });
    expect(L.nodes.map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(L.edges.filter((e) => e.kind === "fwd")).toHaveLength(6);
    expect(L.edges.filter((e) => e.kind === "back").map((e) => e.from)).toEqual(
      [1, 2, 3],
    );
    expect(L.edges.every((e) => e.from < 7 && e.to < 7)).toBe(true);
  });

  it("zpětné hrany jen z vybraných stavů (velký slovník)", () => {
    const L = trieAutomaton(A.nodes, { ...base, backFrom: [id("barbara")] });
    expect(L.edges.filter((e) => e.kind === "back").map((e) => e.from)).toEqual(
      [id("barbara")],
    );
  });
});

describe("trieAutomaton – jména stavů nepřekrývají kroužky (NEWMODS-04)", () => {
  // obr. 13.2 jak ho kreslí stránka (knižní polohy přes acLayout)
  it("na obr. 13.2 (kniha i automatické rozvržení, různé šířky a hladiny) žádné jméno neleží přes cizí kroužek", async () => {
    const { acLayout } = await import("../algos/strings/ahoCorasickView");
    const { acSteps } = await import("../algos/strings/ahoCorasick");
    const { materialize } = await import("../core/steps");
    const steps = materialize(
      acSteps([...FIG_13_2.words], "barbara", "search"),
    );
    const st = steps[steps.length - 1].state;
    const A = acBuild([...FIG_13_2.words]);
    const layouts = [
      ...[240, 280, 300, 360, 520].flatMap((w) =>
        [26, 34, 42, 50, 60, 72].map((levelH) =>
          acLayout(st, { names: true, allBack: true, levelH })(w),
        ),
      ),
      ...[300, 700].map((width) =>
        trieAutomaton(A.nodes, {
          back: A.back,
          short: A.short,
          width,
          levelH: 50,
          names: true,
        }),
      ),
    ];
    for (const L of layouts) {
      const z = L.zoom ?? 1;
      for (const n of L.nodes) {
        if (!n.showName || n.nameX === undefined || n.nameY === undefined)
          continue;
        const w = [...n.name].length * 6.4 * z;
        const x0 = n.nameAnchor === "end" ? n.nameX - w : n.nameX;
        const box = { x0, x1: x0 + w, y0: n.nameY - 10 * z, y1: n.nameY + 2 };
        for (const o of L.nodes) {
          // nejbližší bod kroužku k obdélníku jména
          const cx = Math.max(box.x0, Math.min(o.x, box.x1));
          const cy = Math.max(box.y0, Math.min(o.y, box.y1));
          const d = Math.hypot(o.x - cx, o.y - cy);
          expect(
            d,
            `jméno ${n.name} přes kroužek ${o.name} (šířka ${L.W}, r ${L.r})`,
          ).toBeGreaterThanOrEqual(L.r - 0.5);
        }
      }
    }
  });
});

describe("trieAutomaton – jména a kroužky u náhodných slovníků (NEWMODS-04)", () => {
  it("jméno nikdy neleží přes cizí kroužek (randomAc 1…40, typické slovníky)", async () => {
    const { randomAc } = await import("../algos/strings/ahoCorasickPageModel");
    const dicts = [
      ["he", "she", "his", "hers"],
      ["a", "ab", "abc", "b", "bc", "c"],
      ["aaa", "aab", "aba", "abb", "baa"],
      ...Array.from({ length: 40 }, (_, i) => randomAc(i + 1).words),
    ];
    const bad: string[] = [];
    for (const words of dicts) {
      const A = acBuild(words);
      for (const width of [240, 300, 420])
        for (const levelH of [26, 50, 72]) {
          const L = trieAutomaton(A.nodes, {
            back: A.back,
            short: A.short,
            width,
            levelH,
            names: true,
          });
          const z = L.zoom ?? 1;
          for (const n of L.nodes) {
            if (!n.showName || n.nameX === undefined || n.nameY === undefined)
              continue;
            const w = [...n.name].length * 6.4 * z;
            const x0 = n.nameAnchor === "end" ? n.nameX - w : n.nameX;
            const box = {
              x0,
              x1: x0 + w,
              y0: n.nameY - 10 * z,
              y1: n.nameY + 2,
            };
            for (const o of L.nodes) {
              const cx = Math.max(box.x0, Math.min(o.x, box.x1));
              const cy = Math.max(box.y0, Math.min(o.y, box.y1));
              if (Math.hypot(o.x - cx, o.y - cy) < L.r - 0.5)
                bad.push(
                  `${words.join(",")} w${width} h${levelH}: ${n.name} × ${o.name}`,
                );
            }
          }
        }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
