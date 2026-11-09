/**
 * Rabin–Karp podle Průvodce 13.4 (str. 330–331): heš okénka sena
 *   H(x_1, …, x_J) = (x_1·P^{J−1} + … + x_J·P^0) mod N
 * a jeho přepočet v O(1) při posunu o znak
 *   H(x_2, …, x_{J+1}) = (P · H(x_1, …, x_J) − x_1·P^J + x_{J+1}) mod N.
 * Písmena „považujeme za přirozená čísla“: a = 1, …, z = 26 (s a = 0 by heš vypustil počáteční áčka).
 * Čisté funkce a generátor kroků; testy v rabinKarp.test.ts a bookStrings.test.ts.
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import { naiveComparisons } from "./kmp";
import { hitsWord } from "./pageModel";

export const MAX_RK_NEEDLE = 12;
export const MAX_RK_HAYSTACK = 40;
export const P_MIN = 2;
export const P_MAX = 1000;
export const N_MIN = 2;
export const N_MAX = 1_000_003;

/* ------------------------------------------------------------------ pseudokód (str. 331) */

export const PC_RK = [
  "Algoritmus RabinKarp",
  "  Vstup: Jehla ι délky J, seno σ délky S",
  "  Zvolíme P a N a předpočítáme P^J mod N.",
  "  j ← H(ι)   // heš jehly",
  "  h ← H(σ[ : J])   // heš první pozice okénka",
  "  Pro i od 0 do S − J:   // možné pozice okénka",
  "    Je-li h = j:",
  "      Pokud σ[i : i + J] = ι, ohlásíme výskyt na pozici i.",
  "    Pokud i < S − J:   // přepočítáme heš",
  "      h ← (P · h − σ[i] · P^J + σ[i + J]) mod N",
];

const LINE = {
  pre: 2,
  needle: 3,
  first: 4,
  loop: 5,
  test: 6,
  chars: 7,
  roll: 9,
} as const;

/* ------------------------------------------------------------------ čisté funkce */

/** a = 1, …, z = 26 */
export const letterCode = (c: string): number => c.charCodeAt(0) - 96;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

const mod = (x: number, N: number) => ((x % N) + N) % N;

/** horní index pro prostý text zpráv (zprávy kroků se nesázejí jako matematika): 5 → ⁵ */
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) =>
  [...String(n)].map((d) => SUP[Number(d)] ?? d).join("");

/** P^J mod N (iterativně, bez přetečení) */
export function rkPow(P: number, J: number, N: number): number {
  let r = 1 % N;
  for (let k = 0; k < J; k++) r = (r * P) % N;
  return r;
}

/** H(slovo) Hornerovým schématem, mod N v každém kroku */
export function rkHash(word: string, P: number, N: number): number {
  let h = 0;
  for (const c of word) h = (h * P + letterCode(c)) % N;
  return h;
}

/** Přepočet heše při posunu okénka: odchozí znak `out`, příchozí `inc`, PJ = P^J mod N. */
export function rkRoll(
  h: number,
  out: string,
  inc: string,
  P: number,
  PJ: number,
  N: number,
): { raw: number; value: number } {
  const raw = P * h - letterCode(out) * PJ + letterCode(inc);
  return { raw, value: mod(raw, N) };
}

/** Heše všech okének délky J (první přímo, další přepočtem). */
export function rkHashes(
  text: string,
  J: number,
  P: number,
  N: number,
): number[] {
  const t = [...text];
  if (J > t.length || J <= 0) return [];
  const PJ = rkPow(P, J, N);
  const out = [rkHash(t.slice(0, J).join(""), P, N)];
  for (let i = 0; i + J < t.length; i++)
    out.push(rkRoll(out[i], t[i], t[i + J], P, PJ, N).value);
  return out;
}

export interface RkCount {
  /** porovnání h = j (jedno na okénko) */
  hashCmp: number;
  /** porovnané znaky okének se shodným hešem */
  charCmp: number;
  falseHits: number;
}

/** Celý RabinKarp: výskyty, falešné shody (h = j, ale znaky se liší) a počítadla. */
export function rkRun(
  needle: string,
  text: string,
  P: number,
  N: number,
): {
  hashes: number[];
  j: number;
  found: number[];
  falseHits: number[];
  count: RkCount;
} {
  const p = [...needle];
  const t = [...text];
  const J = p.length;
  const j = rkHash(needle, P, N);
  const hashes = rkHashes(text, J, P, N);
  const found: number[] = [];
  const falseHits: number[] = [];
  const count: RkCount = { hashCmp: 0, charCmp: 0, falseHits: 0 };
  hashes.forEach((h, i) => {
    count.hashCmp++;
    if (h !== j) return;
    let ok = true;
    for (let k = 0; k < J; k++) {
      count.charCmp++;
      if (t[i + k] !== p[k]) {
        ok = false;
        break;
      }
    }
    if (ok) found.push(i);
    else falseHits.push(i);
  });
  count.falseHits = falseHits.length;
  return { hashes, j, found, falseHits, count };
}

