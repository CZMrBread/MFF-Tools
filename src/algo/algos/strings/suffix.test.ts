import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  build,
  cleanAlpha,
  cleanBeta,
  commitAlpha,
  kasai,
  MAX_ALPHA,
  patternFor,
  PC_BUILD,
  PC_KASAI,
  PC_SEARCH,
  phaseTitle,
  pseudocodeFor,
  randomAlpha,
  search,
  suffixSteps,
  type SAState,
} from "./suffix";

/** porovnání, ve kterém je $ nejmenší znak */
const key = (t: string) => t.replace(/\$/g, "\u0000");
const cmp = (a: string, b: string) =>
  key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
const bruteSA = (s: string) =>
  Array.from({ length: s.length }, (_, i) => i).sort((a, b) =>
    cmp(s.slice(a), s.slice(b)),
  );
const lcp = (a: string, b: string) => {
  let l = 0;
  while (l < a.length && l < b.length && a[l] === b[l]) l++;
  return l;
};
const bruteOcc = (text: string, beta: string) => {
  const out: number[] = [];
  for (let i = 0; i + beta.length <= text.length; i++)
    if (text.startsWith(beta, i)) out.push(i);
  return out;
};
/** definice z přednášky (L05, slide 13–14): R_k[i] = počet pozic j s α[j:j+k] < α[i:i+k] */
const lectureR = (s: string, k: number) =>
  Array.from({ length: s.length }, (_, i) => {
    let c = 0;
    for (let j = 0; j < s.length; j++)
      if (cmp(s.slice(j, j + k), s.slice(i, i + k)) < 0) c++;
    return c;
  });
const randomWord = (r: () => number, alphabet: string, maxLen: number) =>
  Array.from(
    { length: 1 + Math.floor(r() * maxLen) },
    () => alphabet[Math.floor(r() * alphabet.length)],
  ).join("");

const built = (w: string): SAState => {
  const steps = suffixSteps(w, { kind: "build" });
  return steps[steps.length - 1].state;
};
const found = (w: string, beta: string) => {
  const steps = suffixSteps(w, { kind: "search", beta });
  return Object.entries(steps[steps.length - 1].state.rowMarks)
    .filter(([, c]) => c === "row-found")
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
};

const WORDS = [
  "a",
  "aa",
  "ab",
  "ba",
  "aaaaaaaa",
  "abababab",
  "banana",
  "barokoarokoko",
  "mississippi",
  "abracadabra",
  "Aa",
  "žluťoučký",
  "a".repeat(MAX_ALPHA),
];
for (let seed = 1; seed <= 30; seed++)
  WORDS.push(
    randomWord(rng(seed), ["ab", "abc", "abcdefgh"][seed % 3], MAX_ALPHA),
  );

