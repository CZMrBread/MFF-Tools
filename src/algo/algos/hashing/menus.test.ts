/**
 * Model nabídek operací stránek hešování (menus.ts): které akce stránka nabízí, s jakými argumenty
 * a výchozími hodnotami, kdy jsou zakázané a jaký příkaz stránce předají.
 */
import { describe, expect, it } from "vitest";
import type {
  ActionDef,
  ChoiceArgDef,
  IntArgDef,
  ListArgDef,
} from "../../core/actionModel";
import { blBuild } from "./bloom";
import { ckBuild } from "./cuckoo";
import { HASH_FNS } from "./hashfn";
import {
  bloomMenu,
  clampKeys,
  cuckooMenu,
  hashMenu,
  rehashTitle,
  type HashCmd,
} from "./menus";
import { buildTable, storedKeys } from "./tables";
import {
  BLOOM_DEFAULT,
  CHAIN_DEFAULT,
  CUCKOO_DEFAULT,
  PROBE_DEFAULT,
} from "./ui";

const chain = () => buildTable(8, "mod", 1, CHAIN_DEFAULT.keys, false).state;
const probe = (keys = PROBE_DEFAULT.keys, m = 16) =>
  buildTable(m, "mod", 1, keys, true).state;

function rec() {
  const cmds: HashCmd[] = [];
  return { cmds, exec: (c: HashCmd) => cmds.push(c) };
}
const byId = (defs: ActionDef[], id: string) => {
  const d = defs.find((x) => x.id === id);
  if (!d) throw new Error(`akce ${id} chybí`);
  return d;
};
const arg = (d: ActionDef, name: string, variant?: string) => {
  const args = [
    ...(d.args ?? []),
    ...(d.variants?.find((v) => v.id === variant)?.args ?? []),
  ];
  const a = args.find((x) => x.name === name);
  if (!a) throw new Error(`argument ${name} chybí`);
  return a;
};

