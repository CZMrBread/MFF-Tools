/**
 * Pomůcky testů shody se starou kalkulačkou: načtení záznamu
 * `credits-legacy.json` (generuje scripts/gen-credits-fixture.mjs) a převod modelů
 * nového kódu na stejný textový zápis, jakým generátor zapsal to, co vykreslila stará
 * stránka. Testy pak porovnávají text s textem.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { creditsBadgeText } from "../credits";
import type {
  CategoryView,
  GroupProgress,
  PlanGroup,
  PlanStatus,
  PlanSummary,
  StudyPlan,
  SummaryItem,
} from "../credits";
import { indexNodes, parseNodes } from "../data";
import type { StudyIndex } from "../data";
import {
  isDropAllowed,
  isFixedSemester,
  placedAtText,
  placementOf,
  placementOptions,
  semesterSlotLabel,
  semesterTagText,
  yearsStepper,
} from "../schedule";
import type { CalculatorState, YearBlock } from "../schedule";
import type { Placement, Placements } from "../storage";
import type { SubjectNode } from "../types";

// ---------------------------------------------------------------------------
// Tvar záznamu
// ---------------------------------------------------------------------------

export interface LegacyPlanRecord {
  degreeLabel: string;
  title: string;
  /** Poznámka `no_pdf_plan`, nebo `null`. */
  note: string | null;
  categories: {
    title: string;
    noCreditToggle: boolean;
    /** „ID | N kr. | zkratka semestru" v pořadí zobrazení. */
    subjects: string[];
  }[];
  /** Výběr ročníku a zvýraznění při přetahování pro vzorové předměty. */
  pickers: string[];
}

/**
 * Čísla souhrnu Kalkulačky. `groups`, `choice` a `pv` jsou výsledky původních funkcí
 * (effMin, ncCreditsIn, planTotals); ostatní je přečtené z vykresleného souhrnu.
 */
export interface LegacyNumbers {
  /** [získané, celkem] povinných předmětů. */
  mand: [number, number];
  /** Skupiny plánu v pořadí zobrazení: [získané (z `counted`), effMin, „bez kreditů"]. */
  groups: [number, number | null, number][];
  /** [choiceEarned, choiceMin] z planTotals. */
  choice: [number, number];
  /** [pvEarned, effOverall, ncTotal] z planTotals. */
  pv: [number, number | null, number];
  /** Získané kredity celkem (pruh „Celkem kreditů"). */
  total: number;
  /** Odhad volitelných; `null`, když se nezobrazil (není kladný). */
  free: number | null;
  /** Všechny podmínky splněné. */
  ok: boolean;
}

/**
 * Čísla souhrnu Rozvrhu („získané" = zařazené). Minima a snížení jsou stejná jako
 * v Kalkulačce, proto se neukládají.
 */
export interface LegacyScheduleNumbers {
  mand: number;
  /** Získané kredity skupin; `null` u skupin bez pruhu (bez vlastního minima). */
  groups: (number | null)[];
  choice: number;
  pv: number;
  total: number;
  ok: boolean;
}

export interface LegacyScenario {
  name: string;
  /** Vstup: id oddělená mezerou. */
  completed: string;
  noCredit: string;
  /** Vstup: „ID:ročník:semestr" oddělené mezerou. */
  placements: string;
  yearsCount: number | null;
  /** Kalkulačka: bloky kategorií, souhrn a stavová hláška. */
  categories: string[];
  summary: string[];
  status: string;
  numbers: LegacyNumbers;
  schedule: {
    /** Id, jejichž zařazení vykreslení zahodilo (předměty mimo plán). */
    pruned: string;
    yearsCount: number;
    stepper: string;
    placed: string;
    years: string[];
    summary: string[];
    status: string;
    numbers: LegacyScheduleNumbers;
  };
}

export interface LegacySequence {
  start: string;
  /** „akce => uloženo: … => stav". */
  steps: string[];
}

export interface LegacyDataset {
  nodesDigest: string;
  specs: Record<
    string,
    { plan: LegacyPlanRecord; scenarios: LegacyScenario[] }
  >;
  sequences: Record<string, LegacySequence>;
}

/** Barvy pruhu podle stavu (výplň a text „zbývá …") ze starého `bar()`. */
export type LegacyTones = Record<string, { fill: string; text: string }>;

