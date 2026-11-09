/**
 * Sazba pseudokódu a krátkých matematických zápisů: indexy `x_i`, `R_{2k}`, mocniny `2^k`, `e^{−kn/m}`
 * a komentáře za `//`. Bez závislostí; parseMath a splitComment jsou čisté funkce (testy ve format.test.ts).
 */
import type { ReactNode } from "react";

export type MathNode = string | { kind: "sub" | "sup"; children: MathNode[] };

/** znak, za kterým může následovat index nebo mocnina */
const BASE = /[\p{L}\p{N})\]]/u;
/** znak slova (písmeno nebo číslice) – argument indexu bez závorek */
const WORD = /[\p{L}\p{N}]/u;

/** Argument indexu / mocniny od pozice `from`: `{…}` (i vnořené), jinak souvislé slovo z písmen a číslic. */
function readArg(
  text: string,
  from: number,
): { body: string; end: number } | null {
  const ch = text[from];
  if (ch === undefined) return null;
  if (ch === "{") {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0)
        return i > from + 1
          ? { body: text.slice(from + 1, i), end: i + 1 }
          : null;
    }
    return null; // neuzavřená závorka → nechat jako text
  }
  // bez závorek celé slovo: s_syn → s<sub>syn</sub>, klíč_i(v) → klíč<sub>i</sub>(v), 2^10 → 2<sup>10</sup>
  if (!WORD.test(ch)) return null;
  let end = from + 1;
  while (end < text.length && WORD.test(text[end])) end++;
  return { body: text.slice(from, end), end };
}

/**
 * Rozloží text na obyčejné úseky, dolní a horní indexy. `_` a `^` se berou jako index jen těsně za písmenem,
 * číslicí nebo závorkou, takže např. „a ^ b“ nebo samotné podtržítko zůstane textem.
 */
export function parseMath(text: string): MathNode[] {
  const out: MathNode[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if ((ch === "_" || ch === "^") && i > 0 && BASE.test(text[i - 1])) {
      const arg = readArg(text, i + 1);
      if (arg) {
        if (buf) out.push(buf);
        buf = "";
        out.push({
          kind: ch === "_" ? "sub" : "sup",
          children: parseMath(arg.body),
        });
        i = arg.end;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

function render(nodes: MathNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    const Tag = n.kind;
    return <Tag key={i}>{render(n.children)}</Tag>;
  });
}

/**
 * Text s indexy a mocninami jako React uzly: fmtMath('p_{x_i} ← 2^k') → p<sub>x<sub>i</sub></sub> ← 2<sup>k</sup>.
 * Použitelné v pseudokódu, názvech proměnných, titulcích operací i v popisech stránek.
 */
export function fmtMath(text: string): ReactNode {
  const nodes = parseMath(text);
  return nodes.length === 1 && typeof nodes[0] === "string"
    ? nodes[0]
    : render(nodes);
}

/** Rozdělí řádek pseudokódu na kód a komentář (`//` na začátku řádku nebo za mezerou). */
export function splitComment(line: string): { code: string; comment: string } {
  const m = /(^|\s)\/\//.exec(line);
  if (!m) return { code: line, comment: "" };
  const at = m.index + m[1].length;
  return { code: line.slice(0, at), comment: line.slice(at) };
}

/**
 * Jediný formátovač zobrazovaných čísel stránky algo: česká desetinná čárka (`0,7`, `3,14`).
 * `digits` = pevný počet desetinných míst jako `toFixed`; bez něj nejkratší zápis jako `String(x)`.
 * Tisíce se neoddělují (šířky popisků v kresbách se nemění), `-0` se píše jako `0`, ±∞ jako `∞` / `−∞`,
 * NaN jako `–`. `{ point: true }` (nebo `formatNumPoint`) ponechá tečku – jen FFT (/fft/fft, /fft/net).
 * Do adresy (parametry `alpha=0.7` …) se čísla dál píší s tečkou přes `String(x)`, ne tímto formátovačem.
 */
export function formatNum(
  value: number,
  digits?: number,
  opts?: { point?: boolean },
): string {
  if (Number.isNaN(value)) return "–";
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "−∞";
  let s = digits === undefined ? String(value) : value.toFixed(digits);
  // -0, -0.0 i -0.04 zaokrouhlené na 0,0 → bez znaménka
  if (s.startsWith("-") && /^-[0.]*$/.test(s)) s = s.slice(1);
  return opts?.point ? s : s.replace(".", ",");
}

/** Číslo v textu hlášky: česká čárka a typografické minus („−2“, ne „-2“). */
export function formatMinus(value: number, digits?: number): string {
  return formatNum(value, digits).replace(/^-/, "−");
}

/** Číslo jako sčítanec či činitel za operátorem: záporné v závorce – „2 + (−3)“, „17·(−56)“. */
export function formatTerm(value: number, digits?: number): string {
  const s = formatMinus(value, digits);
  return s.startsWith("−") ? `(${s})` : s;
}

/** Číslo s desetinnou tečkou (FFT ponechává tečku, viz rozhodnutí vlastníka 7. 11. 2026). */
export function formatNumPoint(value: number, digits?: number): string {
  return formatNum(value, digits, { point: true });
}
