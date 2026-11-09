/*
 * Edit2 (Průvodce 12.3, str. 308): tabulka proti obr. 12.5, rekurzivní Edit (str. 307) a Levenštejn
 * hrubou silou, rekonstrukce úprav (cvičení 12.3.3) a cesta z obr. 12.6, kroky podle řádků pseudokódu.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import { FIG_12_5, FIG_12_6_PATH } from "./dpBook.fixtures";
import {
  applyMoves,
  EDIT_LINE,
  edit2,
  edit2Steps,
  editMoves,
  editRecursive,
  isOptimalPath,
  PC_EDIT2,
  splitChars,
} from "./editDistance";

/** referenční Levenštejn (klasický řádkový výpočet zleva) */
function lev(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[y.length];
}

describe("Edit2 – obr. 12.5 (str. 308)", () => {
  it("celá tabulka T pro poutník / potemník včetně okrajů", () => {
    expect(edit2(FIG_12_5.x, FIG_12_5.y)).toEqual(FIG_12_5.T);
  });

  it("okraje: T[i, m + 1] = n − i + 1 a T[n + 1, j] = m − j + 1", () => {
    const T = edit2("abc", "de");
    expect(T.map((r) => r[2])).toEqual([3, 2, 1, 0]);
    expect(T[3]).toEqual([2, 1, 0]);
  });

  it("písmena s diakritikou jsou jiná než bez ní (í ≠ i)", () => {
    expect(edit2("í", "i")[0][0]).toBe(1);
    expect(splitChars("poutník")).toHaveLength(7);
  });
});

describe("Edit2 = rekurzivní Edit = Levenštejn", () => {
  it("úvodní příklady str. 306: koule → boule 1, koule → kdoule 1, poutník → potemník 3", () => {
    expect(edit2("koule", "boule")[0][0]).toBe(1);
    expect(edit2("koule", "kdoule")[0][0]).toBe(1);
    expect(edit2("poutník", "potemník")[0][0]).toBe(3);
  });

  it("200 náhodných dvojic nad {a, b, c}", () => {
    const r = rng(7);
    const word = () =>
      Array.from(
        { length: Math.floor(r() * 7) },
        () => "abc"[Math.floor(r() * 3)],
      ).join("");
    for (let t = 0; t < 200; t++) {
      const a = word();
      const b = word();
      const d = edit2(a, b)[0][0];
      expect(d, `${a} / ${b}`).toBe(lev(a, b));
      expect(editRecursive(a, b)).toBe(d);
    }
  });
});

describe("rekonstrukce úprav (cvičení 12.3.3)", () => {
  it("poutník → potemník: 3 úpravy, které z x opravdu udělají y", () => {
    const T = edit2(FIG_12_5.x, FIG_12_5.y);
    const moves = editMoves(FIG_12_5.x, FIG_12_5.y, T);
    expect(moves.filter((m) => m.cost === 1)).toHaveLength(3);
    expect(applyMoves(moves)).toBe(FIG_12_5.y);
    // ze stejně dobrých tahů bere ↘, pak ↓ (smazání), pak → (vložení)
    expect(moves.map((m) => m.dir).join("")).toBe("↘↘↘↘→↘↘↘");
  });

  it("cesta vyznačená na obr. 12.6 je také nejkratší (kniha volí jinou ze stejně dlouhých)", () => {
    const T = edit2(FIG_12_5.x, FIG_12_5.y);
    expect(isOptimalPath(FIG_12_5.x, FIG_12_5.y, T, [...FIG_12_6_PATH])).toBe(
      true,
    );
    expect(isOptimalPath(FIG_12_5.x, FIG_12_5.y, T, ["→", "↓"])).toBe(false);
  });

  it("náhodné dvojice: délka cesty = T[1, 1], počet úprav = T[1, 1], výsledek = y", () => {
    const r = rng(11);
    const word = () =>
      Array.from(
        { length: Math.floor(r() * 8) },
        () => "abcd"[Math.floor(r() * 4)],
      ).join("");
    for (let t = 0; t < 100; t++) {
      const a = word();
      const b = word();
      const T = edit2(a, b);
      const moves = editMoves(a, b, T);
      expect(moves.reduce((s, m) => s + m.cost, 0)).toBe(T[0][0]);
      expect(applyMoves(moves), `${a} → ${b}`).toBe(b);
    }
  });

  it("podproblém z buňky (i, j): cesta vede do pravého dolního rohu", () => {
    const T = edit2("koule", "kdoule");
    const moves = editMoves("koule", "kdoule", T, [2, 3]);
    expect(moves[0]).toMatchObject({ r: 2, c: 3 });
    expect(moves.reduce((s, m) => s + m.cost, 0)).toBe(T[2][3]);
  });
});

