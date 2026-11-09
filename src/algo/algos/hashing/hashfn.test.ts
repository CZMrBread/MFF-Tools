/**
 * Hešovací funkce: rozsah hodnot, odolnost vůči neplatným klíčům a kvalita „náhodných“ funkcí.
 * Testy s „BUG:“ v názvu hlídají dříve nalezené chyby (audit, skupina Hešování).
 */
import { describe, expect, it } from "vitest";
import { formatNum } from "../../core/format";
import { rng } from "../../core/steps";
import { czNum, HASH_FNS, isKey, isPow2, KEY_MAX, keyError } from "./hashfn";

const byId = (id: string) => HASH_FNS.find((f) => f.id === id)!;
const MS = [4, 8, 16, 32];
/** Čísla, která pole type="number" propustí, ale nejsou platné klíče. */
const BAD = [
  -1,
  -2,
  -5,
  -100,
  -65535,
  1.5,
  3.5,
  -0.5,
  NaN,
  Infinity,
  -Infinity,
  65536,
  70000,
  1e15,
  1e300,
  -1e300,
];

describe("hashfn – rozsah a determinismus", () => {
  it("každá funkce zobrazuje celá čísla 0 ≤ x < 2^16 do {0, …, m−1} a je deterministická", () => {
    const r = rng(12345);
    const xs = [
      0,
      1,
      255,
      256,
      65535,
      ...Array.from({ length: 120 }, () => Math.floor(r() * 65536)),
    ];
    for (const f of HASH_FNS)
      for (const m of MS)
        for (let seed = 1; seed <= 15; seed++) {
          const h = f.make(m, seed);
          const h2 = f.make(m, seed);
          for (const x of xs) {
            const v = h(x);
            if (!(Number.isInteger(v) && v >= 0 && v < m))
              throw new Error(`${f.id} m=${m} seed=${seed}: h(${x}) = ${v}`);
            if (h2(x) !== v) throw new Error(`${f.id} není deterministická`);
          }
        }
  });

  it("BUG: žádná funkce nespadne ani nevrátí index mimo [m] pro záporné, necelé, nekonečné nebo obří x", () => {
    const bad: string[] = [];
    for (const f of HASH_FNS)
      for (const m of [1, ...MS, 64])
        for (let seed = 1; seed <= 8; seed++) {
          const h = f.make(m, seed);
          for (const x of BAD) {
            let v: number | string;
            try {
              v = h(x);
            } catch (e) {
              v = (e as Error).name;
            }
            if (!(
              typeof v === "number" &&
              Number.isInteger(v) &&
              v >= 0 &&
              v < m
            ))
              bad.push(`${f.id} m=${m} seed=${seed} h(${x}) = ${v}`);
          }
        }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it("BUG: lineární funkce vrací pro záporné i necelé x platnou přihrádku (dřív záporný index / RangeError z BigInt)", () => {
    const h = byId("linear").make(16, 3);
    for (const x of [-5, -1, -100, 1.5, 3.5]) {
      const v = h(x);
      expect(Number.isInteger(v) && v >= 0 && v < 16, `h(${x}) = ${v}`).toBe(
        true,
      );
    }
  });

  it("BUG: „x mod m“ vrací pro necelé x celý index přihrádky", () => {
    const v = byId("mod").make(8, 1)(1.5);
    expect(Number.isInteger(v) && v >= 0 && v < 8, `h(1.5) = ${v}`).toBe(true);
    expect(byId("mod").make(8, 1)(-3)).toBe(5);
  });

  it("lineární funkce dává pro platné klíče stejné hodnoty jako původní výpočet přes BigInt", () => {
    // referenční hodnoty spočítané původní implementací; na nich stojí kukaččí tabulka (seedy 3, 3 + 7919) a Bloomův filtr (5 + 31i)
    const xs = [0, 1, 2, 57, 255, 256, 999, 4242, 65535];
    const ref: Record<string, number[]> = {
      "16/3": [5, 12, 3, 11, 8, 15, 3, 5, 7],
      "16/7922": [2, 11, 4, 6, 7, 0, 9, 1, 0],
      "32/5": [22, 22, 22, 25, 5, 5, 14, 4, 22],
      "32/36": [26, 14, 1, 29, 25, 13, 25, 3, 18],
      "8/1": [3, 0, 5, 4, 5, 2, 1, 4, 2],
      "64/67": [29, 36, 42, 7, 46, 53, 28, 47, 17],
    };
    for (const [key, want] of Object.entries(ref)) {
      const [m, seed] = key.split("/").map(Number);
      expect(xs.map(byId("linear").make(m, seed)), key).toEqual(want);
    }
  });

  it("x mod m a multiply-shift odpovídají definici", () => {
    const mod = byId("mod").make(8, 1);
    for (const x of [0, 7, 8, 9, 65535]) expect(mod(x)).toBe(x % 8);
    // multiply-shift: h(0) = 0 pro každé a (rodina není 2-nezávislá)
    for (let seed = 1; seed <= 10; seed++)
      expect(byId("mulshift").make(16, seed)(0)).toBe(0);
    expect(isPow2(16)).toBe(true);
    expect(isPow2(12)).toBe(false);
  });
});

describe("hashfn – kvalita náhodných funkcí", () => {
  it("náhodné dvojice klíčů kolidují přes volbu seedu s pravděpodobností ≲ 2/m (linear, mulshift, tab)", () => {
    for (const id of ["linear", "mulshift", "tab"]) {
      const f = byId(id);
      for (const m of [8, 32]) {
        const r = rng(7);
        let coll = 0;
        let tot = 0;
        for (let t = 0; t < 60; t++) {
          const x = Math.floor(r() * 65536);
          const y = Math.floor(r() * 65536);
          if (x === y) continue;
          for (let seed = 1; seed <= 60; seed++) {
            const h = f.make(m, seed);
            tot++;
            if (h(x) === h(y)) coll++;
          }
        }
        expect(coll / tot, `${id}, m=${m}`).toBeLessThan(2 / m);
      }
    }
  });

  it("BUG: tabulační funkce nesmí poslat všechny násobky m do jedné přihrádky (tlačítko „Vložit násobky m“)", () => {
    // Pro náhodnou funkci je P[všechny v jedné přihrádce] = m^-(m/2−1): 1/512 pro m = 8, 16^-7 pro m = 16.
    const tab = byId("tab");
    for (const m of [8, 16]) {
      const keys = Array.from({ length: m / 2 }, (_, k) => (k + 1) * m);
      let allInOne = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const h = tab.make(m, seed);
        if (new Set(keys.map(h)).size === 1) allInOne++;
      }
      expect(
        allInOne,
        `m=${m}: počet seedů (z 200), kdy všechny násobky m kolidují`,
      ).toBeLessThan(20);
    }
  });

  it("BUG: tabulační funkce nesmí být periodická s periodou m (h(x) = h(x+m) pro každé x < 256)", () => {
    const tab = byId("tab");
    for (const m of MS) {
      let same = 0;
      let tot = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const h = tab.make(m, seed);
        for (let x = 0; x + m < 256; x++) {
          tot++;
          if (h(x) === h(x + m)) same++;
        }
      }
      // ideál je 1/m; dřív přesně 1,0 (tabulky se plnily dolními bity LCG mod 2^32)
      expect(same / tot, `m=${m}: podíl x s h(x) = h(x+m)`).toBeLessThan(
        1.5 / m,
      );
    }
  });

  it("BUG: rozklad klíčů < 256 na přihrádky tabulační funkcí není totožný s rozkladem „x mod m“", () => {
    const tab = byId("tab");
    const identical: string[] = [];
    for (const m of MS)
      for (let seed = 1; seed <= 100; seed++) {
        const h = tab.make(m, seed);
        const img = new Map<number, Set<number>>();
        for (let x = 0; x < 256; x++) {
          if (!img.has(x % m)) img.set(x % m, new Set());
          img.get(x % m)!.add(h(x));
        }
        const onlyResidue = [...img.values()].every((s) => s.size === 1);
        const bijection =
          new Set([...img.values()].map((s) => [...s][0])).size === m;
        if (onlyResidue && bijection) identical.push(`m=${m} seed=${seed}`);
      }
    expect(identical).toEqual([]);
  });

  it("BUG: „Nová náhodná h“ u tabulační funkce mění, které násobky m spolu kolidují", () => {
    const tab = byId("tab");
    for (const m of [4, 8, 16]) {
      const keys = Array.from(
        { length: Math.floor(m / 2) },
        (_, k) => (k + 1) * m,
      );
      const patterns = new Set<string>();
      for (let seed = 1; seed <= 100; seed++) {
        const h = tab.make(m, seed);
        const first = new Map<number, number>();
        patterns.add(
          keys
            .map((k) =>
              first.has(h(k)) ? first.get(h(k))! : (first.set(h(k), k), k),
            )
            .join(","),
        );
      }
      expect(
        patterns.size,
        `m=${m}: počet různých kolizních vzorů přes 100 seedů`,
      ).toBeGreaterThan(1);
    }
  });

  it("tabulační funkce využívá oba bajty klíče a rozděluje klíče zhruba rovnoměrně", () => {
    const tab = byId("tab");
    for (const m of [8, 32]) {
      const h = tab.make(m, 11);
      const counts = Array(m).fill(0);
      for (let x = 0; x < 65536; x++) counts[h(x)]++;
      for (const c of counts)
        expect(Math.abs(c - 65536 / m) / (65536 / m)).toBeLessThan(0.25);
      // změna jen horního bajtu musí umět změnit přihrádku
      expect(
        new Set(Array.from({ length: 256 }, (_, hi) => h(hi << 8))).size,
      ).toBeGreaterThan(1);
    }
  });
});

