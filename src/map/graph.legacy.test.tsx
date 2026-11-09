// @vitest-environment jsdom
/**
 * Shoda nového grafu (src/map/graph.ts) se starou stránkou specializace/index.html.
 *
 * Test spustí SKUTEČNÝ skript staré stránky (vyříznutý z HTML) nad jejím markupem
 * v jsdom a vedle něj nový `createGraph` nad stejnými daty. Obě simulace běží nad
 * stejným časovačem D3 a krokují se ručně (`timerFlush`), takže po každém kroku musí
 * být obsah obou SVG shodný – polohy uzlů a hran, třídy, barvy i pořadí prvků.
 * Stejně se porovnávají reakce na kliknutí (výběr specializací, filtr stupně,
 * zvýraznění předmětů), tooltipy a obsah popoveru.
 *
 * Po smazání staré stránky (krok 7 migrace) se celý soubor přeskočí.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as d3 from "d3";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { parseFields, parseLinks, parseNodes, parseYears } from "../lib/data";
import type { DegreeFilter, TooltipContent } from "../lib/map";
import type { StudyLink, StudyNode, SubjectNode } from "../lib/types";
import { createGraph } from "./graph";
import type { GraphController } from "./graph";
import { SubjectPopover } from "./SubjectPopover";

/**
 * Snímky se nespouštějí samy: `requestAnimationFrame` jen řadí zpětná volání do
 * fronty (musí se nahradit dřív, než se načte D3, proto `vi.hoisted`). Simulace se
 * krokují ručně přes `d3.timerFlush()`.
 */
const frameQueue = vi.hoisted(() => {
  const queue: FrameRequestCallback[] = [];
  window.requestAnimationFrame = (callback) => queue.push(callback);
  return queue;
});

const repoRoot = resolve(import.meta.dirname, "../..");
const dataDir = resolve(repoRoot, "data");
const OLD_PAGE_PATH = resolve(repoRoot, "src/legacy/specializace/index.html");
const oldPageExists = existsSync(OLD_PAGE_PATH);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, path), "utf8"));
}

const years = parseYears(readJson("years.json"));
/** Všechny kombinace rok × obor z years.json a <rok>/fields.json. */
const combinations = years.flatMap((year) =>
  parseFields(readJson(`${year}/fields.json`)).map((field) => ({
    year,
    field,
    label: `${year}/${field}`,
  })),
);

// Krokování stovek kroků simulace nad skutečnými daty v jsdom chvíli trvá.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// jsdom neumí měřit text; šířka řádku = 7 px na znak (stejně pro starý i nový kód).
Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
  configurable: true,
  value(this: SVGElement) {
    return (this.textContent ?? "").length * 7;
  },
});

// ---------------------------------------------------------------------------
// Stará stránka
// ---------------------------------------------------------------------------

interface OldPopoverConfig {
  container: string | Element;
  title: string;
  content: string;
}

/** Náhrada `bootstrap.Popover`: vloží obsah do stránky, jak to dělal Bootstrap. */
class FakePopover {
  tip: HTMLElement | null = null;
  private readonly config: OldPopoverConfig;

  constructor(_element: Element, config: OldPopoverConfig) {
    this.config = config;
  }

  show(): void {
    const tip = document.createElement("div");
    tip.className = "popover show";
    tip.innerHTML =
      `<h3 class="popover-header">${this.config.title}</h3>` +
      `<div class="popover-body">${this.config.content}</div>`;
    const container =
      typeof this.config.container === "string"
        ? document.querySelector(this.config.container)
        : this.config.container;
    (container ?? document.body).appendChild(tip);
    this.tip = tip;
  }

  update(): void {}

  dispose(): void {
    this.tip?.remove();
    this.tip = null;
  }
}

interface Stoppable {
  stop(): unknown;
  on(type: string, listener: (() => void) | null): unknown;
}

interface OldPage {
  svg: SVGSVGElement;
  /** Počet kroků staré simulace od spuštění. */
  ticks: () => number;
  stop: () => void;
}

