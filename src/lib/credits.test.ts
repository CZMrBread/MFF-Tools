import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NO_PDF_PLAN_NOTE,
  PROGRESS_COLORS,
  buildPlan,
  compareSubjects,
  creditsBadgeText,
  degreeHeading,
  degreeLabel,
  doneIn,
  earnedCredits,
  effMin,
  fieldSuffix,
  groupProgress,
  groupTitle,
  isMandatoryChoice,
  isMasterPlan,
  noCreditCredits,
  planCategories,
  planFor,
  planStatus,
  planSubjectsById,
  planSummary,
  planTotals,
  progressBar,
  sortSubjects,
  specsForDegree,
  subjectCredits,
  sumCredits,
  summaryItems,
} from "./credits";
import { indexNodes, parseFields, parseYears } from "./data";
import type { PvGroupDef, PvGroupId, SpecNode, SubjectNode } from "./types";
import {
  at,
  elective,
  ids,
  mandatory,
  requirement,
  subject,
} from "./__fixtures__/builders";
import {
  categoryLines,
  loadDataset,
  parseIds,
  planCategoryRecords,
  readLegacyFixture,
  statusLine,
  summaryLines,
  summaryNumbers,
} from "./__fixtures__/legacyTranscript";

// ---------------------------------------------------------------------------
// Ručně sestavená data
// ---------------------------------------------------------------------------

// Malý bakalářský plán: 2 povinné, tělocvik (povinný výběr), tři PV skupiny a jedna
// prázdná.
const SUBJECTS: SubjectNode[] = [
  mandatory("A", 5),
  mandatory("B", 3),
  elective("T1", 1, "telocvik"),
  elective("T2", 1, "telocvik"),
  elective("P1", 6, 1),
  elective("P2", 4, 1),
  elective("P3", 5, 2),
  elective("P4", 3, 3),
  elective("X", 9, "doporucene"), // skupina, kterou požadavky neznají
  elective("Y", 7, 1, {}, "jiny"), // jiná specializace
];
const REQ = requirement([
  { group: "telocvik", label: "Tělocvik", min_credits: 2 },
  { group: 1, label: "Skupina 1", min_credits: 8 },
  { group: 2, label: "Skupina 2", min_credits: 5 },
  { group: 3, label: "Skupina 3", min_credits: 0 },
  { group: 9, label: "Prázdná", min_credits: 5 },
]);
const PLAN = buildPlan(REQ, SUBJECTS);
const COMPLETED = new Set(["A", "T1", "P1", "P3", "X", "Y"]);
const NO_CREDIT = new Set(["P2"]);
const NONE: ReadonlySet<string> = new Set();

// Plán s nadřazenou skupinou (includes_groups), jak ho popisuje docs/data.md.
const NESTED_SUBJECTS: SubjectNode[] = [
  mandatory("M", 10),
  elective("a1", 5, "A"),
  elective("a2", 5, "A"),
  elective("g1", 4, "G"),
  elective("o1", 6, "O"),
];
const NESTED_PLAN = buildPlan(
  requirement(
    [
      { group: "A", label: "Skupina A", min_credits: 10 },
      { group: "G", label: "Skupina G", min_credits: 5 },
      { group: "E", label: "Prázdná", min_credits: 3 },
      {
        group: "O",
        label: "Ostatní",
        min_credits: 20,
        includes_groups: ["A", "G", "E", "neexistuje"],
      },
    ],
    { pv_overall_min: 20 },
  ),
  NESTED_SUBJECTS,
);

// ---------------------------------------------------------------------------
// Řazení a kredity
// ---------------------------------------------------------------------------

describe("řazení předmětů", () => {
  it("řadí podle názvu českou kolací (Č za C, Ch za H, diakritika až druhotně)", () => {
    const labels = ["Chemie", "Cizí", "Čeština", "Hudba", "Analýza", "Ábel"];
    const sorted = sortSubjects(
      labels.map((label, index) => subject(`S${index}`, 1, { label })),
    );
    expect(sorted.map((item) => item.label)).toEqual([
      "Ábel",
      "Analýza",
      "Cizí",
      "Čeština",
      "Hudba",
      "Chemie",
    ]);
  });

  it("dává stejný výsledek jako label.localeCompare(…, 'cs')", () => {
    const labels = [
      "NMAI054 Matematická analýza 1",
      "NDMI002 Diskrétní",
      "Ž",
      "z",
    ];
    for (const a of labels) {
      for (const b of labels) {
        expect(Math.sign(compareSubjects({ label: a }, { label: b }))).toBe(
          Math.sign(a.localeCompare(b, "cs")),
        );
      }
    }
  });

  it("je stabilní a nemění vstupní pole", () => {
    const input = [
      subject("S2", 1, { label: "Stejný" }),
      subject("S1", 1, { label: "Stejný" }),
      subject("S0", 1, { label: "Dřív" }),
    ];
    expect(ids(sortSubjects(input))).toEqual(["S0", "S2", "S1"]);
    expect(ids(input)).toEqual(["S2", "S1", "S0"]);
  });
});

