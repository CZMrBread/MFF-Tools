import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import { fmtNum, type Graph, type GraphState } from "../algos/graphs/graph";
import { useRovingFocus } from "../core/useRovingFocus";
import {
  clampPoint,
  DRAG_THRESHOLD,
  hitRadius,
  pickNearest,
  separateFrom,
} from "../core/dragMath";
import { usePointerDrag, type DragSession } from "../core/usePointerDrag";
import type { NodeGroup } from "../algos/graphs/layers";
import type { GraphEditAction, GraphSelection } from "./graphEdit";
import {
  DENSE_MIN_H,
  DENSE_MIN_W,
  denseNodeScale,
  densePads,
  fitAspectFor,
  scaledLabel,
  edgeGeometry,
  GRAPH_MAX_W,
  GRAPH_MIN_W_FIXED,
  drawingExtent,
  graphCanvasMinWidth,
  subLabelSides,
  graphViewport,
  newVertexSpot,
  vertexBox,
  keyMove,
  nodeLabel,
  R,
  boxOverflow,
  subLabelBox,
  textWidth,
  weightLabelWidth,
  type Box2,
  type P2,
  type Viewport,
} from "./graphGeometry";
import {
  classifyRelease,
  nodeAt,
  type Matrix2D,
  type PressTarget,
} from "./pointer";
import { plural } from "./text";
import { cellKey } from "./tableCells";
import { useGraphFitHeight } from "./graphFitHeight";
import { fitWidth, useWidth } from "./useWidth";

interface Props {
  graph: Graph;
  state: GraphState;
  /** přesun vrcholu; `gesture` = id tahu myší či prstem (všechna volání jednoho tahu mají stejné), u šipek chybí */
  onMove?: (id: number, x: number, y: number, gesture?: number) => void;
  height?: number;
  /** pevná šířka v px místo změřené šířky obalu */
  width?: number;
  /** přístupný název; výchozí „Graf s 8 vrcholy a 12 hranami“ */
  ariaLabel?: string;
  /**
   * „color“ (výchozí): typ hrany DFS barvou a čárkováním. „book“: jako obr. 5.9 Průvodce – nestromové
   * hrany tečkovaně v barvě obyčejné hrany, typ (zpětná / dopředná / příčná) jen popiskem.
   */
  edgeStyle?: "color" | "book";
  /** skupiny vrcholů obtažené tečkovaným zaobleným obdélníkem s popiskem nad ním (vrstvy BFS V₀…Vₖ) */
  groups?: readonly NodeGroup[];
  /**
   * Režim „Upravit graf“ (GraphEditor): klik do prázdna = vrchol, tah z vrcholu na vrchol = hrana, tah do
   * prázdna = přesun, ťuknutí na vrchol a pak na druhý = hrana, klik na hranu = výběr (cena), dlouhý stisk
   * prstem či perem na kruhu (ne myší), pravé tlačítko nebo Delete = smazat. Úpravy jdou jako akce
   * reduceru graphEdit.
   */
  edit?: GraphEditProps;
  /** režim algoritmu: klik (Enter) na vrchol = výběr počátečního vrcholu v₀ */
  onPickVertex?: (id: number) => void;
  /**
   * kresba jen k prohlížení, ale z klávesnice dostupná: jedna zastávka Tabu, šipky po vrcholech (čtečka
   * přečte vrchol i jeho popisek). Myš nic nedělá. Pro odvozené kresby (síť rezerv, vrstevnatá síť R).
   */
  browse?: boolean;
  /** vložené pole ceny u hrany `edge` (GraphEditor ho otevře po kliknutí na hranu ohodnoceného grafu) */
  editWeight?: {
    edge: number;
    onSubmit: (text: string) => void;
    onCancel: () => void;
  };
  /** matice obrazovky SVG (testy; v prohlížeči svg.getScreenCTM()) */
  screenMatrix?: () => Matrix2D | null;
  /**
   * Nejdelší popisek stavu u každého vrcholu za celý běh (subLabelReserve): místo pro něj se rezervuje
   * vždy, aby se kresba mezi kroky neposouvala. Bez něj se počítá s popisky aktuálního kroku.
   */
  subReserve?: Readonly<Record<number, string>>;
  /**
   * Další třídy hran s vlastní šipkou (fáze 4: tok, rezerva, cesta…) – barvu dá CSS `.graph-arrow.<třída>`.
   * Základní třídy (MARKER_CLASSES) šipku mají vždy; bez `markers` je kresba beze změny.
   */
  markers?: readonly string[];
  /**
   * Hustá kresba (toky, chyba vlastníka 8. 11. 2026): menší okraje a kroužky zmenšené (nejvýš na ~11 px),
   * aby se vrcholy nepřekrývaly ani v nízkém plátně (široká síť pod sebou, dlouhý řetěz vrstev). Řídká
   * kresba zůstane s poloměrem 18. Bez `dense` beze změny.
   */
  dense?: boolean;
  /**
   * Jen kresba s `aspect`: poměr stran se zvolí podle plátna v mezích [min, max] (síť párování – sloupce
   * z | L | R | s se roztáhnou do šířky panelu a řádky do jeho výšky). Souřadnice vrcholů se nemění.
   */
  fitAspect?: readonly [number, number];
  /**
   * Kresba drží rozložení (měřítko, posun) i přes změny struktury a polohy, dokud se vrcholy vejdou – jako
   * kresba v editoru. Druhá kresba toků v editoru (síť rezerv): přesun vrcholu ji nepřeměří (X-08).
   */
  holdLayout?: boolean;
}

