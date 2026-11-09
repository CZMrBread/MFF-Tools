import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPlan,
  planCategories,
  planFor,
  planStatus,
  planSummary,
  doneIn,
  summaryItems,
} from "./credits";
import type { StudyPlan } from "./credits";
import type { StudyIndex } from "./data";
import {
  DEFAULT_YEARS,
  FALLBACK_YEARS,
  MAX_YEARS,
  MIN_YEARS,
  PLACEMENT_SEMESTERS,
  canPlace,
  changeYears,
  completeAllMandatory,
  defaultYearsFor,
  effectiveDegree,
  emptyState,
  isDropAllowed,
  isFixedSemester,
  normalizeState,
  placeSubject,
  placedAtText,
  placedIn,
  placementOf,
  placementOptions,
  prunePlacements,
  quickPlacementSemester,
  resetAllProgress,
  resetAllSchedule,
  resetCategory,
  resetScheduleCategory,
  resetYear,
  resolveYearsCount,
  scheduleSummary,
  semesterSlotLabel,
  semesterTagText,
  stateChanges,
  toggleDone,
  toggleNoCredit,
  unplaceFromSchedule,
  yearBlocks,
  yearsStepper,
} from "./schedule";
import type { CalculatorState } from "./schedule";
import type { Placements } from "./storage";
import type { SubjectNode } from "./types";
import {
  at,
  elective,
  ids,
  mandatory,
  requirement,
} from "./__fixtures__/builders";
import {
  categoryIds,
  loadDataset,
  pickerLine,
  placedText,
  readLegacyFixture,
  scenarioState,
  stateText,
  statusLine,
  stepperLine,
  scheduleSummaryNumbers,
  summaryLines,
  yearLines,
} from "./__fixtures__/legacyTranscript";

// ---------------------------------------------------------------------------
// Ručně sestavená data
// ---------------------------------------------------------------------------

// Malý plán: 3 povinné (zimní, letní, celoroční) a jedna PV skupina s minimem 8,
// ve které je i předmět s neznámým textem semestru. X do plánu nepatří.
const SUBJECTS: SubjectNode[] = [
  mandatory("A", 5, { semester: "zimní" }),
  mandatory("B", 3, { semester: "letní" }),
  mandatory("C", 4, { semester: "oba" }),
  elective("P1", 6, 1, { semester: "zimní" }),
  elective("P2", 4, 1, { semester: "letní" }),
  elective("P3", 2, 1, { semester: "jindy" }),
  elective("X", 9, "doporucene", { semester: "zimní" }),
];
const PLAN = buildPlan(
  requirement([{ group: 1, label: "Skupina 1", min_credits: 8 }], {
    total_credits: 20,
    pv_overall_min: 8,
  }),
  SUBJECTS,
);
const GROUP_IDS = ["P1", "P2", "P3"];

function subjectOf(id: string): SubjectNode {
  const found = SUBJECTS.find((item) => item.id === id);
  if (!found) throw new Error(`Neznámý předmět ${id}`);
  return found;
}

interface StateInput {
  completed?: string[];
  noCredit?: string[];
  placements?: Placements;
  yearsCount?: number | null;
}

function state(input: StateInput = {}): CalculatorState {
  return {
    completed: new Set(input.completed ?? []),
    noCredit: new Set(input.noCredit ?? []),
    placements: input.placements ?? {},
    yearsCount: input.yearsCount === undefined ? 3 : input.yearsCount,
  };
}

const WINTER_1 = { year: 1, semester: "zimní" } as const;
const SUMMER_1 = { year: 1, semester: "letní" } as const;
const SUMMER_2 = { year: 2, semester: "letní" } as const;
const WINTER_3 = { year: 3, semester: "zimní" } as const;

// ---------------------------------------------------------------------------
// Počet ročníků
// ---------------------------------------------------------------------------

