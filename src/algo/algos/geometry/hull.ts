/**
 * Konvexní obal (Průvodce 16.1, str. 401–405) – generátory kroků, čisté funkce bez Reactu (testy v hull.test.ts).
 *
 * - `sweep` = algoritmus KonvexníObal (zametání roviny, str. 403–404): body lexikograficky setříděné, horní
 *   obálka H a dolní obálka D jako dva zásobníky. Úhel hₖ₋₁hₖb je „orientovaný doleva“, právě když
 *   det M = x₁y₂ − x₂y₁ ≥ 0 (u = hₖ − hₖ₋₁, v = b − hₖ, str. 404). Horní obálka odebírá při det ≥ 0, dolní
 *   symetricky při orientaci doprava, tj. det < 0 – body na společné přímce v D zůstanou (vnitřní úhel
 *   180°, cvičení 16.1.1).
 * - `wrap` = provázkový algoritmus (obr. 16.2, str. 402; detaily podle cv. 16.1.7 – místo úhlů
 *   orientace / determinant): z nejlevějšího bodu L otáčíme polopřímkou po směru hodinových ručiček.
 *
 * Souřadnice jsou celá čísla v rovině 0–100, osa y míří nahoru (jako v knize). Obal se vypisuje po směru
 * hodinových ručiček od b₁ (nejlevějšího bodu) přes horní obálku.
 */
import { formatMinus, formatTerm } from "../../core/format";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";

export interface HullPt {
  id: number;
  x: number;
  y: number;
}

export type HullAlg = "sweep" | "wrap";

/** rovina [x1, y1, x2, y2] */
export const PLANE: [number, number, number, number] = [0, 0, 100, 100];
/** nejvyšší počet bodů */
export const MAX_N = 40;

/** Testovaný úhel: zametání a→m→b (u = m − a, v = b − m), provázek c→q a c→p (u = q − c, v = p − c). */
export interface AngleTest {
  /** zametání: hₖ₋₁, hₖ, b; provázek: c, q, p */
  a: number;
  m: number;
  b: number;
  u: [number, number];
  v: [number, number];
  det: number;
  /** odebere se hₖ (zametání) / p se stane kandidátem (provázek) */
  pop: boolean;
}

export interface HullState {
  alg: HullAlg;
  /** body v pořadí zadání */
  points: HullPt[];
  /** pořadí b₁ … bₙ (id) po lexikografickém setřídění; prázdné před ním */
  order: number[];
  /** horní a dolní obálka (zametání) */
  H: number[];
  D: number[];
  /** dosud sestrojená část obalu (provázek) */
  chain: number[];
  /** aktuální bod b (zametání) / vrchol c, ze kterého otáčíme (provázek) */
  cur: number | null;
  /** x zametací přímky */
  sweepX: number | null;
  /** obálka, kterou právě přepočítáváme */
  env: "H" | "D" | null;
  test: AngleTest | null;
  /** právě odebraný bod (ř. 6 / ř. 8) */
  popped: number | null;
  /** body už odebrané z obálek při přidávání aktuálního b (zametání) */
  dropped: number[];
  /** provázek: kandidát q a zkoušený bod p */
  cand: number | null;
  probe: number | null;
  /** hotový obal po směru hodinových ručiček od b₁; null = ještě ne */
  hull: number[] | null;
}

/** Pseudokód KonvexníObal (Průvodce str. 403–404). */
export const PC_SWEEP = [
  "Setřídíme body podle x-ové souřadnice, označíme je b_1, …, b_n.",
  "Vložíme do horní a dolní obálky bod b_1: H ← D ← (b_1).",
  "Pro každý další bod b = b_2, …, b_n:",
  "  Přepočítáme horní obálku:",
  "    Dokud |H| ≥ 2, H = (…, h_{k−1}, h_k) a úhel h_{k−1}h_kb je orientovaný doleva:",
  "      Odebereme poslední bod h_k z obálky H.",
  "    Přidáme bod b na konec obálky H.",
  "  Symetricky přepočteme dolní obálku (s orientací doprava).",
  "Výsledný obal je tvořen body v obálkách H a D.",
];

/** Provázkový algoritmus – postup z textu str. 402, porovnání orientací podle cv. 16.1.7. */
export const PC_WRAP = [
  "L ← nejlevější bod, c ← L, obal O ← (L).",
  "Opakujeme (otáčíme polopřímkou z c po směru hodinových ručiček):",
  "  q ← libovolný bod různý od c.",
  "  Pro každý další bod p ≠ c:",
  "    Leží-li p nalevo od cq (det > 0) nebo na ní dál od c: q ← p.",
  "  Úsečka cq patří do obalu, c ← q.",
  "  Je-li c = L, skončíme; jinak přidáme c na konec O.",
];

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) =>
  String(n)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");