function isRequirementNode(node: unknown): boolean {
  return (
    typeof node === "object" &&
    node !== null &&
    "group" in node &&
    node.group === "program_req"
  );
}

/**
 * Vloží do dokumentu markup staré stránky a spustí její hlavní skript. Se
 * `stripRequirements` dostane stará stránka nodes.json bez uzlů `program_req`.
 */
async function startOldPage(
  year: string,
  field: string,
  stripRequirements: boolean,
): Promise<OldPage> {
  const html = readFileSync(OLD_PAGE_PATH, "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const scripts = Array.from(parsed.querySelectorAll("script"));
  const mainScript = scripts.find((script) =>
    (script.textContent ?? "").includes("forceSimulation"),
  );
  if (!mainScript) throw new Error("ve staré stránce chybí hlavní skript");
  for (const script of scripts) script.remove();
  document.body.innerHTML = parsed.body.innerHTML;

  const simulations: Stoppable[] = [];
  let ticks = 0;
  const trackSimulation = (...args: unknown[]) => {
    const simulation = (
      d3.forceSimulation as (...params: unknown[]) => Stoppable
    )(...args);
    simulation.on("tick.count", () => ticks++);
    simulations.push(simulation);
    return simulation;
  };
  const oldD3 = {
    ...d3,
    forceSimulation: trackSimulation,
    json: (url: string) => {
      const match = /\/data\/(.+)$/.exec(url);
      if (!match?.[1]) return Promise.reject(new Error(`nečekaná URL ${url}`));
      const data = readJson(match[1]);
      return Promise.resolve(
        stripRequirements && Array.isArray(data)
          ? data.filter((item: unknown) => !isRequirementNode(item))
          : data,
      );
    },
  };
  // Stará stránka čte přes fetch years.json a <rok>/fields.json (DATA_DIR '../data/').
  const fakeFetch = (url: string) => {
    const match = /^\.\.\/data\/(.+)$/.exec(url);
    if (!match?.[1]) return Promise.reject(new Error(`nečekaná URL ${url}`));
    const data = readJson(match[1]);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  };
  const fakeLocation = {
    search: `?rok=${year}&obor=${field}`,
    href: `http://localhost/specializace/?rok=${year}&obor=${field}`,
  };
  const fakeStorage = { getItem: () => null, setItem: () => undefined };

  const run = new Function(
    "d3",
    "bootstrap",
    "fetch",
    "location",
    "localStorage",
    mainScript.textContent ?? "",
  ) as (...globals: unknown[]) => void;
  run(oldD3, { Popover: FakePopover }, fakeFetch, fakeLocation, fakeStorage);

  // Skript čeká na data v řetězu promise; snímky neběží, takže simulace zatím stojí.
  const svg = await vi.waitFor(() => {
    const element = document.querySelector<SVGSVGElement>(
      "#graph-container svg",
    );
    if (!element) throw new Error("stará stránka ještě nevykreslila graf");
    return element;
  });

  return {
    svg,
    ticks: () => ticks,
    stop: () => simulations.forEach((simulation) => simulation.stop()),
  };
}

function oldElement(selector: string): Element {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`ve staré stránce chybí ${selector}`);
  return element;
}

/** Uzel grafu staré stránky (`<g id="node-…">`). */
function oldNode(nodeId: string): Element {
  const element = document.getElementById(`node-${nodeId}`);
  if (!element) throw new Error(`ve staré stránce chybí uzel ${nodeId}`);
  return element;
}

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

// ---------------------------------------------------------------------------
// Nový graf
// ---------------------------------------------------------------------------

interface NewGraph {
  svg: SVGSVGElement;
  controller: GraphController;
  ticks: () => number;
  /** Klik na uzel specializace – přepnutí výběru jako v <MapGraph>. */
  clickSpec: (specId: string) => void;
  /** Přepnutí předmětu ve výběru „Zobrazit specializace" jako v <MapGraph>. */
  toggleSource: (subjectId: string) => void;
  clearSources: () => void;
  /** Uzel grafu (`<g id="node-…">`). */
  node: (nodeId: string) => Element;
  /** Najetí kurzorem na uzel – obsah tooltipu. */
  hover: (nodeId: string) => TooltipContent | null;
  /** Předmět a kruh z posledního kliknutí na uzel předmětu. */
  lastSubjectClick: () => { subject: SubjectNode; circle: Element } | null;
}

