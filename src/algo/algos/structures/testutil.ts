/** Pomůcky pro testy generátorů datových struktur (aplikace je neimportuje). */
import { materialize, type Step, type StepGen } from "../../core/steps";

export interface OpResult<S> {
  steps: Step<S>[];
  /** stav po operaci = poslední krok (stejný kontrakt jako core/useStructure) */
  last: S;
}

/** Spustí operaci nad kopií stavu stejně jako useStructure.run: novým stavem je POSLEDNÍ vydaný krok. */
export function runOp<S>(state: S, op: (st: S) => StepGen<S>): OpResult<S> {
  const steps = materialize(op(structuredClone(state)));
  if (!steps.length) throw new Error("operace nevydala žádný krok");
  return { steps, last: steps[steps.length - 1].state };
}

/** Kroky, které ukazují mimo pseudokód nebo na prázdný řádek (má být prázdné pole). */
export function badLines<S>(steps: Step<S>[], code: string[]): string[] {
  return steps
    .filter(
      (s) =>
        s.line !== null &&
        (!Number.isInteger(s.line) ||
          s.line < 0 ||
          s.line >= code.length ||
          code[s.line].trim() === ""),
    )
    .map(
      (s) =>
        `řádek ${s.line} (pseudokód má ${code.length} řádků): ${s.message}`,
    );
}