/** popisek i-tého bodu v setříděném pořadí (od 0): b₁, b₂, … */
export const bLabel = (i: number) => `b${sub(i + 1)}`;

/** číslo do zprávy: česká čárka a typografické minus */
const num = (v: number) => formatMinus(v);
/** činitel v součinu za jiným znakem: záporný v závorce („17·(−56)“, ne „17·−56“) */
const fac = (v: number) => formatTerm(v);
/** rozepsaný determinant „x₁·y₂ − x₂·y₁“ */
const detTerms = (u: readonly number[], v: readonly number[]) =>
  `${num(u[0])}·${fac(v[1])} − ${fac(v[0])}·${fac(u[1])}`;
const vec = (v: readonly number[]) => `(${num(v[0])}, ${num(v[1])})`;

/** u = m − a, v = b − m, det M = x₁y₂ − x₂y₁ (str. 404) */
export function det(
  a: { x: number; y: number },
  m: { x: number; y: number },
  b: { x: number; y: number },
): { u: [number, number]; v: [number, number]; det: number } {
  const u: [number, number] = [m.x - a.x, m.y - a.y];
  const v: [number, number] = [b.x - m.x, b.y - m.y];
  return { u, v, det: u[0] * v[1] - v[0] * u[1] };
}

/** Lexikografické pořadí (podle x, při shodě podle y) – str. 404, body v obecné poloze. */
export function lexOrder(points: readonly HullPt[]): HullPt[] {
  return [...points].sort((p, q) => p.x - q.x || p.y - q.y || p.id - q.id);
}

const emptyState = (alg: HullAlg, points: readonly HullPt[]): HullState => ({
  alg,
  points: points.map((p) => ({ ...p })),
  order: [],
  H: [],
  D: [],
  chain: [],
  cur: null,
  sweepX: null,
  env: null,
  test: null,
  popped: null,
  dropped: [],
  cand: null,
  probe: null,
  hull: null,
});

const step = (
  st: HullState,
  line: number | null,
  message: string,
  extra?: Partial<Step<HullState>>,
): Step<HullState> => ({
  state: structuredClone(st),
  line,
  message,
  ...extra,
});

const EMPTY_MSG =
  "Žádné body – obal je prázdný. Klepnutím do roviny přidejte body (nebo Vytvořit ▸ Náhodně).";

