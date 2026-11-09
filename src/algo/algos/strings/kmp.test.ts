/*
 * Knuth–Morris–Pratt (Průvodce 13.2, str. 320–324): zpětná funkce Z, běh automatu a kroky vizualizace.
 * Očekávané hodnoty jsou z knihy (obr. 13.1, příklad kokos, úvod kap. 13) – viz bookStrings.fixtures.ts.
 */
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { materialize, rng } from "../../core/steps";
import {
  cleanHaystack,
  cleanNeedle,
  ENDMARK,
  kmpRun,
  kmpSteps,
  kmpTable,
  MAX_HAYSTACK,
  MAX_NEEDLE,
  naiveComparisons,
  naiveFind,
  pseudocodeForPhase,
  PC_KMP_BUILD,
  PC_KMP_SEARCH,
  type KmpState,
} from "./kmp";
import type { Step } from "../../core/steps";

/** Z z definice: nejdelší vlastní sufix ι[:s], který je prefixem ι (hrubou silou). */
function bruteZ(p: string): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let s = 1; s <= p.length; s++) {
    const w = p.slice(0, s);
    let best = 0;
    for (let l = s - 1; l > 0; l--)
      if (w.endsWith(p.slice(0, l))) {
        best = l;
        break;
      }
    out.push(best);
  }
  return out;
}

const randomWord = (r: () => number, alpha: string, min: number, max: number) =>
  Array.from(
    { length: min + Math.floor(r() * (max - min + 1)) },
    () => alpha[Math.floor(r() * alpha.length)],
  ).join("");

const steps = (
  j: string,
  s: string,
  mode: "all" | "build" | "search" = "all",
) => materialize(kmpSteps(j, s, mode));
const last = (st: Step<KmpState>[]) => st[st.length - 1].state;

describe("kmpTable – zpětná funkce (obr. 13.1)", () => {
  it("barbarossa = [–, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0] jako na obr. 13.1", () => {
    expect(kmpTable("barbarossa")).toEqual([
      null,
      0,
      0,
      0,
      1,
      2,
      3,
      0,
      0,
      0,
      0,
    ]);
  });

  it("kokos, ana, aaab, abrakadabra (str. 319–324)", () => {
    expect(kmpTable("kokos")).toEqual([null, 0, 0, 1, 2, 0]);
    expect(kmpTable("ana")).toEqual([null, 0, 0, 1]);
    expect(kmpTable("aaab")).toEqual([null, 0, 1, 2, 0]);
    expect(kmpTable("abrakadabra")).toEqual([
      null,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      1,
      2,
      3,
      4,
    ]);
    expect(kmpTable("a")).toEqual([null, 0]);
  });

  it("pro 500 náhodných slov nad {a, b, c} se shoduje s definicí z knihy", () => {
    const r = rng(13);
    for (let t = 0; t < 500; t++) {
      const w = randomWord(r, "abc", 1, 12);
      expect(kmpTable(w), w).toEqual(bruteZ(w));
    }
  });
});