function toggled(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

function startNewGraph(
  nodes: readonly StudyNode[],
  links: readonly StudyLink[],
): NewGraph {
  // SVG není v dokumentu, aby se jeho id (`node-…`) nepletla se starou stránkou.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  let selected: ReadonlySet<string> = new Set();
  let sources: ReadonlySet<string> = new Set();
  let ticks = 0;
  let tooltip: TooltipContent | null = null;
  let subjectClick: { subject: SubjectNode; circle: Element } | null = null;

  const controller = createGraph(
    svg,
    { nodes, links },
    {
      onSpecClick: (specId) => {
        selected = toggled(selected, specId);
        controller.setSelectedSpecs(selected);
      },
      onSubjectClick: (subject, circle) => {
        subjectClick = { subject, circle };
      },
      onNodeEnter: (content) => {
        tooltip = content;
      },
      onNodeMove: () => undefined,
      onNodeLeave: () => undefined,
      onLayout: () => ticks++,
    },
  );

  const nodeElements = new Map(
    Array.from(svg.querySelectorAll("g.node"), (element) => [
      element.id,
      element,
    ]),
  );
  const nodeElement = (nodeId: string) => {
    const element = nodeElements.get(`node-${nodeId}`);
    if (!element) throw new Error(`v novém grafu chybí uzel ${nodeId}`);
    return element;
  };

  return {
    svg,
    controller,
    ticks: () => ticks,
    node: nodeElement,
    clickSpec: (specId) => click(nodeElement(specId)),
    toggleSource: (subjectId) => {
      sources = toggled(sources, subjectId);
      controller.setHighlightSources(sources);
    },
    clearSources: () => {
      sources = new Set();
      controller.setHighlightSources(sources);
    },
    hover: (nodeId) => {
      tooltip = null;
      nodeElement(nodeId).dispatchEvent(new MouseEvent("mouseenter"));
      return tooltip;
    },
    lastSubjectClick: () => subjectClick,
  };
}

// ---------------------------------------------------------------------------
// Porovnání obsahu SVG
// ---------------------------------------------------------------------------

/** Kanonický popis prvku: atributy seřazené, třídy seřazené, prázdné atributy pryč. */
function describeElement(
  element: Element,
  skipAttributes: ReadonlySet<string>,
): string {
  const attributes = Array.from(element.attributes)
    .filter((attribute) => !skipAttributes.has(attribute.name))
    .map((attribute) => {
      const value =
        attribute.name === "class"
          ? attribute.value.split(/\s+/).filter(Boolean).sort().join(" ")
          : attribute.value.trim();
      return [attribute.name, value] as const;
    })
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  const children = Array.from(element.childNodes)
    .map((child) =>
      child instanceof Element
        ? describeElement(child, skipAttributes)
        : JSON.stringify(child.textContent),
    )
    .join("");
  return `<${element.tagName} ${attributes}>${children}</${element.tagName}>`;
}

interface GraphSnapshot {
  /** Id prvků v pořadí, v jakém leží v SVG (na pořadí záleží – určuje překryv). */
  order: string[];
  elements: Map<string, string>;
  layerTransform: string | null;
}

const POSITION_ATTRIBUTES: ReadonlySet<string> = new Set([
  "transform",
  "x1",
  "y1",
  "x2",
  "y2",
]);
const NO_ATTRIBUTES: ReadonlySet<string> = new Set();

/**
 * Popis grafu: skupina hran a skupina uzlů uvnitř `g.zoom-layer`. Uzly `program_req`,
 * které stará stránka vykreslovala jako neviditelné (kruh bez poloměru), se
 * přeskakují – nový graf je záměrně nemá.
 */
function snapshot(
  svg: SVGSVGElement,
  withPositions: boolean,
  skipIds: ReadonlySet<string>,
): GraphSnapshot {
  const layer = svg.querySelector(":scope > g.zoom-layer");
  if (!layer) throw new Error("chybí g.zoom-layer");
  expect(svg.children).toHaveLength(1);
  expect(layer.children).toHaveLength(2);
  const skip = withPositions ? NO_ATTRIBUTES : POSITION_ATTRIBUTES;
  const order: string[] = [];
  const elements = new Map<string, string>();
  for (const group of Array.from(layer.children)) {
    expect(group.tagName).toBe("g");
    expect(group.attributes).toHaveLength(0);
    for (const element of Array.from(group.children)) {
      if (skipIds.has(element.id)) continue;
      order.push(element.id);
      elements.set(element.id, describeElement(element, skip));
    }
  }
  return { order, elements, layerTransform: layer.getAttribute("transform") };
}

/** Porovná oba grafy; při neshodě vypíše prvních pár rozdílných prvků. */
function expectSameGraph(
  oldSvg: SVGSVGElement,
  newSvg: SVGSVGElement,
  label: string,
  withPositions: boolean,
  skipIds: ReadonlySet<string>,
): void {
  const expected = snapshot(oldSvg, withPositions, skipIds);
  const actual = snapshot(newSvg, withPositions, skipIds);
  expect(actual.order.length, label).toBeGreaterThan(0);
  expect(actual.order, `${label}: pořadí prvků`).toEqual(expected.order);
  const differences: { id: string; old?: string; new?: string }[] = [];
  for (const [id, description] of expected.elements) {
    if (actual.elements.get(id) !== description && differences.length < 3) {
      differences.push({ id, old: description, new: actual.elements.get(id) });
    }
  }
  expect(differences, label).toEqual([]);
  expect(actual.layerTransform, label).toBe(expected.layerTransform);
}

/** Souřadnice uzlů z atributu `transform`. */
function nodePositions(svg: SVGSVGElement): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  for (const element of Array.from(svg.querySelectorAll("g.node"))) {
    const match = /^translate\((.+),(.+)\)$/.exec(
      element.getAttribute("transform") ?? "",
    );
    if (match) positions.set(element.id, [Number(match[1]), Number(match[2])]);
  }
  return positions;
}

