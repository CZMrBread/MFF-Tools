/**
 * Čistá logika Mapy předmětů (bez Reactu, bez DOM, bez D3) – přepis výpočtů ze staré
 * stránky specializace/index.html. D3 graf (src/map/graph.ts) a komponenty je jen volají.
 */
import type { SpecNode, StudyType, SubjectNode } from "./types";

// ---------------------------------------------------------------------------
// Filtr stupně studia
// ---------------------------------------------------------------------------

/** Hodnota přepínače stupně studia (starý atribut `data-filter`). */
export type DegreeFilter = "all" | StudyType;

/** Po načtení stránky je vybrané bakalářské studium (stará proměnná `currentFilter`). */
export const DEFAULT_DEGREE_FILTER: DegreeFilter = "bakalarske";

/** Tlačítka přepínače v pořadí a s texty ze staré stránky. */
export const DEGREE_FILTERS: readonly {
  value: DegreeFilter;
  label: string;
}[] = [
  { value: "all", label: "Všechny stupně" },
  { value: "bakalarske", label: "Bakalářské" },
  { value: "magisterske", label: "Magisterské" },
];

/** Konce hrany – id uzlů (`source` = předmět, `target` = specializace). */
export interface LinkEnds {
  source: string;
  target: string;
}

/** Uzel pro filtr stupně: `study_type` mají jen specializace. */
export interface DegreeFilterNode {
  id: string;
  study_type?: StudyType;
}

export interface DegreeFilterResult {
  /** Id uzlů, které zůstávají vidět (a v simulaci). */
  nodeIds: Set<string>;
  /** Pro každou hranu (podle indexu ve vstupu), zda zůstává vidět. */
  linkVisible: boolean[];
}

/**
 * Které uzly a hrany jsou vidět při daném filtru (starý `applyStudyFilter`, část
 * výběru): uzly se shodným `study_type` a k nim vše, co je s nimi spojené hranou.
 * Filtr "all" ponechá všechno.
 */
export function filterByDegree(
  nodes: readonly DegreeFilterNode[],
  links: readonly LinkEnds[],
  filter: DegreeFilter,
): DegreeFilterResult {
  if (filter === "all") {
    return {
      nodeIds: new Set(nodes.map((node) => node.id)),
      linkVisible: links.map(() => true),
    };
  }
  const matching = new Set<string>();
  for (const node of nodes) {
    if (node.study_type === filter) matching.add(node.id);
  }
  const nodeIds = new Set(matching);
  const linkVisible = links.map((link) => {
    if (!matching.has(link.source) && !matching.has(link.target)) return false;
    nodeIds.add(link.source);
    nodeIds.add(link.target);
    return true;
  });
  return { nodeIds, linkVisible };
}

/**
 * Rozmístění `count` specializací rovnoměrně po kružnici, první nahoře, dál po směru
 * hodinových ručiček (stejný výpočet úhlu jako ve starém kódu).
 */
export function specCirclePositions(
  count: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return positions;
}

/**
 * Počet hran vedoucích do specializace, které jsou vidět při daném filtru – číslo
 * v tooltipu specializace („Sdílených předmětů (ve filtru)").
 */