describe("kmpRun – běh automatu na seně", () => {
  it("kokos v clanekokokosu: stavy, výskyt na pozici 7 a věta ze str. 321", () => {
    const r = kmpRun("kokos", "clanekokokosu");
    expect(r.states).toEqual([0, 0, 0, 0, 0, 1, 2, 3, 4, 3, 4, 5, 0]);
    expect(r.found).toEqual([7]);
    // „po přečtení sena clanekoko se nacházíme ve stavu koko, následují stavy kok, koko a kokos“
    expect(r.states[8]).toBe(4);
    expect(r.states.slice(9, 12)).toEqual([3, 4, 5]);
    // 2 zpětné kroky (4 → 2 a 5 → 0), 7 dopředných, 15 porovnání ι[s] s x
    expect(r.count).toEqual({ fwd: 7, back: 2, cmp: 15 });
  });

  it("ana v bananas: překrývající se výskyty 1 a 3; v anna žádný (str. 319)", () => {
    expect(kmpRun("ana", "bananas").found).toEqual([1, 3]);
    expect(kmpRun("ana", "bananas").states).toEqual([0, 1, 2, 3, 2, 3, 0]);
    expect(kmpRun("ana", "anna").found).toEqual([]);
    expect(kmpRun("ana", "anna").states).toEqual([1, 2, 0, 1]);
    expect(kmpRun("aaaa", "aaaaaaaa").found).toEqual([0, 1, 2, 3, 4]);
  });

  it("výskyty se pro náhodné vstupy shodují s naivním hledáním; lemma back ≤ fwd ≤ S", () => {
    const r = rng(7);
    for (let t = 0; t < 400; t++) {
      const j = randomWord(r, "ab", 1, 5);
      const s = randomWord(r, "ab", 0, 30);
      const run = kmpRun(j, s);
      expect(run.found, `${j} v ${s}`).toEqual(naiveFind(j, s));
      expect(run.count.back).toBeLessThanOrEqual(run.count.fwd);
      expect(run.count.fwd).toBeLessThanOrEqual(s.length);
    }
  });

  it("zarážka ι[J]: znak ⊥ v seně nehlásí falešnou shodu", () => {
    expect(kmpRun("ab", `ab${ENDMARK}ab`).found).toEqual([0, 3]);
    expect(kmpRun("a", "aaa").found).toEqual([0, 1, 2]);
  });

  it("naivní algoritmus na aaab / aaaaaaaaaa: 28 porovnání, KMP 17 (cvičení 1, str. 324)", () => {
    expect(naiveComparisons("aaab", "aaaaaaaaaa")).toBe(28);
    expect(kmpRun("aaab", "aaaaaaaaaa").count.cmp).toBe(17);
    expect(naiveComparisons("kokos", "clanekokokosu")).toBe(17);
  });
});

