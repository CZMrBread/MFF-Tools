import { formatNum } from "../../core/format";

/** Hešovací funkce z přednášky. Všechny mapují celá čísla 0 ≤ x < 2^16 do [m]. */
export interface HashFn {
  id: string;
  name: string;
  /** popis se skutečnými parametry */
  describe: (m: number) => string;
  make: (m: number, seed: number) => (x: number) => number;
}

const P = 65537; // prvočíslo > 2^16

/** Největší klíč univerza (klíče jsou 16bitová čísla). */
export const KEY_MAX = 65535;

/** Je x platný klíč, tedy celé číslo 0 … 65535? */
export const isKey = (x: number): boolean =>
  Number.isInteger(x) && x >= 0 && x <= KEY_MAX;

/**
 * Hláška pro neplatný klíč (null = klíč je v pořádku). Generátory operací ji vydají jako jediný krok,
 * místo aby počítaly s číslem mimo univerzum (pole type="number" pustí i −5, 1.5 nebo 1e999).
 */
export function keyError(x: number): string | null {
  if (isKey(x)) return null;
  const shown =
    typeof x !== "number" || Number.isNaN(x)
      ? "nic nebo nečíselná hodnota"
      : String(x).replace("Infinity", "∞").replace("-", "−").replace(".", ",");
  return `Klíč musí být celé číslo od 0 do ${KEY_MAX} (zadáno: ${shown}) – operace se neprovedla.`;
}

/** Číslo s desetinnou čárkou (česká typografie), např. α = 0,56 – společný formátovač stránky algo (E3). */
export const czNum = (v: number, digits = 2): string => formatNum(v, digits);

/* Pojistky: žádná funkce nesmí spadnout ani vrátit index mimo [m], ať dostane jakékoli číslo. */
const int = (x: number) => (Number.isFinite(x) ? Math.trunc(x) : 0);
const size = (m: number) => Math.max(1, int(m));
const pmod = (x: number, m: number) => ((x % m) + m) % m;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

export const HASH_FNS: HashFn[] = [
  {
    id: "mod",
    name: "x mod m (dělení)",
    describe: (m) => `h(x) = x mod ${m}`,
    make: (m) => {
      const mm = size(m);
      return (x) => pmod(int(x), mm);
    },
  },
  {
    id: "linear",
    name: "((ax + b) mod p) mod m (lineární, 2-univerzální)",
    describe: (m) => `h(x) = ((a·x + b) mod ${P}) mod ${m}, a, b náhodné`,
    make: (m, seed) => {
      const mm = size(m);
      const r = lcg(seed);
      const a = 1 + (r() % (P - 1));
      const b = r() % P;
      // x nejdřív zredukujeme do Z_p; a·x + b < 2^33, takže se vejde přesně do double (bez BigInt)
      return (x) => ((a * pmod(int(x), P) + b) % P) % mm;
    },
  },
  {
    id: "mulshift",
    name: "multiply-shift (horní bity a·x)",
    describe: (m) =>
      `h(x) = (a·x mod 2³²) ≫ (32 − log₂ ${m}), a liché náhodné; m musí být mocnina 2`,
    make: (m, seed) => {
      const mm = size(m);
      const r = lcg(seed);
      const a = (r() | 1) >>> 0;
      const l = Math.round(Math.log2(mm));
      // l = 0 by znamenalo posun o 32 bitů, který JS neprovede; „% mm“ je jen pojistka pro m, které není mocnina 2
      return (x) =>
        l <= 0 ? 0 : ((Math.imul(a, int(x)) >>> 0) >>> (32 - l)) % mm;
    },
  },
  {
    id: "tab",
    name: "tabulační (xor tabulek po bytech, 3-nezávislé)",
    describe: (m) =>
      `h(x) = T₀[x₀] ⊕ T₁[x₁] mod ${m}, kde x = x₁x₀ po bytech, tabulky náhodné`,
    make: (m, seed) => {
      const mm = size(m);
      const r = lcg(seed);
      // Bereme HORNÍCH 16 bitů: dolních l bitů LCG mod 2^32 má periodu jen 2^l, takže „r() % 65536“
      // dávalo po redukci mod m tabulky závislé jen na (index mod m) – funkce se chovala jako x mod m.
      const T0 = Array.from({ length: 256 }, () => r() >>> 16);
      const T1 = Array.from({ length: 256 }, () => r() >>> 16);
      return (x) => (T0[int(x) & 255] ^ T1[(int(x) >> 8) & 255]) % mm;
    },
  },
];

export const isPow2 = (m: number) => m > 0 && (m & (m - 1)) === 0;