/** Algoritmus KonvexníObal (zametání roviny). */
export function* sweep(input: readonly HullPt[]): StepGen<HullState> {
  const st = emptyState("sweep", input);
  if (!input.length) {
    yield step(st, null, EMPTY_MSG, { outcome: "neutral" });
    return;
  }
  const sorted = lexOrder(st.points);
  const at = new Map(st.points.map((p) => [p.id, p]));
  const name = new Map(sorted.map((p, i) => [p.id, bLabel(i)]));
  const nm = (id: number) => name.get(id) ?? "?";
  const pt = (id: number) => at.get(id)!;
  const list = (ids: readonly number[]) => `(${ids.map(nm).join(", ")})`;
  st.order = sorted.map((p) => p.id);
  const shown = sorted
    .slice(0, 6)
    .map((p, i) => `${bLabel(i)} = (${num(p.x)}, ${num(p.y)})`)
    .join(", ");
  yield step(
    st,
    0,
    `Setřídíme ${sorted.length === 1 ? "jediný bod" : `${sorted.length} ${sorted.length < 5 ? "body" : "bodů"}`} podle x (při shodě podle y – lexikograficky): ${shown}${sorted.length > 6 ? ", …" : ""}.`,
  );

  const first = sorted[0];
  st.H = [first.id];
  st.D = [first.id];
  st.cur = first.id;
  st.sweepX = first.x;
  yield step(
    st,
    1,
    `Nejlevější bod b₁ = (${num(first.x)}, ${num(first.y)}) leží na obalu: H ← D ← (b₁). Zametací přímka stojí na x = ${num(first.x)}.`,
  );

  for (let k = 1; k < sorted.length; k++) {
    const b = sorted[k];
    st.cur = b.id;
    st.sweepX = b.x;
    st.env = null;
    st.test = null;
    st.popped = null;
    st.dropped = [];
    yield step(
      st,
      2,
      `Další bod b = ${nm(b.id)} = (${num(b.x)}, ${num(b.y)}): zametací přímka se posune na x = ${num(b.x)}. Bod b je nejpravější, na novém obalu tedy leží.`,
    );

    for (const env of ["H", "D"] as const) {
      const E = st[env];
      const upper = env === "H";
      const ln = upper ? 4 : 7;
      const obal = upper ? "horní obálky H" : "dolní obálky D";
      st.env = env;
      for (;;) {
        st.popped = null;
        if (E.length < 2) {
          st.test = null;
          yield step(
            st,
            ln,
            `|${env}| = 1 < 2 – v ${upper ? "horní" : "dolní"} obálce není úhel, který by šel testovat.`,
          );
          break;
        }
        const a = pt(E[E.length - 2]);
        const m = pt(E[E.length - 1]);
        const d = det(a, m, b);
        // kniha: doleva ⇔ det ≥ 0; dolní obálka symetricky odebírá při orientaci doprava (det < 0)
        const pop = upper ? d.det >= 0 : d.det < 0;
        st.test = { a: a.id, m: m.id, b: b.id, ...d, pop };
        const angle = `Úhel ${nm(a.id)}${nm(m.id)}${nm(b.id)}: u = ${nm(m.id)} − ${nm(a.id)} = ${vec(d.u)}, v = b − ${nm(m.id)} = ${vec(d.v)}, det M = ${detTerms(d.u, d.v)} = ${num(d.det)}`;
        let verdict: string;
        if (upper)
          verdict = pop
            ? d.det === 0
              ? ` – body leží na přímce; nezáporný det kniha počítá jako „doleva“, takže ${nm(m.id)} odebereme.`
              : ` > 0, úhel je orientovaný doleva: obálka by zatočila špatně, ${nm(m.id)} odebereme.`
            : ` < 0, úhel je orientovaný doprava – horní obálka je v pořádku.`;
        else
          verdict = pop
            ? ` < 0, úhel je orientovaný doprava: dolní obálka by zatočila špatně, ${nm(m.id)} odebereme.`
            : d.det === 0
              ? ` – body leží na přímce. Orientace doprava to není (det není záporný), ${nm(m.id)} v D zůstane jako vrchol s vnitřním úhlem 180° (cvičení 16.1.1).`
              : ` > 0, úhel je orientovaný doleva – dolní obálka je v pořádku.`;
        yield step(st, ln, angle + verdict);
        if (!pop) break;
        E.pop();
        st.popped = m.id;
        st.dropped.push(m.id);
        st.test = null;
        yield step(
          st,
          upper ? 5 : 7,
          `Odebereme ${nm(m.id)} z ${obal}: ${env} = ${list(E)}.`,
        );
      }
      st.popped = null;
      st.test = null;
      E.push(b.id);
      yield step(
        st,
        upper ? 6 : 7,
        `Přidáme b = ${nm(b.id)} na konec ${obal}: ${env} = ${list(E)}.`,
      );
    }
  }

  st.env = null;
  st.test = null;
  st.popped = null;
  st.dropped = [];
  st.cur = null;
  const lower = st.D.slice(1, -1).reverse();
  st.hull = st.H.length > 1 ? [...st.H, ...lower] : [...st.H];
  // všechny body na přímce: obal je úsečka b₁bₙ; body mezi zůstaly podle pravidla knihy v D (CR-1)
  const leftmost = sorted[0];
  const rightmost = sorted[sorted.length - 1];
  const flat =
    sorted.length > 2 &&
    sorted.every((p) => det(leftmost, rightmost, p).det === 0);
  const result = flat
    ? `úsečka ${nm(leftmost.id)} → ${nm(rightmost.id)} – všechny body leží na přímce (body mezi nimi zůstaly v D jako vrcholy s úhlem 180°, cvičení 16.1.1; provázek je vynechá)`
    : hullText(st.hull, nm);
  yield step(
    st,
    8,
    `Hotovo – obal tvoří horní obálka H = ${list(st.H)} a dolní obálka D = ${list(st.D)}: ${result}.`,
  );
}

function hullText(hull: readonly number[], nm: (id: number) => string) {
  const h = hull.length;
  const what =
    h === 1
      ? "jediný bod"
      : h === 2
        ? "úsečka"
        : `${h} ${h < 5 ? "vrcholy" : "vrcholů"}`;
  return `${what} ${hull.map(nm).join(" → ")}${h > 2 ? ` → ${nm(hull[0])} (po směru hodinových ručiček)` : ""}`;
}

