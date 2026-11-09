/**
 * D3 část Mapy předmětů: silový graf vykreslený do předaného `<svg>`. Přepis skriptu
 * ze staré stránky specializace/index.html – stejné síly, parametry, třídy a pořadí
 * kroků. React do obsahu `<svg>` nezasahuje; stav (filtr stupně, vybrané
 * specializace, zvýrazněné předměty) drží React a posílá ho sem přes metody
 * {@link GraphController}.
 *
 * Názvy tříd (`node`, `node-spec`, `selected`, `dimmed`, …) jsou stejné jako ve staré
 * stránce; styly k nim jsou v MapGraph.module.css.
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  zoomIdentity,
} from "d3";
import type { D3ZoomEvent, SimulationNodeDatum } from "d3";
import {
  buildSubjectToSpecs,
  computeSubjectHighlight,
  countSpecLinks,
  filterByDegree,
  isCommonMandatory,
  matchesAllSelected,
  pullsToCenter,
  selectionColor,
  specCirclePositions,
  specIdsByStudyType,
  specTooltip,
  subjectBaseColor,
  subjectTooltip,
  wrapLineDy,
  wrapWords,
} from "../lib/map";
import type { DegreeFilter, LinkEnds, TooltipContent } from "../lib/map";
import type { SpecNode, StudyLink, StudyNode, SubjectNode } from "../lib/types";

/** Rozměry kreslicí plochy (viewBox) a kružnice specializací – jako ve starém kódu. */
export const GRAPH_WIDTH = 1200;
export const GRAPH_HEIGHT = 900;
const CENTER_X = GRAPH_WIDTH / 2;
const CENTER_Y = GRAPH_HEIGHT / 2;
const SPEC_CIRCLE_RADIUS = 300;
/** Šířka, na kterou se zalamují popisky specializací. */
const SPEC_LABEL_WIDTH = 110;

/** Data grafu: uzly z nodes.json (uzly `program_req` se přeskočí) a hrany z links.json. */
export interface GraphData {
  nodes: readonly StudyNode[];
  links: readonly StudyLink[];
}

export interface GraphCallbacks {
  /** Klik na specializaci – přepnutí v aktivním výběru. */
  onSpecClick: (specId: string) => void;
  /** Klik na předmět; `circle` je kruh uzlu, ke kterému se váže popover. */
  onSubjectClick: (subject: SubjectNode, circle: SVGCircleElement) => void;
  /** Kurzor najel na uzel – obsah tooltipu. */
  onNodeEnter: (content: TooltipContent) => void;
  /** Pohyb kurzoru nad uzlem (souřadnice okna). */
  onNodeMove: (clientX: number, clientY: number) => void;
  onNodeLeave: () => void;
  /** Uzly se pohnuly (krok simulace) nebo se změnil zoom – popover se má přepočítat. */
  onLayout: () => void;
}

export interface GraphController {
  /**
   * Použije filtr stupně (starý `applyStudyFilter`): skryje ostatní uzly a hrany,
   * rozmístí viditelné specializace po kružnici a znovu rozhýbe simulaci. Volá se i
   * pro už aktivní filtr – stejně jako klik na aktivní tlačítko ve staré stránce.
   */
  applyFilter: (filter: DegreeFilter) => void;
  /** Nastaví vybrané specializace a překreslí průnik (starý `updateHighlights`). */
  setSelectedSpecs: (selected: ReadonlySet<string>) => void;
  /** Nastaví předměty vybrané přes „Zobrazit specializace" (starý `updateSubjHighlights`). */
  setHighlightSources: (sources: ReadonlySet<string>) => void;
  /** Přiblíží/oddálí násobkem `factor` (přechod 200 ms). */
  zoomBy: (factor: number) => void;
  /** Vrátí výchozí pohled (přechod 300 ms). */
  resetZoom: () => void;
  /** Zastaví simulaci a přechody, odpojí posluchače a vyprázdní `<svg>`. */
  destroy: () => void;
}

interface SpecSimNode extends SimulationNodeDatum {
  group: "spec";
  id: string;
  spec: SpecNode;
}

interface SubjectSimNode extends SimulationNodeDatum {
  group: "subj";
  id: string;
  subject: SubjectNode;
  /** Společný povinný předmět (staré `commonMandatory`). */
  commonMandatory: boolean;
  baseColor: string;
}