describe("kredity", () => {
  it("subjectCredits bere chybějící nebo nulové kredity jako 0", () => {
    expect(subjectCredits({ credits: 5 })).toBe(5);
    expect(subjectCredits({ credits: 0 })).toBe(0);
    expect(subjectCredits({ credits: Number.NaN })).toBe(0);
    expect(creditsBadgeText({ credits: 4 })).toBe("4 kr.");
    expect(creditsBadgeText({ credits: Number.NaN })).toBe("0 kr.");
  });

  it("sumCredits, earnedCredits a noCreditCredits sčítají jen předměty ze seznamu", () => {
    const list = [subject("a", 5), subject("b", 3), subject("c", 2)];
    expect(sumCredits(list)).toBe(10);
    expect(sumCredits([])).toBe(0);
    expect(earnedCredits(list, doneIn(new Set(["a", "c", "mimo"])))).toBe(7);
    expect(earnedCredits(list, () => false)).toBe(0);
    expect(noCreditCredits(list, new Set(["b", "mimo"]))).toBe(3);
  });
});

describe("effMin", () => {
  const list = [subject("a", 5), subject("b", 3)];

  it("snižuje minimum o kredity předmětů „bez kreditů“ ze seznamu", () => {
    expect(effMin(10, list, NONE)).toBe(10);
    expect(effMin(10, list, new Set(["a"]))).toBe(5);
    expect(effMin(10, list, new Set(["a", "b", "mimo"]))).toBe(2);
  });

  it("neklesne pod nulu", () => {
    expect(effMin(8, list, new Set(["a", "b"]))).toBe(0);
    expect(effMin(3, list, new Set(["a", "b"]))).toBe(0);
    expect(effMin(0, list, new Set(["a"]))).toBe(0);
  });

  it("skupina bez limitu (null / undefined) zůstává bez limitu", () => {
    expect(effMin(null, list, new Set(["a"]))).toBeNull();
    expect(effMin(undefined, list, new Set(["a"]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Plán
// ---------------------------------------------------------------------------

describe("specsForDegree", () => {
  const spec = (id: string, studyType: SpecNode["study_type"]): SpecNode => ({
    id,
    label: `Specializace ${id}`,
    group: "spec",
    study_type: studyType,
    color: "#000000",
    radius: 40,
  });
  const specs = [
    spec("s2", "bakalarske"),
    spec("m1", "magisterske"),
    spec("s1", "bakalarske"),
  ];

  it("vybere specializace daného stupně v pořadí dat", () => {
    expect(specsForDegree(specs, "bakalarske").map((item) => item.id)).toEqual([
      "s2",
      "s1",
    ]);
    expect(specsForDegree(specs, "magisterske").map((item) => item.id)).toEqual(
      ["m1"],
    );
    expect(specsForDegree(specs, "doktorske")).toEqual([]);
  });
});

describe("buildPlan / planFor", () => {
  it("povinné = předměty s mandatory_in obsahujícím specializaci, seřazené", () => {
    const plan = buildPlan(REQ, [
      mandatory("B", 3),
      mandatory("Z", 2, {}, "jiny"),
      mandatory("A", 5),
    ]);
    expect(ids(plan.mandatory)).toEqual(["A", "B"]);
  });

  it("skupiny jsou v pořadí pv_groups a prázdné se vynechají", () => {
    expect(PLAN.groups.map((group) => group.def.group)).toEqual([
      "telocvik",
      1,
      2,
      3,
    ]);
    expect(PLAN.groups.map((group) => ids(group.subjects))).toEqual([
      ["T1", "T2"],
      ["P1", "P2"],
      ["P3"],
      ["P4"],
    ]);
  });

  it("předmět se skupinou, kterou požadavky neznají, ani předmět jiné specializace v plánu není", () => {
    const all = [...planSubjectsById(PLAN).keys()];
    expect(all).toEqual(["A", "B", "T1", "T2", "P1", "P2", "P3", "P4"]);
  });

  it('skupinu porovnává striktně – 1 a "1" jsou různé skupiny', () => {
    const plan = buildPlan(
      requirement([
        { group: 1, label: "Číslo", min_credits: 1 },
        { group: "1", label: "Text", min_credits: 1 },
      ]),
      [elective("N", 1, 1), elective("S", 1, "1")],
    );
    expect(plan.groups.map((group) => ids(group.subjects))).toEqual([
      ["N"],
      ["S"],
    ]);
  });

  it("bez includes_groups je counted totéž co subjects", () => {
    for (const group of PLAN.groups) {
      expect(group.counted).toEqual(group.subjects);
      expect(group.includedLabels).toEqual([]);
    }
  });

  it("includes_groups: counted = vlastní předměty + předměty uvedených neprázdných skupin", () => {
    const other = at(NESTED_PLAN.groups, 2);
    expect(other.def.group).toBe("O");
    expect(ids(other.subjects)).toEqual(["o1"]);
    expect(ids(other.counted)).toEqual(["o1", "a1", "a2", "g1"]);
    // prázdná a neexistující skupina se ignorují
    expect(other.includedLabels).toEqual(["Skupina A", "Skupina G"]);
    expect(ids(at(NESTED_PLAN.groups, 0).counted)).toEqual(["a1", "a2"]);
  });

  it("includes_groups: předmět se do counted dostane jen jednou", () => {
    const plan = buildPlan(
      requirement([
        { group: "A", label: "A", min_credits: 5 },
        {
          group: "O",
          label: "O",
          min_credits: 10,
          includes_groups: ["A", "A", "O"],
        },
      ]),
      [elective("a1", 5, "A"), elective("o1", 6, "O")],
    );
    expect(ids(at(plan.groups, 1).counted)).toEqual(["o1", "a1"]);
  });

  it("planFor bere požadavky z indexu a pro neznámou specializaci vrací null", () => {
    const index = indexNodes([REQ, ...SUBJECTS]);
    expect(planFor(index, "x1")).toEqual(PLAN);
    expect(planFor(index, "jiny")).toBeNull();
  });

  it("degreeLabel a isMasterPlan se řídí req.level", () => {
    const master = buildPlan(requirement([], { level: "mgr" }), []);
    expect(isMasterPlan(PLAN)).toBe(false);
    expect(degreeLabel(PLAN)).toBe("Bakalářské studium");
    expect(isMasterPlan(master)).toBe(true);
    expect(degreeLabel(master)).toBe("Magisterské studium");
  });

  it("degreeHeading přidá název oboru (neznámý obor svým id, bez oboru nic)", () => {
    expect(fieldSuffix("ucitelstvi")).toBe(" · Učitelství");
    expect(fieldSuffix("astronomie")).toBe(" · astronomie");
    expect(fieldSuffix(null)).toBe("");
    expect(fieldSuffix("")).toBe("");
    expect(degreeHeading(PLAN, "informatika")).toBe(
      "Bakalářské studium · Informatika",
    );
    expect(degreeHeading(PLAN, null)).toBe("Bakalářské studium");
  });
});

// ---------------------------------------------------------------------------
// Skupiny povinného výběru
// ---------------------------------------------------------------------------

describe("isMandatoryChoice", () => {
  const def = (
    group: PvGroupId,
    extra: Partial<PvGroupDef> = {},
  ): PvGroupDef => ({
    group,
    label: "Skupina",
    min_credits: 4,
    ...extra,
  });

  it("pozná mandatory_choice: true (jen přesně true)", () => {
    expect(isMandatoryChoice(def(7, { mandatory_choice: true }))).toBe(true);
    expect(isMandatoryChoice(def(0, { mandatory_choice: true }))).toBe(true);
    expect(isMandatoryChoice(def(7, { mandatory_choice: false }))).toBe(false);
    expect(isMandatoryChoice(def(7))).toBe(false);
  });

  it("pozná skupinu telocvik", () => {
    expect(isMandatoryChoice(def("telocvik"))).toBe(true);
    expect(isMandatoryChoice(def("Telocvik"))).toBe(false);
    expect(isMandatoryChoice(def("telocvik2"))).toBe(false);
  });

  it("pozná skupiny alt, alt1, alt23 (/^alt\\d*$/)", () => {
    for (const group of ["alt", "alt1", "alt2", "alt23"]) {
      expect(isMandatoryChoice(def(group))).toBe(true);
    }
    for (const group of [
      "alternativa",
      "alt1b",
      "xalt1",
      "ALT1",
      "alt-1",
      1,
      0,
    ]) {
      expect(isMandatoryChoice(def(group))).toBe(false);
    }
  });

  it("groupTitle: „Povinné — …“ u povinného výběru, jinak „Povinně volitelné — …“", () => {
    expect(groupTitle(def("telocvik"))).toBe("Povinné — Skupina");
    expect(groupTitle(def("alt2"))).toBe("Povinné — Skupina");
    expect(groupTitle(def(3, { mandatory_choice: true }))).toBe(
      "Povinné — Skupina",
    );
    expect(groupTitle(def(1))).toBe("Povinně volitelné — Skupina");
    expect(groupTitle(def("doporucene"))).toBe("Povinně volitelné — Skupina");
  });
});

// ---------------------------------------------------------------------------
// Součty
// ---------------------------------------------------------------------------

describe("groupProgress", () => {
  it("počítá získané kredity, efektivní minimum a splnění", () => {
    const progress = groupProgress(
      at(PLAN.groups, 1),
      doneIn(COMPLETED),
      NO_CREDIT,
    );
    expect(progress).toMatchObject({
      earned: 6,
      rawMin: 8,
      min: 4,
      noCreditCredits: 4,
      satisfied: true,
      hasBar: true,
    });
  });

  it("nesplněná skupina a skupina bez vlastního limitu", () => {
    const sport = groupProgress(at(PLAN.groups, 0), doneIn(COMPLETED), NONE);
    expect(sport).toMatchObject({ earned: 1, min: 2, satisfied: false });
    const free = groupProgress(at(PLAN.groups, 3), doneIn(COMPLETED), NONE);
    expect(free).toMatchObject({
      earned: 0,
      rawMin: 0,
      min: 0,
      satisfied: true,
      hasBar: false,
    });
  });

  it("minimum snížené na 0 je splněné i bez kreditů", () => {
    const progress = groupProgress(
      at(PLAN.groups, 2),
      () => false,
      new Set(["P3"]),
    );
    expect(progress).toMatchObject({
      earned: 0,
      rawMin: 5,
      min: 0,
      satisfied: true,
      hasBar: true,
    });
  });

  it("nadřazená skupina počítá i předměty podskupin", () => {
    const progress = groupProgress(
      at(NESTED_PLAN.groups, 2),
      doneIn(new Set(["a1", "g1", "o1"])),
      new Set(["a2"]),
    );
    expect(progress).toMatchObject({
      earned: 15,
      rawMin: 20,
      min: 15,
      noCreditCredits: 5,
      satisfied: true,
    });
  });

  it("skupina bez limitu (min_credits null) je vždy splněná a nemá pruh", () => {
    const plan = buildPlan(
      requirement([{ group: 1, label: "Volná", min_credits: null }]),
      SUBJECTS,
    );
    expect(
      groupProgress(at(plan.groups, 0), () => false, new Set(["P1"])),
    ).toMatchObject({
      earned: 0,
      rawMin: null,
      min: null,
      noCreditCredits: 6,
      satisfied: true,
      hasBar: false,
    });
  });
});

describe("planTotals", () => {
  it("tělocvik (povinný výběr) se počítá zvlášť a ne do PV celkem", () => {
    const totals = planTotals(PLAN, doneIn(COMPLETED), NO_CREDIT);
    expect(totals).toMatchObject({
      mandEarned: 5,
      mandTotal: 8,
      pvEarned: 11,
      choiceEarned: 1,
      choiceMin: 2,
      ncTotal: 4,
      effOverall: 8,
      totalEarned: 17,
    });
    expect(totals.choiceGroups.map((group) => group.def.group)).toEqual([
      "telocvik",
    ]);
    expect(totals.pvGroups.map((group) => group.def.group)).toEqual([1, 2, 3]);
  });

  it("„bez kreditů“ ve skupině povinného výběru nesnižuje PV celkem", () => {
    const totals = planTotals(PLAN, () => false, new Set(["T1", "P4"]));
    expect(totals).toMatchObject({ ncTotal: 3, effOverall: 9 });
  });

  it("choiceMin sčítá nesnížená minima, chybějící minimum = 0", () => {
    const plan = buildPlan(
      requirement([
        { group: "telocvik", label: "Tělocvik", min_credits: 2 },
        { group: "alt1", label: "Alternativa", min_credits: null },
        {
          group: 1,
          label: "Skupina 1",
          min_credits: 8,
          mandatory_choice: true,
        },
      ]),
      [
        elective("T1", 1, "telocvik"),
        elective("L1", 4, "alt1"),
        elective("P1", 6, 1),
      ],
    );
    const totals = planTotals(plan, doneIn(new Set(["L1", "P1"])), NONE);
    expect(totals).toMatchObject({
      choiceEarned: 10,
      choiceMin: 10,
      pvEarned: 0,
      effOverall: 12,
      totalEarned: 10,
    });
    expect(totals.pvGroups).toEqual([]);
  });

  it("„PV celkem“ neklesne pod nulu a bez pv_overall_min je null", () => {
    const everything = new Set(["T1", "T2", "P1", "P2", "P3", "P4"]);
    expect(planTotals(PLAN, () => false, everything).effOverall).toBe(0);
    const open = buildPlan(
      requirement(REQ.pv_groups, { pv_overall_min: null }),
      SUBJECTS,
    );
    expect(planTotals(open, () => false, everything).effOverall).toBeNull();
  });

  it("předmět podskupiny se do PV celkem započítá jednou", () => {
    const totals = planTotals(
      NESTED_PLAN,
      doneIn(new Set(["a1", "g1", "o1"])),
      new Set(["a2"]),
    );
    expect(totals).toMatchObject({ pvEarned: 15, ncTotal: 5, effOverall: 15 });
  });

  it("předměty mimo plán nic neovlivní", () => {
    const base = planTotals(PLAN, doneIn(new Set(["A"])), NONE);
    const noisy = planTotals(
      PLAN,
      doneIn(new Set(["A", "X", "Y", "neexistuje"])),
      new Set(["X", "Y"]),
    );
    expect(noisy).toEqual(base);
  });
});

describe("planSummary", () => {
  it("vyjmenuje, co zbývá, v pevném pořadí", () => {
    const summary = planSummary(PLAN, doneIn(COMPLETED), NO_CREDIT);
    expect(summary).toMatchObject({
      mandOk: false,
      groupsOk: true,
      overallOk: true,
      totalOk: false,
      fulfilled: false,
      structuralFree: 60 - 8 - 2 - 8,
    });
    expect(summary.missing).toEqual(["povinné", "43 kr. do 60"]);
    expect(planStatus(summary, "calculator")).toEqual({
      fulfilled: false,
      tone: "todo",
      text: "Zbývá splnit: povinné, 43 kr. do 60.",
    });
    expect(planStatus(summary, "schedule").text).toBe(
      "Zbývá zařadit: povinné, 43 kr. do 60.",
    );
  });

  it("nesplněný tělocvik patří k „povinné“, nesplněná PV skupina k „minima PV skupin“", () => {
    const sport = planSummary(
      PLAN,
      doneIn(new Set(["A", "B", "T1", "P1", "P2", "P3"])),
      NONE,
    );
    expect(sport).toMatchObject({
      mandOk: false,
      groupsOk: true,
      overallOk: true,
      structuralFree: 60 - 8 - 2 - 12,
    });
    expect(sport.missing).toEqual(["povinné", "36 kr. do 60"]);

    const group = planSummary(
      PLAN,
      doneIn(new Set(["A", "B", "T1", "T2", "P1", "P3"])),
      NONE,
    );
    expect(group).toMatchObject({ mandOk: true, groupsOk: false });
    expect(group.missing).toEqual([
      "minima PV skupin",
      "PV celkem",
      "39 kr. do 60",
    ]);
  });

  it("splněný plán", () => {
    const plan = buildPlan(
      requirement(REQ.pv_groups, { total_credits: 28 }),
      SUBJECTS,
    );
    const all = new Set(["A", "B", "T1", "T2", "P1", "P2", "P3", "P4"]);
    const summary = planSummary(plan, doneIn(all), NONE);
    expect(summary).toMatchObject({
      totalEarned: 28,
      choiceEarned: 2,
      pvEarned: 18,
      mandOk: true,
      groupsOk: true,
      overallOk: true,
      totalOk: true,
      fulfilled: true,
      structuralFree: 28 - 8 - 2 - 12,
    });
    expect(summary.missing).toEqual([]);
    expect(planStatus(summary, "schedule")).toEqual({
      fulfilled: true,
      tone: "ok",
      text: "✓ Všechny podmínky studijního plánu jsou splněné.",
    });
  });

  it("plán bez povinných předmětů nemá „povinné“ nikdy splněné (jako stará stránka)", () => {
    const plan = buildPlan(
      requirement([{ group: 1, label: "Skupina 1", min_credits: 5 }], {
        total_credits: 5,
        pv_overall_min: 5,
      }),
      [elective("P1", 6, 1)],
    );
    const summary = planSummary(plan, () => true, NONE);
    expect(summary).toMatchObject({
      mandOk: false,
      groupsOk: true,
      overallOk: true,
      totalOk: true,
      fulfilled: false,
    });
    expect(summary.missing).toEqual(["povinné"]);
  });

  it("nesplněné „PV celkem“ a plán bez pv_overall_min", () => {
    const done = doneIn(new Set(["A", "B", "T1", "T2", "P1", "P2"]));
    const strict = buildPlan(
      requirement(
        [
          { group: "telocvik", label: "Tělocvik", min_credits: 2 },
          { group: 1, label: "Skupina 1", min_credits: 8 },
        ],
        { pv_overall_min: 20, total_credits: 20 },
      ),
      SUBJECTS,
    );
    expect(planSummary(strict, done, NONE).missing).toEqual(["PV celkem"]);
    const open = buildPlan({ ...strict.req, pv_overall_min: null }, SUBJECTS);
    const summary = planSummary(open, done, NONE);
    expect(summary).toMatchObject({ overallOk: true, fulfilled: true });
    expect(summary.structuralFree).toBe(20 - 8 - 2);
  });
});

// ---------------------------------------------------------------------------
// Pruh průběhu
// ---------------------------------------------------------------------------

describe("progressBar", () => {
  it("nezačatý pruh je červený a má šířku 3 %", () => {
    expect(progressBar(0, 110)).toEqual({
      earned: 0,
      target: 110,
      percent: 0,
      widthPercent: 3,
      remaining: 110,
      done: false,
      tone: "empty",
      fillColor: "var(--primary--primary-red)",
      textColor: "var(--primary--primary-red)",
      valueText: "0 / 110 kr.",
      remainingText: "zbývá 110",
    });
  });

  it("do 75 % modrý, od 75 % oranžový, procenta se nezaokrouhlují", () => {
    const low = progressBar(38, 110);
    expect(low.percent).toBe((38 / 110) * 100);
    expect(low.widthPercent).toBe(low.percent);
    expect(low.tone).toBe("progress");
    expect(progressBar(74, 100).tone).toBe("progress");
    const near = progressBar(75, 100);
    expect(near).toMatchObject({
      tone: "near",
      fillColor: "var(--col-mixed)",
      textColor: "#8a6d00",
      remainingText: "zbývá 25",
    });
  });

  it("splněný pruh je zelený a šířka nepřesáhne 100 %", () => {
    expect(progressBar(100, 100)).toMatchObject({
      percent: 100,
      done: true,
      tone: "done",
      remaining: 0,
      remainingText: "✓ splněno",
    });
    expect(progressBar(196, 120)).toMatchObject({
      percent: 100,
      widthPercent: 100,
      remaining: 0,
      valueText: "196 / 120 kr.",
      fillColor: PROGRESS_COLORS.done.fill,
    });
  });

  it("cíl 0 je vždy splněný; bez kreditů má šířku 0", () => {
    expect(progressBar(0, 0)).toMatchObject({
      percent: 0,
      widthPercent: 0,
      done: true,
      tone: "done",
      valueText: "0 / 0 kr.",
      remainingText: "✓ splněno",
    });
    expect(progressBar(5, 0)).toMatchObject({ percent: 100, done: true });
  });

  it("bez cíle se neukazuje, kolik zbývá", () => {
    expect(progressBar(5, null)).toMatchObject({
      target: null,
      percent: 100,
      remaining: null,
      done: false,
      tone: "near",
      valueText: "5 kr.",
      remainingText: "",
    });
    expect(progressBar(0, undefined)).toMatchObject({
      percent: 0,
      widthPercent: 0,
      tone: "empty",
      valueText: "0 kr.",
    });
  });
});

// ---------------------------------------------------------------------------
// Položky souhrnu
// ---------------------------------------------------------------------------

describe("summaryItems", () => {
  it("pořadí oddílů, povinný výběr pod „Povinné“, pruhy jen u skupin s minimem, poznámky", () => {
    const summary = planSummary(PLAN, doneIn(COMPLETED), NO_CREDIT);
    expect(summaryLines(summaryItems(summary, "calculator"))).toEqual([
      "section | Povinné",
      "bar | Povinné předměty | 5 / 8 kr. | 62.5% | progress | zbývá 3",
      "bar | Tělocvik | 1 / 2 kr. | 50% | progress | zbývá 1",
      "section | Povinně volitelné — skupiny",
      "bar | Skupina 1 | 6 / 4 kr. | 100% | done | ✓ splněno",
      "bar | Skupina 2 | 5 / 5 kr. | 100% | done | ✓ splněno",
      "section | PV celkem",
      "bar | Povinně volitelné celkem | 11 / 8 kr. | 100% | done | ✓ splněno",
      "note | sníženo „bez kreditů“ | −4 kr. (z 12)",
      "divider",
      `total | Celkem kreditů | 17 / 60 kr. | ${(17 / 60) * 100}% | progress | zbývá 43`,
      "note | z toho volitelné (libovolné předměty) | ~42 kr.",
    ]);
  });

  it("v Rozvrhu chybí odhad volitelných", () => {
    const summary = planSummary(PLAN, doneIn(COMPLETED), NO_CREDIT);
    const lines = summaryLines(summaryItems(summary, "schedule"));
    expect(lines.at(-1)).toMatch(/^total \| Celkem kreditů/);
    expect(lines.some((line) => line.includes("volitelné (libovolné"))).toBe(
      false,
    );
  });

  it("bez pruhů PV skupin a bez pv_overall_min chybí jejich oddíly", () => {
    const plan = buildPlan(
      requirement(
        [
          { group: "telocvik", label: "Tělocvik", min_credits: 2 },
          { group: 3, label: "Skupina 3", min_credits: 0 },
        ],
        { pv_overall_min: null },
      ),
      SUBJECTS,
    );
    expect(
      summaryLines(
        summaryItems(
          planSummary(plan, () => false, NONE),
          "schedule",
        ),
      ),
    ).toEqual([
      "section | Povinné",
      "bar | Povinné předměty | 0 / 8 kr. | 3% | empty | zbývá 8",
      "bar | Tělocvik | 0 / 2 kr. | 3% | empty | zbývá 2",
      "divider",
      "total | Celkem kreditů | 0 / 60 kr. | 3% | empty | zbývá 60",
    ]);
  });

  it("poznámka o snížení PV celkem jen při nenulovém snížení", () => {
    const lines = summaryLines(
      summaryItems(
        planSummary(PLAN, () => false, NONE),
        "calculator",
      ),
    );
    expect(lines.some((line) => line.startsWith("note | sníženo"))).toBe(false);
  });

  it("odhad volitelných se neukáže, když není kladný", () => {
    const plan = buildPlan(
      requirement(REQ.pv_groups, { total_credits: 20 }),
      SUBJECTS,
    );
    const summary = planSummary(plan, () => false, NONE);
    expect(summary.structuralFree).toBe(20 - 8 - 2 - 12);
    const lines = summaryLines(summaryItems(summary, "calculator"));
    expect(lines.at(-1)).toMatch(/^total \|/);
    const exact = planSummary(
      buildPlan(requirement(REQ.pv_groups, { total_credits: 22 }), SUBJECTS),
      () => false,
      NONE,
    );
    expect(exact.structuralFree).toBe(0);
    expect(summaryLines(summaryItems(exact, "calculator")).at(-1)).toMatch(
      /^total \|/,
    );
  });
});

// ---------------------------------------------------------------------------
// Bloky kategorií
// ---------------------------------------------------------------------------

describe("planCategories", () => {
  it("povinné: podtitulek, štítek „splnit vše“ / „hotovo“", () => {
    const todo = at(planCategories(PLAN, COMPLETED, NO_CREDIT), 0);
    expect(todo).toMatchObject({
      kind: "mandatory",
      title: "Povinné předměty",
      subtitle: "Nutné splnit všechny • 5/8 kr.",
      badge: { text: "splnit vše", tone: "req" },
      allowNoCredit: false,
      canCompleteAll: true,
      progress: null,
    });
    expect(ids(todo.subjects)).toEqual(["A", "B"]);

    const done = at(planCategories(PLAN, new Set(["A", "B"]), NONE), 0);
    expect(done).toMatchObject({
      subtitle: "Nutné splnit všechny • 8/8 kr.",
      badge: { text: "hotovo", tone: "ok" },
      canCompleteAll: false,
    });
  });

  it("plán bez povinných předmětů nemá nikdy „hotovo“", () => {
    const plan = buildPlan(REQ, [elective("P1", 6, 1)]);
    expect(at(planCategories(plan, NONE, NONE), 0)).toMatchObject({
      subtitle: "Nutné splnit všechny • 0/0 kr.",
      badge: { text: "splnit vše", tone: "req" },
      subjects: [],
    });
  });

  it("skupiny: nadpisy, štítky a podtitulky podle minima", () => {
    const views = planCategories(PLAN, COMPLETED, NO_CREDIT);
    expect(categoryLines(views)).toEqual([
      "Povinné předměty | splnit vše [req, klik completeAllMandatory()] | Nutné splnit všechny • 5/8 kr.",
      "Povinné — Tělocvik | min. 2 kr. [req] | Minimum 2 kr. • získáno 1 kr.",
      "Povinně volitelné — Skupina 1 | splněno [ok] | Minimum 4 kr. (sníženo o 4 kr. „bez kreditů“ z 8) • získáno 6 kr.",
      "Povinně volitelné — Skupina 2 | splněno [ok] | Minimum 5 kr. • získáno 5 kr.",
      "Povinně volitelné — Skupina 3 | bez vlastního limitu [todo] | Získáno 0 kr. (počítá se do celku PV)",
    ]);
    expect(views.map((view) => view.kind)).toEqual([
      "mandatory",
      "group",
      "group",
      "group",
      "group",
    ]);
    expect(new Set(views.map((view) => view.key)).size).toBe(views.length);
  });

  it("skupina bez limitu (min_credits null)", () => {
    const plan = buildPlan(
      requirement([{ group: 1, label: "Volná", min_credits: null }]),
      SUBJECTS,
    );
    expect(at(categoryLines(planCategories(plan, COMPLETED, NONE)), 1)).toBe(
      "Povinně volitelné — Volná | bez limitu [todo] | Získáno 6 kr. (počítá se do celku PV)",
    );
  });

  it("minimum snížené na 0 je „splněno“ i bez získaných kreditů", () => {
    const views = planCategories(PLAN, NONE, new Set(["P3"]));
    expect(at(categoryLines(views), 3)).toBe(
      "Povinně volitelné — Skupina 2 | splněno [ok] | Minimum 0 kr. (sníženo o 5 kr. „bez kreditů“ z 5) • získáno 0 kr.",
    );
  });

  it("nadřazená skupina uvádí započítané podskupiny a počítá jejich kredity", () => {
    const views = planCategories(
      NESTED_PLAN,
      new Set(["a1", "g1", "o1"]),
      new Set(["a2"]),
    );
    expect(at(categoryLines(views), 3)).toBe(
      "Povinně volitelné — Ostatní | splněno [ok] | Minimum 15 kr. (včetně skupin: Skupina A, Skupina G) (sníženo o 5 kr. „bez kreditů“ z 20) • získáno 15 kr.",
    );
    // v seznamu bloku jsou jen vlastní předměty skupiny
    expect(ids(at(views, 3).subjects)).toEqual(["o1"]);
  });

  it("přepínač „bez kreditů“ mají jen skupiny magisterského plánu", () => {
    const master = buildPlan(
      requirement(REQ.pv_groups, { level: "mgr" }),
      SUBJECTS,
    );
    expect(
      planCategories(master, NONE, NONE).map((view) => view.allowNoCredit),
    ).toEqual([false, true, true, true, true]);
    expect(
      planCategories(PLAN, NONE, NONE).map((view) => view.allowNoCredit),
    ).toEqual([false, false, false, false, false]);
  });

  it("text poznámky no_pdf_plan", () => {
    expect(NO_PDF_PLAN_NOTE).toMatch(/^Pozn\.: pro tuto specializaci/);
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

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("záznam staré kalkulačky", () => {
  it("vznikl z aktuální staré stránky (dokud existuje)", () => {
    if (!existsSync(LEGACY_HTML)) return;
    const html = readFileSync(LEGACY_HTML, "utf8").replaceAll("\r\n", "\n");
    expect(
      createHash("sha256").update(html).digest("hex"),
      "src/legacy/kalkulačka/index.html se změnila – spusť: node scripts/gen-credits-fixture.mjs",
    ).toBe(fixture.sourceSha256);
  });

  it("pokrývá každý rok × obor z years.json / fields.json a všechny specializace", () => {
    const years = parseYears(readJsonFile(resolve(DATA_ROOT, "years.json")));
    const expected = years.flatMap((year) =>
      parseFields(readJsonFile(resolve(DATA_ROOT, year, "fields.json"))).map(
        (field) => `${year}/${field}`,
      ),
    );
    expect(expected.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(fixture.datasets)).toEqual(expected);
    for (const [dataset, record] of Object.entries(fixture.datasets)) {
      const loaded = loadDataset(DATA_ROOT, dataset, record);
      if (loaded.status !== "ok") continue;
      expect(Object.keys(record.specs)).toEqual(
        loaded.index.specs.map((spec) => spec.id),
      );
      for (const spec of Object.values(record.specs)) {
        expect(spec.scenarios.map((scenario) => scenario.name)).toEqual([
          "nic",
          "vše",
          "PV bez kreditů",
          "náhodný 1",
          "náhodný 2",
          "náhodný 3",
        ]);
      }
    }
  });

  it("barvy pruhů odpovídají staré stránce", () => {
    expect(fixture.tones).toEqual(PROGRESS_COLORS);
  });

  it("obsahuje splněné i nesplněné plány, povinný výběr, podskupiny a snížení „bez kreditů“", () => {
    const scenarios = Object.values(fixture.datasets).flatMap((dataset) =>
      Object.values(dataset.specs).flatMap((spec) => spec.scenarios),
    );
    expect(scenarios.length).toBeGreaterThanOrEqual(500);
    const count = (test: (scenario: (typeof scenarios)[number]) => boolean) =>
      scenarios.filter(test).length;
    expect(count((s) => s.status.startsWith("ok | "))).toBeGreaterThan(10);
    expect(count((s) => s.status.startsWith("todo | "))).toBeGreaterThan(10);
    expect(count((s) => s.schedule.status.startsWith("ok | "))).toBeGreaterThan(
      10,
    );
    expect(
      count((s) => s.summary.some((line) => line.includes("sníženo"))),
    ).toBeGreaterThan(10);
    // minimum skupiny snížené až na nulu
    expect(
      count((s) => s.summary.some((line) => / \/ 0 kr\. /.test(line))),
    ).toBeGreaterThan(10);
    // skupiny povinného výběru (telocvik, alt…, mandatory_choice) a includes_groups
    expect(
      count((s) => s.categories.some((line) => line.startsWith("Povinné — "))),
    ).toBeGreaterThan(100);
    expect(
      count((s) => s.categories.some((line) => line.includes("včetně skupin"))),
    ).toBeGreaterThan(10);
    expect(count((s) => s.numbers.choice[0] > 0)).toBeGreaterThan(100);
  });
});

for (const [dataset, record] of Object.entries(fixture.datasets)) {
  const loaded = loadDataset(DATA_ROOT, dataset, record);
  const field = dataset.slice(dataset.indexOf("/") + 1);

  describe(`shoda se starou kalkulačkou – ${dataset}`, () => {
    if (loaded.status === "stale") {
      // Záznam platí jen pro data, ze kterých vznikl. Dokud stará stránka existuje, je
      // potřeba ho přegenerovat; po jejím smazání už shodu pro změněná data ověřit nejde.
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
        if (!plan) throw new Error(`Chybí požadavky pro ${specId}`);

        it("plán: nadpisy, pořadí předmětů, kredity", () => {
          const views = planCategories(plan, new Set(), new Set());
          expect(degreeHeading(plan, field)).toBe(specRecord.plan.degreeLabel);
          expect(index.specById.get(specId)?.label).toBe(specRecord.plan.title);
          expect(plan.req.no_pdf_plan ? NO_PDF_PLAN_NOTE : null).toBe(
            specRecord.plan.note,
          );
          expect(planCategoryRecords(views)).toEqual(
            specRecord.plan.categories,
          );
        });

        it.each(specRecord.scenarios)("$name", (scenario) => {
          const completed = new Set(parseIds(scenario.completed));
          const noCredit = new Set(parseIds(scenario.noCredit));

          const views = planCategories(plan, completed, noCredit);
          expect(categoryLines(views)).toEqual(scenario.categories);

          const summary = planSummary(plan, doneIn(completed), noCredit);
          const items = summaryItems(summary, "calculator");
          expect(summaryLines(items)).toEqual(scenario.summary);
          expect(statusLine(planStatus(summary, "calculator"))).toBe(
            scenario.status,
          );

          // Čísla zvlášť: výsledky původních planTotals / effMin / ncCreditsIn.
          expect(summaryNumbers(plan, summary)).toEqual(scenario.numbers);
        });
      });
    }
  });
}