describe("počet ročníků", () => {
  it("výchozí počet: 3 bakalářské, 2 magisterské, jinak 3", () => {
    expect(DEFAULT_YEARS).toEqual({ bakalarske: 3, magisterske: 2 });
    expect(FALLBACK_YEARS).toBe(3);
    expect(defaultYearsFor("bakalarske")).toBe(3);
    expect(defaultYearsFor("magisterske")).toBe(2);
    for (const degree of [null, undefined, "", "mgr", "bc", "toString"]) {
      expect(defaultYearsFor(degree)).toBe(3);
    }
  });

  it("effectiveDegree: uložený stupeň, jinak stupeň specializace, jinak null", () => {
    expect(effectiveDegree("magisterske", { study_type: "bakalarske" })).toBe(
      "magisterske",
    );
    expect(effectiveDegree(null, { study_type: "magisterske" })).toBe(
      "magisterske",
    );
    expect(effectiveDegree(undefined, { study_type: "bakalarske" })).toBe(
      "bakalarske",
    );
    expect(effectiveDegree(null, null)).toBeNull();
    expect(effectiveDegree(null, undefined)).toBeNull();
  });

  it("resolveYearsCount doplní výchozí jen za chybějící nebo NaN hodnotu", () => {
    expect(resolveYearsCount(null, "magisterske")).toBe(2);
    expect(resolveYearsCount(undefined, "bakalarske")).toBe(3);
    expect(resolveYearsCount(Number.NaN, "magisterske")).toBe(2);
    expect(resolveYearsCount(null, null)).toBe(3);
    expect(resolveYearsCount(5, "magisterske")).toBe(5);
    expect(resolveYearsCount(0, "magisterske")).toBe(0);
  });

  it("yearsStepper vypne − na 1 a + na 8", () => {
    expect([MIN_YEARS, MAX_YEARS]).toEqual([1, 8]);
    expect(yearsStepper(1)).toEqual({ canDecrease: false, canIncrease: true });
    expect(yearsStepper(3)).toEqual({ canDecrease: true, canIncrease: true });
    expect(yearsStepper(8)).toEqual({ canDecrease: true, canIncrease: false });
    expect(yearsStepper(0)).toEqual({ canDecrease: false, canIncrease: true });
    expect(yearsStepper(9)).toEqual({ canDecrease: true, canIncrease: false });
  });
});

// ---------------------------------------------------------------------------
// Semestry
// ---------------------------------------------------------------------------