describe("sufixové pole – stavba zdvojováním", () => {
  it("X je správné sufixové pole, každý sloupec R_k odpovídá definici z přednášky a výsledné R je inverze X", () => {
    for (const w of WORDS) {
      const st = built(w);
      const s = w + "$";
      expect(st.s).toBe(s);
      expect(st.X).toEqual(bruteSA(s));
      expect(st.rounds.map((r) => r.k)).toEqual(
        st.rounds.map((_, idx) => 2 ** idx),
      );
      for (const { k, R } of st.rounds)
        expect(R, `${w}, k = ${k}`).toEqual(lectureR(s, k));
      // X[R[i]] = i, jak tvrdí pseudokód i popis (dřív bylo R číslované od 1)
      const R = st.rounds[st.rounds.length - 1].R;
      expect(R.map((r) => st.X![r])).toEqual(R.map((_, i) => i));
    }
  });

  it("sloupce R_k pro „banana“ jsou čísla ze slidu přednášky", () => {
    const st = built("banana");
    const byK = Object.fromEntries(st.rounds.map((r) => [r.k, r.R]));
    expect(byK[1]).toEqual([4, 1, 5, 1, 5, 1, 0]);
    expect(byK[2]).toEqual([4, 2, 5, 2, 5, 1, 0]);
    expect(byK[4]).toEqual([4, 3, 6, 2, 5, 1, 0]);
    expect(st.X).toEqual([6, 5, 3, 1, 0, 4, 2]);
  });

  it("krok „Dvojice“ ukáže tříděné dvojice (dřív se stav neměnil) – pro banana a k = 1 jako na slidu", () => {
    const steps = materialize(build("banana"));
    const idx = steps.findIndex((s) => s.message.startsWith("Dvojice (R"));
    expect(idx).toBeGreaterThan(0);
    expect(steps[idx].state).not.toEqual(steps[idx - 1].state);
    expect(steps[idx].line).toBe(4);
    expect(PC_BUILD[4]).toContain("dvojici");
    // slide 13: i → dvojice; „–“ (mimo řetězec) = −1
    expect(steps[idx].state.pairs).toEqual({
      k: 1,
      list: [
        [4, 1],
        [1, 5],
        [5, 1],
        [1, 5],
        [5, 1],
        [1, 0],
        [0, -1],
      ],
    });
    // dvojice zůstanou vidět vedle nového sloupce R₂ a po dokončení zmizí
    expect(steps[idx + 1].state.pairs?.k).toBe(1);
    expect(steps[idx + 1].state.rounds.map((r) => r.k)).toEqual([1, 2]);
    expect(steps[steps.length - 1].state.pairs).toBeNull();
  });

  it("pseudokód popisuje i ukončení při různých pořadích a zvýrazněné řádky existují", () => {
    expect(PC_BUILD[3]).toMatch(/k < n/);
    expect(PC_BUILD[3]).toMatch(/shodná/);
    for (const w of [
      "a",
      "aa",
      "banana",
      "mississippi",
      "a".repeat(MAX_ALPHA),
    ]) {
      const steps = materialize(build(w));
      for (const s of steps)
        expect(s.line === null || PC_BUILD[s.line] !== undefined).toBe(true);
      // závěrečný krok bez řádku shrne výsledek, před ním inverze R a zdůvodnění ukončení na řádku s podmínkou cyklu
      const last = steps[steps.length - 1];
      expect(last.line).toBeNull();
      expect(last.message).toContain(`X = (${bruteSA(w + "$").join(", ")})`);
      expect(steps[steps.length - 2].line).toBe(7);
      expect(PC_BUILD[7]).toContain("X[R[i]] = i");
      expect(steps[steps.length - 3].line).toBe(3);
      expect(steps[steps.length - 3].message).toMatch(/všechna pořadí různá/);
      // každé kolo zdvojování proběhne jen tehdy, když ještě existují shodná pořadí
      const st = last.state;
      st.rounds
        .slice(0, -1)
        .forEach((r) => expect(new Set(r.R).size).toBeLessThan(st.s.length));
      expect(new Set(st.rounds[st.rounds.length - 1].R).size).toBe(st.s.length);
    }
    // značení přednášky: n = |α|
    expect(materialize(build("banana"))[0].message).toMatch(/n = 6/);
    expect(PC_BUILD[0]).toContain("n = |α|");
  });

  it("vstup se čistí i uvnitř generátoru: $ a mezery pryč, nejvýše MAX_ALPHA znaků, nic nezacyklí", () => {
    expect(cleanAlpha(" ba na$na ")).toEqual({
      value: "banana",
      removed: true,
      truncated: false,
    });
    expect(cleanAlpha("x".repeat(40))).toEqual({
      value: "x".repeat(MAX_ALPHA),
      removed: false,
      truncated: true,
    });
    expect(cleanAlpha("")).toEqual({
      value: "",
      removed: false,
      truncated: false,
    });
    for (const w of ["$$", "$", "", "a$a", "ab ".repeat(5000), "\t\n"]) {
      const steps = materialize(build(w));
      const st = steps[steps.length - 1].state;
      const s = cleanAlpha(w).value + "$";
      expect(st.s).toBe(s);
      expect(st.X).toEqual(bruteSA(s));
      expect(steps.length).toBeLessThan(40);
    }
  });
});