describe("hashMenu – řetězení a otevřená adresace", () => {
  it("nabízí Vytvořit, Insert/Find/Delete(x), Přehešovat, novou h a hromadná vložení v tomto pořadí", () => {
    const defs = hashMenu({ table: chain(), probing: false, exec: () => {} });
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Insert(x)",
      "Find(x)",
      "Delete(x)",
      "Přehešovat(m, h)",
      "Nová náhodná h",
      "Vložit 4 náhodné",
      "Vložit násobky m",
    ]);
  });

  it("Find/Delete sdílí x s existujícím klíčem, Insert má vlastní pole s novým klíčem (kolize)", () => {
    const defs = hashMenu({ table: chain(), probing: false, exec: () => {} });
    for (const id of ["find", "delete"]) {
      const x = arg(byId(defs, id), "x") as IntArgDef;
      expect(x).toMatchObject({ kind: "int", min: 0, max: 65535, default: 20 });
    }
    expect(arg(byId(defs, "insert"), "xi")).toMatchObject({
      kind: "int",
      label: "x =",
      min: 0,
      max: 65535,
      default: 36,
    });
    const p = hashMenu({ table: probe(), probing: true, exec: () => {} });
    expect((arg(byId(p, "find"), "x") as IntArgDef).default).toBe(35);
    expect((arg(byId(p, "insert"), "xi") as IntArgDef).default).toBe(51);
  });

  it("Insert/Find/Delete předají operaci s klíčem", () => {
    const r = rec();
    const defs = hashMenu({ table: chain(), probing: false, exec: r.exec });
    byId(defs, "insert").run({ xi: 36 }, null);
    byId(defs, "find").run({ x: 28 }, null);
    byId(defs, "delete").run({ x: 12 }, null);
    expect(r.cmds).toEqual([
      { kind: "op", op: "insert", x: 36 },
      { kind: "op", op: "find", x: 28 },
      { kind: "op", op: "delete", x: 12 },
    ]);
  });

  it("Vytvořit: výchozí varianta Vlastní má pole A s klíči tabulky a parametry m, h; Náhodně a Prázdná bez polí", () => {
    const defs = hashMenu({ table: chain(), probing: false, exec: () => {} });
    const c = byId(defs, "create");
    expect(c.args ?? []).toEqual([]);
    expect(c.variants!.map((v) => [v.id, v.label])).toEqual([
      ["custom", "Vlastní"],
      ["random", "Náhodně"],
      ["empty", "Prázdná"],
    ]);
    expect(c.variants![0].args!.map((a) => a.name)).toEqual(["A", "m", "h"]);
    expect(arg(c, "A", "custom")).toMatchObject({
      kind: "list",
      default: storedKeys(chain(), false), // pořadí podle přihrádek jako dřívější pole „Klíče“
      allowEmpty: true,
      min: 0,
      max: 65535,
    });
    const m = arg(c, "m", "custom") as ChoiceArgDef;
    expect(m.options.map((o) => o.value)).toEqual(["4", "8", "10", "16", "32"]);
    expect(m.default).toBe("8");
    const h = arg(c, "h", "custom") as ChoiceArgDef;
    expect(h.options.map((o) => o.value)).toEqual(HASH_FNS.map((f) => f.id));
    expect(h.options[0].label).toBe("x mod m (dělení)");
    expect(h.default).toBe("mod");
    expect(c.variants![1].args ?? []).toEqual([]);
    expect(c.variants![2].args ?? []).toEqual([]);
  });

  it("Vytvořit předá klíče a parametry; Náhodně a Prázdná použijí parametry tabulky", () => {
    const r = rec();
    const c = byId(
      hashMenu({ table: chain(), probing: false, exec: r.exec }),
      "create",
    );
    c.run({ A: [1, 2], m: "16", h: "tab" }, "custom");
    c.run({}, "random");
    c.run({}, "empty");
    expect(r.cmds).toEqual([
      { kind: "build", how: "custom", keys: [1, 2], m: 16, fn: "tab" },
      { kind: "build", how: "random", keys: [], m: 8, fn: "mod" },
      { kind: "build", how: "empty", keys: [], m: 8, fn: "mod" },
    ]);
  });

  it("Přehešovat(m, h) předá nové parametry, Nová náhodná h nové semínko; u x mod m je zakázaná", () => {
    const r = rec();
    const defs = hashMenu({ table: chain(), probing: false, exec: r.exec });
    byId(defs, "rehash").run({ m: "16", h: "linear" }, null);
    expect(r.cmds).toEqual([{ kind: "rehash", m: 16, fn: "linear" }]);
    expect(byId(defs, "reseed").disabledReason).toContain(
      "x mod m nemá náhodné parametry",
    );
    const lin = buildTable(8, "linear", 4, [1, 2], false).state;
    const r2 = rec();
    const d2 = hashMenu({ table: lin, probing: false, exec: r2.exec });
    expect(byId(d2, "reseed").disabledReason ?? null).toBeNull();
    byId(d2, "reseed").run({}, null);
    expect(r2.cmds).toEqual([{ kind: "reseed" }]);
    // výchozí hodnoty polí přehešování = parametry tabulky
    expect((arg(byId(d2, "rehash"), "h") as ChoiceArgDef).default).toBe(
      "linear",
    );
  });

  it("otevřená adresace: Přehešovat nenabízí m menší než počet klíčů", () => {
    const st = probe([1, 2, 3, 4, 5, 6], 8);
    const defs = hashMenu({ table: st, probing: true, exec: () => {} });
    const m = arg(byId(defs, "rehash"), "m") as ChoiceArgDef;
    expect(m.options.map((o) => o.value)).toEqual(["8", "10", "16", "32"]);
    expect(byId(defs, "rehash").title).toContain("menší m než počet klíčů");
  });

  it("plná tabulka zakáže Insert a hromadná vložení, prázdná Delete – s vysvětlením", () => {
    const full = probe([0, 1, 2, 3], 4);
    const defs = hashMenu({ table: full, probing: true, exec: () => {} });
    expect(byId(defs, "insert").disabledReason).toContain(
      "Tabulka je plná (n = m = 4)",
    );
    expect(byId(defs, "random").disabledReason).toBe("Tabulka je plná.");
    expect(byId(defs, "multiples").disabledReason).toContain(
      "volných buněk jen 0",
    );
    const empty = buildTable(8, "mod", 1, [], false).state;
    const e = hashMenu({ table: empty, probing: false, exec: () => {} });
    expect(byId(e, "delete").disabledReason).toBe("Tabulka je prázdná.");
    expect(byId(e, "find").disabledReason ?? null).toBeNull();
  });

  it("hromadná vložení předají příkaz; popisek násobků vyjmenuje klíče", () => {
    const r = rec();
    const defs = hashMenu({ table: chain(), probing: false, exec: r.exec });
    expect(byId(defs, "multiples").title).toContain("8, 16, 24");
    byId(defs, "random").run({}, null);
    byId(defs, "multiples").run({}, null);
    expect(r.cmds).toEqual([
      { kind: "bulk", what: "random", count: 4 },
      { kind: "bulk", what: "multiples", count: 0 },
    ]);
  });

  it("rehashTitle pojmenuje změnu jako dřív (m = 16 / h: tabulační / obojí)", () => {
    const st = chain();
    expect(rehashTitle(st, 16, "mod")).toBe("m = 16");
    expect(rehashTitle(st, 8, "tab")).toBe("h: tabulační");
    expect(rehashTitle(st, 16, "tab")).toBe("m = 16, h: tabulační");
    expect(rehashTitle(st, 8, "mod")).toBe("Přehešovat");
  });

  it("clampKeys: řetězení pojme nejvýše 2m klíčů, zbytek vrátí", () => {
    expect(clampKeys([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, "chain")).toEqual({
      keys: [1, 2, 3, 4, 5, 6, 7, 8],
      extra: [9, 10],
    });
    expect(clampKeys([1, 2], 4, "chain")).toEqual({ keys: [1, 2], extra: [] });
  });
});