/** Provázkový algoritmus (obr. 16.2). */
export function* wrap(input: readonly HullPt[]): StepGen<HullState> {
  const st = emptyState("wrap", input);
  if (!input.length) {
    yield step(st, null, EMPTY_MSG, { outcome: "neutral" });
    return;
  }
  const sorted = lexOrder(st.points);
  st.order = sorted.map((p) => p.id);
  const at = new Map(st.points.map((p) => [p.id, p]));
  const name = new Map(sorted.map((p, i) => [p.id, bLabel(i)]));
  const nm = (id: number) => name.get(id) ?? "?";
  const pt = (id: number) => at.get(id)!;
  const L = sorted[0];
  st.chain = [L.id];
  st.cur = L.id;
  yield step(
    st,
    0,
    `Nejlevější bod L = ${nm(L.id)} = (${num(L.x)}, ${num(L.y)}) leží na obalu. Z něj povedeme polopřímku doleva a budeme s ní otáčet po směru hodinových ručiček.`,
  );
  if (sorted.length === 1) {
    st.hull = [L.id];
    st.cur = null;
    yield step(st, 6, `Hotovo – jediný bod ${nm(L.id)} je sám sobě obalem.`);
    return;
  }

  const dist2 = (a: HullPt, b: HullPt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  // každý vrchol obalu se přidá nejvýš jednou → nejvýš n otočení
  for (let round = 0; round <= sorted.length; round++) {
    const c = pt(st.cur!);
    const others = sorted.filter((p) => p.id !== c.id);
    let q = others[0];
    st.cand = q.id;
    st.probe = null;
    st.test = null;
    yield step(
      st,
      2,
      `Z bodu c = ${nm(c.id)} zkusíme jako kandidáta q = ${nm(q.id)} – polopřímka cq je zatím nejdál otočená.`,
    );
    for (const p of others.slice(1)) {
      const u: [number, number] = [q.x - c.x, q.y - c.y];
      const v: [number, number] = [p.x - c.x, p.y - c.y];
      const d = u[0] * v[1] - v[0] * u[1];
      const farther = d === 0 && dist2(c, p) > dist2(c, q);
      const take = d > 0 || farther;
      st.probe = p.id;
      st.test = { a: c.id, m: q.id, b: p.id, u, v, det: d, pop: take };
      const head = `p = ${nm(p.id)}: u = q − c = ${vec(u)}, v = p − c = ${vec(v)}, det M = ${detTerms(u, v)} = ${num(d)}`;
      const tail =
        d > 0
          ? ` > 0 – p leží nalevo od cq, polopřímka na něj narazí dřív: q ← ${nm(p.id)}.`
          : d < 0
            ? ` < 0 – p leží napravo od cq, kandidát zůstává q = ${nm(q.id)}.`
            : farther
              ? ` – p leží na přímce cq dál od c: q ← ${nm(p.id)} (bližší bod by byl vrcholem s úhlem 180°).`
              : ` – p leží na přímce cq blíž k c, kandidát zůstává q = ${nm(q.id)}.`;
      if (take) {
        q = p;
        st.cand = q.id;
      }
      yield step(st, 4, head + tail);
    }
    st.probe = null;
    st.test = null;
    st.cand = null;
    st.cur = q.id;
    if (q.id === L.id) {
      st.cur = null;
      st.hull = [...st.chain];
      yield step(
        st,
        6,
        `Hotovo – polopřímka se vrátila do L, obal: ${hullText(st.hull, nm)}.`,
      );
      return;
    }
    st.chain.push(q.id);
    yield step(
      st,
      5,
      `Polopřímka z ${nm(c.id)} narazí nejdřív na ${nm(q.id)}: úsečka ${nm(c.id)}${nm(q.id)} patří do obalu, pokračujeme z c = ${nm(q.id)}.`,
    );
  }
}

/** Kroky zvoleného algoritmu (materializované). */
export function hullSteps(
  points: readonly HullPt[],
  alg: HullAlg,
): Step<HullState>[] {
  return materialize(alg === "wrap" ? wrap(points) : sweep(points));
}

/** n náhodných různých bodů se souřadnicemi 5–95 (n oříznuté do 0…MAX_N). */
export function randomHullPoints(n: number, seed: number): HullPt[] {
  const count = Math.max(0, Math.min(MAX_N, Math.round(n) || 0));
  const r = rng(seed);
  const seen = new Set<string>();
  const out: HullPt[] = [];
  while (out.length < count) {
    const x = 5 + Math.floor(r() * 91);
    const y = 5 + Math.floor(r() * 91);
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: out.length, x, y });
  }
  return out;
}

/** nejvyšší n pro „body na kružnici“ (zaokrouhlené body pak ještě všechny leží na obalu) */
export const MAX_CIRCLE = 24;

/** n bodů na kružnici se středem (50, 50) – všechny leží na obalu. */
export function circlePoints(n: number): HullPt[] {
  const count = Math.max(0, Math.min(MAX_CIRCLE, Math.round(n) || 0));
  return Array.from({ length: count }, (_, i) => {
    const t = (2 * Math.PI * i) / count + 0.3;
    return {
      id: i,
      x: Math.round(50 + 44 * Math.cos(t)),
      y: Math.round(50 + 44 * Math.sin(t)),
    };
  });
}
