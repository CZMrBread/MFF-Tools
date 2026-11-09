/**
 * Odkaz ?t=… zachová skutečný stav tabulky (rozhodnutí vlastníka E4, 7. 11. 2026):
 *  - otevřená adresace: náhrobky („~“) i umístění klíčů; kde to jde, zůstává starý zápis seznamem klíčů,
 *  - kukačka: skutečné buňky i po Delete („_“ = prázdná buňka).
 * Staré odkazy (seznam klíčů) se čtou beze změny.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { ckBuild, ckOp, fns, mkC } from "./cuckoo";
import { buildTable, hashOp, mkTable, type HashState } from "./tables";
import {
  CUCKOO_DEFAULT,
  cuckooFromShare,
  formatCuckooShare,
  hashFromShare,
  hashShare,
  PROBE_DEFAULT,
} from "./ui";

const probe = () =>
  buildTable(
    PROBE_DEFAULT.m,
    PROBE_DEFAULT.fnId,
    PROBE_DEFAULT.seed,
    PROBE_DEFAULT.keys,
    true,
  ).state;
const run = (st: HashState, x: number, op: "insert" | "find" | "delete") =>
  materialize(hashOp(st, x, op, true));
const roundTrip = (st: HashState) => hashFromShare(hashShare(st, true), true)!;

describe("otevřená adresace: odkaz zachová náhrobky a umístění", () => {
  it("výchozí tabulka má odkaz beze změny (seznam klíčů)", () => {
    expect(hashShare(probe(), true)).toBe("16:mod:1:3,19,35,20,7,41");
  });

  it("řetězení: odkaz beze změny", () => {
    const st = buildTable(8, "mod", 1, [12, 20, 28, 7], false).state;
    expect(hashShare(st, false)).toBe("8:mod:1:12,20,28,7");
  });

  it("po Delete je náhrobek v odkazu jako „~“ a po načtení zůstane na místě", () => {
    const st = probe();
    run(st, 19, "delete");
    const text = hashShare(st, true);
    expect(text).toContain("~");
    expect(text.split(":")[3].split(",")).toHaveLength(16);
    const back = roundTrip(st);
    expect(back.cells).toEqual(st.cells);
    expect(back.cells[4]).toBe("tomb");
    expect(back.n).toBe(5);
    expect(back.vars["α = n/m"]).toBe("0,31");
    // Find(35) po načtení odkazu přeskočí náhrobek stejně jako před ním
    const steps = run(back, 35, "find");
    expect(steps[steps.length - 1].message).toContain("nalezeno v buňce 5");
  });

  it("klíč přetečený přes konec tabulky zůstane v buňce 0 (dřív se po načtení prohodil)", () => {
    const st = mkTable(10, "mod", 1);
    run(st, 9, "insert");
    run(st, 19, "insert");
    expect(st.cells[0]).toBe(19);
    expect(st.cells[9]).toBe(9);
    // jde to zapsat starým formátem – pořadí klíčů, ve kterém je načtení umístí stejně
    expect(hashShare(st, true)).toBe("10:mod:1:9,19");
    expect(roundTrip(st).cells).toEqual(st.cells);
  });

  it("plná tabulka bez náhrobků, kterou nejde postavit vkládáním, má značku „:b“", () => {
    const st = mkTable(4, "mod", 1);
    for (const x of [0, 4, 2, 3]) run(st, x, "insert");
    run(st, 0, "delete");
    run(st, 5, "insert"); // projde celou tabulku a vloží se do náhrobku v buňce 0
    expect(st.cells).toEqual([5, 4, 2, 3]);
    const text = hashShare(st, true);
    expect(text).toBe("4:mod:1:5,4,2,3:b");
    expect(roundTrip(st).cells).toEqual([5, 4, 2, 3]);
  });

  it("prázdné buňky jsou „_“; staré odkazy se seznamem klíčů platí dál", () => {
    expect(hashFromShare("4:mod:1:_,5,~,_", true)!.cells).toEqual([
      null,
      5,
      "tomb",
      null,
    ]);
    // čtyři klíče v tabulce m = 4 bez značky = starý seznam klíčů (vkládají se postupně)
    expect(hashFromShare("4:mod:1:5,4,2,3", true)!.cells).toEqual([4, 5, 2, 3]);
    expect(hashFromShare("16:mod:1:3,19,35", true)!.cells.slice(3, 6)).toEqual([
      3, 19, 35,
    ]);
  });

  it("neplatný seznam buněk se ignoruje (platí výchozí příklad)", () => {
    for (const t of [
      "4:mod:1:_,5,~", // málo buněk
      "4:mod:1:_,5,~,_,_", // moc buněk
      "4:mod:1:_,5,5,_", // opakovaný klíč
      "4:mod:1:_,4,_,_", // 4 má h = 0, ale buňka 0 je prázdná – Find by ho nenašel
      "4:mod:1:_,x,_,_",
      "4:mod:1:1,2,3,70000:b",
      "4:mod:1:_,~,~,_:x",
    ])
      expect(hashFromShare(t, true), t).toBeNull();
    // řetězení náhrobky nemá
    expect(hashFromShare("4:mod:1:_,5,~,_", false)).toBeNull();
  });
});

describe("kukačka: odkaz zachová buňky i po Delete", () => {
  const base = () =>
    ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys).state;

  it("Delete(12) a Delete(90): buňky po načtení odkazu stejné (seznam buněk s „_“)", () => {
    for (const x of [12, 90]) {
      const t = base();
      materialize(ckOp(t, x, "delete"));
      const text = formatCuckooShare(t);
      expect(text, `Delete(${x})`).toContain("_");
      expect(text.split(":")[2].split(",")).toHaveLength(16);
      const back = cuckooFromShare(text)!;
      expect(back.cells, `Delete(${x})`).toEqual(t.cells);
      expect(back.n).toBe(4);
      expect(back.seed).toBe(t.seed);
    }
  });

  it("plná tabulka bez prázdné buňky jde zapsat se značkou „:b“", () => {
    // ručně sestavená plná tabulka: m = 8, každý klíč v buňce f(x) nebo g(x)
    const st = mkC(8, 5);
    const [f, g] = fns(st);
    for (let x = 1; st.cells.includes(null) && x < 5000; x++) {
      const free = [f(x), g(x)].find((i) => st.cells[i] === null);
      if (free !== undefined && !st.cells.includes(x)) st.cells[free] = x;
    }
    expect(st.cells.includes(null)).toBe(false);
    const text = `8:5:${st.cells.join(",")}:b`;
    const back = cuckooFromShare(text)!;
    expect(back.cells).toEqual(st.cells);
    expect(back.n).toBe(8);
  });

  it("neplatný seznam buněk se ignoruje", () => {
    const t = base();
    const cells = t.cells.map((c) => (c === null ? "_" : String(c)));
    const ok = `16:3:${cells.join(",")}`;
    expect(cuckooFromShare(ok)!.cells).toEqual(t.cells);
    // klíč mimo své buňky f(x), g(x)
    const moved = [...cells];
    const i = moved.findIndex((c) => c !== "_");
    const j = moved.findIndex(
      (c, k) =>
        c === "_" && ![...fns(t)].some((h) => h(Number(moved[i])) === k),
    );
    [moved[i], moved[j]] = [moved[j], moved[i]];
    for (const bad of [
      `16:3:${moved.join(",")}`,
      `16:3:${cells.slice(1).join(",")}`, // málo buněk
      `16:3:${cells.join(",").replace("_", "~")}`, // náhrobky kukačka nemá
    ])
      expect(cuckooFromShare(bad), bad).toBeNull();
  });
});