export interface LegacyFixture {
  description: string;
  source: string;
  sourceSha256: string;
  /** Řádky souhrnu uvádějí místo barev název stavu z této tabulky. */
  tones: LegacyTones;
  /** Klíč „rok/obor" pro každou kombinaci z data/years.json × fields.json. */
  datasets: Record<string, LegacyDataset>;
}

// ---------------------------------------------------------------------------
// Načtení
// ---------------------------------------------------------------------------

export function readLegacyFixture(path: string): LegacyFixture {
  return JSON.parse(readFileSync(path, "utf8")) as LegacyFixture;
}

export type DatasetLoad =
  { status: "ok"; index: StudyIndex } | { status: "stale"; reason: string };

/**
 * Načte `nodes.json` datové sady („rok/obor") a ověří, že jsou data stejná
 * jako při generování záznamu. Když ne, záznam pro tuto sadu neplatí (`stale`).
 */
export function loadDataset(
  dataRoot: string,
  dataset: string,
  record: LegacyDataset,
): DatasetLoad {
  const file = resolve(dataRoot, dataset, "nodes.json");
  if (!existsSync(file)) {
    return { status: "stale", reason: `soubor ${file} neexistuje` };
  }
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const digest = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  if (digest !== record.nodesDigest) {
    return {
      status: "stale",
      reason: `data ${dataset}/nodes.json se od vygenerování záznamu změnila`,
    };
  }
  return { status: "ok", index: indexNodes(parseNodes(raw)) };
}

// ---------------------------------------------------------------------------
// Vstupy scénářů
// ---------------------------------------------------------------------------

export function parseIds(text: string): string[] {
  return text === "" ? [] : text.split(" ");
}

export function parsePlacements(text: string): Placements {
  const entries = parseIds(text).map((item): [string, Placement] => {
    const [id, year, semester] = item.split(":");
    if (
      id === undefined ||
      semester === undefined ||
      !isFixedSemester(semester)
    ) {
      throw new Error(`Nečitelné zařazení v záznamu: ${item}`);
    }
    return [id, { year: Number(year), semester }];
  });
  return Object.fromEntries(entries);
}

export function scenarioState(scenario: LegacyScenario): CalculatorState {
  return {
    completed: new Set(parseIds(scenario.completed)),
    noCredit: new Set(parseIds(scenario.noCredit)),
    placements: parsePlacements(scenario.placements),
    yearsCount: scenario.yearsCount,
  };
}

// ---------------------------------------------------------------------------
// Textový zápis modelů (stejný formát jako v generátoru)
// ---------------------------------------------------------------------------

export function placementsText(placements: Placements): string {
  return Object.entries(placements)
    .map(([id, placement]) => `${id}:${placement.year}:${placement.semester}`)
    .join(" ");
}

export function stateText(state: CalculatorState): string {
  return [
    `completed=${[...state.completed].join(" ")}`,
    `noCredit=${[...state.noCredit].join(" ")}`,
    `placements=${placementsText(state.placements)}`,
    `years=${state.yearsCount}`,
  ].join("; ");
}

/** Bloky kategorií tak, jak je vykresluje záložka Kalkulačka. */
export function categoryLines(views: readonly CategoryView[]): string[] {
  return views.map((view) => {
    const click = view.canCompleteAll ? ", klik completeAllMandatory()" : "";
    return `${view.title} | ${view.badge.text} [${view.badge.tone}${click}] | ${view.subtitle}`;
  });
}

/** Část záznamu plánu nezávislá na postupu: pořadí předmětů, kredity, semestry. */
export function planCategoryRecords(
  views: readonly CategoryView[],
): LegacyPlanRecord["categories"] {
  return views.map((view) => ({
    title: view.title,
    noCreditToggle: view.allowNoCredit,
    subjects: view.subjects.map(
      (subject) =>
        `${subject.id} | ${creditsBadgeText(subject)} | ${semesterTagText(subject.semester)}`,
    ),
  }));
}