export function countSpecLinks(
  specId: string,
  links: readonly LinkEnds[],
  studyTypeOf: (nodeId: string) => StudyType | undefined,
  filter: DegreeFilter,
): number {
  let count = 0;
  for (const link of links) {
    if (link.target !== specId) continue;
    if (
      filter === "all" ||
      studyTypeOf(link.source) === filter ||
      studyTypeOf(link.target) === filter
    ) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Barvy a kategorie předmětů
// ---------------------------------------------------------------------------

/** Barvy uzlů předmětů (staré konstanty `colMandatoryAll`, `colMandatory`, …). */
export const MAP_COLORS = {
  mandatoryAll: "#3b82f6",
  mandatory: "#4ade80",
  elective: "#fb923c",
  mixed: "#facc15",
} as const;

export type SubjectCategory = keyof typeof MAP_COLORS;

/** Pořadí položek legendy. */
export const SUBJECT_CATEGORIES: readonly SubjectCategory[] = [
  "mandatoryAll",
  "mandatory",
  "elective",
  "mixed",
];

/** Texty legendy a štítku v tooltipu. */
export const SUBJECT_CATEGORY_LABELS: Readonly<
  Record<SubjectCategory, string>
> = {
  mandatoryAll: "Společný povinný",
  mandatory: "Povinný",
  elective: "Povinně volitelný",
  mixed: "Smíšený",
};

/** Id specializací podle stupně studia, v pořadí nodes.json (staré `specsByType`). */
export function specIdsByStudyType(
  specs: readonly Pick<SpecNode, "id" | "study_type">[],
): Map<StudyType, string[]> {
  const byType = new Map<StudyType, string[]>();
  for (const spec of specs) {
    const ids = byType.get(spec.study_type);
    if (ids) ids.push(spec.id);
    else byType.set(spec.study_type, [spec.id]);
  }
  return byType;
}

/**
 * „Společný povinný" předmět (staré `commonMandatory`): má `course_type` "mandatory"
 * a je povinný ve VŠECH specializacích některého stupně, který má aspoň dvě
 * specializace. (Dřív se poznal podle `shared_count === 7`, což sedělo jen na
 * informatiku.)
 */
export function isCommonMandatory(
  subject: Pick<SubjectNode, "course_type" | "mandatory_in">,
  specsByType: ReadonlyMap<StudyType, readonly string[]>,
): boolean {
  if (subject.course_type !== "mandatory") return false;
  for (const ids of specsByType.values()) {
    if (
      ids.length > 1 &&
      ids.every((id) => subject.mandatory_in.includes(id))
    ) {
      return true;
    }
  }
  return false;
}

/** Kategorie předmětu pro základní barvu uzlu a štítek v tooltipu. */
export function subjectCategory(
  subject: Pick<SubjectNode, "course_type">,
  commonMandatory: boolean,
): SubjectCategory {
  if (commonMandatory) return "mandatoryAll";
  if (subject.course_type === "mandatory") return "mandatory";
  return subject.course_type === "elective" ? "elective" : "mixed";
}

/** Základní barva uzlu předmětu (staré `baseColor`). */
export function subjectBaseColor(
  subject: Pick<SubjectNode, "course_type">,
  commonMandatory: boolean,
): string {
  return MAP_COLORS[subjectCategory(subject, commonMandatory)];
}

/**
 * Táhne síla `pullToSpecs` předmět přímo do středu kružnice (místo do těžiště jeho
 * specializací)? Ano, když je společný povinný, nebo když je spojený se všemi
 * viditelnými specializacemi a těch je víc než jedna (staré `toCenter`).
 */
export function pullsToCenter(
  commonMandatory: boolean,
  linkedSpecCount: number,
  visibleSpecCount: number,
): boolean {
  return (
    commonMandatory ||
    (linkedSpecCount === visibleSpecCount && visibleSpecCount > 1)
  );
}

/** Název předmětu bez kódu: "NAIL002 Neuronové sítě" → "Neuronové sítě". */
export function subjectTitle(subject: Pick<SubjectNode, "id" | "label">) {
  return subject.label.replace(subject.id, "").trim();
}

// ---------------------------------------------------------------------------
// Průnik specializací (klik na uzly specializací)
// ---------------------------------------------------------------------------

/** Mapa předmět → specializace, se kterými je spojen hranou (staré `subjToSpecs`). */
export function buildSubjectToSpecs(
  links: readonly LinkEnds[],
): Map<string, string[]> {
  const subjectToSpecs = new Map<string, string[]>();
  for (const link of links) {
    const specs = subjectToSpecs.get(link.source);
    if (specs) specs.push(link.target);
    else subjectToSpecs.set(link.source, [link.target]);
  }
  return subjectToSpecs;
}

/** Je předmět (jeho specializace `parentSpecs`) ve všech vybraných specializacích? */
export function matchesAllSelected(
  selectedSpecs: Iterable<string>,
  parentSpecs: readonly string[],
): boolean {
  for (const specId of selectedSpecs) {
    if (!parentSpecs.includes(specId)) return false;
  }
  return true;
}

/**
 * Barva zvýrazněného předmětu podle jeho role ve VYBRANÝCH specializacích: jen
 * povinný → zelená, jen povinně volitelný → oranžová, obojí → žlutá; společný
 * povinný → vždy modrá. Když není ve vybraných specializacích ani povinný, ani
 * volitelný, zůstává základní barva.
 */
export function selectionColor(
  subject: Pick<SubjectNode, "mandatory_in" | "elective_in">,
  commonMandatory: boolean,
  selectedSpecs: Iterable<string>,
  baseColor: string,
): string {
  if (commonMandatory) return MAP_COLORS.mandatoryAll;
  let mandatoryCount = 0;
  let electiveCount = 0;
  for (const specId of selectedSpecs) {
    if (subject.mandatory_in.includes(specId)) mandatoryCount++;
    if (subject.elective_in.includes(specId)) electiveCount++;
  }
  if (mandatoryCount > 0 && electiveCount === 0) return MAP_COLORS.mandatory;
  if (electiveCount > 0 && mandatoryCount === 0) return MAP_COLORS.elective;
  if (mandatoryCount > 0 && electiveCount > 0) return MAP_COLORS.mixed;
  return baseColor;
}

// ---------------------------------------------------------------------------
// Zvýraznění specializací podle vybraných předmětů (tlačítko v popoveru)
// ---------------------------------------------------------------------------

export interface SubjectHighlight {
  /** Specializace, které nabízejí VŠECHNY vybrané předměty (průnik, AND). */
  and: Set<string>;
  /** Specializace, které nabízejí alespoň jeden vybraný předmět, ale ne všechny (OR). */
  or: Set<string>;
}

/**
 * Průnik (AND) a sjednocení bez průniku (OR) specializací napříč vybranými předměty
 * (staré `computeSubjHighlightIntersection`). Bez vybraných předmětů jsou obě množiny
 * prázdné.
 */
export function computeSubjectHighlight(
  sourceIds: Iterable<string>,
  subjectToSpecs: ReadonlyMap<string, readonly string[]>,
): SubjectHighlight {
  const and = new Set<string>();
  const or = new Set<string>();
  const specLists = Array.from(sourceIds, (id) => subjectToSpecs.get(id) ?? []);
  const [first, ...rest] = specLists;
  if (first === undefined) return { and, or };

  for (const specId of first) {
    if (rest.every((list) => list.includes(specId))) and.add(specId);
  }
  for (const list of specLists) {
    for (const specId of list) {
      if (!and.has(specId)) or.add(specId);
    }
  }
  return { and, or };
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/** Obsah tooltipu nad uzlem. */
export type TooltipContent =
  | {
      kind: "subject";
      id: string;
      title: string;
      /** Barva kódu předmětu a štítku. */
      color: string;
      badgeLabel: string;
      sharedCount: number;
    }
  | {
      kind: "spec";
      label: string;
      color: string;
      /** Počet hran specializace viditelných v aktuálním filtru. */
      count: number;
    };

export function subjectTooltip(
  subject: SubjectNode,
  commonMandatory: boolean,
): TooltipContent {
  const category = subjectCategory(subject, commonMandatory);
  return {
    kind: "subject",
    id: subject.id,
    title: subjectTitle(subject),
    color: MAP_COLORS[category],
    badgeLabel: SUBJECT_CATEGORY_LABELS[category],
    sharedCount: subject.shared_count,
  };
}

export function specTooltip(spec: SpecNode, count: number): TooltipContent {
  return { kind: "spec", label: spec.label, color: spec.color, count };
}

/**
 * Umístění tooltipu vůči kurzoru (souřadnice relativně ke kontejneru grafu): nad
 * kurzorem, v horních 150 px kontejneru pod ním.
 */
export function tooltipPosition(
  x: number,
  y: number,
): { left: string; top: string; transform: string } {
  if (y < 150) {
    return {
      left: `${x}px`,
      top: `${y + 24}px`,
      transform: "translate(-50%, 0)",
    };
  }
  return {
    left: `${x}px`,
    top: `${y - 16}px`,
    transform: "translate(-50%, -100%)",
  };
}

// ---------------------------------------------------------------------------
// Zalamování popisků specializací
// ---------------------------------------------------------------------------

/** Výška řádku zalomeného popisku v em. */
export const WRAP_LINE_HEIGHT_EM = 1.1;

/**
 * Rozdělí text na řádky tak, aby se každý vešel do `maxWidth` (starý `wrap`). Šířku
 * řádku dodává `measure`. Chování je záměrně stejné jako ve starém kódu: první řádek
 * vzniká vždy (i prázdný – když je první slovo samo širší než `maxWidth`, zůstane
 * první řádek prázdný) a slovo, které začíná nový řádek, se už neměří.
 */
export function wrapWords(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const lines = [""];
  let line: string[] = [];
  for (const word of text.split(/\s+/)) {
    // Starý cyklus `while (word = words.pop())` končí na prvním prázdném slově.
    if (!word) break;
    line.push(word);
    const candidate = line.join(" ");
    if (measure(candidate) > maxWidth) {
      line.pop();
      lines[lines.length - 1] = line.join(" ");
      line = [word];
      lines.push(word);
    } else {
      lines[lines.length - 1] = candidate;
    }
  }
  return lines;
}

/** Atribut `dy` řádku č. `lineIndex` (od 0) zalomeného popisku. */
export function wrapLineDy(lineIndex: number, baseDy: number): string {
  return `${lineIndex * WRAP_LINE_HEIGHT_EM + baseDy}em`;
}

// ---------------------------------------------------------------------------
// Popover předmětu
// ---------------------------------------------------------------------------

/** Odkaz na předmět v SIS. */
export function sisUrl(subjectId: string): string {
  return `https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=${encodeURIComponent(subjectId)}`;
}

/** Odkaz na předmět na wiki.matfyz.cz. */
export function wikiUrl(subjectId: string): string {
  return `https://wiki.matfyz.cz/${encodeURIComponent(subjectId)}`;
}

export interface BoxSize {
  width: number;
  height: number;
}

export interface BoxRect extends BoxSize {
  left: number;
  top: number;
}

/** Strany, na které se popover zkouší umístit, v pořadí pokusů (jako Bootstrap). */
export const POPOVER_PLACEMENTS = ["top", "right", "bottom", "left"] as const;

export type PopoverPlacement = (typeof POPOVER_PLACEMENTS)[number];

export interface PopoverGeometry {
  /** Mezera mezi uzlem a popoverem (místo pro šipku). */
  offset: number;
  /** Délka šipky podél hrany popoveru. */
  arrowLength: number;
  /** Šířka rámečku popoveru (šipka se počítá od vnitřní hrany rámečku). */
  borderWidth: number;
}

/** Rozměry popoveru z Bootstrapu 5: odsazení 8 px, šipka 1rem × 0.5rem, rámeček 1 px. */
export const POPOVER_GEOMETRY: PopoverGeometry = {
  offset: 8,
  arrowLength: 16,
  borderWidth: 1,
};

export interface PopoverPosition {
  placement: PopoverPlacement;
  /** Levý horní roh popoveru v souřadnicích okna. */
  x: number;
  y: number;
  /** Posun šipky podél hrany popoveru, měřeno od vnitřní hrany rámečku. */
  arrowOffset: number;
}

const OPPOSITE_SIDE: Readonly<Record<PopoverPlacement, PopoverPlacement>> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isVertical(placement: PopoverPlacement): boolean {
  return placement === "top" || placement === "bottom";
}

/**
 * Umístění popoveru vedle uzlu – náhrada za Popper.js, který používal Bootstrap ve
 * staré stránce (stejné pořadí pokusů a stejná pravidla):
 *
 * 1. Zkouší se strany nahoře → vpravo → dole → vlevo; popover je na dané straně
 *    vystředěný k uzlu. Vyhraje první strana, kde popover nepřesahuje okno směrem od
 *    uzlu ani na obou koncích příčné osy; když taková není, první, která projde
 *    alespoň prvními dvěma, resp. první kontrolou; jinak zůstane nahoře.
 * 2. Podél hrany se popover posune tak, aby nepřesahoval okno, ale neodtrhne se od
 *    uzlu (šipka musí zůstat u uzlu).
 * 3. Šipka míří na střed uzlu, nejdál ke kraji popoveru.
 */
export function placePopover(
  reference: BoxRect,
  popover: BoxSize,
  viewport: BoxSize,
  geometry: PopoverGeometry = POPOVER_GEOMETRY,
): PopoverPosition {
  const centerX = reference.left + reference.width / 2;
  const centerY = reference.top + reference.height / 2;

  const candidates = POPOVER_PLACEMENTS.map((placement) => {
    let x = centerX - popover.width / 2;
    let y = centerY - popover.height / 2;
    if (placement === "top") {
      y = reference.top - popover.height - geometry.offset;
    } else if (placement === "bottom") {
      y = reference.top + reference.height + geometry.offset;
    } else if (placement === "left") {
      x = reference.left - popover.width - geometry.offset;
    } else {
      x = reference.left + reference.width + geometry.offset;
    }
    const overflow: Record<PopoverPlacement, number> = {
      top: -y,
      left: -x,
      bottom: y + popover.height - viewport.height,
      right: x + popover.width - viewport.width,
    };
    const dimension = isVertical(placement) ? "width" : "height";
    let side: PopoverPlacement = isVertical(placement) ? "left" : "top";
    if (reference[dimension] > popover[dimension]) side = OPPOSITE_SIDE[side];
    const checks = [
      overflow[placement] <= 0,
      overflow[side] <= 0,
      overflow[OPPOSITE_SIDE[side]] <= 0,
    ];
    return { placement, x, y, checks };
  });

  let chosen = candidates.find((candidate) => candidate.placement === "top");
  for (let required = 3; required > 0; required--) {
    const fitting = candidates.find((candidate) =>
      candidate.checks.slice(0, required).every(Boolean),
    );
    if (fitting) {
      chosen = fitting;
      break;
    }
  }
  if (!chosen) throw new Error("placePopover: no placement candidates");

  const { placement } = chosen;
  let { x, y } = chosen;
  const vertical = isVertical(placement);
  const dimension = vertical ? "width" : "height";
  const position = vertical ? x : y;
  const referenceLength = reference[dimension];
  const popoverLength = popover[dimension];
  const arrowReach = clamp(0, referenceLength, geometry.arrowLength);

  const min = 0;
  const max = viewport[dimension] - popoverLength;
  const tetherMin =
    position +
    referenceLength / 2 +
    popoverLength / 2 -
    arrowReach -
    geometry.borderWidth;
  const tetherMax =
    position - referenceLength / 2 - popoverLength / 2 + arrowReach;
  const shifted = clamp(
    Math.min(min, tetherMin),
    position,
    Math.max(max, tetherMax),
  );
  if (vertical) x = shifted;
  else y = shifted;

  const referenceCenter = vertical ? centerX : centerY;
  const arrowOffset = clamp(
    0,
    referenceCenter - shifted - geometry.borderWidth - geometry.arrowLength / 2,
    popoverLength - 2 * geometry.borderWidth - geometry.arrowLength,
  );

  return { placement, x, y, arrowOffset };
}