describe("semestry", () => {
  it("isFixedSemester: jen zimní a letní", () => {
    expect(PLACEMENT_SEMESTERS).toEqual(["zimní", "letní"]);
    expect(isFixedSemester("zimní")).toBe(true);
    expect(isFixedSemester("letní")).toBe(true);
    expect(isFixedSemester("oba")).toBe(false);
    expect(isFixedSemester("jindy")).toBe(false);
    expect(isFixedSemester("")).toBe(false);
  });

  it("semesterTagText a semesterSlotLabel", () => {
    expect(semesterTagText("zimní")).toBe("ZS");
    expect(semesterTagText("letní")).toBe("LS");
    expect(semesterTagText("oba")).toBe("ZS nebo LS");
    expect(semesterTagText("jindy")).toBe("—");
    expect(semesterTagText("")).toBe("—");
    expect(semesterSlotLabel("zimní")).toBe("Zimní semestr");
    expect(semesterSlotLabel("letní")).toBe("Letní semestr");
  });

  it("canPlace: pevný semestr jen do svého, „oba“ i neznámý kamkoli", () => {
    const table = [
      ["zimní", true, false],
      ["letní", false, true],
      ["oba", true, true],
      ["jindy", true, true],
    ] as const;
    for (const [semester, winter, summer] of table) {
      expect(canPlace({ semester }, "zimní")).toBe(winter);
      expect(canPlace({ semester }, "letní")).toBe(summer);
    }
  });

  it("isDropAllowed: neznámý semestr se při přetahování ukáže jako zakázaný", () => {
    const table = [
      ["zimní", true, false],
      ["letní", false, true],
      ["oba", true, true],
      ["jindy", false, false],
    ] as const;
    for (const [semester, winter, summer] of table) {
      expect(isDropAllowed({ semester }, "zimní")).toBe(winter);
      expect(isDropAllowed({ semester }, "letní")).toBe(summer);
    }
    // neví se, co se táhne → povoleno
    expect(isDropAllowed(null, "zimní")).toBe(true);
    expect(isDropAllowed(undefined, "letní")).toBe(true);
  });

  it("quickPlacementSemester: pevný semestr, jinak zimní", () => {
    expect(quickPlacementSemester({ semester: "letní" })).toBe("letní");
    expect(quickPlacementSemester({ semester: "zimní" })).toBe("zimní");
    expect(quickPlacementSemester({ semester: "oba" })).toBe("zimní");
    expect(quickPlacementSemester({ semester: "jindy" })).toBe("zimní");
  });

  it("placementOptions: jedna volba na ročník u pevného semestru, jinak dvě", () => {
    expect(placementOptions({ semester: "letní" }, 2)).toEqual([
      { year: 1, semester: "letní", label: "1. ročník — letní semestr" },
      { year: 2, semester: "letní", label: "2. ročník — letní semestr" },
    ]);
    expect(
      placementOptions({ semester: "oba" }, 2).map((option) => option.label),
    ).toEqual([
      "1. ročník — zimní semestr",
      "1. ročník — letní semestr",
      "2. ročník — zimní semestr",
      "2. ročník — letní semestr",
    ]);
    expect(placementOptions({ semester: "jindy" }, 3)).toHaveLength(6);
    expect(placementOptions({ semester: "zimní" }, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Zařazení
// ---------------------------------------------------------------------------

describe("zařazení", () => {
  const placements: Placements = { A: WINTER_1, P2: SUMMER_2 };

  it("placementOf a placedIn", () => {
    expect(placementOf(placements, "A")).toEqual(WINTER_1);
    expect(placementOf(placements, "B")).toBeUndefined();
    // zděděné vlastnosti objektu nejsou zařazení
    expect(placementOf(placements, "constructor")).toBeUndefined();
    expect(placementOf(placements, "toString")).toBeUndefined();
    const isPlaced = placedIn(placements);
    expect(isPlaced("A")).toBe(true);
    expect(isPlaced("P2")).toBe(true);
    expect(isPlaced("B")).toBe(false);
    expect(isPlaced("constructor")).toBe(false);
  });

  it("placedAtText", () => {
    expect(placedAtText(WINTER_1)).toBe("1. r. / ZS");
    expect(placedAtText(SUMMER_2)).toBe("2. r. / LS");
  });

  it("prunePlacements zahodí předměty mimo plán a zachová pořadí", () => {
    const withForeign: Placements = {
      P2: SUMMER_2,
      X: WINTER_1,
      A: WINTER_1,
      neexistuje: SUMMER_1,
    };
    const pruned = prunePlacements(withForeign, PLAN);
    expect(Object.keys(pruned)).toEqual(["P2", "A"]);
    expect(pruned).toEqual({ P2: SUMMER_2, A: WINTER_1 });
    // vstup se nemění; bez změny vrací tentýž objekt
    expect(Object.keys(withForeign)).toHaveLength(4);
    expect(prunePlacements(placements, PLAN)).toBe(placements);
  });
});

describe("yearBlocks", () => {
  const placements: Placements = {
    P2: SUMMER_2,
    A: WINTER_1,
    C: SUMMER_1,
    B: SUMMER_1,
    X: WINTER_1, // mimo plán
    P1: { year: 4, semester: "zimní" }, // nad počtem ročníků
  };

  it("rozdělí předměty do ročníků a semestrů podle zařazení", () => {
    const blocks = yearBlocks(PLAN, placements, 3);
    expect(blocks.map((block) => block.year)).toEqual([1, 2, 3]);

    const first = at(blocks, 0);
    expect(first.title).toBe("1. ročník");
    // pořadí zařazení, ne abecední
    expect(ids(first.subjects)).toEqual(["A", "C", "B"]);
    expect(ids(first.winter)).toEqual(["A"]);
    // celoroční předmět C je jen v semestru, do kterého byl zařazen
    expect(ids(first.summer)).toEqual(["C", "B"]);
    expect(first.credits).toBe(12);
    expect(first.creditsText).toBe("12 kr.");
    expect(first.canReset).toBe(true);

    const second = at(blocks, 1);
    expect(ids(second.subjects)).toEqual(["P2"]);
    expect(ids(second.winter)).toEqual([]);
    expect(ids(second.summer)).toEqual(["P2"]);
    expect(second.credits).toBe(4);

    expect(at(blocks, 2)).toEqual({
      year: 3,
      title: "3. ročník",
      subjects: [],
      credits: 0,
      creditsText: "0 kr.",
      winter: [],
      summer: [],
      canReset: false,
    });
  });

  it("ročník nad počtem ročníků se nezobrazí; počet 0 = žádné ročníky", () => {
    expect(
      yearBlocks(PLAN, placements, 4).map((block) => block.credits),
    ).toEqual([12, 4, 0, 6]);
    expect(yearBlocks(PLAN, placements, 1)).toHaveLength(1);
    expect(yearBlocks(PLAN, placements, 0)).toEqual([]);
  });
});

describe("scheduleSummary", () => {
  it("počítá kredity zařazených předmětů, ne splněných", () => {
    const placements: Placements = {
      A: WINTER_1,
      B: SUMMER_1,
      C: SUMMER_1,
      P1: WINTER_3,
      X: WINTER_1,
    };
    const summary = scheduleSummary(PLAN, placements, new Set(["P2"]));
    expect(summary).toMatchObject({
      mandEarned: 12,
      mandTotal: 12,
      pvEarned: 6,
      ncTotal: 4,
      effOverall: 4,
      totalEarned: 18,
      mandOk: true,
      groupsOk: true,
      overallOk: true,
      totalOk: false,
      fulfilled: false,
    });
    expect(planStatus(summary, "schedule").text).toBe(
      "Zbývá zařadit: 2 kr. do 20.",
    );
    // stejný výsledek jako planSummary nad „je zařazený“
    expect(summary).toEqual(
      planSummary(
        PLAN,
        doneIn(new Set(Object.keys(placements))),
        new Set(["P2"]),
      ),
    );
  });

  it("skupina povinného výběru: zařazené kredity jdou do celku, ne do PV celkem", () => {
    const plan = buildPlan(
      requirement(
        [
          { group: "telocvik", label: "Tělocvik", min_credits: 2 },
          { group: 1, label: "Skupina 1", min_credits: 8 },
        ],
        { total_credits: 20, pv_overall_min: 8 },
      ),
      [
        ...SUBJECTS,
        elective("T1", 1, "telocvik", { semester: "oba" }),
        elective("T2", 1, "telocvik", { semester: "oba" }),
      ],
    );
    const placements: Placements = {
      A: WINTER_1,
      B: SUMMER_1,
      C: SUMMER_1,
      P1: WINTER_3,
      T1: WINTER_1,
    };
    const summary = scheduleSummary(plan, placements, new Set());
    expect(summary).toMatchObject({
      mandEarned: 12,
      choiceEarned: 1,
      choiceMin: 2,
      pvEarned: 6,
      totalEarned: 19,
      mandOk: false,
      groupsOk: false,
    });
    expect(summary.missing).toEqual([
      "povinné",
      "minima PV skupin",
      "PV celkem",
      "1 kr. do 20",
    ]);
  });

  it("prázdný rozvrh", () => {
    const summary = scheduleSummary(PLAN, {}, new Set());
    expect(summary).toMatchObject({
      mandEarned: 0,
      pvEarned: 0,
      totalEarned: 0,
    });
    expect(summary.missing).toEqual([
      "povinné",
      "minima PV skupin",
      "PV celkem",
      "20 kr. do 20",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Přechody stavu
// ---------------------------------------------------------------------------

describe("emptyState, normalizeState, stateChanges", () => {
  it("emptyState je prázdný postup bez počtu ročníků", () => {
    expect(stateText(emptyState())).toBe(
      "completed=; noCredit=; placements=; years=null",
    );
  });

  it("normalizeState doplní počet ročníků a zahodí zařazení mimo plán", () => {
    const before = state({
      completed: ["X", "A"],
      placements: { X: WINTER_1, A: WINTER_1 },
      yearsCount: null,
    });
    const after = normalizeState(before, PLAN, "magisterske");
    expect(stateText(after)).toBe(
      "completed=X A; noCredit=; placements=A:1:zimní; years=2",
    );
    // předmět mimo plán zůstává splněný; vstup se nemění
    expect(stateText(before)).toBe(
      "completed=X A; noCredit=; placements=X:1:zimní A:1:zimní; years=null",
    );
    expect(
      normalizeState(state({ yearsCount: Number.NaN }), PLAN, null).yearsCount,
    ).toBe(3);
  });

  it("normalizeState bez změny vrací tentýž objekt", () => {
    const before = state({ placements: { A: WINTER_1 }, yearsCount: 5 });
    expect(normalizeState(before, PLAN, "bakalarske")).toBe(before);
  });

  it("stateChanges pozná, co se má uložit, podle identity objektů", () => {
    const before = state({ completed: ["A"], placements: { A: WINTER_1 } });
    expect(stateChanges(before, before)).toEqual({
      progress: false,
      schedule: false,
    });
    expect(stateChanges(before, { ...before, noCredit: new Set() })).toEqual({
      progress: true,
      schedule: false,
    });
    expect(stateChanges(before, { ...before, placements: {} })).toEqual({
      progress: false,
      schedule: true,
    });
    expect(stateChanges(before, { ...before, yearsCount: 4 })).toEqual({
      progress: false,
      schedule: true,
    });
  });
});

describe("toggleDone", () => {
  it("zaškrtnutí označí předmět jako splněný a zruší „bez kreditů“", () => {
    const before = state({ completed: ["A"], noCredit: ["P1", "P2"] });
    const after = toggleDone(before, "P1");
    expect(stateText(after)).toBe(
      "completed=A P1; noCredit=P2; placements=; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: false,
    });
    expect(stateText(before)).toBe(
      "completed=A; noCredit=P1 P2; placements=; years=3",
    );
  });

  it("odškrtnutí odebere předmět i z rozvrhu", () => {
    const before = state({
      completed: ["A", "B"],
      placements: { A: WINTER_1, B: SUMMER_1 },
    });
    const after = toggleDone(before, "A");
    expect(stateText(after)).toBe(
      "completed=B; noCredit=; placements=B:1:letní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
  });

  it("odškrtnutí nezařazeného předmětu rozvrh nemění", () => {
    const before = state({
      completed: ["A", "B"],
      placements: { A: WINTER_1 },
    });
    const after = toggleDone(before, "B");
    expect(after.placements).toBe(before.placements);
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: false,
    });
  });
});

describe("toggleNoCredit", () => {
  it("zapnutí zruší „splněno“ a odebere předmět z rozvrhu", () => {
    const before = state({
      completed: ["A", "P1"],
      placements: { P1: WINTER_1, A: WINTER_1 },
    });
    const after = toggleNoCredit(before, "P1");
    expect(stateText(after)).toBe(
      "completed=A; noCredit=P1; placements=A:1:zimní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
  });

  it("vypnutí jen zruší „bez kreditů“", () => {
    const before = state({ completed: ["A"], noCredit: ["P1", "P2"] });
    const after = toggleNoCredit(before, "P1");
    expect(stateText(after)).toBe(
      "completed=A; noCredit=P2; placements=; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: false,
    });
  });
});

describe("completeAllMandatory, resetCategory, resetAllProgress", () => {
  it("completeAllMandatory splní povinné a zruší u nich „bez kreditů“", () => {
    const before = state({
      completed: ["P1", "B"],
      noCredit: ["A", "P2"],
      placements: { P1: WINTER_1 },
    });
    const after = completeAllMandatory(before, PLAN);
    expect(stateText(after)).toBe(
      "completed=P1 B A C; noCredit=P2; placements=P1:1:zimní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: false,
    });
  });

  it("resetCategory zruší splněno, „bez kreditů“ i zařazení předmětů kategorie", () => {
    const before = state({
      completed: ["A", "P1"],
      noCredit: ["P2"],
      placements: { A: WINTER_1, P1: WINTER_1 },
    });
    const after = resetCategory(before, GROUP_IDS);
    expect(stateText(after)).toBe(
      "completed=A; noCredit=; placements=A:1:zimní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
    // kategorie bez zařazených předmětů rozvrh neukládá
    const unplaced = state({ completed: ["P1"], placements: { A: WINTER_1 } });
    const cleared = resetCategory(unplaced, GROUP_IDS);
    expect(cleared.placements).toBe(unplaced.placements);
    expect(stateChanges(unplaced, cleared)).toEqual({
      progress: true,
      schedule: false,
    });
  });

  it("resetAllProgress vyprázdní vše kromě počtu ročníků a vždy ukládá obojí", () => {
    const before = state({
      completed: ["A"],
      noCredit: ["P2"],
      placements: { A: WINTER_1 },
      yearsCount: 5,
    });
    expect(stateText(resetAllProgress(before))).toBe(
      "completed=; noCredit=; placements=; years=5",
    );
    const empty = state();
    expect(stateChanges(empty, resetAllProgress(empty))).toEqual({
      progress: true,
      schedule: true,
    });
  });
});

describe("changeYears", () => {
  it("mění počet v mezích 1–8", () => {
    expect(changeYears(state({ yearsCount: 3 }), 1).yearsCount).toBe(4);
    expect(changeYears(state({ yearsCount: 3 }), -1).yearsCount).toBe(2);
    expect(changeYears(state({ yearsCount: 8 }), 1).yearsCount).toBe(8);
    expect(changeYears(state({ yearsCount: 1 }), -1).yearsCount).toBe(1);
    expect(changeYears(state({ yearsCount: 20 }), 1).yearsCount).toBe(8);
  });

  it("chybějící počet bere jako 1 (jako stará stránka)", () => {
    expect(changeYears(state({ yearsCount: null }), 1).yearsCount).toBe(2);
    expect(changeYears(state({ yearsCount: null }), -1).yearsCount).toBe(1);
    expect(changeYears(state({ yearsCount: 0 }), 1).yearsCount).toBe(2);
  });

  it("zahodí zařazení do ročníků nad novým počtem, předměty zůstanou splněné", () => {
    const before = state({
      completed: ["A", "P1", "P2"],
      placements: { A: WINTER_1, P1: WINTER_3, P2: SUMMER_2 },
      yearsCount: 3,
    });
    const after = changeYears(before, -1);
    expect(stateText(after)).toBe(
      "completed=A P1 P2; noCredit=; placements=A:1:zimní P2:2:letní; years=2",
    );
    expect(after.completed).toBe(before.completed);
    expect(stateChanges(before, after)).toEqual({
      progress: false,
      schedule: true,
    });
  });

  it("ukládá rozvrh i na mezi, kdy se počet nezmění", () => {
    const before = state({ yearsCount: 8 });
    expect(stateChanges(before, changeYears(before, 1))).toEqual({
      progress: false,
      schedule: true,
    });
  });
});

describe("placeSubject", () => {
  it("zařadí předmět, označí ho jako splněný a zruší „bez kreditů“", () => {
    const before = state({ noCredit: ["P1", "P2"] });
    const after = placeSubject(before, subjectOf("P1"), 2, "zimní");
    expect(stateText(after)).toBe(
      "completed=P1; noCredit=P2; placements=P1:2:zimní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
    expect(stateText(before)).toBe(
      "completed=; noCredit=P1 P2; placements=; years=3",
    );
  });

  it("předmět s pevným semestrem do jiného semestru nezařadí", () => {
    const before = state();
    expect(placeSubject(before, subjectOf("A"), 1, "letní")).toBe(before);
    expect(placeSubject(before, subjectOf("B"), 1, "zimní")).toBe(before);
  });

  it("neznámý předmět ignoruje", () => {
    const before = state();
    expect(placeSubject(before, undefined, 1, "zimní")).toBe(before);
    expect(placeSubject(before, null, 1, "letní")).toBe(before);
  });

  it("celoroční předmět a předmět s neznámým semestrem lze dát do obou semestrů", () => {
    for (const id of ["C", "P3"]) {
      for (const semester of PLACEMENT_SEMESTERS) {
        const after = placeSubject(state(), subjectOf(id), 1, semester);
        expect(after.placements).toEqual({ [id]: { year: 1, semester } });
      }
    }
  });

  it("přesun zachová pořadí zařazení i pořadí splněných", () => {
    const before = state({
      completed: ["C", "A"],
      placements: { C: SUMMER_1, A: WINTER_1 },
    });
    const after = placeSubject(before, subjectOf("C"), 3, "zimní");
    expect(stateText(after)).toBe(
      "completed=C A; noCredit=; placements=C:3:zimní A:1:zimní; years=3",
    );
  });

  it("ročník nekontroluje (nabídku ročníků hlídá rozhraní)", () => {
    const after = placeSubject(
      state({ yearsCount: 2 }),
      subjectOf("A"),
      5,
      "zimní",
    );
    expect(after.placements).toEqual({ A: { year: 5, semester: "zimní" } });
  });

  it("předmět mimo plán zařadí; úklid ho z rozvrhu odebere, splněný zůstane", () => {
    const placed = placeSubject(state(), subjectOf("X"), 1, "zimní");
    expect(stateText(normalizeState(placed, PLAN, "bakalarske"))).toBe(
      "completed=X; noCredit=; placements=; years=3",
    );
  });
});

describe("odebírání z rozvrhu", () => {
  const filled = () =>
    state({
      completed: ["A", "B", "P1", "P2"],
      noCredit: ["P3"],
      placements: { A: WINTER_1, B: SUMMER_1, P2: SUMMER_2 },
    });

  it("unplaceFromSchedule zruší zařazení i „splněno“, „bez kreditů“ nechá", () => {
    const before = filled();
    const after = unplaceFromSchedule(before, "A");
    expect(stateText(after)).toBe(
      "completed=B P1 P2; noCredit=P3; placements=B:1:letní P2:2:letní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
  });

  it("unplaceFromSchedule u nezařazeného předmětu zruší „splněno“ a uloží obojí", () => {
    const before = filled();
    const after = unplaceFromSchedule(before, "P1");
    expect(stateText(after)).toBe(
      "completed=A B P2; noCredit=P3; placements=A:1:zimní B:1:letní P2:2:letní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
  });

  it("resetYear vyprázdní jen daný ročník; prázdný ročník nic nemění", () => {
    const before = filled();
    expect(stateText(resetYear(before, 1))).toBe(
      "completed=P1 P2; noCredit=P3; placements=P2:2:letní; years=3",
    );
    expect(resetYear(before, 3)).toBe(before);
  });

  it("resetAllSchedule vyprázdní rozvrh; nezařazené splněné předměty nechá", () => {
    const before = filled();
    expect(stateText(resetAllSchedule(before))).toBe(
      "completed=P1; noCredit=P3; placements=; years=3",
    );
    const empty = state({ completed: ["A"] });
    expect(resetAllSchedule(empty)).toBe(empty);
  });

  it("resetScheduleCategory zruší „splněno“ i u nezařazených předmětů kategorie", () => {
    const before = filled();
    const after = resetScheduleCategory(before, GROUP_IDS);
    expect(stateText(after)).toBe(
      "completed=A B; noCredit=P3; placements=A:1:zimní B:1:letní; years=3",
    );
    expect(stateChanges(before, after)).toEqual({
      progress: true,
      schedule: true,
    });
    // ukládá obojí, i když se nic nezměnilo
    const empty = state();
    expect(
      stateChanges(empty, resetScheduleCategory(empty, GROUP_IDS)),
    ).toEqual({ progress: true, schedule: true });
  });
});

// ---------------------------------------------------------------------------
// Shoda se starou kalkulačkou (záznam z scripts/gen-credits-fixture.mjs)
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE_PATH = resolve(
  REPO_ROOT,
  "src/lib/__fixtures__/credits-legacy.json",
);
const DATA_ROOT = resolve(REPO_ROOT, "data");
const LEGACY_HTML = resolve(REPO_ROOT, "src/legacy/kalkulačka/index.html");

const fixture = readLegacyFixture(FIXTURE_PATH);

/** Provede jednu akci ze záznamu posloupnosti novými funkcemi. */
function applyAction(
  current: CalculatorState,
  action: string,
  plan: StudyPlan,
  index: StudyIndex,
): CalculatorState {
  const [name, ...args] = action.split(" ");
  const arg = (position: number): string => at(args, position);
  const categoryOf = (position: number) =>
    at(categoryIds(plan), Number(arg(position)));
  const semesterArg = (position: number) => {
    const semester = arg(position);
    if (!isFixedSemester(semester)) {
      throw new Error(`Neznámý semestr v záznamu: ${semester}`);
    }
    return semester;
  };

  switch (name) {
    case "toggleDone":
      return toggleDone(current, arg(0));
    case "toggleNoCredit":
      return toggleNoCredit(current, arg(0));
    case "completeAllMandatory":
      return completeAllMandatory(current, plan);
    case "resetCategory":
      return resetCategory(current, categoryOf(0));
    case "resetAllProgress":
      return resetAllProgress(current);
    case "changeYears":
      return changeYears(current, Number(arg(0)));
    case "placeSubject":
      return placeSubject(
        current,
        index.subjectById.get(arg(0)),
        Number(arg(1)),
        semesterArg(2),
      );
    case "scheduleCheckbox": {
      // zaškrtávátko v levém sloupci Rozvrhu: rychlé zařazení / odebrání
      const id = arg(0);
      if (placementOf(current.placements, id)) {
        return unplaceFromSchedule(current, id);
      }
      const subject = index.subjectById.get(id);
      if (!subject) throw new Error(`Neznámý předmět v záznamu: ${id}`);
      return placeSubject(current, subject, 1, quickPlacementSemester(subject));
    }
    case "unplaceFromSchedule":
      return unplaceFromSchedule(current, arg(0));
    case "resetYear":
      return resetYear(current, Number(arg(0)));
    case "resetAllSchedule":
      return resetAllSchedule(current);
    case "resetSchedCategory":
      return resetScheduleCategory(current, categoryOf(0));
    default:
      throw new Error(`Neznámá akce v záznamu: ${action}`);
  }
}

function savedText(changes: { progress: boolean; schedule: boolean }): string {
  const parts = [
    ...(changes.progress ? ["postup"] : []),
    ...(changes.schedule ? ["rozvrh"] : []),
  ];
  return parts.join("+") || "nic";
}

describe("záznam staré kalkulačky – rozvrh", () => {
  it("obsahuje zařazení mimo plán, nad počtem ročníků a posloupnosti akcí", () => {
    const datasets = Object.values(fixture.datasets);
    const scenarios = datasets.flatMap((dataset) =>
      Object.values(dataset.specs).flatMap((spec) => spec.scenarios),
    );
    const count = (test: (scenario: (typeof scenarios)[number]) => boolean) =>
      scenarios.filter(test).length;
    expect(count((s) => s.schedule.pruned !== "")).toBeGreaterThan(10);
    expect(count((s) => s.schedule.status.startsWith("ok | "))).toBeGreaterThan(
      10,
    );
    expect(
      count((s) => s.schedule.status.startsWith("todo | ")),
    ).toBeGreaterThan(10);
    // zařazení do ročníku nad počtem ročníků (v ročnících není vidět, v souhrnu ano)
    expect(
      count((s) => {
        const years = s.schedule.yearsCount;
        return scenarioStateYears(s.placements).some((year) => year > years);
      }),
    ).toBeGreaterThan(5);

    const steps = datasets.flatMap((dataset) =>
      Object.values(dataset.sequences).flatMap((sequence) => sequence.steps),
    );
    expect(steps.length).toBeGreaterThanOrEqual(200);
    for (const action of [
      "toggleDone",
      "toggleNoCredit",
      "completeAllMandatory",
      "resetCategory",
      "resetAllProgress",
      "changeYears",
      "placeSubject",
      "scheduleCheckbox",
      "unplaceFromSchedule",
      "resetYear",
      "resetAllSchedule",
      "resetSchedCategory",
    ]) {
      expect(
        steps.some((step) => step.startsWith(`${action} `)),
        action,
      ).toBe(true);
    }
    for (const saved of ["nic", "postup", "rozvrh", "postup+rozvrh"]) {
      expect(
        steps.some((step) => step.includes(` => uloženo: ${saved} => `)),
        saved,
      ).toBe(true);
    }
  });
});

/** Ročníky ze zápisu zařazení „ID:ročník:semestr …“. */
function scenarioStateYears(placements: string): number[] {
  return placements === ""
    ? []
    : placements.split(" ").map((item) => Number(item.split(":")[1]));
}

for (const [dataset, record] of Object.entries(fixture.datasets)) {
  const loaded = loadDataset(DATA_ROOT, dataset, record);

  describe(`shoda se starou kalkulačkou (rozvrh) – ${dataset}`, () => {
    if (loaded.status === "stale") {
      // Viz credits.test.ts: záznam platí jen pro data, ze kterých vznikl.
      it("záznam odpovídá datům", () => {
        expect(
          existsSync(LEGACY_HTML),
          `${loaded.reason} – spusť: node scripts/gen-credits-fixture.mjs`,
        ).toBe(false);
      });
      return;
    }
    const { index } = loaded;

    for (const [specId, specRecord] of Object.entries(record.specs)) {
      describe(specId, () => {
        const plan = planFor(index, specId);
        const spec = index.specById.get(specId);
        if (!plan || !spec) throw new Error(`Chybí data pro ${specId}`);
        const degree = effectiveDegree(null, spec);

        it("výběr ročníku a zvýraznění při přetahování", () => {
          const yearsCount = resolveYearsCount(null, degree);
          const lines = specRecord.plan.pickers.map((line) => {
            const id = line.slice(0, line.indexOf(" "));
            const subject = index.subjectById.get(id);
            if (!subject) throw new Error(`Neznámý předmět v záznamu: ${id}`);
            return pickerLine(subject, yearsCount);
          });
          expect(lines).toEqual(specRecord.plan.pickers);
        });

        it.each(specRecord.scenarios)("$name", (scenario) => {
          const input = scenarioState(scenario);
          const current = normalizeState(input, plan, degree);

          // úklid při vykreslení: počet ročníků a zařazení mimo plán
          const pruned = Object.keys(input.placements).filter(
            (id) => !placementOf(current.placements, id),
          );
          expect(pruned.join(" ")).toBe(scenario.schedule.pruned);
          expect(current.yearsCount).toBe(scenario.schedule.yearsCount);
          const yearsCount = resolveYearsCount(current.yearsCount, degree);
          expect(stepperLine(yearsCount)).toBe(scenario.schedule.stepper);

          // levý sloupec: štítky zařazení; pravý sloupec: ročníky
          const views = planCategories(
            plan,
            current.completed,
            current.noCredit,
          );
          expect(placedText(views, current.placements)).toBe(
            scenario.schedule.placed,
          );
          expect(
            yearLines(yearBlocks(plan, current.placements, yearsCount)),
          ).toEqual(scenario.schedule.years);

          // souhrn nad zařazenými předměty
          const summary = scheduleSummary(
            plan,
            current.placements,
            current.noCredit,
          );
          expect(summaryLines(summaryItems(summary, "schedule"))).toEqual(
            scenario.schedule.summary,
          );
          expect(statusLine(planStatus(summary, "schedule"))).toBe(
            scenario.schedule.status,
          );
          expect(scheduleSummaryNumbers(plan, summary)).toEqual(
            scenario.schedule.numbers,
          );

          // zařazení mimo plán souhrn neovlivní ani před úklidem
          expect(
            scheduleSummary(plan, input.placements, input.noCredit),
          ).toEqual(summary);
        });
      });
    }

    for (const [specId, sequence] of Object.entries(record.sequences)) {
      it(`posloupnost akcí – ${specId}`, () => {
        const plan = planFor(index, specId);
        const spec = index.specById.get(specId);
        if (!plan || !spec) throw new Error(`Chybí data pro ${specId}`);
        const degree = spec.study_type;

        let current = normalizeState(emptyState(), plan, degree);
        expect(stateText(current)).toBe(sequence.start);

        sequence.steps.forEach((step, position) => {
          const [action, saved, expected] = step.split(" => ");
          if (action === undefined || saved === undefined) {
            throw new Error(`Nečitelný krok záznamu: ${step}`);
          }
          const next = applyAction(current, action, plan, index);
          const label = `krok ${position + 1}: ${action}`;
          expect(
            `uloženo: ${savedText(stateChanges(current, next))}`,
            label,
          ).toBe(saved);
          current = normalizeState(next, plan, degree);
          expect(stateText(current), label).toBe(expected);
        });
      });
    }
  });
}