/** Barva v podobě, v jaké ji vrací jsdom (`#3b82f6` → `rgb(59, 130, 246)`). */
function cssColor(color: string): string {
  const probe = document.createElement("span");
  probe.style.color = color;
  return probe.style.color;
}

// ---------------------------------------------------------------------------

/** Provede `count` kroků všech běžících simulací (každý `timerFlush` = jeden krok). */
function tick(count: number): void {
  for (let i = 0; i < count; i++) d3.timerFlush();
}

interface Pair {
  oldPage: OldPage;
  fresh: NewGraph;
}

/**
 * Společná příprava skupiny testů: stará stránka a nový graf nad daty roku `year`,
 * oba s výchozím filtrem a před prvním krokem simulace. Volá se uvnitř `describe`.
 */
function setUpPair(year: string, field: string, stripRequirements: boolean) {
  const nodes = parseNodes(readJson(`${year}/${field}/nodes.json`));
  const links = parseLinks(readJson(`${year}/${field}/links.json`));
  /** Uzly program_req – stará stránka je vykreslovala (neviditelně), nová ne. */
  const requirementIds = new Set(
    nodes
      .filter((node) => node.group === "program_req")
      .map((node) => `node-${node.id}`),
  );
  let pair: Pair | null = null;
  let errorSpy: MockInstance<typeof console.error> | null = null;

  const current = (): Pair => {
    if (!pair) throw new Error("graf ještě není připravený");
    return pair;
  };

  beforeAll(async () => {
    // Stará stránka chyby jen vypisuje do konzole – test na ně musí přijít.
    errorSpy = vi.spyOn(console, "error");
    const oldPage = await startOldPage(year, field, stripRequirements);
    const fresh = startNewGraph(nodes, links);
    // Stará stránka použije výchozí filtr hned po vykreslení.
    fresh.controller.applyFilter("bakalarske");
    pair = { oldPage, fresh };
  });

  afterAll(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy?.mockRestore();
    current().oldPage.stop();
    current().fresh.controller.destroy();
    document.body.innerHTML = "";
    // Časovač D3 usne až ve snímku – pustit vše, co zůstalo ve frontě.
    for (let i = 0; i < 100 && frameQueue.length > 0; i++) {
      frameQueue.shift()?.(performance.now());
    }
    expect(frameQueue).toHaveLength(0);
  });

  return {
    nodes,
    links,
    oldPage: () => current().oldPage,
    fresh: () => current().fresh,
    setFilter(filter: DegreeFilter): void {
      click(oldElement(`.filter-btn[data-filter="${filter}"]`));
      current().fresh.controller.applyFilter(filter);
    },
    clickSpec(specId: string): void {
      click(oldNode(specId));
      current().fresh.clickSpec(specId);
    },
    /** Stará stránka: klik na předmět otevře popover, tlačítko v něm přepne výběr. */
    toggleSource(subjectId: string): void {
      click(oldNode(subjectId));
      click(oldElement(".popover .btn-subj-specs"));
      expect(document.querySelector(".popover")).toBeNull();
      current().fresh.toggleSource(subjectId);
    },
    /** Oba grafy musí mít stejný obsah SVG (volitelně bez poloh). */
    same(label: string, withPositions = true): void {
      expectSameGraph(
        current().oldPage.svg,
        current().fresh.svg,
        label,
        withPositions,
        requirementIds,
      );
    },
    /** Počet kroků obou simulací – musí být stejný. */
    ticks(): number {
      expect(current().oldPage.ticks()).toBe(current().fresh.ticks());
      return current().fresh.ticks();
    },
  };
}