type SimNode = SpecSimNode | SubjectSimNode;

interface SimLink {
  source: SimNode;
  target: SimNode;
  index?: number;
}

function isSpec(node: SimNode): node is SpecSimNode {
  return node.group === "spec";
}

function isSubject(node: SimNode): node is SubjectSimNode {
  return node.group === "subj";
}

function nodeRadius(node: SimNode): number {
  return node.group === "spec" ? node.spec.radius : node.subject.radius;
}

function nodeColor(node: SimNode): string {
  return node.group === "spec" ? node.spec.color : node.baseColor;
}

function placeOnCircle(specs: readonly SpecSimNode[]): void {
  const positions = specCirclePositions(
    specs.length,
    CENTER_X,
    CENTER_Y,
    SPEC_CIRCLE_RADIUS,
  );
  specs.forEach((node, i) => {
    const position = positions[i];
    if (!position) return;
    node.fx = position.x;
    node.fy = position.y;
  });
}

/**
 * Zalomí popisek do `<tspan>` řádků (starý `wrap`). Šířku měří prohlížeč; kde měření
 * není k dispozici (jsdom), zůstane text na jednom řádku.
 */
function wrapLabel(textElement: SVGTextElement, width: number): void {
  const text = select(textElement);
  const content = text.text();
  const x = text.attr("x") || 0;
  const y = text.attr("y") || 0;
  const dy = parseFloat(text.attr("dy")) || 0;
  text.text(null);

  const appendLine = (lineIndex: number) =>
    text
      .append("tspan")
      .attr("x", x)
      .attr("y", y)
      .attr("dy", wrapLineDy(lineIndex, dy));

  const first = appendLine(0);
  const firstElement = first.node();
  const lines = wrapWords(content, width, (line) => {
    first.text(line);
    return firstElement &&
      typeof firstElement.getComputedTextLength === "function"
      ? firstElement.getComputedTextLength()
      : 0;
  });
  lines.forEach((line, i) => {
    (i === 0 ? first : appendLine(i)).text(line);
  });
}

interface PullTarget {
  d: SubjectSimNode;
  specs: SpecSimNode[];
  toCenter: boolean;
}

/** Cíle síly pullToSpecs pro aktivní hrany (staré `rebuildPullTargets`). */
function buildPullTargets(
  activeLinks: readonly SimLink[],
  visibleSpecCount: number,
): PullTarget[] {
  const bySubject = new Map<SubjectSimNode, SpecSimNode[]>();
  for (const { source, target } of activeLinks) {
    const subject = isSubject(source) ? source : target;
    const spec = isSpec(source) ? source : target;
    if (!isSubject(subject) || !isSpec(spec)) continue;
    const specs = bySubject.get(subject);
    if (specs) specs.push(spec);
    else bySubject.set(subject, [spec]);
  }
  return Array.from(bySubject, ([d, specs]) => ({
    d,
    specs,
    toCenter: pullsToCenter(d.commonMandatory, specs.length, visibleSpecCount),
  }));
}