describe("sufixové pole – Kasai", () => {
  it("LCP pole odpovídá hrubé síle", () => {
    for (const w of WORDS) {
      const steps = suffixSteps(w, { kind: "kasai" });
      const st = steps[steps.length - 1].state;
      const s = w + "$";
      expect(st.X).toEqual(bruteSA(s));
      expect(st.L).toEqual(
        Array.from({ length: s.length - 1 }, (_, j) =>
          lcp(s.slice(st.X![j]), s.slice(st.X![j + 1])),
        ),
      );
      for (const step of steps)
        expect(step.line === null || PC_KASAI[step.line] !== undefined).toBe(
          true,
        );
      // po dokončení nezůstane nic zvýrazněného
      expect(st.rowMarks).toEqual({});
      expect(st.cmp).toBeUndefined();
    }
    // tabulka z přednášky (slide 6)
    const banana = suffixSteps("banana", { kind: "kasai" });
    expect(banana[banana.length - 1].state.L).toEqual([0, 1, 3, 0, 0, 2]);
  });

  it("řádek „pokud j = n“ sedí na zobrazené proměnné (n = |α|, pořadí 0…n)", () => {
    const steps = suffixSteps("banana", { kind: "kasai" });
    const step = steps.find((s) => s.message.includes("poslední"))!;
    expect(step.line).toBe(3);
    expect(PC_KASAI[3]).toMatch(/j = n,/);
    expect(PC_KASAI[2]).toMatch(/i = 0, …, n:/);
    // n = |α| = 6 a poslední sufix v pořadí má j = 6
    expect(step.state.vars.j).toBe(6);
    expect(step.state.vars.j).toBe(step.state.s.length - 1);
    // každý krok „L[j] ← l“ má v proměnných právě zapsanou hodnotu
    for (const s of steps.filter((x) => x.line === 6))
      expect(s.state.L![Number(s.state.vars.j)]).toBe(s.state.vars.l);
  });

  it("bez postaveného X dá hlášku místo prázdného seznamu kroků", () => {
    const empty: SAState = {
      s: "ab$",
      rounds: [],
      pairs: null,
      X: null,
      L: null,
      rowMarks: {},
      colMark: null,
      sortedView: false,
      vars: {},
    };
    expect(materialize(kasai(structuredClone(empty)))).toHaveLength(1);
    expect(materialize(search(structuredClone(empty), "a"))).toHaveLength(1);
  });
});

describe("sufixové pole – hledání vzorku", () => {
  it("najde přesně všechny výskyty (písmenná abeceda, 40 náhodných slov)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 31);
      const alphabet = ["ab", "abc"][seed % 2];
      const w = randomWord(r, alphabet, MAX_ALPHA);
      for (let q = 0; q < 3; q++) {
        const beta =
          r() < 0.5
            ? randomWord(r, alphabet, 4)
            : w
                .slice(Math.floor(r() * w.length))
                .slice(0, 1 + Math.floor(r() * 5));
        expect(found(w, beta), `α = ${w}, β = ${beta}`).toEqual(
          bruteOcc(w, beta),
        );
      }
    }
    expect(found("banana", "ana")).toEqual([1, 3]);
    expect(found("banana", "banana")).toEqual([0]);
    expect(found("banana", "bananas")).toEqual([]);
    expect(found("banana", "x")).toEqual([]);
    expect(found("banana", "A")).toEqual([]);
    expect(found("banana", "a")).toEqual([1, 3, 5]);
  });

  it('funguje i pro znaky s kódem menším než „$“ (! " #) – porovnává se stejným pořadím jako při stavbě', () => {
    expect(found("!!", "!!")).toEqual([0]);
    expect(found("a!a!", "!")).toEqual([1, 3]);
    // sufix „x!$“ je kratší než β; nativní porovnání s „$“ by ho zařadilo ZA „x!!“
    expect(found("x!!x!", "x!!")).toEqual([0]);
    for (const alphabet of ["a!#", "a%~Z", '"#!']) {
      for (let seed = 1; seed <= 40; seed++) {
        const r = rng(seed * 17);
        const w = randomWord(r, alphabet, 12);
        const beta = w
          .slice(Math.floor(r() * w.length))
          .slice(0, 1 + Math.floor(r() * 3));
        expect(found(w, beta), `α = ${w}, β = ${beta}`).toEqual(
          bruteOcc(w, beta),
        );
      }
    }
  });

  it("prázdný vzorek (i β = „$“ nebo mezery) nic „nenajde“ a řekne proč", () => {
    for (const beta of ["$", "", "  ", "$$ $"]) {
      expect(cleanBeta(beta)).toBe("");
      const steps = suffixSteps("banana", { kind: "search", beta });
      expect(steps).toHaveLength(1);
      expect(steps[0].message).toMatch(/prázdný/);
      expect(Object.values(steps[0].state.rowMarks)).not.toContain("row-found");
    }
    expect(cleanBeta(" a $na ")).toBe("ana");
    // příliš dlouhý vzorek se nemůže vyskytovat – žádné obří zprávy
    const long = suffixSteps("banana", {
      kind: "search",
      beta: "a".repeat(5000),
    });
    expect(long).toHaveLength(1);
    expect(long[0].message.length).toBeLessThan(200);
  });

  it("kroky hledání: řádky pseudokódu existují a proměnné lo/hi odpovídají zprávě", () => {
    const steps = suffixSteps("mississippi", { kind: "search", beta: "ssi" });
    for (const s of steps)
      expect(s.line === null || PC_SEARCH[s.line] !== undefined).toBe(true);
    expect(steps[0].state.vars).toMatchObject({ lo: 0, hi: 12 });
    expect(PC_SEARCH[1]).toContain("hi ← n + 1");
    // po kroku „lo ← mid + 1 / hi ← mid“ už proměnné ukazují nové meze
    for (const s of steps.filter((x) => x.line === 5)) {
      const { lo, hi, mid } = s.state.vars as {
        lo: number;
        hi: number;
        mid: number;
      };
      expect(lo === mid + 1 || hi === mid).toBe(true);
      expect(s.message).toMatch(lo === mid + 1 ? /lo ← mid \+ 1/ : /hi ← mid/);
    }
    const last = steps[steps.length - 1];
    expect(last.state.vars["výskytů"]).toBe(2);
    expect(last.message).toMatch(/na pozicích 2, 5/);
  });
});

