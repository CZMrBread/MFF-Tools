/*
 * Náhled Goldbergova algoritmu na úvodní stránce kreslí krok z dat (bez běhu algoritmu – logika zůstane
 * v líném chunku stránky). Data musí být přesně krok výchozího příkladu modulu (obr. 14.2): převedení
 * po hraně a→c z výšky 3 do 2.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { goldberg } from "./goldberg";
import { goldbergPreviewData } from "./goldbergPreviewData";

describe("náhled Goldbergova algoritmu", () => {
  it("data náhledu = krok „Převedeme přebytek po hraně a→c (h 3 → 2)“ výchozího příkladu", () => {
    const { net, state, hMax } = goldbergPreviewData();
    const steps = materialize(goldberg(net));
    const step = steps.find((s) =>
      s.message.startsWith("Převedeme přebytek po hraně a→c (h 3 → 2)"),
    )!;
    expect(step).toBeDefined();
    const pick = (s: typeof state) => ({
      f: s.f,
      h: s.h,
      ex: s.ex,
      P: s.P,
      u: s.u,
      push: s.push,
      lift: s.lift,
      value: s.value,
    });
    expect(pick(state)).toEqual(pick(step.state));
    expect(hMax).toBe(8);
  });
});
