import { parseNumberList } from "./input";

/**
 * Jeden krok vizualizace: snímek stavu, zvýrazněný řádek pseudokódu a popisek.
 * Algoritmy jsou generátory kroků – UI je jen přehrává.
 */
export interface Step<S> {
  state: S;
  /** index řádku pseudokódu (0-based), null = žádný */
  line: number | null;
  message: string;
  /** poslední krok běhu, který materialize() přerušilo kvůli limitu kroků */
  truncated?: boolean;
  /** krok jen oznamuje chybu (operace se neprovedla) – UI ho zvýrazní */
  error?: boolean;
  /**
   * Výsledek běhu, který není „úspěch“: na posledním kroku místo zeleného ✓ ukáže Visualizer ⓘ (neutral –
   * např. „nenalezeno“, „nic se nezměnilo“) nebo ⚠ (warn – např. záporný cyklus, graf není DAG).
   */
  outcome?: "neutral" | "warn";
}

export type StepGen<S> = Generator<Step<S>, void, unknown>;

/** Horní limit kroků, aby UI nezamrzlo na obřím vstupu. */
export const MAX_STEPS = 20000;

/**
 * Posbírá kroky generátoru. Běh delší než `limit` se přeruší: za posledním krokem přibude krok
 * s hláškou a příznakem `truncated` (viz isTruncated). Běh, který má přesně `limit` kroků, doběhne celý.
 */
export function materialize<S>(gen: StepGen<S>, limit = MAX_STEPS): Step<S>[] {
  const max = Math.max(1, limit);
  const out: Step<S>[] = [];
  for (;;) {
    const r = gen.next();
    if (r.done) break;
    if (out.length >= max) {
      // generátor má další krok nad limit → teprve teď víme, že je běh opravdu oříznutý
      out.push({
        ...out[out.length - 1],
        message: `Dosažen limit ${max} kroků – zkuste menší vstup.`,
        truncated: true,
      });
      gen.return();
      break;
    }
    out.push(r.value);
  }
  return out;
}

/** Byl běh přerušen limitem kroků? (Pak poslední stav není dokončený výsledek.) */
export function isTruncated<S>(steps: readonly Step<S>[]): boolean {
  return steps.length > 0 && steps[steps.length - 1].truncated === true;
}

/** Pomocník: vyrobí krok z hluboké kopie stavu. */
export function snap<S>(
  state: S,
  line: number | null,
  message: string,
): Step<S> {
  return { state: structuredClone(state), line, message };
}

/* ---------- deterministický generátor náhodných čísel (pro „náhodný vstup“) ---------- */

export function rng(seed: number): () => number {
  // xorshift32; nulový stav by zůstal nulový, proto má semínko 0 vlastní konstantu (dřív splývalo se semínkem 1)
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function randomArray(n: number, max = 99, seed = Date.now()): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => 1 + Math.floor(r() * max));
}

/**
 * Čísla oddělená mezerami, čárkami nebo středníky; neplatné tokeny vynechá. Přijímá i záporná a desetinná
 * čísla (ne 0x10, 1e9). Kde je potřeba říct uživateli, co se zahodilo, použijte parseIntList z ./input.
 */
export function parseNumbers(text: string): number[] {
  return parseNumberList(text, { integerOnly: false }).values;
}

export { parseIntList, parseNumberList } from "./input";
