// Co se z kroku Rabin–Karp kreslí (NEWMODS-17, NEWMODS-18): dlouhé heše, mnoho výskytů, jehla na konci.
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { rkSteps } from "./rabinKarp";
import { stackBrackets } from "../../views/textStripLayout";
import { rkBrackets, rkCollapse, rkRows, rkVars } from "./rabinKarpView";

const run = (needle: string, text: string, P: number, N: number) =>
  materialize(rkSteps(needle, text, P, N)).map((s) => s.state);

describe("rabinKarpView", () => {
  it("závěrečný krok: jehla pod posledním výskytem (kokos, N = 101 → posun 7), jako KMP", () => {
    const fin = run("kokos", "clanekokokosu", 31, 101).at(-1)!;
    expect(fin.i).toBeNull();
    const needle = rkRows(fin).find((r) => r.key === "needle")!;
    expect(needle.offset).toBe(7);
    // bez výskytu: pod posledním okénkem
    const none = run("xy", "abcd", 31, 101).at(-1)!;
    expect(rkRows(none).find((r) => r.key === "needle")!.offset).toBe(2);
    // před začátkem běhu na začátku
    const first = run("kokos", "clanekokokosu", 31, 101)[0];
    expect(rkRows(first).find((r) => r.key === "needle")!.offset).toBe(0);
  });

  it("N s víc než 3 číslicemi: řádek h pod pozicemi se nevypisuje, h aktuálního okénka je v proměnných", () => {
    const states = run("zzzzzzzzzzzz", "z".repeat(40), 31, 1000003);
    const mid = states.find((s) => s.i !== null && s.hashes[s.i!] !== null)!;
    expect(rkRows(mid).map((r) => r.key)).not.toContain("hashes");
    expect(rkVars(mid).h).toBe(mid.hashes[mid.i!]);
    // malé N: řádek h zůstává
    const small = run("kokos", "clanekokokosu", 31, 101);
    expect(rkRows(small.at(-1)!).map((r) => r.key)).toContain("hashes");
  });

  it("víc než 6 pater závorek výskytů → jedna řada značek ✓", () => {
    const fin = run("zzzzzzzzzzzz", "z".repeat(40), 31, 1000003).at(-1)!;
    expect(rkCollapse(fin)).toBe(true);
    const marks = rkBrackets(fin, true);
    expect(marks.every((b) => b.to - b.from === 1)).toBe(true);
    expect(marks.every((b) => b.label.includes("✓"))).toBe(true);
    expect(Math.max(...stackBrackets(marks).map((b) => b.row))).toBe(0);
    const few = run("kokos", "clanekokokosu", 31, 101).at(-1)!;
    expect(rkCollapse(few)).toBe(false);
  });
});
