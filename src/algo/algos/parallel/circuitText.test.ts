// Textový zápis hradlové sítě (Import / export, odkaz, Vytvořit ▸ Vlastní): formát, round-trip, chyby.
import { describe, expect, it } from "vitest";
import { structureKey } from "./circuit";
import { BOOK_PRESETS, majority, randomCircuit } from "./circuitPresets";
import { circuitText, oneLine, parseCircuitText } from "./circuitText";

const MAJ = `in x, y, z
A1 = and(y, x)
A2 = and(x, z)
A3 = and(z, y)
O1 = or(A1, A2)
O2 = or(O1, A3)
out q = O2`;

describe("circuitText – export", () => {
  it("majorita z obr. 15.1", () => {
    expect(circuitText(majority())).toBe(MAJ);
  });

  it("jednořádková podoba odděluje příkazy středníkem", () => {
    expect(oneLine(MAJ)).toBe(
      "in x, y, z; A1 = and(y, x); A2 = and(x, z); A3 = and(z, y); O1 = or(A1, A2); O2 = or(O1, A3); out q = O2",
    );
  });

  it("nezapojený port je „_“, výstup bez vstupu „out q“", () => {
    const r = parseCircuitText("in a\nG = and(a, _)\nout q");
    expect(r.errors).toEqual([]);
    expect(circuitText(r.circuit)).toBe("in a\nG = and(a, _)\nout q");
  });
});

describe("parseCircuitText – round-trip", () => {
  it("všechny knižní předvolby a náhodné sítě", () => {
    const nets = [
      ...BOOK_PRESETS.map((p) => p.build()),
      ...[1, 2, 3, 4, 5].map((s) => randomCircuit(3, 6, s)),
    ];
    for (const c of nets) {
      const r = parseCircuitText(circuitText(c));
      expect(r.errors).toEqual([]);
      expect(structureKey(r.circuit)).toBe(structureKey(c));
      const r1 = parseCircuitText(oneLine(circuitText(c)));
      expect(structureKey(r1.circuit)).toBe(structureKey(c));
    }
  });

  it("odkazy dopředu, velká písmena, komentáře, mezery i čárky ve vstupech", () => {
    const r = parseCircuitText(
      "# majorita\nout q = O2\nO2 = OR(O1, A3)  // dolní\nO1 = or(A1,A2)\nin x y\nin z\nA1=and(y,x); A2 = and(x, z); A3 = And(z, y)",
    );
    expect(r.errors).toEqual([]);
    expect(r.circuit.nodes.map((n) => n.id)).toEqual([
      "x",
      "y",
      "z",
      "O2",
      "O1",
      "A1",
      "A2",
      "A3",
      "q",
    ]);
    expect(structureKey({ nodes: sortLike(r.circuit.nodes) })).toBe(
      structureKey({ nodes: sortLike(majority().nodes) }),
    );
  });

  it("prázdný text = prázdná síť (editor)", () => {
    const r = parseCircuitText("  \n# nic\n");
    expect(r.errors).toEqual([]);
    expect(r.circuit.nodes).toEqual([]);
  });
});

/** pořadí vrcholů podle jména – klíč struktury pak nezávisí na pořadí řádků */
function sortLike<T extends { id: string }>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}

describe("parseCircuitText – srozumitelné chyby s číslem řádku", () => {
  const err = (t: string) => parseCircuitText(t).errors.map((e) => e.message);

  it("neznámé hradlo", () => {
    expect(err("in a, b\nG = andd(a, b)\nout q = G")).toEqual([
      "Řádek 2: neznámé hradlo „andd“ – použijte and, or, not, nand, nor, xor.",
    ]);
  });
  it("špatný počet vstupů", () => {
    expect(err("in a, b\nG = not(a, b)\nout q = G")).toEqual([
      "Řádek 2: not má 1 vstup, zadány 2.",
    ]);
    expect(err("in a\nG = and(a)\nout q = G")).toEqual([
      "Řádek 2: and má 2 vstupy, zadán 1.",
    ]);
  });
  it("dvakrát stejné jméno", () => {
    expect(err("in a, b\na = and(a, b)\nout q = a")).toEqual([
      "Řádek 2: jméno „a“ už je použité.",
    ]);
  });
  it("neplatné jméno a neznámý tvar řádku", () => {
    expect(err("in a, 2b")).toEqual([
      "Řádek 1: „2b“ není platné jméno (písmeno, pak písmena, číslice nebo _).",
    ]);
    expect(err("in a\nkdovíco")[0]).toMatch(
      /^Řádek 2: nerozumím řádku „kdovíco“ – očekávám/,
    );
  });
  it("neexistující zdroj a výstup jako zdroj", () => {
    expect(err("in a\nG = not(w)\nout q = G")).toEqual([
      "Řádek 2: vstup „w“ hradla G neexistuje.",
    ]);
    expect(err("in a\nout q = a\nG = not(q)\nout r = G")).toEqual([
      "Řádek 3: „q“ je výstup sítě – z výstupu nevedou hrany.",
    ]);
  });
  it("cyklus odmítne s cestou a vysvětlením", () => {
    expect(err("in a\nG1 = and(a, G2)\nG2 = not(G1)\nout q = G2")).toEqual([
      "Síť obsahuje cyklus G1 → G2 → G1 – hradlová síť musí být acyklická (výstup hradla se nesmí vrátit na jeho vstup).",
    ]);
  });
  it("příliš velká síť", () => {
    const names = Array.from({ length: 9 }, (_, i) => `x${i}`).join(", ");
    expect(err(`in ${names}`)[0]).toMatch(/nejvýše 8 vstupů/);
  });
});

describe("jednořádkový zápis (odkaz c=, Vytvořit ▸ Vlastní)", () => {
  it("chyba hlásí pořadí příkazu, ne „Řádek 1“", () => {
    const r = parseCircuitText("in x; A1 = and(x, zz); out q = A1");
    expect(r.errors.map((e) => e.message)).toEqual([
      "Příkaz 2: vstup „zz“ hradla A1 neexistuje.",
    ]);
  });
  it("komentář platí jen do konce svého příkazu, další příkazy zůstanou", () => {
    const r = parseCircuitText("in x # vstup; out q = x");
    expect(r.errors).toEqual([]);
    expect(r.circuit.nodes.map((n) => n.id)).toEqual(["x", "q"]);
  });
  it("víceřádkový text dál hlásí řádek", () => {
    const r = parseCircuitText("in x\nA1 = and(x, zz)\nout q = A1");
    expect(r.errors[0].message).toMatch(/^Řádek 2: /);
  });
});

describe("parseCircuitText – pořadí chyb (NEWMODS-19)", () => {
  it("chyby seřazené podle čísla řádku (ř. 2 před ř. 4), chyby bez řádku na konci", () => {
    const r = parseCircuitText(
      ["in a", "G = and(a, x)", "out q = G", "H = ???"].join("\n"),
    );
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(r.errors[0].line).toBe(2);
    const lines = r.errors.map((e) => e.line ?? Infinity);
    expect(lines).toEqual([...lines].sort((p, q) => p - q));
  });
});