describe("cuckooMenu", () => {
  const ck = () =>
    ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys).state;

  it("akce, výchozí x = 57 a hromadné operace s popisky jako dřív", () => {
    const defs = cuckooMenu({ table: ck(), exec: () => {} });
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Insert(x)",
      "Find(x)",
      "Delete(x)",
      "Přehešovat(m)",
      "Vložit 5 náhodných",
      "Doplnit na 60 % (n = 9)",
      "Vynutit cyklus",
    ]);
    expect((arg(byId(defs, "find"), "x") as IntArgDef).default).toBe(57);
    const c = byId(defs, "create");
    expect(c.variants![0].args!.map((a) => a.name)).toEqual(["A", "m"]);
    expect(arg(c, "A", "custom").kind).toBe("list");
    expect(
      (arg(c, "m", "custom") as ChoiceArgDef).options.map((o) => o.value),
    ).toEqual(["8", "16", "32"]);
  });

  it("příkazy: operace, stavba, přehešování a hromadné operace", () => {
    const r = rec();
    const defs = cuckooMenu({ table: ck(), exec: r.exec });
    byId(defs, "insert").run({ xi: 5 }, null);
    byId(defs, "create").run({ A: [3], m: "8" }, "custom");
    byId(defs, "create").run({}, "random");
    byId(defs, "rehash").run({ m: "32" }, null);
    byId(defs, "fill").run({}, null);
    byId(defs, "cycle").run({}, null);
    expect(r.cmds).toEqual([
      { kind: "op", op: "insert", x: 5 },
      { kind: "build", how: "custom", keys: [3], m: 8 },
      { kind: "build", how: "random", keys: [], m: 16 },
      { kind: "rehash", m: 32 },
      { kind: "bulk", what: "fill", count: 9 },
      { kind: "bulk", what: "cycle", count: 3 },
    ]);
  });

  it("zákazy: Doplnit při n ≥ 60 %, cyklus bez 3 volných míst, Delete na prázdné", () => {
    const full = ckBuild(8, 3, [1, 2, 3, 4, 5, 6]).state;
    const defs = cuckooMenu({ table: full, exec: () => {} });
    if (full.n >= 4)
      expect(byId(defs, "fill").disabledReason).toContain("není co doplňovat");
    if (full.n + 3 > 8)
      expect(byId(defs, "cycle").disabledReason).toBe(
        "V tabulce už nejsou 3 volná místa.",
      );
    const empty = cuckooMenu({
      table: ckBuild(8, 3, []).state,
      exec: () => {},
    });
    expect(byId(empty, "delete").disabledReason).toBe("Tabulka je prázdná.");
  });
});