const dec = (x: number) =>
  x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

/** Volba P a N: chyba (nesoudělnost, rozsah) blokuje běh, poznámky jen upozorní (str. 330). */
export function rkValidate(
  P: number,
  N: number,
  J: number,
  S: number,
): { error: string | null; notes: string[] } {
  if (!Number.isInteger(P) || P < P_MIN || P > P_MAX)
    return { error: `P musí být celé číslo ${P_MIN} až ${P_MAX}.`, notes: [] };
  if (!Number.isInteger(N) || N < N_MIN || N > N_MAX)
    return { error: `N musí být celé číslo ${N_MIN} až ${N_MAX}.`, notes: [] };
  const g = gcd(P, N);
  if (g !== 1)
    return {
      error: `P a N musí být nesoudělná (kniha, str. 330); gcd(${P}, ${N}) = ${g}.`,
      notes: [],
    };
  const notes: string[] = [];
  const windows = S - J + 1;
  if (windows > 0 && N <= S * J)
    notes.push(
      `N = ${N} ≤ S·J = ${S * J} – čekejte falešné shody (průměrně (S − J + 1)/N ≈ ${dec(windows / N)}).`,
    );
  if (J > 0 && P ** J < 10 * N)
    notes.push(
      `Pᴶ = ${P}${sup(J)} = ${dec(P ** J)} – Pᴶ by mělo být řádově větší než N (kniha, str. 330).`,
    );
  return { error: null, notes };
}

/** Jehla nebo seno pro RK: jen a–z (velká písmena se převedou), bez mezer, nejvýše `max` znaků. */
export function cleanRkText(
  text: string,
  max: number,
): { value: string; note: string; error: string | null } {
  const raw = String(text ?? "");
  const noSpace = raw.replace(/\s+/gu, "");
  const lower = noSpace.toLowerCase();
  const notes: string[] = [];
  if (noSpace !== "" && /\s/u.test(raw)) notes.push("Mezery vynechány.");
  if (lower !== noSpace) notes.push("Velká písmena převedena na malá.");
  if (lower === "")
    return { value: "", note: "", error: "Zadejte aspoň jedno písmeno a–z." };
  if (!/^[a-z]+$/.test(lower))
    return {
      value: "",
      note: "",
      error: "Povolena jsou jen písmena a–z bez diakritiky (a = 1, …, z = 26).",
    };
  if (lower.length > max) notes.push(`Zkráceno na ${max} znaků.`);
  return { value: lower.slice(0, max), note: notes.join(" "), error: null };
}

/* ------------------------------------------------------------------ kroky */

export interface RkState {
  needle: string;
  text: string;
  P: number;
  N: number;
  /** P^J mod N (po předvýpočtu) */
  PJ: number | null;
  /** P^1 … P^J mod N */
  pows: number[];
  /** j = H(ι) */
  j: number | null;
  /** h pro každou pozici okénka; null = ještě nespočítáno */
  hashes: (number | null)[];
  /** pozice okénka; null = žádné */
  i: number | null;
  /** rozepsaný výpočet aktuálního kroku (Horner, přepočet) */
  calc: string | null;
  /** porovnávaný znak okénka (index v jehle) a výsledek */
  cmp: { at: number; ok: boolean } | null;
  /** přepočet: odchozí a příchozí index v seně */
  roll: { out: number; inc: number } | null;
  /** výsledek u okének s h = j */
  verdicts: Record<number, "hit" | "false">;
  found: number[];
  count: RkCount;
}

const q = (s: string) => `„${s}“`;

/** Hornerovo schéma rozepsané čísly: ((11·31 + 15)·31 + 11) mod 101 */
function horner(word: string, P: number): string {
  const c = [...word].map(letterCode);
  let s = String(c[0]);
  for (let k = 1; k < c.length; k++)
    s = `${k > 1 ? "(" + s + ")" : s}·${P} + ${c[k]}`;
  return c.length > 1 ? `(${s})` : s;
}

const minus = (x: number) => String(x).replace("-", "−");