/** Vykreslí graf do `svgElement` a spustí simulaci. Filtr se nastaví až `applyFilter`. */
export function createGraph(
  svgElement: SVGSVGElement,
  data: GraphData,
  callbacks: GraphCallbacks,
): GraphController {
  // --- Data: vlastní objekty uzlů a hran (D3 je mění, vstupní data zůstávají netknutá)
  // „Společný povinný" = povinný ve všech specializacích daného stupně (má-li stupeň
  // aspoň dvě specializace).
  const specsByType = specIdsByStudyType(
    data.nodes.filter((node): node is SpecNode => node.group === "spec"),
  );
  const simNodes: SimNode[] = [];
  for (const node of data.nodes) {
    if (node.group === "spec") {
      simNodes.push({ group: "spec", id: node.id, spec: node });
    } else if (node.group === "subj") {
      const commonMandatory = isCommonMandatory(node, specsByType);
      simNodes.push({
        group: "subj",
        id: node.id,
        subject: node,
        commonMandatory,
        baseColor: subjectBaseColor(node, commonMandatory),
      });
    }
  }
  const nodeById = new Map(simNodes.map((node) => [node.id, node]));
  const simLinks: SimLink[] = [];
  for (const link of data.links) {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    if (source && target) simLinks.push({ source, target });
  }
  const linkEnds: LinkEnds[] = simLinks.map((link) => ({
    source: link.source.id,
    target: link.target.id,
  }));
  const subjectToSpecs = buildSubjectToSpecs(linkEnds);
  const specNodes = simNodes.filter(isSpec);
  const filterNodes = simNodes.map((node) =>
    node.group === "spec"
      ? { id: node.id, study_type: node.spec.study_type }
      : { id: node.id },
  );
  const studyTypeOf = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    return node?.group === "spec" ? node.spec.study_type : undefined;
  };

  placeOnCircle(specNodes);

  // --- Stav posílaný z Reactu
  let currentFilter: DegreeFilter = "all";
  let selectedSpecs: ReadonlySet<string> = new Set();
  let highlightSources: ReadonlySet<string> = new Set();
  /**
   * Cíle síly pullToSpecs: pro každý předmět s AKTIVNÍ hranou specializace na jejím
   * druhém konci. Přepočítává se jen při změně filtru (staré `rebuildPullTargets`).
   */
  let pullTargets: PullTarget[] = [];

  // --- SVG
  const svg = select<SVGSVGElement, unknown>(svgElement);

  // Zoom/pan: veškerý obsah (hrany i uzly) žije uvnitř <g class="zoom-layer">,
  // na kterou se aplikuje transformace ze zoom chování.
  const zoomLayer = svg.append("g").attr("class", "zoom-layer");

  const zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 8])
    .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      zoomLayer.attr("transform", event.transform.toString());
      callbacks.onLayout();
    });

  svg.call(zoomBehavior);

  const link = zoomLayer
    .append("g")
    .selectAll<SVGLineElement, SimLink>("line")
    .data(simLinks)
    .join("line")
    .attr("class", "link")
    .attr("id", (d) => `link-${d.source.id}-${d.target.id}`);

  const node = zoomLayer
    .append("g")
    .selectAll<SVGGElement, SimNode>("g")
    .data(simNodes)
    .join("g")
    .attr(
      "class",
      (d) => "node " + (d.group === "spec" ? "node-spec" : "node-subj"),
    )
    .attr("id", (d) => "node-" + d.id);
  const specNode = node.filter(isSpec);
  const subjNode = node.filter(isSubject);

  node
    .append("circle")
    .attr("r", nodeRadius)
    .attr("fill", nodeColor)
    .style("color", nodeColor);
  specNode
    .append("text")
    .attr("x", 0)
    .attr("y", 32)
    .attr("text-anchor", "middle")
    .text((d) => (d.group === "spec" ? d.spec.label : ""))
    .each(function () {
      wrapLabel(this, SPEC_LABEL_WIDTH);
    });
  subjNode
    .append("text")
    .attr("dy", 4)
    .attr("text-anchor", "middle")
    .style("font-size", "8px")
    .text((d) => d.id);

  // --- Simulace
  const linkForce = forceLink<SimNode, SimLink>(simLinks)
    .id((d) => d.id)
    .distance(30)
    .strength(0.1);

  /**
   * Vlastní síla: táhne každý předmět do těžiště specializací, se kterými je spojen
   * AKTIVNÍ hranou (tj. hranou viditelnou v aktuálním filtru); společné povinné
   * předměty a předměty ve všech viditelných specializacích přímo doprostřed.
   */
  function pullToSpecs(alpha: number): void {
    for (const { d, specs, toCenter } of pullTargets) {
      let targetX = CENTER_X;
      let targetY = CENTER_Y;
      if (!toCenter) {
        targetX = 0;
        targetY = 0;
        for (const spec of specs) {
          targetX += spec.x ?? 0;
          targetY += spec.y ?? 0;
        }
        targetX /= specs.length;
        targetY /= specs.length;
      }
      d.vx = (d.vx ?? 0) + (targetX - (d.x ?? 0)) * alpha * 0.6;
      d.vy = (d.vy ?? 0) + (targetY - (d.y ?? 0)) * alpha * 0.6;
    }
  }

  // Krok simulace překresluje jen uzly a hrany, které jsou v simulaci (při filtru
  // stupně jen viditelné); skryté stojí, nemá smysl je posouvat.
  let activeNodeSel = node;
  let activeLinkSel = link;

  function ticked(): void {
    activeNodeSel.attr("transform", (d) => {
      const padding = d.group === "spec" ? 20 : 15;
      d.x = Math.max(padding, Math.min(GRAPH_WIDTH - padding, d.x ?? 0));
      d.y = Math.max(padding, Math.min(GRAPH_HEIGHT - padding - 15, d.y ?? 0));
      return `translate(${d.x},${d.y})`;
    });
    activeLinkSel
      .attr("x1", (d) => d.source.x ?? 0)
      .attr("y1", (d) => d.source.y ?? 0)
      .attr("x2", (d) => d.target.x ?? 0)
      .attr("y2", (d) => d.target.y ?? 0);

    // Otevřený popover se musí držet nad pohybujícím se kruhem.
    callbacks.onLayout();
  }

  // Kolize s 1 iterací a rychlejší ustálení (alphaDecay 0.035) – jako na staré stránce.
  const simulation = forceSimulation<SimNode, SimLink>(simNodes)
    .alphaDecay(0.035)
    .force("link", linkForce)
    .force(
      "charge",
      forceManyBody<SimNode>().strength((d) => (d.group === "spec" ? 0 : -25)),
    )
    .force(
      "collide",
      forceCollide<SimNode>()
        .radius((d) => nodeRadius(d) + 6)
        .iterations(1),
    )
    .force("pullToSpecs", pullToSpecs)
    .on("tick", ticked);

  // --- Průnik specializací (klik na uzly specializací)
  function updateHighlights(): void {
    if (selectedSpecs.size === 0) {
      node
        .classed("selected", false)
        .classed("highlighted", false)
        .classed("dimmed", false);
      subjNode.select("circle").attr("fill", nodeColor).style("filter", null);
      link
        .classed("highlighted", false)
        .classed("dimmed", false)
        .style("stroke", null);
      return;
    }

    specNode.classed("selected", (d) => selectedSpecs.has(d.id));

    const highlightedSubjects = new Set<string>();
    subjNode.each(function (d) {
      if (d.group !== "subj") return;
      const matches = matchesAllSelected(
        selectedSpecs,
        subjectToSpecs.get(d.id) ?? [],
      );
      const element = select(this);
      element.classed("highlighted", matches).classed("dimmed", !matches);

      if (matches) {
        highlightedSubjects.add(d.id);
        // Zvýrazněný uzel navrch, aby nezůstal schovaný za utlumenými.
        element.raise();
        const color = selectionColor(
          d.subject,
          d.commonMandatory,
          selectedSpecs,
          d.baseColor,
        );
        element
          .select("circle")
          .attr("fill", color)
          .style("filter", `drop-shadow(0 0 10px ${color}80)`);
      } else {
        element.select("circle").attr("fill", null).style("filter", "none");
      }
    });

    // Hrana svítí barvou cílové specializace, když vede ze zvýrazněného předmětu do
    // vybrané specializace; ostatní hrany jsou ztlumené.
    const isActive = (d: SimLink) =>
      highlightedSubjects.has(d.source.id) && selectedSpecs.has(d.target.id);
    link
      .classed("highlighted", isActive)
      .classed("dimmed", (d) => !isActive(d))
      .style("stroke", (d) =>
        isActive(d) && d.target.group === "spec" ? d.target.spec.color : null,
      );

    // Uzly specializací znovu navrch, aby byly nad hranami i předměty.
    specNode.raise();
  }

  // --- Zvýraznění specializací podle vybraných předmětů (tlačítko v popoveru)
  function updateSubjectHighlights(): void {
    if (highlightSources.size === 0) {
      node
        .classed("subj-emphasized-and", false)
        .classed("subj-emphasized-or", false)
        .classed("subj-source", false)
        .classed("subj-faded", false);
      link
        .classed("subj-highlighted-and", false)
        .classed("subj-highlighted-or", false);
      return;
    }

    const highlight = computeSubjectHighlight(highlightSources, subjectToSpecs);

    // Zvýrazněné: vybrané předměty + specializace ve skupině AND / jen OR.
    specNode
      .classed("subj-emphasized-and", (d) => highlight.and.has(d.id))
      .classed("subj-emphasized-or", (d) => highlight.or.has(d.id));
    subjNode.classed("subj-source", (d) => highlightSources.has(d.id));

    // Vše ostatní lehce zešedne, ale zůstává klikatelné.
    specNode.classed(
      "subj-faded",
      (d) => !highlight.and.has(d.id) && !highlight.or.has(d.id),
    );
    subjNode.classed("subj-faded", (d) => !highlightSources.has(d.id));

    link
      .classed(
        "subj-highlighted-and",
        (d) =>
          highlightSources.has(d.source.id) && highlight.and.has(d.target.id),
      )
      .classed(
        "subj-highlighted-or",
        (d) =>
          highlightSources.has(d.source.id) && highlight.or.has(d.target.id),
      );
  }

  // --- Filtr stupně studia
  function applyFilter(filter: DegreeFilter): void {
    currentFilter = filter;
    const visible = filterByDegree(filterNodes, linkEnds, filter);

    node.classed("filtered-out", (d) => !visible.nodeIds.has(d.id));
    link.classed("filtered-out", (_, i) => visible.linkVisible[i] !== true);

    // Do simulace patří jen viditelné uzly a hrany.
    const activeNodes = simNodes.filter((n) => visible.nodeIds.has(n.id));
    const activeLinks = simLinks.filter(
      (_, i) => visible.linkVisible[i] === true,
    );

    // Viditelné specializace se znovu rozmístí po kružnici…
    const activeSpecs = activeNodes.filter(isSpec);
    placeOnCircle(activeSpecs);

    // …a skryté se uvolní, aby při mizení nezpůsobovaly kolize.
    const activeSpecSet = new Set(activeSpecs);
    for (const spec of specNodes) {
      if (!activeSpecSet.has(spec)) {
        spec.fx = null;
        spec.fy = null;
      }
    }

    simulation.nodes(activeNodes);
    linkForce.links(activeLinks);
    pullTargets = buildPullTargets(activeLinks, activeSpecs.length);
    if (filter === "all") {
      activeNodeSel = node;
      activeLinkSel = link;
    } else {
      const activeNodeSet = new Set(activeNodes);
      const activeLinkSet = new Set(activeLinks);
      activeNodeSel = node.filter((d) => activeNodeSet.has(d));
      activeLinkSel = link.filter((d) => activeLinkSet.has(d));
    }

    // Simulace se znovu rozhýbe: specializace sjedou na nová místa na kružnici a síla
    // pullToSpecs za nimi přitáhne předměty.
    simulation.alpha(0.5).restart();
    updateHighlights();
    updateSubjectHighlights();
  }

  // --- Události uzlů
  node.on("click", function (event: MouseEvent, d) {
    if (d.group === "spec") {
      callbacks.onSpecClick(d.id);
    } else {
      // Aby klik hned nespustil globální zavírání popoveru „klikem mimo".
      event.stopPropagation();
      const circle = this.querySelector("circle");
      if (circle) callbacks.onSubjectClick(d.subject, circle);
    }
  });

  node.on("mouseenter", (_event: MouseEvent, d) => {
    callbacks.onNodeEnter(
      d.group === "subj"
        ? subjectTooltip(d.subject, d.commonMandatory)
        : specTooltip(
            d.spec,
            countSpecLinks(d.id, linkEnds, studyTypeOf, currentFilter),
          ),
    );
  });

  node.on("mousemove", (event: MouseEvent) => {
    callbacks.onNodeMove(event.clientX, event.clientY);
  });

  node.on("mouseleave", () => {
    callbacks.onNodeLeave();
  });

  let destroyed = false;

  return {
    applyFilter(filter) {
      if (!destroyed) applyFilter(filter);
    },
    setSelectedSpecs(selected) {
      if (destroyed) return;
      selectedSpecs = selected;
      updateHighlights();
    },
    setHighlightSources(sources) {
      if (destroyed) return;
      highlightSources = sources;
      updateSubjectHighlights();
    },
    zoomBy(factor) {
      if (destroyed) return;
      svg.transition().duration(200).call(zoomBehavior.scaleBy, factor);
    },
    resetZoom() {
      if (destroyed) return;
      svg.transition().duration(300).call(zoomBehavior.transform, zoomIdentity);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      simulation.stop();
      simulation.on("tick", null);
      svg.interrupt();
      svg.on(".zoom", null);
      node.on("click mouseenter mousemove mouseleave", null);
      zoomLayer.remove();
      // D3 si aktuální zoom pamatuje na elementu – další graf ve stejném <svg> má
      // začít ve výchozím pohledu.
      Reflect.deleteProperty(svgElement, "__zoom");
    },
  };
}