describe("sufixové pole – navázání operací na vstup", () => {
  it("Kasai / hledání vždy převezmou aktuální text z pole α (dřív běžely nad starým řetězcem)", () => {
    const c = commitAlpha("mississippi", "banana", true);
    expect(c.alpha).toBe("mississippi");
    expect(c.note).toMatch(/mississippi/);
    const steps = suffixSteps(c.alpha!, { kind: "search", beta: "ssi" });
    expect(steps[steps.length - 1].state.s).toBe("mississippi$");
    // beze změny žádná hláška; čištění vstupu se oznámí; prázdné α se nepostaví
    expect(commitAlpha("banana", "banana", true)).toEqual({
      alpha: "banana",
      note: "",
    });
    expect(commitAlpha("mississippi", "banana")).toEqual({
      alpha: "mississippi",
      note: "",
    });
    expect(commitAlpha("ba na$na", "banana").note).toMatch(/odstranili/);
    expect(commitAlpha("x".repeat(30), "banana").note).toMatch(/zkrátili/);
    expect(commitAlpha(" $ ", "banana").alpha).toBeNull();
    expect(commitAlpha("", "banana").note).toMatch(/neprázdný/);
  });

  it("pseudokód odpovídá fázi", () => {
    expect(pseudocodeFor({ kind: "build" })).toBe(PC_BUILD);
    expect(pseudocodeFor({ kind: "kasai" })).toBe(PC_KASAI);
    expect(pseudocodeFor({ kind: "search", beta: "a" })).toBe(PC_SEARCH);
  });
});

