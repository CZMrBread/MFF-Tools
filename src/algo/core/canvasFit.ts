/**
 * Přizpůsobení kresby výšce plátna na desktopu na jednu obrazovku (FIT_MEDIA).
 *
 * CSS umí SVG pohled jen zmenšit celý (i s písmem) – u dvou pohledů nad sebou (Mergesort + pole Z,
 * halda + pole) nebo u hlubokého stromu by písmo kleslo na pár px. Stránka proto místo toho změní
 * „pružné“ rozměry kresby (výšku sloupců, vzdálenost hladin stromu) o `delta` px: Visualizer dá přes
 * kontext prvek plátna, useCanvasFit změří, kolik px výšky obsahu přebývá nebo chybí, a delta
 * upraví. Písmo a vrcholy zůstanou 1 : 1; CSS zmenšení zůstává jen pojistkou za mezemi.
 */
import {
  createContext,
  createElement,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Prvek plátna (.viz-canvas) v režimu jedné obrazovky; jinde (telefon, běžný tok stránky) null. */
export const CanvasFitContext = createContext<HTMLElement | null>(null);

/** SVG pohledu v plátně: přirozená velikost (atributy width/height) a skutečně vykreslená. */
export interface SvgBox {
  /** atribut width (px při 1 : 1) */
  w: number;
  /** atribut height */
  h: number;
  /** vykreslená výška */
  renderedH: number;
  /** šířka, kterou má k dispozici (obal) – užší obal zmenší SVG i na výšku, to není nedostatek výšky */
  availW: number;
}

/**
 * Kolik px výšky obsahu plátna přebývá (> 0) nebo chybí (< 0) při kresbě 1 : 1.
 * `inner` = výška plátna bez paddingu, `content` = výška obsahu, jak je teď vykreslený (od horního
 * okraje prvního po spodní okraj posledního potomka). SVG zmenšená CSS (flex-shrink) se počítají
 * v přirozené výšce – jinak by zmenšení vypadalo jako „vejde se“.
 */
export function fitSlack(
  inner: number,
  content: number,
  svgs: readonly SvgBox[],
): number {
  let natural = content;
  for (const s of svgs) {
    if (!(s.w > 0 && s.h > 0)) continue;
    const byWidth = Math.min(1, s.availW > 0 ? s.availW / s.w : 1);
    natural += Math.max(0, s.h * byWidth - s.renderedH);
  }
  return inner - natural;
}

export interface FitLimits {
  /** nejvýš o kolik px kresbu zmenšit (delta ≥ −shrink) */
  shrink: number;
  /** nejvýš o kolik px kresbu zvětšit (delta ≤ grow) */
  grow: number;
}

/**
 * Další delta: posun o změřenou rezervu, v mezích. Volné místo pod 2 px deltu nemění (žádné kmitání
 * po zaokrouhlení); přesah (nad šum měření 0,1 px) kresbu vždy zmenší, zaokrouhleno dolů – jinak by
 * plátno dostalo posuvník o 1–2 px. Po zmenšení zbude volné místo pod 2 px, takže se nekmitá.
 */
export function nextDelta(
  delta: number,
  slack: number,
  limits: FitLimits,
): number {
  if (slack >= -0.1 && slack < 2) return delta;
  const raw = delta + slack;
  return Math.max(
    -limits.shrink,
    Math.min(limits.grow, slack < 0 ? Math.floor(raw) : Math.round(raw)),
  );
}

/** Pružný rozměr: `base` posunutý o `delta`, v mezích [min, max], zaokrouhlený. */
export function stretch(
  base: number,
  delta: number,
  min: number,
  max: number,
): number {
  return Math.round(Math.max(min, Math.min(max, base + delta)));
}

/** Nejvýš tolik změn delty za jedno usazování (pojistka; běžně stačí 1–2). */
const MAX_SETTLE = 8;

/**
 * Krok usazování: nová delta, nebo null = zůstat. Rozměry jsou zaokrouhlené (hladiny stromu po celých
 * px), takže rezerva nemusí jít vynulovat a delta by kmitala mezi dvěma hodnotami. Proto se už
 * vyzkoušená delta neopakuje – jedině když kresba přetéká a vede ke kresbě menší (ta se vejde).
 */
export function settleStep(
  delta: number,
  slack: number,
  limits: FitLimits,
  visited: readonly number[],
): number | null {
  const next = nextDelta(delta, slack, limits);
  if (next === delta) return null;
  const repeat = visited.includes(next) || visited.length >= MAX_SETTLE;
  if (!repeat) return next;
  return slack < 0 && next < delta && visited.length < 2 * MAX_SETTLE
    ? next
    : null;
}

function measure(canvas: HTMLElement): number {
  const cs = getComputedStyle(canvas);
  const inner =
    canvas.clientHeight -
    (parseFloat(cs.paddingTop) || 0) -
    (parseFloat(cs.paddingBottom) || 0);
  const kids = [...canvas.children] as HTMLElement[];
  if (!kids.length || !(inner > 0)) return 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (const k of kids) {
    const r = k.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(top)) return 0;
  const svgs: SvgBox[] = [
    ...canvas.querySelectorAll<SVGSVGElement>(".view-wrap > svg"),
  ].map((svg) => ({
    w: Number(svg.getAttribute("width")),
    h: Number(svg.getAttribute("height")),
    renderedH: svg.getBoundingClientRect().height,
    availW: svg.parentElement?.clientWidth ?? 0,
  }));
  return fitSlack(inner, bottom - top, svgs);
}

/**
 * Kolik px přidat (> 0) nebo ubrat (< 0) pružným rozměrům kresby, aby obsah plátna vyplnil jeho
 * výšku. Mimo režim jedné obrazovky vždy 0. Volá ho jen stránka (jeden na plátno), která pak deltu
 * rozdělí mezi své pohledy tak, aby se výška obsahu změnila právě o deltu.
 */
export function useCanvasFit(limits: FitLimits): number {
  const canvas = useContext(CanvasFitContext);
  const [delta, setDelta] = useState(0);
  const [, setTick] = useState(0);
  const { shrink, grow } = limits;
  // vyzkoušené delty v tomto usazování; `own` = další vykreslení vyvolala změna delty odsud
  const run = useRef<{ visited: number[]; own: boolean }>({
    visited: [],
    own: false,
  });

  // změna velikosti plátna (okno, otevřená akce v doku) → změřit znovu
  useEffect(() => {
    if (!canvas || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvas]);

  // po každém vykreslení (nový krok může strom prohloubit) – rozměr se mění o deltu, takže obvykle
  // stačí jeden až dva průchody; settleStep hlídá, aby se zaokrouhlením nekmitalo. Záměrně bez
  // seznamu závislostí: výška obsahu se mění s čímkoli, co stránka vykreslí (krok, vstup, šířka)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!canvas) return;
    const r = run.current;
    // vykreslení zvenku (nový krok, změna velikosti plátna) začíná nové usazování
    if (!r.own) r.visited = [];
    r.own = false;
    r.visited.push(delta);
    const next = settleStep(
      delta,
      measure(canvas),
      { shrink, grow },
      r.visited,
    );
    if (next !== null) {
      r.own = true;
      setDelta(next);
    }
  });

  return canvas ? delta : 0;
}

/**
 * Obal pro obsah plátna, který se přizpůsobí jeho výšce: `children(delta)` vykreslí kresbu s pružnými
 * rozměry posunutými o deltu. Musí ležet uvnitř Visualizer (kontext plátna) – stránka ho dává jako
 * potomka; Fragment nevytváří box, takže pohledy zůstávají přímými potomky .viz-canvas.
 */
export function CanvasFit({
  limits,
  children,
}: {
  limits: FitLimits;
  children: (delta: number) => ReactNode;
}) {
  const delta = useCanvasFit(limits);
  return createElement(Fragment, null, children(delta));
}