export function summaryLines(items: readonly SummaryItem[]): string[] {
  return items.map((item) => {
    switch (item.type) {
      case "section":
        return `section | ${item.title}`;
      case "note":
        return `note | ${item.label} | ${item.value}`;
      case "divider":
        return "divider";
      case "bar": {
        const { bar } = item;
        const parts = [
          item.total ? "total" : "bar",
          item.label,
          bar.valueText,
          `${bar.widthPercent}%`,
          bar.tone,
        ];
        if (bar.remainingText) parts.push(bar.remainingText);
        return parts.join(" | ");
      }
    }
  });
}

function progressOf(summary: PlanSummary, group: PlanGroup): GroupProgress {
  const progress = [...summary.choiceProgress, ...summary.pvProgress].find(
    (item) => item.group === group,
  );
  if (!progress) throw new Error(`Souhrn nezná skupinu ${group.def.label}`);
  return progress;
}

/** Čísla souhrnu Kalkulačky ve stejném tvaru, v jakém je zapsal generátor. */
export function summaryNumbers(
  plan: StudyPlan,
  summary: PlanSummary,
): LegacyNumbers {
  return {
    mand: [summary.mandEarned, summary.mandTotal],
    groups: plan.groups.map((group) => {
      const progress = progressOf(summary, group);
      return [progress.earned, progress.min, progress.noCreditCredits];
    }),
    choice: [summary.choiceEarned, summary.choiceMin],
    pv: [summary.pvEarned, summary.effOverall, summary.ncTotal],
    total: summary.totalEarned,
    free: summary.structuralFree > 0 ? summary.structuralFree : null,
    ok: summary.fulfilled,
  };
}

/** Čísla souhrnu Rozvrhu ve stejném tvaru, v jakém je zapsal generátor. */
export function scheduleSummaryNumbers(
  plan: StudyPlan,
  summary: PlanSummary,
): LegacyScheduleNumbers {
  return {
    mand: summary.mandEarned,
    groups: plan.groups.map((group) => {
      const progress = progressOf(summary, group);
      return progress.hasBar ? progress.earned : null;
    }),
    choice: summary.choiceEarned,
    pv: summary.pvEarned,
    total: summary.totalEarned,
    ok: summary.fulfilled,
  };
}

export function statusLine(status: PlanStatus): string {
  return `${status.tone} | ${status.text}`;
}

export function stepperLine(yearsCount: number): string {
  const { canDecrease, canIncrease } = yearsStepper(yearsCount);
  const text = (enabled: boolean) => (enabled ? "zapnuto" : "vypnuto");
  return `${yearsCount} | − ${text(canDecrease)} | + ${text(canIncrease)}`;
}

/** Štítky „N. r. / ZS" u zařazených předmětů v levém sloupci Rozvrhu. */
export function placedText(
  views: readonly CategoryView[],
  placements: Placements,
): string {
  const parts: string[] = [];
  for (const view of views) {
    for (const subject of view.subjects) {
      const placement = placementOf(placements, subject.id);
      if (placement) parts.push(`${subject.id}=${placedAtText(placement)}`);
    }
  }
  return parts.join("; ");
}

export function yearLines(blocks: readonly YearBlock[]): string[] {
  const slot = (subjects: readonly SubjectNode[]) =>
    subjects.length ? subjects.map((subject) => subject.id).join(" ") : "–";
  return blocks.map((block) =>
    [
      block.title,
      block.creditsText,
      block.canReset ? "Reset" : "–",
      `${semesterSlotLabel("zimní")}: ${slot(block.winter)}`,
      `${semesterSlotLabel("letní")}: ${slot(block.summer)}`,
    ].join(" | "),
  );
}

/** Výběr ročníku a zvýraznění cílů při přetahování pro jeden předmět. */
export function pickerLine(subject: SubjectNode, yearsCount: number): string {
  const options = placementOptions(subject, yearsCount).map(
    (option) => option.label,
  );
  const drops = (["zimní", "letní"] as const).map(
    (semester) =>
      `${semester} ${isDropAllowed(subject, semester) ? "ano" : "ne"}`,
  );
  return `${subject.id} (${subject.semester}) | ${options.join("; ")} | přetažení: ${drops.join(", ")}`;
}

/** Id předmětů po kategoriích: povinné, pak skupiny (pro akce „Reset kategorie"). */
export function categoryIds(plan: StudyPlan): string[][] {
  return [plan.mandatory, ...plan.groups.map((group) => group.subjects)].map(
    (subjects) => subjects.map((subject) => subject.id),
  );
}