describe("sufixové pole – závěrečné kroky, chyby a navázání hledání na Kasai", () => {
  it("Kasai i hledání končí krokem bez řádku pseudokódu, který shrne výsledek", () => {
    const k = suffixSteps("banana", { kind: "kasai" });
    const kl = k[k.length - 1];
    expect(kl.line).toBeNull();
    expect(kl.message).toMatch(
      /^LCP pole pro „banana“: L = \(0, 1, 3, 0, 0, 2\)\./,
    );
    const s = suffixSteps("banana", { kind: "search", beta: "ana" });
    expect(s[s.length - 1].line).toBeNull();
    expect(s[s.length - 1].message).toMatch(
      /^Hledání „ana“: nalezeno 2× – na pozicích 1, 3\./,
    );
    expect(s[s.length - 2].line).toBe(6);
    const none = suffixSteps("banana", { kind: "search", beta: "x" });
    expect(none[none.length - 1].message).toBe(
      "Hledání „x“: vzorek se v řetězci nevyskytuje.",
    );
    expect(materialize(build("a")).at(-1)!.message).toMatch(
      /zdvojovat nebylo potřeba/,
    );
    expect(materialize(build("banana")).at(-1)!.message).toMatch(/po 2 kolech/);
    // tip na stránce: mississippi potřebuje tři kola (k = 1, 2, 4)
    expect(materialize(build("mississippi")).at(-1)!.message).toMatch(
      /po 3 kolech/,
    );
  });

  it("neprovedená operace (bez X, prázdný či příliš dlouhý vzorek) je jediný chybový krok", () => {
    const empty: SAState = {
      s: "ab$",
      rounds: [],
      pairs: null,
      X: null,
      L: null,
      rowMarks: {},
      colMark: null,
      sortedView: false,
      vars: {},
    };
    expect(materialize(kasai(structuredClone(empty)))[0].error).toBe(true);
    expect(materialize(search(structuredClone(empty), "a"))[0].error).toBe(
      true,
    );
    expect(suffixSteps("banana", { kind: "search", beta: "$" })[0].error).toBe(
      true,
    );
    expect(
      suffixSteps("banana", { kind: "search", beta: "a".repeat(30) })[0].error,
    ).toBe(true);
    expect(
      suffixSteps("banana", { kind: "search", beta: "ana" }).some(
        (s) => s.error,
      ),
    ).toBe(false);
  });

  it("hledání po Kasai zachová sloupec L (dřív zmizel) a najde totéž", () => {
    for (const w of ["banana", "mississippi", "abracadabra"]) {
      const kasaiL = suffixSteps(w, { kind: "kasai" }).at(-1)!.state.L;
      for (const beta of ["a", "ss", "bra", "x"]) {
        const plain = suffixSteps(w, { kind: "search", beta });
        const withL = suffixSteps(w, { kind: "search", beta }, true);
        expect(plain.at(-1)!.state.L).toBeNull();
        for (const s of withL) expect(s.state.L).toEqual(kasaiL);
        expect(withL.at(-1)!.state.rowMarks).toEqual(
          plain.at(-1)!.state.rowMarks,
        );
        expect(withL.map((s) => s.message)).toEqual(
          plain.map((s) => s.message),
        );
      }
    }
  });

  it("náhodné α je deterministické a krátké, navržený vzorek se v α vyskytuje", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = randomAlpha(seed);
      expect(a).toBe(randomAlpha(seed));
      expect(a.length).toBeGreaterThanOrEqual(8);
      expect(a.length).toBeLessThanOrEqual(MAX_ALPHA);
      expect(cleanAlpha(a).value).toBe(a);
      const b = patternFor(a, seed);
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(a.includes(b)).toBe(true);
    }
    expect(patternFor("ab", 1)).toBe("ab");
  });

  it("název operace obsahuje argumenty", () => {
    expect(phaseTitle("banana", { kind: "build" })).toBe(
      "Stavba X zdvojováním: α = „banana“",
    );
    expect(phaseTitle("banana", { kind: "kasai" })).toContain("Kasai");
    expect(phaseTitle("banana", { kind: "search", beta: " a$na" })).toBe(
      "Hledání vzorku β = „ana“ v α = „banana“",
    );
  });
});

describe("dlouhý vzorek β (NEWMODS-12)", () => {
  it("hláška porovná |β| se skutečnou délkou α", () => {
    const steps = suffixSteps("Banana", {
      kind: "search",
      beta: "x".repeat(36),
    });
    const msg = steps[steps.length - 1].message;
    expect(msg).toContain("Vzorek β má 36 znaků");
    expect(msg).toContain("řetězec α jen 6");
    // β delší než α, ale kratší než 24: také se nemůže vyskytovat
    const short = suffixSteps("ab", { kind: "search", beta: "aba" });
    expect(short[short.length - 1].message).toContain("řetězec α jen 2");
  });
});