describe("kroky Edit2", () => {
  const steps = materialize(edit2Steps(FIG_12_5.x, FIG_12_5.y));
  const last = steps[steps.length - 1];

  it("pseudokód z knihy (str. 308) + rekonstrukce označená jako cvičení 3", () => {
    expect(PC_EDIT2[EDIT_LINE.col]).toContain("T[i, m + 1] ← n − i + 1");
    expect(PC_EDIT2[EDIT_LINE.delta]).toContain("δ ← 0");
    expect(PC_EDIT2[EDIT_LINE.min]).toContain(
      "min(δ + T[i + 1, j + 1], 1 + T[i + 1, j], 1 + T[i, j + 1])",
    );
    expect(PC_EDIT2[EDIT_LINE.walkStart]).toMatch(/cvičení 3/);
  });

  it("okraje dvěma kroky, pak na buňku krok δ (ř. 5) a krok min (ř. 6); 56 buněk = 112 kroků", () => {
    expect(steps[0].line).toBe(EDIT_LINE.col);
    expect(steps[0].state.T.map((r) => r[8])).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(steps[1].line).toBe(EDIT_LINE.row);
    expect(steps.filter((s) => s.line === EDIT_LINE.delta)).toHaveLength(56);
    expect(steps.filter((s) => s.line === EDIT_LINE.min)).toHaveLength(56);
    // vyplňuje se po řádcích zdola nahoru, zprava doleva
    const first = steps.find((s) => s.line === EDIT_LINE.min)!;
    expect(first.state.cur).toEqual([6, 7]);
  });

  it("krok min ukáže tři kandidáty a vybraný směr; zpráva má čísla", () => {
    const s = steps.find(
      (st) =>
        st.line === EDIT_LINE.min &&
        st.state.cur?.[0] === 2 &&
        st.state.cur?.[1] === 2,
    )!;
    expect(s.state.cand).toEqual({ diag: 3, down: 3, right: 3 });
    expect(s.state.pick).toBe("↘");
    expect(s.message).toContain("T[3, 3]");
    expect(s.message).toContain("= 3");
  });

  it("konec: tabulka = obr. 12.5, cesta úprav a Hotovo s počtem úprav", () => {
    expect(last.state.T).toEqual(FIG_12_5.T);
    expect(last.state.path.map((m) => m.dir).join("")).toBe("↘↘↘↘→↘↘↘");
    expect(last.message).toMatch(/^Hotovo/);
    expect(last.message).toContain("L(poutník, potemník) = 3");
    expect(steps.filter((s) => s.line === EDIT_LINE.walk)).toHaveLength(8);
  });

  it("prázdné slovo y: jen okraje, výsledek n smazání", () => {
    const s = materialize(edit2Steps("abc", ""));
    const end = s[s.length - 1];
    expect(end.state.T.map((r) => r[0])).toEqual([3, 2, 1, 0]);
    expect(end.message).toContain("= 3");
    expect(end.state.path.every((m) => m.kind === "delete")).toBe(true);
  });
});