describe("kmpSteps – kroky konstrukce a hledání", () => {
  it("příklad z knihy = JEDNA sada kroků: nejdřív stavba automatu, pak hledání v seně", () => {
    const st = steps("kokos", "clanekokokosu");
    const phases = st.map((x) => x.state.phase);
    const firstSearch = phases.indexOf("search");
    expect(phases[0]).toBe("build");
    expect(firstSearch).toBeGreaterThan(0);
    expect(phases.slice(firstSearch).every((p) => p === "search")).toBe(true);
    expect(last(st).Z).toEqual([null, 0, 0, 1, 2, 0]);
    expect(last(st).found).toEqual([7]);
    expect(st[st.length - 1].message).toContain("1 výskyt");
  });

  it("každý krok ukazuje na existující řádek pseudokódu své fáze; žádný krok nespouští nic samo", () => {
    for (const [j, s] of [
      ["kokos", "clanekokokosu"],
      ["barbarossa", "barbarbarossa"],
      ["a", ""],
      ["aaab", "aaaaaaaaaa"],
    ]) {
      for (const x of steps(j, s)) {
        const pc = pseudocodeForPhase(x.state.phase);
        if (x.line !== null) {
          expect(x.line).toBeGreaterThanOrEqual(0);
          expect(x.line).toBeLessThan(pc.length);
        }
      }
    }
  });

  it("konstrukce: Z[i] se zapíše na řádku „Z[i] ← s“ v pořadí i = 2 … J; u barbarossa jediná zpětná hrana 3 → 0 u znaku o", () => {
    const st = steps("barbarossa", "", "build");
    const writeLine = PC_KMP_BUILD.findIndex((l) => l.includes("Z[i] ← s"));
    const writes = st.filter((x) => x.line === writeLine);
    expect(writes.map((x) => x.state.zCol)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const backs = st.filter((x) => x.state.edge?.kind === "back");
    expect(backs.map((x) => [x.state.edge?.from, x.state.edge?.to])).toEqual([
      [3, 0],
    ]);
    expect(backs[0].state.text[backs[0].state.k!]).toBe("o");
  });

  it("bootstrapping: při zpracování ι[i − 1] je stav vždy menší než i (automat nesáhne na nehotovou hranu)", () => {
    const r = rng(3);
    for (let t = 0; t < 100; t++) {
      const w = randomWord(r, "ab", 2, 10);
      for (const x of steps(w, "", "build"))
        if (x.state.phase === "build" && x.state.k !== null)
          expect(x.state.s).toBeLessThan(x.state.k + 1);
    }
  });

  it("hledání: zpětná hrana na řádku Dokud, dopředná na řádku Pokud, výskyt na „Pokud s = J“; kokos 4 → 2 a výskyt 7", () => {
    const st = steps("kokos", "clanekokokosu", "search");
    const L = {
      loop: PC_KMP_SEARCH.findIndex((l) => l.startsWith("  Dokud")),
      fwd: PC_KMP_SEARCH.findIndex((l) => l.startsWith("  Pokud ι[s] = x")),
      hit: PC_KMP_SEARCH.findIndex((l) => l.includes("Pokud s = J")),
    };
    expect(Object.values(L).every((i) => i >= 0)).toBe(true);
    for (const x of st) {
      if (x.state.edge?.kind === "back") expect(x.line).toBe(L.loop);
      if (x.state.edge?.kind === "fwd") expect(x.line).toBe(L.fwd);
    }
    const back42 = st.find(
      (x) => x.state.edge?.kind === "back" && x.state.edge.from === 4,
    );
    expect(back42?.state.edge?.to).toBe(2);
    expect(back42?.message).toMatch(/4 → Z\[4\] = 2/);
    const hit = st.find((x) => x.line === L.hit);
    expect(hit?.message).toContain("pozici 7");
    expect(last(st).count).toEqual({ fwd: 7, back: 2, cmp: 15 });
  });

  it("posun jehly: při porovnání stojí ι[s] pod čteným znakem (posun = k − s), po zpětné hraně se posune doprava o s − Z[s]", () => {
    const st = steps("kokos", "clanekokokosu", "search");
    for (const x of st) {
      const { k, shift, cmp } = x.state;
      if (k !== null && cmp) expect(shift + cmp.i, x.message).toBe(k);
    }
    const i = st.findIndex(
      (x) => x.state.edge?.kind === "back" && x.state.edge.from === 4,
    );
    expect(st[i].state.shift - st[i - 1].state.shift).toBe(2);
  });

  it("prázdné seno: hledání skončí bez výskytu; J > S nehlásí nic", () => {
    expect(last(steps("abc", "", "search")).found).toEqual([]);
    expect(last(steps("abcdef", "abc")).found).toEqual([]);
  });

  it("navazující čtení znaku (inkrementální režim, str. 320): po kokos/clanekokokos + „u“ je stav 0", () => {
    const st = materialize(kmpSteps("kokos", "clanekokokosu", "search", 12));
    expect(st[0].state.s).toBe(5);
    expect(st[0].state.found).toEqual([7]);
    expect(last(st).s).toBe(0);
    expect(last(st).found).toEqual([7]);
    expect(st.every((x) => x.state.k === null || x.state.k === 12)).toBe(true);
  });
});

describe("vstup a sazba", () => {
  it("jehla bez mezer, nejvýše MAX_NEEDLE znaků; seno nejvýše MAX_HAYSTACK znaků (s poznámkou)", () => {
    expect(cleanNeedle(" ko kos ")).toEqual({
      value: "kokos",
      note: "Mezery z jehly vynechány.",
    });
    expect(cleanNeedle("a".repeat(MAX_NEEDLE + 3)).value).toHaveLength(
      MAX_NEEDLE,
    );
    expect(cleanNeedle("a".repeat(MAX_NEEDLE + 3)).note).toContain(
      String(MAX_NEEDLE),
    );
    expect(cleanHaystack("x".repeat(MAX_HAYSTACK + 1)).value).toHaveLength(
      MAX_HAYSTACK,
    );
    expect(cleanNeedle("Kokos").value).toBe("Kokos");
    expect(cleanNeedle(" ").value).toBe("");
  });

  it("pseudokód z knihy: žádný řádek nezačíná knižním číslem ani nemá ^( / _( ", () => {
    for (const l of [...PC_KMP_BUILD, ...PC_KMP_SEARCH]) {
      expect(l.trimStart()).not.toMatch(/^\d+\./);
      expect(l).not.toMatch(/[\^_]\(/);
      expect(parseMath(l).length).toBeGreaterThan(0);
    }
    expect(PC_KMP_SEARCH[0]).toContain("KmpHledej");
    expect(PC_KMP_BUILD[0]).toContain("KmpKonstrukce");
    expect(PC_KMP_SEARCH.some((l) => l.includes("Procedura KmpKrok"))).toBe(
      true,
    );
  });
});