describe("bloomMenu", () => {
  const bl = () =>
    blBuild(BLOOM_DEFAULT.m, BLOOM_DEFAULT.k, BLOOM_DEFAULT.keys).state;

  it("Insert a Lookup(x) s výchozím 17, Vytvořit s m a k, Přestavit(m, k) a testy", () => {
    const defs = bloomMenu({ table: bl(), exec: () => {} });
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Insert(x)",
      "Lookup(x)",
      "Přestavit(m, k)",
      "Vložit 6 náhodných",
      "Otestovat 10 nevložených",
    ]);
    expect((arg(byId(defs, "lookup"), "x") as IntArgDef).default).toBe(17);
    const c = byId(defs, "create");
    expect(c.variants!.map((v) => v.label)).toEqual([
      "Vlastní",
      "Náhodně",
      "Prázdný",
    ]);
    expect(c.variants![0].args!.map((a) => a.name)).toEqual(["A", "m", "k"]);
    expect(
      (arg(c, "k", "custom") as ChoiceArgDef).options.map((o) => o.value),
    ).toEqual(["1", "2", "3", "4", "5"]);
    expect((arg(c, "A", "custom") as ListArgDef).default).toEqual([17, 42, 99]);
  });

  it("příkazy", () => {
    const r = rec();
    const defs = bloomMenu({ table: bl(), exec: r.exec });
    byId(defs, "lookup").run({ x: 5 }, null);
    byId(defs, "create").run({ A: [1], m: "64", k: "2" }, "custom");
    byId(defs, "create").run({}, "empty");
    byId(defs, "resize").run({ m: "16", k: "3" }, null);
    byId(defs, "foreign").run({}, null);
    expect(r.cmds).toEqual([
      { kind: "op", op: "lookup", x: 5 },
      { kind: "build", how: "custom", keys: [1], m: 64, k: 2 },
      { kind: "build", how: "empty", keys: [], m: 32, k: 3 },
      { kind: "rehash", m: 16, k: 3 },
      { kind: "bulk", what: "foreign", count: 10 },
    ]);
  });
});

describe("hešování – m = 10 a příklad z knihy (TREEHASH-09)", () => {
  it("otevřená adresace: Vytvořit ▸ Příklady z knihy ▸ Obr. 11.2 předá příkaz book", () => {
    const r = rec();
    const c = byId(
      hashMenu({ table: probe(), probing: true, exec: r.exec }),
      "create",
    );
    expect(c.variants!.map((v) => v.id)).toEqual([
      "custom",
      "random",
      "empty",
      "book",
    ]);
    const fig = arg(c, "fig", "book") as ChoiceArgDef;
    expect(fig.options).toEqual([{ value: "11.2", label: "Obr. 11.2" }]);
    c.run({ fig: "11.2" }, "book");
    expect(r.cmds).toEqual([{ kind: "book", id: "11.2" }]);
    // řetězení příklad z knihy nemá
    const ch = byId(
      hashMenu({ table: chain(), probing: false, exec: () => {} }),
      "create",
    );
    expect(ch.variants!.map((v) => v.id)).not.toContain("book");
  });

  it("multiply-shift s m = 10 nejde (chyba ve formuláři Vytvořit i Přehešovat)", () => {
    const defs = hashMenu({ table: chain(), probing: false, exec: () => {} });
    expect(
      byId(defs, "create").check?.(
        { A: [1], m: "10", h: "mulshift" },
        "custom",
      ),
    ).toMatch(/mocninu 2/);
    expect(
      byId(defs, "create").check?.({ A: [1], m: "10", h: "mod" }, "custom"),
    ).toBeNull();
    expect(
      byId(defs, "rehash").check?.({ m: "10", h: "mulshift" }, null),
    ).toMatch(/mocninu 2/);
  });
});