export function* rkSteps(
  needle: string,
  text: string,
  P: number,
  N: number,
): StepGen<RkState> {
  const p = [...needle];
  const t = [...text];
  const J = p.length;
  const S = t.length;
  const st: RkState = {
    needle,
    text,
    P,
    N,
    PJ: null,
    pows: [],
    j: null,
    hashes: Array.from({ length: Math.max(0, S - J + 1) }, () => null),
    i: null,
    calc: null,
    cmp: null,
    roll: null,
    verdicts: {},
    found: [],
    count: { hashCmp: 0, charCmp: 0, falseHits: 0 },
  };
  const v = rkValidate(P, N, J, S);
  if (v.error) {
    const s: Step<RkState> = { ...snap(st, LINE.pre, v.error), error: true };
    yield s;
    return;
  }

  // řádek 2: předvýpočet P^1 … P^J mod N
  let r = 1 % N;
  for (let k = 0; k < J; k++) st.pows.push((r = (r * P) % N));
  st.PJ = rkPow(P, J, N);
  st.calc = `P^k mod N pro k = 1 … ${J}: ${st.pows.join(", ")}`;
  yield snap(
    st,
    LINE.pre,
    `P = ${P}, N = ${N}, gcd(P, N) = 1. Předpočítáme Pᴶ mod N = ${P}${sup(J)} mod ${N} = ${st.PJ}.`,
  );

  // řádek 3: heš jehly
  st.j = rkHash(needle, P, N);
  st.calc = `H(${needle}) = ${horner(needle, P)} mod ${N} = ${st.j}`;
  yield snap(
    st,
    LINE.needle,
    `Heš jehly j = H(${q(needle)}) = ${st.j} (Hornerovo schéma, a = 1 … z = 26).`,
  );

  if (J > S) {
    st.calc = null;
    yield snap(
      st,
      null,
      `Jehla je delší než seno (J = ${J} > S = ${S}) – žádné okénko, žádný výskyt.`,
    );
    return;
  }

  // řádek 4: heš prvního okénka
  let h = rkHash(t.slice(0, J).join(""), P, N);
  st.hashes[0] = h;
  st.i = 0;
  st.calc = `H(${t.slice(0, J).join("")}) = ${horner(t.slice(0, J).join(""), P)} mod ${N} = ${h}`;
  yield snap(st, LINE.first, `Heš prvního okénka h = H(σ[0 : ${J}]) = ${h}.`);

  for (let i = 0; i <= S - J; i++) {
    const win = t.slice(i, i + J).join("");
    st.i = i;
    st.cmp = null;
    st.roll = null;
    st.calc = null;
    yield snap(
      st,
      LINE.loop,
      `Okénko na pozici i = ${i}: σ[${i} : ${i + J}] = ${q(win)}, h = ${h}.`,
    );
    st.count.hashCmp++;
    if (h !== st.j) {
      yield snap(
        st,
        LINE.test,
        `h = ${h} ≠ j = ${st.j} → okénko přeskočíme, znaky neporovnáváme.`,
      );
    } else {
      yield snap(
        st,
        LINE.test,
        `h = j = ${h} → heše se shodují, porovnáme znaky okénka s jehlou.`,
      );
      let ok = true;
      for (let k = 0; k < J; k++) {
        st.count.charCmp++;
        const same = t[i + k] === p[k];
        st.cmp = { at: k, ok: same };
        yield snap(
          st,
          LINE.chars,
          `σ[${i + k}] = ${q(t[i + k])} ${same ? "=" : "≠"} ι[${k}] = ${q(p[k])}${same ? " ✓" : " ✗"}`,
        );
        if (!same) {
          ok = false;
          break;
        }
      }
      st.cmp = null;
      if (ok) {
        st.found.push(i);
        st.verdicts[i] = "hit";
        yield snap(
          st,
          LINE.chars,
          `σ[${i} : ${i + J}] = ι → ohlásíme výskyt na pozici ${i}.`,
        );
      } else {
        st.verdicts[i] = "false";
        st.count.falseHits++;
        yield snap(
          st,
          LINE.chars,
          `Falešná shoda ≈: heš okénka ${q(win)} je stejný jako heš jehly, ale řetězce se liší.`,
        );
      }
    }
    if (i < S - J) {
      const out = t[i];
      const inc = t[i + J];
      const old = h;
      const rr = rkRoll(old, out, inc, P, st.PJ, N);
      const a = P * old;
      const b = letterCode(out) * st.PJ;
      st.calc =
        `h ← (${P}·${old} − ${letterCode(out)}·${st.PJ} + ${letterCode(inc)}) mod ${N}` +
        ` = (${a} − ${b} + ${letterCode(inc)}) mod ${N} = ${minus(rr.raw)} mod ${N} = ${rr.value}`;
      h = rr.value;
      st.hashes[i + 1] = h;
      st.roll = { out: i, inc: i + J };
      st.cmp = null;
      yield snap(
        st,
        LINE.roll,
        `Přepočet: odchází ${q(out)} (${letterCode(out)}), přichází ${q(inc)} (${letterCode(inc)}): ` +
          `(${P}·${old} − ${letterCode(out)}·${st.PJ} + ${letterCode(inc)}) mod ${N} = ${minus(rr.raw)} mod ${N} = ${rr.value}.`,
      );
    }
  }
  st.i = null;
  st.cmp = null;
  st.roll = null;
  st.calc = null;
  const n = st.found.length;
  const naive = naiveComparisons(needle, text);
  yield snap(
    st,
    null,
    `Hotovo: ${hitsWord(n)}${n ? ` (${st.found.join(", ")})` : ""}, ` +
      `falešných shod ${st.count.falseHits}; porovnání hešů ${st.count.hashCmp}, znaků ${st.count.charCmp} (naivně ${naive}).`,
  );
}
