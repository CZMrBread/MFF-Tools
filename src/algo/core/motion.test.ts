// Plynulé přechody mezi kroky – čisté funkce: jaký pohyb nastal (přehrávání / ruční krok / skok) a jak
// dlouho má přechod trvat. Délka se odvozuje z rychlosti přehrávače a nikdy nepřesáhne interval mezi kroky.
import { describe, expect, it } from "vitest";
import {
  leavingEntries,
  MANUAL_MS,
  MAX_STEP_MS,
  motionOf,
  stepTransitionMs,
  colorTransitionMs,
} from "./motion";
import { SPEEDS } from "./player";

describe("motionOf – druh posunu přehrávače", () => {
  it("tick = přehrávání, Další/Zpět = ruční krok", () => {
    expect(motionOf("tick", 2, 3, undefined)).toBe("play");
    expect(motionOf("next", 2, 3, undefined)).toBe("step");
    expect(motionOf("prev", 3, 2, "play")).toBe("step");
  });

  it("posuvník, Home/End a návrat na začátek = skok (bez animace), i o jediný krok", () => {
    expect(motionOf("seek", 2, 3, "step")).toBe("jump");
    expect(motionOf("seek", 2, 40, "step")).toBe("jump");
    expect(motionOf("first", 9, 0, "play")).toBe("jump");
    expect(motionOf("last", 0, 9, undefined)).toBe("jump");
    expect(motionOf("play", 9, 0, "step")).toBe("jump");
  });

  it("beze změny kroku (pauza, ▶ uprostřed) zůstává předchozí druh – běžící přechod se neutne", () => {
    expect(motionOf("pause", 4, 4, "play")).toBe("play");
    expect(motionOf("play", 4, 4, "step")).toBe("step");
    expect(motionOf("toggle", 4, 4, undefined)).toBeUndefined();
  });
});

describe("stepTransitionMs – délka přechodu", () => {
  it("nová sada kroků (undefined) a skok = 0 ms", () => {
    expect(stepTransitionMs(undefined, 500, false)).toBe(0);
    expect(stepTransitionMs("jump", 500, false)).toBe(0);
  });

  it("omezit pohyb (prefers-reduced-motion) = vždy 0 ms", () => {
    for (const m of ["play", "step", "jump", undefined] as const)
      expect(stepTransitionMs(m, 2000, true)).toBe(0);
  });

  it("ruční krok má krátký pevný přechod", () => {
    expect(MANUAL_MS).toBeGreaterThan(0);
    expect(MANUAL_MS).toBeLessThanOrEqual(250);
    expect(stepTransitionMs("step", 2000, false)).toBe(MANUAL_MS);
    expect(stepTransitionMs("step", 50, false)).toBe(MANUAL_MS);
  });

  it("přehrávání: kratší při rychlejší rychlosti, nikdy delší než interval mezi kroky ani než MAX_STEP_MS", () => {
    const ds = SPEEDS.map((s) => stepTransitionMs("play", s.ms, false));
    for (let i = 1; i < ds.length; i++)
      expect(ds[i]).toBeLessThanOrEqual(ds[i - 1]);
    SPEEDS.forEach((s, i) => {
      expect(ds[i]).toBeLessThan(s.ms);
      expect(ds[i]).toBeLessThanOrEqual(MAX_STEP_MS);
    });
    // 1× (500 ms) se viditelně animuje
    expect(stepTransitionMs("play", 500, false)).toBeGreaterThanOrEqual(200);
  });

  it("přechod kratší než ~2 snímky se nevyplatí → 0 (8× = 50 ms)", () => {
    expect(stepTransitionMs("play", 50, false)).toBe(0);
  });

  it("neplatná prodleva → 0", () => {
    expect(stepTransitionMs("play", NaN, false)).toBe(0);
    expect(stepTransitionMs("play", -5, false)).toBe(0);
  });

  it("barvy se přelévají nejvýš tak dlouho jako pohyb a nejvýš 250 ms", () => {
    expect(colorTransitionMs(0)).toBe(0);
    expect(colorTransitionMs(120)).toBe(120);
    expect(colorTransitionMs(600)).toBe(250);
  });
});

describe("leavingEntries – prvky, které z kresby zmizely (dožijí se odchodu)", () => {
  it("vrací položky předchozí kresby, které v nové chybí, v původním pořadí", () => {
    const prev = new Map([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    const next = new Map([
      [3, "c"],
      [4, "d"],
    ]);
    expect(leavingEntries(prev, next)).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });

  it("nic nezmizelo → prázdné pole", () => {
    const m = new Map([[1, "a"]]);
    expect(leavingEntries(m, new Map(m))).toEqual([]);
  });
});