export interface GraphEditProps {
  selected: GraphSelection | null;
  /** první vrchol hrany zadávané ťuknutím */
  source: number | null;
  dispatch: (a: GraphEditAction) => void;
  /** klik na hranu (po výběru) – GraphEditor otevře pole ceny */
  onEdgeTap?: (id: number) => void;
}

/**
 * Co se při stisku zmrazí (usePointerDrag): šířka kresby, převod souřadnic, viewBox a meze taženého
 * vrcholu. Během tahu se kresba nepřepočítá z nových poloh – jinak by se kresba s pevným poměrem stran
 * s každým pohybem zmenšila („miniaturní graf“, chyba 8. 11. 2026).
 */
interface FrozenLayout {
  w: number;
  vp: Viewport;
  /** zmenšení kroužků husté kresby */
  k: number;
  vb: { x: number; y: number; w: number; h: number };
  /** meze středu taženého vrcholu (px) */
  box: Box2;
}

/**
 * Kotva rozložení po přesunu vrcholu (kresba s pevným poměrem stran): převod souřadnic ze stisku drží i po
 * puštění, aby se kresba nepřecentrovala a ostatní vrcholy neposkočily (V-1). Platí, dokud se nezmění
 * plátno (šířka, výška), struktura grafu a dokud jsou všechny vrcholy v jeho ploše.
 */
interface LayoutAnchor {
  key: string;
  W: number;
  hmax: number;
  w: number;
  vp: Viewport;
  /** zmenšení kroužků husté kresby */
  k: number;
}

/** struktura kresby bez souřadnic – nový graf či příklad kotvu zahodí */
const anchorKey = (g: Graph) =>
  `${g.aspect ?? ""}|${g.nodes.length}|${g.edges.map((e) => `${e.u}-${e.v}-${e.bend ?? ""}`).join(",")}`;

/** popisek skupiny nad obtažením (vrstvy): 8 px okraj + 6 px mezera + písmo 13 px ≈ 18 px nad okrajem kresby */
const GROUP_LABEL_PX = 18;

/** souřadnice grafu na 4 desetinná místa (krátký odkaz, žádné 0.30000000000000004) */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

const edgeName = (g: Graph, u: number, v: number) =>
  `${g.nodes[u]?.label ?? "?"}${g.directed ? "→" : "–"}${g.nodes[v]?.label ?? "?"}`;

/** nestromové třídy hran DFS a jejich popisek ve stylu knihy */
const NON_TREE: Record<string, string> = {
  "e-back": "zpětná",
  "e-forward": "dopředná",
  "e-cross": "příčná",
};
const BOOK_EDGE = {
  stroke: "var(--algo-c-edge)",
  strokeWidth: 1.6,
  strokeDasharray: "1 4",
  strokeLinecap: "round",
} as const;
/** světlý lem pod popiskem, ať je čitelný i přes čáru */
const HALO = {
  paintOrder: "stroke",
  stroke: "var(--algo-panel)",
  strokeWidth: 3,
} as const;

const MARKER_CLASSES = [
  "",
  "e-tree",
  "e-active",
  "e-back",
  "e-cross",
  "e-forward",
  "e-rejected",
  "e-relax",
  "e-candidate",
  "e-seen",
];

/**
 * Graf v SVG ve skutečných px (šířka podle obalu, nejméně graphCanvasMinWidth). Vrcholy lze přetahovat myší
 * i prstem (větší neviditelný úchop) a posouvat Shift+šipkami, když mají fokus (samotné šipky přesouvají
 * fokus po vrcholech – roving tabindex, kresba je jedna zastávka Tabu). Graf s `aspect` (knižní
 * předvolba) se kreslí se zachovaným poměrem stran, viz graphViewport.
 */