describe.skipIf(!oldPageExists).each(combinations)(
  "shoda se starou mapou – $label",
  ({ year, field }) => {
    const { nodes, links, oldPage, fresh, setFilter, clickSpec, ...pair } =
      setUpPair(year, field, false);
    const { toggleSource, same, ticks } = pair;
    const specs = nodes.filter((node) => node.group === "spec");
    const subjects = nodes.filter((node) => node.group === "subj");
    const bachelorSpecs = specs.filter((s) => s.study_type === "bakalarske");
    const masterSpecs = specs.filter((s) => s.study_type === "magisterske");
    /** Specializace v pořadí Bc. → Mgr. (fyzika 2026-2027 má jen jednu bakalářskou). */
    const specsByDegree = [...bachelorSpecs, ...masterSpecs];

    it("uzly program_req jsou v souboru až za specializacemi a předměty", () => {
      // D3 dává uzlům výchozí polohu podle pořadí; když nový graf uzly program_req
      // vynechá, nesmí se tím pořadí ostatních posunout.
      const firstRequirement = nodes.findIndex(
        (node) => node.group === "program_req",
      );
      expect(firstRequirement).toBe(specs.length + subjects.length);
      expect(bachelorSpecs.length).toBeGreaterThan(0);
      expect(masterSpecs.length).toBeGreaterThan(3);
    });

    it("po vykreslení (před prvním krokem simulace) je SVG stejné", () => {
      expect(ticks()).toBe(0);
      same("po vykreslení");
      const svg = fresh().svg;
      expect(svg.querySelectorAll("g.node-spec")).toHaveLength(specs.length);
      expect(svg.querySelectorAll("g.node-subj")).toHaveLength(subjects.length);
      expect(svg.querySelectorAll("line.link")).toHaveLength(links.length);
      // Popisky specializací jsou zalomené do řádků.
      expect(svg.querySelectorAll("g.node-spec tspan").length).toBeGreaterThan(
        specs.length,
      );
    });

    it("simulace (filtr Bakalářské) dává krok za krokem stejné polohy", () => {
      for (const step of [1, 2, 3, 10, 50]) {
        tick(step - ticks());
        expect(ticks()).toBe(step);
        same(`krok ${step}`);
      }
      // Doběhnutí do klidu: obě simulace se zastaví samy ve stejném kroku.
      // alphaDecay 0.035 od alpha 0.5 → zhruba 175 kroků.
      tick(400);
      expect(ticks()).toBeGreaterThan(150);
      expect(ticks()).toBeLessThan(400);
      same("po doběhnutí");

      // Viditelné specializace leží na kružnici, předměty se rozprostřely.
      const positions = nodePositions(fresh().svg);
      for (const spec of bachelorSpecs) {
        const [x, y] = positions.get(`node-${spec.id}`) ?? [NaN, NaN];
        expect(Math.hypot(x - 600, y - 450)).toBeCloseTo(300, 6);
      }
      // Krok simulace posouvá jen uzly ve filtru; skryté žádnou polohu nedostaly.
      expect(positions.size).toBe(
        fresh().svg.querySelectorAll("g.node:not(.filtered-out)").length,
      );
      expect(positions.size).toBeLessThan(specs.length + subjects.length);
    });

    it("tooltipy všech uzlů mají stejný obsah (ve všech filtrech)", () => {
      const tooltip = oldElement("#tooltip");
      const text = (selector: string) =>
        tooltip.querySelector(selector)?.textContent ?? null;
      const color = (selector: string, property: "color" | "background") =>
        tooltip.querySelector<HTMLElement>(selector)?.style[property] ?? null;

      for (const filter of ["magisterske", "all", "bakalarske"] as const) {
        setFilter(filter);
        for (const node of [...specs, ...subjects]) {
          oldNode(node.id).dispatchEvent(new MouseEvent("mouseenter"));
          const content = fresh().hover(node.id);
          if (!content) throw new Error(`chybí tooltip uzlu ${node.id}`);
          const label = `${filter} ${node.id}`;
          expect(tooltip.getAttribute("style"), label).toContain("opacity: 1");
          expect(color(".tooltip-title", "color"), label).toBe(
            cssColor(content.color),
          );
          if (content.kind === "subject") {
            expect(tooltip.children, label).toHaveLength(4);
            expect(text(".tooltip-title"), label).toBe(content.id);
            expect(text(".tooltip-desc"), label).toBe(content.title);
            expect(text(".badge"), label).toBe(content.badgeLabel);
            expect(color(".badge", "background"), label).toBe(
              cssColor(content.color),
            );
            expect(text(".tooltip-meta"), label).toBe(
              `Vyskytuje se v ${content.sharedCount} specializacích`,
            );
          } else {
            expect(tooltip.children, label).toHaveLength(3);
            expect(text(".tooltip-title"), label).toBe(content.label);
            expect(text(".tooltip-desc"), label).toBe(
              "Kliknutím aktivujete / skryjete v průniku",
            );
            expect(text(".tooltip-meta"), label).toBe(
              `Sdílených předmětů (ve filtru): ${content.count}`,
            );
          }
        }
      }
      // Přepnutí filtru bez kroku simulace polohy nemění.
      same("po prohlídce tooltipů");
    });

    it("výběr specializací: průnik, barvy, hrany a pořadí prvků", () => {
      const [first, second, third] = specsByDegree.map((spec) => spec.id);
      if (!first || !second || !third) throw new Error("chybí specializace");
      const svg = fresh().svg;

      clickSpec(first);
      same(`vybraná ${first}`);
      expect(fresh().node(first).classList).toContain("selected");
      expect(
        svg.querySelectorAll("g.node-subj.highlighted").length,
      ).toBeGreaterThan(0);
      expect(svg.querySelectorAll("g.node-subj.dimmed").length).toBeGreaterThan(
        0,
      );
      expect(
        svg.querySelectorAll("line.link.highlighted").length,
      ).toBeGreaterThan(0);

      clickSpec(third);
      same(`vybrané ${first} + ${third}`);
      clickSpec(second);
      same("vybrané tři");
      // Odebrání z výběru a výběr skryté (magisterské) specializace.
      clickSpec(first);
      same("po odebrání první");
      const hidden = masterSpecs.at(-1)?.id ?? "";
      clickSpec(hidden);
      same("vybraná i skrytá specializace");
      tick(5);
      same("výběr + kroky simulace");

      // Výběr přežije změnu filtru.
      setFilter("magisterske");
      same("magisterské s výběrem");
      tick(30);
      same("magisterské s výběrem po 30 krocích");
      const otherMaster = masterSpecs[3]?.id ?? "";
      clickSpec(otherMaster);
      same("dvě magisterské");

      for (const specId of [second, third, hidden, otherMaster]) {
        clickSpec(specId);
      }
      same("po zrušení výběru");
      expect(svg.querySelectorAll(".selected")).toHaveLength(0);
      expect(svg.querySelectorAll(".highlighted")).toHaveLength(0);
      expect(svg.querySelectorAll(".dimmed")).toHaveLength(0);
    });

    it("zvýraznění specializací podle předmětů (AND / OR)", () => {
      const linkCount = new Map<string, number>();
      for (const link of links) {
        linkCount.set(link.source, (linkCount.get(link.source) ?? 0) + 1);
      }
      const withSpecs = (count: number) =>
        subjects.find((subj) => linkCount.get(subj.id) === count)?.id ?? "";
      const mostShared = Math.max(...linkCount.values());
      const common = withSpecs(mostShared);
      const single = withSpecs(1);
      const double = withSpecs(2);
      expect([common, single, double].every(Boolean)).toBe(true);
      const panel = oldElement("#subj-highlight-panel");
      const svg = fresh().svg;

      toggleSource(common);
      same(`zvýrazněný ${common}`);
      expect(panel.classList).toContain("visible");
      expect(
        svg.querySelectorAll("g.node-spec.subj-emphasized-and"),
      ).toHaveLength(mostShared);
      expect(svg.querySelectorAll("g.node-subj.subj-source")).toHaveLength(1);

      toggleSource(single);
      same("dva předměty");
      toggleSource(double);
      same("tři předměty");
      // Souběh s výběrem specializací a filtrem.
      const spec = specsByDegree[1]?.id ?? "";
      clickSpec(spec);
      same("zvýraznění + výběr specializace");
      setFilter("bakalarske");
      same("zvýraznění + výběr + filtr");
      clickSpec(spec);
      // Odebrání jednoho předmětu z výběru.
      toggleSource(common);
      same("po odebrání předmětu");

      click(oldElement("#btn-clear-subj-highlight"));
      fresh().clearSources();
      same("po zrušení zvýraznění");
      expect(panel.classList).not.toContain("visible");
      expect(
        svg.querySelectorAll(
          ".subj-emphasized-and, .subj-emphasized-or, .subj-source, .subj-faded, .subj-highlighted-and, .subj-highlighted-or",
        ),
      ).toHaveLength(0);

      tick(20);
      ticks();
      same("bakalářské po dalších krocích");
    });

    it("filtr Magisterské: stejné skrytí i polohy", () => {
      setFilter("magisterske");
      same("magisterské hned po přepnutí");
      for (const spec of bachelorSpecs) {
        expect(fresh().node(spec.id).classList).toContain("filtered-out");
      }
      tick(1);
      same("magisterské po 1 kroku");
      tick(59);
      ticks();
      same("magisterské po 60 krocích");
    });

    it("filtr Všechny stupně: stejné třídy; polohy předmětů ovlivňovaly uzly program_req", () => {
      setFilter("all");
      same("všechny stupně hned po přepnutí");
      expect(fresh().svg.querySelectorAll(".filtered-out")).toHaveLength(0);
      tick(60);
      ticks();
      same("všechny stupně po 60 krocích", false);

      // Stará stránka měla při tomto filtru v simulaci i neviditelné uzly program_req
      // (odpuzující body bez hran). Nový graf je nemá, takže předměty skončí jinde;
      // specializace (pevné) jsou přesně na místě. Že je to jediný rozdíl, ověřuje
      // skupina testů „nad daty bez uzlů program_req" níže.
      const oldPositions = nodePositions(oldPage().svg);
      const newPositions = nodePositions(fresh().svg);
      let largest = 0;
      for (const node of [...specs, ...subjects]) {
        const id = `node-${node.id}`;
        const [oldX, oldY] = oldPositions.get(id) ?? [NaN, NaN];
        const [newX, newY] = newPositions.get(id) ?? [NaN, NaN];
        const distance = Math.hypot(newX - oldX, newY - oldY);
        expect(distance, id).not.toBeNaN();
        if (node.group === "spec") expect(distance, id).toBe(0);
        largest = Math.max(largest, distance);
      }
      expect(largest).toBeGreaterThan(0);
    });

    it("klik na předmět: popover má stejný obsah jako starý", () => {
      const subject = subjects[0];
      if (!subject) throw new Error("chybí předmět");

      click(oldNode(subject.id));
      const oldTip = oldElement(".popover");
      click(fresh().node(subject.id));
      const clicked = fresh().lastSubjectClick();
      expect(clicked?.subject.id).toBe(subject.id);
      expect(clicked?.circle).toBe(
        fresh().node(subject.id).querySelector("circle"),
      );

      for (const highlighted of [false, true]) {
        if (highlighted) {
          // Předmět je ve výběru → popover nabízí odebrání.
          click(oldElement(".popover .btn-subj-specs"));
          click(oldNode(subject.id));
        }
        const tip = highlighted ? oldElement(".popover") : oldTip;
        const page = new DOMParser().parseFromString(
          renderToStaticMarkup(
            <SubjectPopover
              subjectId={subject.id}
              anchor={clicked?.circle ?? fresh().svg}
              highlighted={highlighted}
              onClose={() => undefined}
              onToggleHighlight={() => undefined}
              subscribeLayout={() => () => undefined}
            />,
          ),
          "text/html",
        );
        const popover = page.body.firstElementChild;
        if (!popover) throw new Error("popover se nevykreslil");

        const header = (root: Element) => root.querySelector("h3");
        expect(header(popover)?.textContent).toBe(header(tip)?.textContent);
        expect(header(popover)?.textContent?.trim()).toBe(subject.id);
        const closeButton = (root: Element) =>
          header(root)?.querySelector("button");
        expect(closeButton(popover)?.getAttribute("aria-label")).toBe(
          closeButton(tip)?.getAttribute("aria-label"),
        );
        expect(closeButton(popover)?.getAttribute("type")).toBe("button");

        const controls = (root: Element) =>
          Array.from(
            root.querySelectorAll(
              ":scope > div:last-child a, :scope > div:last-child button",
            ),
          ).map((control) => ({
            tag: control.tagName,
            text: control.textContent,
            href: control.getAttribute("href"),
            target: control.getAttribute("target"),
            rel: control.getAttribute("rel"),
            type: control.getAttribute("type"),
          }));
        expect(controls(popover)).toEqual(controls(tip));
        expect(controls(popover)).toHaveLength(3);
        expect(controls(popover)[2]?.text).toBe(
          highlighted
            ? "Odebrat z výběru specializací"
            : "Zobrazit specializace",
        );
      }

      // Úklid: zavřít starý popover křížkem a zrušit zvýraznění.
      click(oldElement(".popover .subj-popover-close"));
      expect(document.querySelector(".popover")).toBeNull();
      click(oldElement("#btn-clear-subj-highlight"));
    });
  },
);

// Kontrola, že rozdíl poloh ve filtru „Všechny stupně" způsobují jen uzly program_req:
// když je stará stránka v datech nedostane, vychází i tento filtr přesně stejně.
describe.skipIf(!oldPageExists).each(combinations)(
  "shoda se starou mapou nad daty bez uzlů program_req – $label",
  ({ year, field }) => {
    const { setFilter, same, ticks, fresh } = setUpPair(year, field, true);

    it("filtr Všechny stupně dává krok za krokem stejné polohy", () => {
      same("po vykreslení");
      setFilter("all");
      same("všechny stupně hned po přepnutí");
      expect(fresh().svg.querySelectorAll(".filtered-out")).toHaveLength(0);
      for (const step of [1, 2, 10, 60]) {
        tick(step - ticks());
        expect(ticks()).toBe(step);
        same(`všechny stupně, krok ${step}`);
      }
      // A zpět na výchozí filtr.
      setFilter("bakalarske");
      tick(20);
      expect(ticks()).toBe(80);
      same("bakalářské po návratu");
    });
  },
);
