/*
 * Rabin–Karp (Průvodce 13.4, str. 330–331): heš H s kódováním a = 1, …, z = 26, klouzavý přepočet
 * (P · h − σ[i] · P^J + σ[i + J]) mod N, falešné shody a kroky vizualizace.
 */
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { materialize, rng } from "../../core/steps";
import { naiveFind } from "./kmp";
import { hitsWord } from "./pageModel";
import {
  cleanRkText,
  gcd,
  letterCode,
  MAX_RK_NEEDLE,
  PC_RK,
  rkHash,
  rkHashes,
  rkPow,
  rkRoll,
  rkRun,
  rkSteps,
  rkValidate,
} from "./rabinKarp";

const randomWord = (r: () => number, alpha: string, min: number, max: number) =>
  Array.from(
    { length: min + Math.floor(r() * (max - min + 1)) },
    () => alpha[Math.floor(r() * alpha.length)],
  ).join("");

describe("heš a přepočet (str. 330)", () => {
  it("kódování a = 1, …, z = 26; H(kokos) = 36 a P^J mod N = 95 pro P = 31, N = 101", () => {
    expect(letterCode("a")).toBe(1);
    expect(letterCode("z")).toBe(26);
    expect(rkHash("kokos", 31, 101)).toBe(36);
    expect(rkPow(31, 5, 101)).toBe(95);
  });

  it("heše okének kokos / clanekokokosu: N = 101 bez kolize, N = 17 falešná shoda okoko", () => {
    expect(rkHashes("clanekokokosu", 5, 31, 101)).toEqual([
      71, 8, 32, 100, 68, 28, 40, 36, 92,
    ]);
    expect(rkHashes("clanekokokosu", 5, 31, 17)).toEqual([
      10, 13, 2, 10, 4, 7, 15, 15, 14,
    ]);
    expect(rkHash("kokos", 31, 17)).toBe(15);
    expect(rkPow(31, 5, 17)).toBe(12);
  });

  it("ana / bananas, N = 13: heše [4, 5, 5, 5, 10], H(ana) = 5, P^J mod N = 8", () => {
    expect(rkHashes("bananas", 3, 31, 13)).toEqual([4, 5, 5, 5, 10]);
    expect(rkHash("ana", 31, 13)).toBe(5);
    expect(rkPow(31, 3, 13)).toBe(8);
  });

  it("klouzavý přepočet dá totéž co přímý výpočet H, i se zápornými mezivýsledky", () => {
    const r = rng(5);
    for (let t = 0; t < 300; t++) {
      const N = 2 + Math.floor(r() * 500);
      let P = 2 + Math.floor(r() * 200);
      while (gcd(P, N) !== 1) P++;
      const J = 1 + Math.floor(r() * 5);
      const s = randomWord(r, "abcxyz", J, 25);
      const direct = Array.from({ length: s.length - J + 1 }, (_, i) =>
        rkHash(s.slice(i, i + J), P, N),
      );
      expect(rkHashes(s, J, P, N), `${s} P=${P} N=${N}`).toEqual(direct);
    }
    // rozepsaný přepočet: (31·40 − 15·95 + 19) mod 101 = −166 mod 101 = 36
    expect(rkRoll(40, "o", "s", 31, 95, 101)).toEqual({ raw: -166, value: 36 });
  });

  it("kódování a = 1: H(aab) ≠ H(ab) pro N = 101", () => {
    expect(rkHash("aab", 31, 101)).not.toBe(rkHash("ab", 31, 101));
  });
});

