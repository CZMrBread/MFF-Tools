// Zprávy kroků FFT, FFT2 a násobení polynomů jsou prostý text jako u textových algoritmů: žádné ^
// (exponent ω = exp(2πi/n)), komplexní činitelé součinu v závorkách, FFT2 s čárkou za n.
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { fftSteps, ifftSteps, toField } from "./fft";
import { fft2Steps } from "./fft2";
import { mulSteps } from "./polyMul";

const msgs = (steps: { message: string }[]) => steps.map((s) => s.message);

describe("zprávy kroků FFT – prostý text", () => {
  const all = [
    ...msgs(materialize(fftSteps(toField([0, 1, 2, 3, 4, 5, 6, 7], "C"), "C"))),
    ...msgs(materialize(ifftSteps(toField([1, 2, 3, 4], "C"), "C"))),
    ...msgs(
      materialize(fft2Steps(toField([0, 1, 2, 3, 4, 5, 6, 7], "C"), "C")),
    ),
    ...msgs(materialize(fft2Steps(toField([1, 2, 3, 4], "Z17"), "Z17"))),
    ...msgs(materialize(mulSteps([3, 2, 1], [6, 5, 4], "C", "bf"))),
    ...msgs(materialize(mulSteps([3, 2, 1], [6, 5, 4], "Z17", "bf"))),
  ];
  it("žádné ^ ani e^( ve zprávách", () => {
    expect(all.length).toBeGreaterThan(50);
    for (const m of all) expect(m).not.toContain("^");
  });

  it("bodový součin (3, 2, 1) · (6, 5, 4): komplexní a záporní činitelé v závorkách", () => {
    const pw = msgs(
      materialize(mulSteps([3, 2, 1], [6, 5, 4], "C", "bf")),
    ).filter((m) => /^R\(x/.test(m));
    expect(pw).toHaveLength(8);
    expect(pw[0]).toBe("R(x₀) = P(x₀) · Q(x₀) = 6 · 15 = 90.");
    expect(pw[1]).toMatch(
      /= \(4\.41\+2\.41i\) · \(9\.54\+7\.54i\) = 23\.9\+56\.28i\.$/,
    );
    // každý činitel se znaménkem uvnitř je obalený
    for (const m of pw) {
      const rhs = m.split(" = ")[2];
      for (const f of rhs.split(" · "))
        if (/.[+−]/.test(f) || f.startsWith("−")) expect(f).toMatch(/^\(.*\)$/);
    }
  });

  it("FFT2: „pro n = 8, ω = exp(2πi/8) = …“", () => {
    const m0 = msgs(
      materialize(fft2Steps(toField([0, 1, 2, 3, 4, 5, 6, 7], "C"), "C")),
    )[0];
    expect(m0).toMatch(/^FFT2 pro n = 8, ω = exp\(2πi\/8\) = /);
    const z0 = msgs(
      materialize(fft2Steps(toField([1, 2, 3, 4], "Z17"), "Z17")),
    )[0];
    expect(z0).toMatch(/^FFT2 pro n = 4 v ℤ₁₇, ω = 4/);
  });
});