export function GraphView({
  graph: graphProp,
  state,
  onMove,
  height = 440,
  width,
  ariaLabel,
  edgeStyle = "color",
  groups,
  edit,
  onPickVertex,
  editWeight,
  screenMatrix,
  subReserve,
  markers,
  browse = false,
  dense = false,
  fitAspect,
  holdLayout = false,
}: Props) {
  // s fitAspect se poměr stran zvolí až podle plátna (níže)
  let graph = graphProp;
  // předpona instance: dvě kresby na stránce (síť toku a síť rezerv) nesmí sdílet id šipek – jinak
  // url(#…) druhé kresby ukáže na šipku ve skryté první a šipky zmizí (UX-01)
  const markerPrefix = "gar" + useId().replace(/[^a-zA-Z0-9_]/g, "") + "-";
  /** neorientovaný graf se šipkami na některých hranách (edgeArrow) – potřebuje i šipky na začátku hrany */
  const arrowsOnUndirected =
    !graph.directed && Object.keys(state.edgeArrow ?? {}).length > 0;
  const markerClasses = markers
    ? [...MARKER_CLASSES, ...markers.filter((c) => !MARKER_CLASSES.includes(c))]
    : MARKER_CLASSES;
  /** popisek hrany: text ze stavu (tok f/c…), jinak cena ohodnoceného grafu, jinak žádný */
  const edgeLabel = (e: { id: number; w: number }): string | undefined => {
    const t = state.edgeText?.[e.id];
    // "" = hrana záměrně bez popisku (síť párování, UX-05)
    if (t === "") return undefined;
    return t ?? (graph.weighted ? fmtNum(e.w) : undefined);
  };
  const [wrapRef, measured] = useWidth();
  /** tah vrcholu v režimu úprav: náhled polohy (px) a vrchol pod ukazatelem (budoucí hrana) */
  const [preview, setPreview] = useState<{
    id: number;
    p: P2;
    over: number | null;
  } | null>(null);
  const interactive = !!(onMove || edit || onPickVertex);
  /** vrcholy jsou zastávka Tabu (interaktivní kresba, nebo jen k prohlížení – browse) */
  const focusable = interactive || browse;
  // roving tabindex (D3): kresba je jedna zastávka Tabu – šipky chodí po vrcholech (a v editoru i po
  // hranách), Shift+šipky posunou vrchol, Enter = výběr; mezerník zůstane přehrávači
  const rove = useRovingFocus(
    focusable
      ? [
          ...graph.nodes.map((n) => `n${n.id}`),
          ...(edit ? graph.edges.map((e) => `e${e.id}`) : []),
        ]
      : [],
  );
  // tah vrcholu (myš, pero, prst): práh klik/tah, úchop s posunem, meze a zmrazené rozložení
  const {
    session: dragging,
    begin: beginDrag,
    handlers: dragHandlers,
    toLocal,
    attachSvg,
  } = usePointerDrag<PressTarget, FrozenLayout>({
    screenMatrix,
    threshold: DRAG_THRESHOLD,
    clamp: (c, s) =>
      s.target.kind === "node" ? clampPoint(c, s.frozen.box) : c,
    onMove: (c, s) => dragMove(c, s),
    onRelease: (r) => release(r.session, r.pointer, r.center, r.moved, r.ms),
    onCancel: () => setPreview(null),
  });
  const fixed = graph.aspect !== undefined;
  const avail = width ?? measured;
  const W = fitWidth(
    avail,
    fixed
      ? dense
        ? DENSE_MIN_W
        : GRAPH_MIN_W_FIXED
      : graphCanvasMinWidth(graph.nodes.length, avail, { editing: !!edit }),
    GRAPH_MAX_W,
  );
  const labels = graph.nodes.map((n) => nodeLabel(n.label));
  /** zmenšení kroužků husté kresby (dense); jinak 1 */
  let nodeK = 1;
  const radius = (id: number) => (labels[id]?.r ?? R) * nodeK;
  /**
   * Rozložení na plátně w × hmax a co z něj přečnívá: kruhy vrcholů, popisky stavu (rezerva za celý
   * běh), ceny hran, popisky stylu knihy a skupin. Popisek vpravo, který by přečníval doprava, jde pod
   * vrchol. Přesah se pak odečte z plátna a viewBox ho zahrne – všechny texty jsou vidět (GRAPH-01).
   */
  const layoutWith = (w: number, vp: Viewport) => {
    const pos = graph.nodes.map((n) => vp.toPx(n.x, n.y));
    const geom = edgeGeometry(graph, w, vp.H, radius, vp.toPx);
    const sides = subLabelSides(graph, pos);
    const boxes: Box2[] = [];
    graph.nodes.forEach((_, i) => {
      const p = pos[i];
      const r = radius(i);
      boxes.push({
        x1: p.x - r - 2,
        x2: p.x + r + 2,
        y1: p.y - r - 2,
        y2: p.y + r + 2,
      });
      const text = subReserve?.[i] ?? state.nodeSub[i];
      if (!text) return;
      const font = labels[i]?.font ?? 13;
      const out = (x: Box2) => x.x1 < 0 || x.x2 > w;
      let b = subLabelBox(p, r, font, text, sides[i]);
      // popisek do strany by vyčníval z plátna: druhá strana, jinak pod vrchol
      if (sides[i] !== "below" && out(b)) {
        const other = sides[i] === "right" ? "left" : "right";
        const ob = subLabelBox(p, r, font, text, other);
        sides[i] = out(ob) ? "below" : other;
        b = out(ob) ? subLabelBox(p, r, font, text, "below") : ob;
      }
      boxes.push(b);
    });
    graph.edges.forEach((e, i) => {
      const g = geom[i];
      if (!g) return;
      const text = edgeLabel(e);
      if (text !== undefined) {
        const lw = weightLabelWidth(text);
        boxes.push({
          x1: g.lx - lw / 2,
          x2: g.lx + lw / 2,
          y1: g.ly - 9,
          y2: g.ly + 7,
        });
      }
      const book =
        edgeStyle === "book"
          ? NON_TREE[(state.edgeMarks[e.id] ?? "").split(" ")[0] ?? ""]
          : undefined;
      if (book) {
        const y = graph.weighted ? g.ly + 20 : g.ly - 5;
        const tw = textWidth(book, 11) + 3;
        boxes.push({
          x1: g.lx - tw / 2,
          x2: g.lx + tw / 2,
          y1: y - 10,
          y2: y + 4,
        });
      }
    });
    for (const gr of groups ?? []) {
      const pts = gr.nodes.map((v) => pos[v]).filter((p) => p !== undefined);
      if (!pts.length) continue;
      const x =
        (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) /
        2;
      const y = Math.min(...pts.map((p) => p.y)) - R * nodeK - 8 - 6;
      const tw = textWidth(gr.label, 13) + 3;
      boxes.push({ x1: x - tw / 2, x2: x + tw / 2, y1: y - 12, y2: y + 4 });
    }
    return { w, vp, pos, geom, sides, over: boxOverflow(boxes, w, vp.H) };
  };
  // na jednu obrazovku: výška podle volného místa v plátně (kresba 1 : 1, písmo se nezmenší); knižní
  // kresba se smí zvětšit nejvýš ~1,4× proti výchozí výšce
  // hustá kresba se vejde i do nízkého plátna (zmenší kroužky) – nepřetéká, CSS ji nezmenšuje
  const fitH = useGraphFitHeight(
    wrapRef,
    dense ? DENSE_MIN_H : 150,
    fixed ? Math.round(height * 1.4) : 2 * height,
  );
  const hmax = fitH ?? height;
  if (fixed && fitAspect)
    graph = {
      ...graph,
      // bez rozsahu kresby: posunutý vrchol poměr stran nemění (kotva po přesunu platí dál)
      aspect: fitAspectFor(W, hmax, fitAspect, densePads(1)),
    };
  const extent = fixed ? drawingExtent(graph) : undefined;
  // hustá kresba se skupinami (vrstvy R): místo pro popisky skupin nad kresbou je vždy – kresba mezi kroky
  // s vrstvami a bez nich neposkočí
  const padsFor = (k: number) => {
    if (!dense) return undefined;
    const p = densePads(
      k,
      !!subReserve || Object.values(state.nodeSub).some(Boolean),
    );
    return groups ? { ...p, top: p.top + GROUP_LABEL_PX } : p;
  };
  const layoutAt = (w: number, hm: number) =>
    layoutWith(w, graphViewport(w, hm, graph.aspect, extent, padsFor(nodeK)));
  /** zmenšení kroužků husté kresby pro plátno w × hm (1 = beze změny) */
  const denseK = (w: number, hm: number) =>
    dense
      ? denseNodeScale(
          labels.map((l) => l.r),
          (k) => {
            const v = graphViewport(w, hm, graph.aspect, extent, padsFor(k));
            return graph.nodes.map((n) => v.toPx(n.x, n.y));
          },
        )
      : 1;
  // tah vrcholu: rozložení ze stisku (viewBox, měřítko, šířka) až do puštění
  const frozen = dragging?.frozen;
  // po přesunu: rozložení ze stisku dál (kotva), dokud kresba zůstává v jeho ploše (V-1)
  const [anchor, setAnchor] = useState<LayoutAnchor | null>(null);
  const structKey = anchorKey(graph);
  const anchorSize = anchor !== null && anchor.W === W && anchor.hmax === hmax;
  const holding = !!edit || holdLayout;
  // zmenšení kroužků ze stisku či z kotvy (kresba se po puštění ani při úpravách nepřeměří)
  nodeK = frozen?.k ?? (anchor && anchorSize ? anchor.k : 1);
  // v editoru drží kotva rozložení i přes změny struktury (nový vrchol, hrana, import, Zpět), dokud se
  // vrcholy vejdou – kresba se při úpravách ani po „Hotovo“ nepřeměřuje a vrcholy neposkočí (G-05, R3)
  const anchorOk =
    fixed &&
    anchor !== null &&
    anchorSize &&
    (anchor.key === structKey || holding) &&
    graph.nodes.every((n) => {
      const p = anchor.vp.toPx(n.x, n.y);
      const r = radius(n.id);
      return (
        p.x >= r - 0.5 &&
        p.x <= anchor.w - r + 0.5 &&
        p.y >= r - 0.5 &&
        p.y <= anchor.vp.H - r + 0.5
      );
    });
  if (!frozen && !anchorOk) nodeK = denseK(W, hmax);
  let lay = frozen
    ? layoutWith(frozen.w, frozen.vp)
    : anchorOk
      ? layoutWith(anchor.w, anchor.vp)
      : layoutAt(W, hmax);
  if (!frozen && !anchorOk) {
    const o = lay.over;
    if (o.left + o.right + o.top + o.bottom > 0) {
      const w2 = Math.max(R * 4, W - o.left - o.right);
      const h2 = Math.max(R * 4, hmax - o.top - o.bottom);
      // menší plátno (přesah popisků) = vrcholy blíž u sebe – kroužky případně ještě o kus menší
      if (dense) nodeK = Math.min(nodeK, denseK(w2, h2));
      lay = layoutAt(w2, h2);
    }
  }
  if (holding && fixed && !frozen) {
    // kotva editoru: klíč struktury sleduje úpravy (po „Hotovo“ platí dál); bez kotvy (nebo po změně
    // velikosti plátna či když se vrcholy nevejdou) se zakotví dnešní rozložení
    if (anchorOk && anchor.key !== structKey)
      setAnchor({ ...anchor, key: structKey });
    else if (!anchorOk && !(anchorSize && anchor.key === structKey))
      setAnchor({ key: structKey, W, hmax, w: lay.w, vp: lay.vp, k: nodeK });
  }
  const { vp, geom } = lay;
  /** kresba (bez přesahu popisků): DW × H px; viewBox ji rozšíří o přesah popisků */
  const DW = lay.w;
  const H = vp.H;
  const vb = frozen?.vb ?? {
    x: -lay.over.left,
    y: -lay.over.top,
    w: DW + lay.over.left + lay.over.right,
    h: H + lay.over.top + lay.over.bottom,
  };
  // šipky u pevné kresby v jejím obdélníku 0…1
  const lo = vp.fromPx(R + 6, R + 6);
  const marginX = fixed ? 0 : lo.x;
  const marginY = fixed ? 0 : lo.y;
  const pos = lay.pos;
  // popisek stavu (D=1, 3/8) vpravo od vrcholu, ze kterého vede hrana svisle dolů (vrstvy BFS: 1→3),
  // když se tam vejde
  const subSide = lay.sides;

  /** po přesunu vrcholu drží kresba dnešní rozložení (kotva) – jen kresba s pevným poměrem stran */
  const keepLayout = (w: number, v: Viewport) => {
    if (fixed) setAnchor({ key: structKey, W, hmax, w, vp: v, k: nodeK });
  };
  /**
   * Puštěný vrchol nepřekryje jiný (V-5): nejbližší volné místo v mezích tahu, aspoň součet poloměrů
   * + 6 px od ostatních středů.
   */
  const separated = (id: number, c: P2, box: Box2): P2 =>
    separateFrom(
      c,
      pos.flatMap((p, j) =>
        j === id || !p ? [] : [{ p, d: radius(id) + radius(j) + 6 }],
      ),
      box,
    );
  /** px (už v mezích) → souřadnice grafu na 4 desetinná místa */
  const toGraph = (c: P2): P2 => {
    const q = vp.fromPx(c.x, c.y);
    return { x: r4(q.x), y: r4(q.y) };
  };
  /**
   * Meze středu taženého vrcholu (px): viditelné plátno a u kresby s pevným poměrem stran ještě místo,
   * kde se po puštění nezmenší měřítko (keepScaleBox) – vrchol puštěný „mimo“ zůstane na okraji.
   */
  const dragBox = (id: number): Box2 =>
    vertexBox(graph, id, vp, DW, radius(id));
  const startPress = (e: PointerEvent, target: PressTarget) => {
    if (!interactive) return;
    const id = target.kind === "node" ? target.id : null;
    beginDrag(e, target, {
      center: id !== null ? pos[id] : undefined,
      frozen: {
        w: DW,
        vp,
        k: nodeK,
        vb,
        box: id !== null ? dragBox(id) : { x1: 0, y1: 0, x2: DW, y2: H },
      },
    });
  };
  /**
   * Stisk kdekoli na kresbě (fáze zachycení): nejbližší vrchol, jehož úchop bod obsahuje – úchop je větší
   * než kruh (myš ≥ 22 px, prst ≥ 44 px), sousední úchopy rozhodne vzdálenost. V editoru má hrana či její
   * cena pod ukazatelem přednost před úchopem (ne před samotným kruhem).
   */
  /** id hrany, jejíž úchop (cesta nebo cena) leží v bodě obrazovky pod jiným prvkem; jinak null */
  const edgeBelow = (svg: Element, x: number, y: number): number | null => {
    const all = document.elementsFromPoint?.(x, y) ?? [];
    for (const el of all) {
      if (!svg.contains(el) || !el.matches(".edge-hit, .edge-label-hit"))
        continue;
      const id = Number(el.closest("[data-edge]")?.getAttribute("data-edge"));
      if (graph.edges.some((g) => g.id === id)) return id;
    }
    return null;
  };
  const onSvgPointerDown = (e: PointerEvent) => {
    if (!interactive || dragging) return;
    const p = toLocal(e);
    if (!p) return;
    const el = e.target instanceof Element ? e.target : null;
    // hrana (či cena) pod neviditelným úchopem sousedního vrcholu – úchop leží nad hranami (R3)
    const below =
      edit && el?.classList.contains("node-hit")
        ? edgeBelow(e.currentTarget, e.clientX, e.clientY)
        : null;
    const onEdge =
      !!edit && (!!el?.closest(".edge-hit, .edge-label-hit") || below !== null);
    // prvek vrcholu pod ukazatelem (i jeho popisek stavu vedle kruhu)
    const own = Number(el?.closest(".graph-node")?.getAttribute("data-node"));
    const id =
      pickNearest(pos, (i) => radius(i) + 4, p) ??
      (onEdge
        ? null
        : (pickNearest(pos, (i) => hitRadius(radius(i), e.pointerType), p) ??
          (Number.isInteger(own) && graph.nodes[own] ? own : null)));
    if (id === null) {
      if (below === null) return;
      e.stopPropagation();
      startPress(e, { kind: "edge", id: below });
      return;
    }
    e.stopPropagation();
    startPress(e, { kind: "node", id });
  };
  const dragMove = (c: P2, s: DragSession<PressTarget, FrozenLayout>) => {
    if (s.target.kind !== "node") return;
    const id = s.target.id;
    // o spojení rozhoduje střed taženého vrcholu (to, co uživatel vidí), ne ukazatel (V-6)
    if (edit) setPreview({ id, p: c, over: nodeAt(pos, radius, c, 4, id) });
    else if (onMove) {
      const q = toGraph(c);
      onMove(id, q.x, q.y, s.gesture);
    }
  };
  const release = (
    s: DragSession<PressTarget, FrozenLayout>,
    p: P2,
    c: P2,
    moved: boolean,
    ms: number,
  ) => {
    setPreview(null);
    const t = s.target;
    // spojení podle středu taženého vrcholu (V-6)
    const over = t.kind === "node" ? nodeAt(pos, radius, c, 4, t.id) : null;
    let out = classifyRelease({
      start: s.start,
      end: p,
      ms,
      target: t,
      over,
      mode: edit ? "edit" : "run",
      moved,
      pointerType: s.pointerType,
    });
    // dlouhý stisk maže jen na viditelném kruhu, ne v neviditelném úchopu vedle něj (V-3)
    if (out.kind === "long-press" && t.kind === "node") {
      const q = pos[t.id];
      if (!q || Math.hypot(s.start.x - q.x, s.start.y - q.y) > radius(t.id) + 4)
        out = { kind: "tap" };
    }
    if (out.kind === "move" && t.kind === "node") {
      keepLayout(s.frozen.w, s.frozen.vp);
      const free = separated(t.id, c, s.frozen.box);
      if (!edit) {
        if (free.x !== c.x || free.y !== c.y) {
          const q = toGraph(free);
          onMove?.(t.id, q.x, q.y, s.gesture);
        }
        return;
      }
      const q = toGraph(free);
      edit.dispatch({ type: "move", id: t.id, x: q.x, y: q.y });
      return;
    }
    if (!edit) {
      if (out.kind === "tap" && t.kind === "node") onPickVertex?.(t.id);
      return;
    }
    const d = edit.dispatch;
    if (out.kind === "long-press" && t.kind !== "empty")
      d({ type: "remove", target: t });
    else if (out.kind === "connect" && t.kind === "node")
      d({ type: "connect", from: t.id, to: out.to });
    else if (out.kind === "tap") {
      if (t.kind === "node") d({ type: "tapVertex", id: t.id });
      else if (t.kind === "edge") {
        d({ type: "select", target: t });
        edit.onEdgeTap?.(t.id);
      } else if (edit.selected || edit.source !== null)
        d({ type: "select", target: null });
      else {
        // nový vrchol pod kliknutím i v okraji letterboxu, ne na jiném vrcholu; kresba drží dnešní
        // rozložení (kotva pro graf o vrchol větší), ostatní vrcholy se neposunou (G-05)
        const spot = newVertexSpot(graph, vp, DW, p, radius, pos);
        const q = toGraph(spot.p);
        if (fixed)
          setAnchor({
            key: anchorKey({
              ...graph,
              nodes: [
                ...graph.nodes,
                { id: graph.nodes.length, label: "", x: q.x, y: q.y },
              ],
            }),
            W,
            hmax,
            w: DW,
            vp,
            k: nodeK,
          });
        d({ type: "addVertex", x: q.x, y: q.y, moved: spot.moved });
      }
    }
  };
  /** klávesa patří vrcholu či hraně – přehrávač (posluchač na window) ani roving tabindex ji nedostanou */
  const own = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onKey = (e: KeyboardEvent, id: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // mezerník = přehrávač (D3), jen Enter vybírá
    if (e.key === "Enter") {
      if (edit) edit.dispatch({ type: "tapVertex", id });
      else if (onPickVertex) onPickVertex(id);
      else return;
      own(e);
      return;
    }
    if (edit && (e.key === "Delete" || e.key === "Backspace")) {
      own(e);
      edit.dispatch({ type: "remove", target: { kind: "node", id } });
      return;
    }
    const mover = edit
      ? (i: number, x: number, y: number) =>
          edit.dispatch({ type: "move", id: i, x, y })
      : onMove;
    // přesun = Shift+šipky; samotné šipky přesouvají fokus (useRovingFocus)
    if (!mover || !e.shiftKey) return;
    const n = graph.nodes[id];
    const p = keyMove(e.key, false, n.x, n.y, marginX, marginY);
    if (!p) return;
    own(e);
    keepLayout(DW, vp);
    mover(id, r4(p.x), r4(p.y));
  };
  const onEdgeKey = (e: KeyboardEvent, id: number) => {
    if (!edit || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      own(e);
      edit.dispatch({ type: "select", target: { kind: "edge", id } });
      edit.onEdgeTap?.(id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      own(e);
      edit.dispatch({ type: "remove", target: { kind: "edge", id } });
    }
  };
  /** pravé tlačítko myši = smazat (jako ve VisuAlgo); na dotyku místo kontextové nabídky dlouhý stisk */
  const onContext = (
    e: { preventDefault: () => void; nativeEvent: Event },
    t: PressTarget,
  ) => {
    if (!edit || t.kind === "empty") return;
    e.preventDefault();
    const pt = (e.nativeEvent as { pointerType?: string }).pointerType;
    if (pt === "touch" || pt === "pen") return;
    edit.dispatch({ type: "remove", target: t });
  };
  const sel = edit?.selected;
  const nodeName = (n: { label: string; id: number }) => {
    if (edit)
      return `Vrchol ${n.label} – Enter = spojit s dalším vrcholem, Delete = smazat, Shift+šipky = posun`;
    const sub = state.nodeSub[n.id] ? ` (${state.nodeSub[n.id]})` : "";
    const parts = [`Vrchol ${n.label}${sub}`];
    if (onMove) parts.push("Shift+šipky = posun");
    if (onPickVertex) parts.push("Enter = počáteční vrchol");
    return parts.join(" – ");
  };

  const name =
    ariaLabel ??
    `Graf s ${graph.nodes.length} ${plural(graph.nodes.length, "vrcholem", "vrcholy", "vrcholy")} a ${graph.edges.length} ${plural(graph.edges.length, "hranou", "hranami", "hranami")}`;

  return (
    <div className="graph-wrap view-wrap" ref={wrapRef}>
      <svg
        ref={attachSvg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width={vb.w}
        height={vb.h}
        className={
          "graph-svg" +
          (onMove ? " draggable" : "") +
          (edit ? " editing" : "") +
          (onPickVertex && !edit ? " pickable" : "") +
          (dragging?.moved ? " is-dragging" : "")
        }
        role={focusable ? "group" : "img"}
        aria-label={name}
        {...(focusable ? rove.group : {})}
        onPointerDownCapture={onSvgPointerDown}
        {...dragHandlers}
      >
        <defs>
          {[false, ...(arrowsOnUndirected ? [true] : [])].flatMap((start) =>
            markerClasses.map((c) => (
              // štíhlá šipka pevné velikosti jako v knize (nezávisí na tloušťce čáry); „s“ = na začátku hrany
              <marker
                key={(start ? "s" : "") + c}
                id={markerPrefix + (start ? "s" : "") + c}
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="11"
                markerHeight="7"
                preserveAspectRatio="none"
                orient={start ? "auto-start-reverse" : "auto"}
              >
                <path d="M0,0 L10,5 L0,10 z" className={"graph-arrow " + c} />
              </marker>
            )),
          )}
        </defs>
        {edit && (
          <rect
            className="graph-bg"
            x={vb.x}
            y={vb.y}
            width={vb.w}
            height={vb.h}
            onPointerDown={(e) => startPress(e, { kind: "empty" })}
          />
        )}
        {groups?.map((gr, i, all) => {
          const pts = gr.nodes
            .map((v) => pos[v])
            .filter((p) => p !== undefined);
          if (!pts.length) return null;
          const pad = R * nodeK + 8;
          // fullHeight: svislý rozsah všech takových skupin (sloupce vrstev mají stejnou výšku)
          const ys = (
            gr.fullHeight
              ? all.filter((o) => o.fullHeight).flatMap((o) => o.nodes)
              : gr.nodes
          )
            .map((v) => pos[v]?.y)
            .filter((v) => v !== undefined);
          const x = Math.min(...pts.map((p) => p.x)) - pad;
          const y = Math.min(...ys) - pad;
          const w = Math.max(...pts.map((p) => p.x)) - x + pad;
          const h = Math.max(...ys) - y + pad;
          return (
            <g key={i} className="graph-group">
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={Math.min(w, h) / 2}
                style={{
                  fill: "none",
                  stroke: "var(--algo-muted)",
                  strokeWidth: 1.2,
                  strokeDasharray: "1 3",
                  strokeLinecap: "round",
                }}
              />
              <text
                x={x + w / 2}
                y={y - 6}
                textAnchor="middle"
                className="graph-group-label"
                style={{
                  fill: "var(--algo-text)",
                  fontStyle: "italic",
                  fontSize: 13,
                }}
              >
                {gr.label}
              </text>
            </g>
          );
        })}
        {graph.edges.map((e, i) => {
          const cls = state.edgeMarks[e.id] ?? "";
          const g = geom[i];
          const first = cls.split(" ")[0] ?? "";
          const w = fmtNum(e.w);
          const label = edgeLabel(e);
          const lw = weightLabelWidth(label ?? w);
          const bookClass = edgeStyle === "book" ? NON_TREE[first] : undefined;
          const arrowTo = graph.directed ? undefined : state.edgeArrow?.[e.id];
          const arrowCls =
            !bookClass && markerClasses.includes(first) ? first : "";
          const picked = sel?.kind === "edge" && sel.id === e.id;
          // v editoru je číslo ceny (nejzřejmější cíl) totéž co hrana: klik otevře pole ceny
          const labelPress = edit
            ? {
                onPointerDown: (ev: PointerEvent) =>
                  startPress(ev, { kind: "edge", id: e.id }),
                onContextMenu: (ev: ReactMouseEvent) =>
                  onContext(ev, { kind: "edge", id: e.id }),
              }
            : {};
          return (
            <g
              key={e.id}
              data-edge={e.id}
              className={
                "graph-edge " +
                cls +
                (bookClass ? " book-nontree" : "") +
                (picked ? " is-selected" : "")
              }
            >
              <path
                d={g.d}
                style={bookClass ? BOOK_EDGE : undefined}
                markerEnd={
                  graph.directed || arrowTo === "v" || arrowTo === "both"
                    ? `url(#${markerPrefix}${arrowCls})`
                    : undefined
                }
                markerStart={
                  !graph.directed && (arrowTo === "u" || arrowTo === "both")
                    ? `url(#${markerPrefix}s${arrowCls})`
                    : undefined
                }
              />
              {bookClass && (
                <text
                  x={g.lx}
                  y={graph.weighted ? g.ly + 20 : g.ly - 5}
                  textAnchor="middle"
                  className="edge-label edge-class-label"
                  style={{ ...HALO, fontStyle: "italic", fontWeight: 400 }}
                >
                  {bookClass}
                </text>
              )}
              {edit && (
                <path
                  className="edge-hit"
                  d={g.d}
                  {...rove.item(`e${e.id}`)}
                  role="button"
                  aria-label={`Hrana ${edgeName(graph, e.u, e.v)}${graph.weighted ? `, cena ${w}` : ""}`}
                  aria-pressed={picked}
                  onPointerDown={(ev) =>
                    startPress(ev, { kind: "edge", id: e.id })
                  }
                  onKeyDown={(ev) => onEdgeKey(ev, e.id)}
                  onContextMenu={(ev) =>
                    onContext(ev, { kind: "edge", id: e.id })
                  }
                />
              )}
              {label !== undefined && (
                <>
                  <rect
                    x={g.lx - lw / 2}
                    y={g.ly - 9}
                    width={lw}
                    height={16}
                    rx={4}
                    className={
                      "edge-label-bg" + (edit ? " edge-label-hit" : "")
                    }
                    {...labelPress}
                  />
                  <text
                    x={g.lx}
                    y={g.ly + 4}
                    textAnchor="middle"
                    className={"edge-label" + (edit ? " edge-label-hit" : "")}
                    {...labelPress}
                  >
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {preview && preview.over !== null && pos[preview.id] && (
          <line
            className="graph-preview"
            x1={pos[preview.id].x}
            y1={pos[preview.id].y}
            x2={pos[preview.over].x}
            y2={pos[preview.over].y}
          />
        )}
        {graph.nodes.map((n) => {
          const lab = scaledLabel(labels[n.id], nodeK);
          const moving =
            preview !== null && preview.id === n.id && preview.over === null;
          const p = moving ? preview.p : pos[n.id];
          const picked = sel?.kind === "node" && sel.id === n.id;
          return (
            <g
              key={n.id}
              className={
                "graph-node " +
                (state.nodeMarks[n.id] ?? "") +
                (picked ? " is-selected" : "") +
                (edit?.source === n.id ? " is-source" : "") +
                (preview?.over === n.id ? " is-target" : "") +
                (moving ? " is-moving" : "")
              }
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              data-node={n.id}
              {...(focusable ? rove.item(`n${n.id}`) : {})}
              role={interactive ? "button" : focusable ? "img" : undefined}
              aria-label={focusable ? nodeName(n) : undefined}
              aria-pressed={edit ? picked : undefined}
              onKeyDown={interactive ? (e) => onKey(e, n.id) : undefined}
              onContextMenu={(e) => onContext(e, { kind: "node", id: n.id })}
            >
              <title>{n.label}</title>
              {interactive && <circle r={lab.r + 12} className="node-hit" />}
              <circle r={lab.r} />
              <text
                y={lab.font / 2 - 1}
                textAnchor="middle"
                className="node-label"
                style={lab.font !== 13 ? { fontSize: lab.font } : undefined}
              >
                {lab.text}
              </text>
              {state.nodeSub[n.id] && (
                <text
                  {...(subSide[n.id] === "right"
                    ? { x: lab.r + 4, y: lab.font / 2 + 8, textAnchor: "start" }
                    : subSide[n.id] === "left"
                      ? {
                          x: -(lab.r + 4),
                          y: lab.font / 2 + 8,
                          textAnchor: "end",
                        }
                      : { y: lab.r + 14, textAnchor: "middle" })}
                  className="node-sub"
                  style={HALO}
                >
                  {state.nodeSub[n.id]}
                </text>
              )}
            </g>
          );
        })}
        {editWeight &&
          geom[editWeight.edge] &&
          graph.edges[editWeight.edge] && (
            <WeightField
              key={editWeight.edge}
              x={geom[editWeight.edge].lx}
              y={geom[editWeight.edge].ly}
              value={fmtNum(graph.edges[editWeight.edge].w)}
              label={`Cena hrany ${edgeName(graph, graph.edges[editWeight.edge].u, graph.edges[editWeight.edge].v)}`}
              onSubmit={editWeight.onSubmit}
              onCancel={editWeight.onCancel}
            />
          )}
      </svg>
    </div>
  );
}

/** Vložené pole ceny hrany na plátně: Enter / opuštění pole = uložit, Esc = zrušit. */
function WeightField({
  x,
  y,
  value,
  label,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  value: string;
  label: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (submit) onSubmit(ref.current?.value ?? value);
    else onCancel();
  };
  return (
    <foreignObject x={x - 42} y={y - 17} width={84} height={34}>
      <input
        ref={ref}
        className="edge-weight-input"
        type="text"
        inputMode="decimal"
        defaultValue={value}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
    </foreignObject>
  );
}

/**
 * Tabulka pomocné struktury (fronta, zásobník, halda…). Řádky bez buněk (prázdná fronta) = „(prázdné)“.
 * `highlight` zvýrazní řádek, `cellMarks` jednotlivé buňky (třídy cell-hot / cell-active / cell-done /
 * cell-found v index.css).
 */
export function TableView({
  table,
}: {
  table: NonNullable<GraphState["table"]>;
}) {
  const empty = table.rows.every((r) => r.length === 0);
  const box = useRef<HTMLDivElement>(null);
  // zásobník: po změně posunout kontejner (ne okno) na konec, aby byl aktuální vrchol vidět
  const content = table.rows.map((r) => r.join("\u0001")).join("\u0002");
  useEffect(() => {
    const el = box.current;
    if (!el || !table.tail) return;
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = el.scrollHeight;
  }, [content, table.tail]);
  // jedna řada bez hlavičky (fronta, zásobník, topologické pořadí): dlaždice, které se zalamují
  const tiles = table.header.length === 0 && table.rows.length <= 1;
  if (tiles) {
    const row = table.rows[0] ?? [];
    return (
      <div className="gtable">
        <div className="gtable-title">{table.title}</div>
        <div className="table-scroll" ref={box}>
          {row.length === 0 ? (
            <p className="muted">(prázdné)</p>
          ) : (
            <ol className="gtable-tiles">
              {row.map((c, j) => {
                const mark = table.cellMarks?.[cellKey(0, j)];
                return (
                  <li
                    key={j}
                    className={"gtable-tile" + (mark ? ` ${mark}` : "")}
                  >
                    {c}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="gtable">
      <div className="gtable-title">{table.title}</div>
      <div className="table-scroll" ref={box}>
        <table>
          {table.header.length > 0 && (
            <thead>
              <tr>
                {table.header.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {!empty &&
              table.rows.map((r, i) => (
                <tr key={i} className={i === table.highlight ? "hl" : ""}>
                  {r.map((c, j) => (
                    <td key={j} className={table.cellMarks?.[cellKey(i, j)]}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            {empty && (
              <tr>
                <td
                  colSpan={Math.max(1, table.header.length)}
                  className="muted"
                >
                  (prázdné)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
