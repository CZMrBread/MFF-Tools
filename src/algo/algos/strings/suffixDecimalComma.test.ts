// E3 (rozhodnutí vlastníka 7. 11. 2026): zobrazená čísla s desetinnou čárkou. Rabin–Karp, sufixové pole
// a bezzámkový zásobník počítají jen s celými čísly – hlídáme, že žádný krok nevypíše desetinnou tečku.
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { abaScenario, initial } from "../parallel/lockfree";
import { RK_EXAMPLES } from "./bookStrings";
import { rkSteps } from "./rabinKarp";
import { rkVars } from "./rabinKarpView";
import { suffixSteps } from "./suffix";

const DECIMAL_POINT = /\d\.\d/;
const texts = (
  steps: { message: string; state: unknown }[],
  vars?: (s: never) => object,
) =>
  steps.flatMap((s) => [
    s.message,
    ...Object.values(
      vars
        ? vars(s.state as never)
        : ((s.state as { vars?: object }).vars ?? {}),
    ).map(String),
  ]);

describe("E3: žádná desetinná tečka v krocích (Rabin–Karp, sufixové pole, bezzámkový zásobník)", () => {
  it("Rabin–Karp: všechny příklady z knihy", () => {
    for (const e of RK_EXAMPLES) {
      const steps = materialize(rkSteps(e.needle, e.text, e.P, e.N));
      for (const t of texts(steps, rkVars))
        expect(t, e.id).not.toMatch(DECIMAL_POINT);
    }
  });

  it("sufixové pole: stavba, LCP i hledání", () => {
    for (const alpha of ["banana", "mississippi", "barokoarokoko"])
      for (const phase of [
        { kind: "build" as const },
        { kind: "kasai" as const },
        { kind: "search" as const, beta: "ana" },
      ]) {
        const steps = suffixSteps(alpha, phase, true);
        for (const t of texts(steps))
          expect(t, alpha).not.toMatch(DECIMAL_POINT);
      }
  });

  it("bezzámkový zásobník: scénář ABA", () => {
    const steps = materialize(abaScenario(initial()));
    for (const s of steps) expect(s.message).not.toMatch(DECIMAL_POINT);
  });
});