describe("rkRun – výskyty, falešné shody, počítadla", () => {
  it("N = 17: falešná shoda v i = 6 (okoko), výskyt v i = 7", () => {
    const r = rkRun("kokos", "clanekokokosu", 31, 17);
    expect(r.found).toEqual([7]);
    expect(r.falseHits).toEqual([6]);
    expect(r.count.hashCmp).toBe(9);
  });

  it("bananas, N = 13: výskyty [1, 3], falešná shoda [2] (nan); N = 101 bez kolize", () => {
    const r = rkRun("ana", "bananas", 31, 13);
    expect(r.found).toEqual([1, 3]);
    expect(r.falseHits).toEqual([2]);
    expect(rkRun("ana", "bananas", 31, 101).falseHits).toEqual([]);
  });

  it("výskyty se shodují s naivním hledáním pro každé N (i N = 2); falešná shoda nikdy není výskyt", () => {
    const r = rng(11);
    for (let t = 0; t < 300; t++) {
      const N = [2, 3, 7, 13, 101][t % 5];
      const P = N === 31 ? 2 : 31;
      const j = randomWord(r, "ab", 1, 4);
      const s = randomWord(r, "ab", 0, 25);
      const run = rkRun(j, s, P, N);
      expect(run.found).toEqual(naiveFind(j, s));
      for (const f of run.falseHits) expect(run.found).not.toContain(f);
    }
  });

  it("hashCmp = S − J + 1; charCmp jen u okének s h = j – aaa / aaaaaaaa: 18", () => {
    const r = rkRun("aaa", "aaaaaaaa", 31, 101);
    expect(r.count.hashCmp).toBe(6);
    expect(r.count.charCmp).toBe(18);
    expect(r.found).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("validace (str. 330: P nesoudělné s N, P^J ≫ N)", () => {
  it("gcd(26, 13) ≠ 1 → chyba s vysvětlením; N = 1 a P < 2 nejdou", () => {
    expect(gcd(26, 13)).toBe(13);
    expect(rkValidate(26, 13, 3, 7).error).toMatch(
      /nesoudělná.*gcd\(26, 13\) = 13/,
    );
    expect(rkValidate(31, 101, 5, 13).error).toBeNull();
    expect(rkValidate(31, 1, 5, 13).error).not.toBeNull();
    expect(rkValidate(1, 101, 5, 13).error).not.toBeNull();
  });

  it("N ≤ S·J a P^J ≤ N jsou jen poznámky", () => {
    const v = rkValidate(31, 17, 5, 13);
    expect(v.error).toBeNull();
    expect(v.notes.join(" ")).toContain("falešné shody");
    expect(rkValidate(2, 101, 3, 20).notes.join(" ")).toContain("řádově větší");
    expect(rkValidate(31, 101, 5, 13).notes).toEqual([]);
  });

  it("text jen a–z: velká písmena se převedou s poznámkou, jiné znaky jsou chyba; zkrácení", () => {
    expect(cleanRkText("Kokos", 12)).toEqual({
      value: "kokos",
      note: "Velká písmena převedena na malá.",
      error: null,
    });
    expect(cleanRkText("ko kos", 12).value).toBe("kokos");
    expect(cleanRkText("kočka", 12).error).toMatch(/a–z/);
    expect(cleanRkText("a".repeat(20), MAX_RK_NEEDLE).value).toHaveLength(
      MAX_RK_NEEDLE,
    );
    expect(cleanRkText("", 12).error).not.toBeNull();
  });
});

describe("rkSteps – kroky", () => {
  const L = (prefix: string) =>
    PC_RK.findIndex((l) => l.trimStart().startsWith(prefix));

  it("řádky: předvýpočet, heš jehly, první okénko, smyčka, porovnání hešů, znaků, přepočet", () => {
    const st = materialize(rkSteps("kokos", "clanekokokosu", 31, 101));
    const lines = new Set(st.map((x) => x.line));
    for (const p of [
      "Zvolíme",
      "j ←",
      "h ← H",
      "Pro i",
      "Je-li",
      "Pokud σ",
      "h ← (P",
    ])
      expect(lines.has(L(p)), p).toBe(true);
    expect(st[0].line).toBe(L("Zvolíme"));
    const roll = st.find((x) => x.line === L("h ← (P") && x.state.i === 6);
    expect(roll?.message).toContain("(31·40 − 15·95 + 19) mod 101");
    expect(roll?.message).toContain("= 36");
    const fin = st[st.length - 1].state;
    expect(fin.found).toEqual([7]);
    expect(fin.hashes).toEqual([71, 8, 32, 100, 68, 28, 40, 36, 92]);
    expect(fin.count.falseHits).toBe(0);
  });

  it("zprávy kroků jsou prostý text: mocniny horním indexem (31⁵), žádné ^", () => {
    const st = materialize(rkSteps("kokos", "clanekokokosu", 31, 101));
    for (const x of st) expect(x.message).not.toContain("^");
    expect(st[0].message).toContain("31⁵ mod 101 = 95");
  });

  it("N = 17: verdikt falešné shody u i = 6 a výskyt u i = 7", () => {
    const fin = materialize(rkSteps("kokos", "clanekokokosu", 31, 17)).at(
      -1,
    )!.state;
    expect(fin.verdicts).toEqual({ 6: "false", 7: "hit" });
    expect(fin.count.falseHits).toBe(1);
  });

  it("soudělná P, N: jediný chybový krok; J > S: žádné okénko; J = S: bez přepočtu", () => {
    const bad = materialize(rkSteps("ana", "bananas", 26, 13));
    expect(bad).toHaveLength(1);
    expect(bad[0].error).toBe(true);
    const long = materialize(rkSteps("kokosy", "kokos", 31, 101));
    expect(long.at(-1)!.message).toContain("delší než seno");
    expect(long.at(-1)!.state.found).toEqual([]);
    const same = materialize(rkSteps("kokos", "kokos", 31, 101));
    expect(same.some((x) => x.line === L("h ← (P"))).toBe(false);
    expect(same.at(-1)!.state.found).toEqual([0]);
  });

  it("pseudokód: mocniny ve složených závorkách nebo jednoslovné, žádné ^( a čísla řádků z knihy", () => {
    for (const l of PC_RK) {
      expect(l).not.toMatch(/[\^_]\(/);
      expect(l.trimStart()).not.toMatch(/^\d+\./);
      expect(parseMath(l).length).toBeGreaterThan(0);
    }
    expect(PC_RK[0]).toContain("RabinKarp");
  });
});

describe("skloňování počtu výskytů (NEWMODS-07)", () => {
  const last = (needle: string, text: string) =>
    materialize(rkSteps(needle, text, 31, 101)).at(-1)!.message;
  it("29 výskytů, 2 výskyty, 1 výskyt", () => {
    expect(last("aa", "a".repeat(30))).toContain("29 výskytů");
    expect(last("aa", "aaa")).toContain("2 výskyty");
    expect(last("aa", "aab")).toContain("1 výskyt");
    expect(hitsWord(5)).toBe("5 výskytů");
    expect(hitsWord(0)).toBe("žádný výskyt");
  });
});