describe("hashfn – platnost klíče", () => {
  it("isKey / keyError přijímají právě celá čísla 0 … 65535", () => {
    for (const x of [0, 1, 42, 999, KEY_MAX]) {
      expect(isKey(x)).toBe(true);
      expect(keyError(x)).toBeNull();
    }
    for (const x of BAD) {
      expect(isKey(x), String(x)).toBe(false);
      expect(keyError(x), String(x)).toMatch(/celé číslo od 0 do 65535/);
    }
    expect(keyError(-5)).toContain("zadáno: −5)");
    expect(keyError(1.5)).toContain("zadáno: 1,5)");
    expect(keyError(-Infinity)).toContain("zadáno: −∞)");
    expect(keyError(NaN)).toContain("nečíselná hodnota");
    expect(czNum(9 / 16)).toBe("0,56");
    expect(czNum(3.14159, 1)).toBe("3,1");
  });
});

describe("čísla na stránkách hešování (E3: desetinná čárka, jeden formátovač)", () => {
  it("czNum je formatNum s pevným počtem míst – i záporná nula a nekonečno", () => {
    for (const [v, d] of [
      [0.5, 2],
      [2 / 3, 1],
      [-0.001, 2],
      [12.5, 1],
      [Infinity, 2],
    ] as const)
      expect(czNum(v, d), String(v)).toBe(formatNum(v, d));
    expect(czNum(-0.001)).toBe("0,00");
  });
});
