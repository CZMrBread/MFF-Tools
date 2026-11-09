import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  indexNodes,
  parseFields,
  parseLinks,
  parseNodes,
  parseYears,
} from "./data";
import {
  DEFAULT_DEGREE_FILTER,
  DEGREE_FILTERS,
  MAP_COLORS,
  POPOVER_GEOMETRY,
  SUBJECT_CATEGORIES,
  SUBJECT_CATEGORY_LABELS,
  buildSubjectToSpecs,
  computeSubjectHighlight,
  countSpecLinks,
  filterByDegree,
  isCommonMandatory,
  matchesAllSelected,
  placePopover,
  pullsToCenter,
  selectionColor,
  sisUrl,
  specCirclePositions,
  specIdsByStudyType,
  specTooltip,
  subjectBaseColor,
  subjectCategory,
  subjectTitle,
  subjectTooltip,
  tooltipPosition,
  wikiUrl,
  wrapLineDy,
  wrapWords,
} from "./map";
import type { DegreeFilter } from "./map";
import type { StudyType, SubjectNode } from "./types";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const dataDir = join(repoRoot, "data");
const OLD_PAGE_PATH = join(
  repoRoot,
  "src",
  "legacy",
  "specializace",
  "index.html",
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const years = parseYears(readJson(join(dataDir, "years.json")));

function loadCombination(year: string, field: string) {
  const dir = join(dataDir, year, field);
  const nodes = parseNodes(readJson(join(dir, "nodes.json")));
  const links = parseLinks(readJson(join(dir, "links.json")));
  const index = indexNodes(nodes);
  const graphNodes = nodes.filter((node) => node.group !== "program_req");
  const specsByType = specIdsByStudyType(index.specs);
  /** Doslovný přepis starého výpočtu `commonMandatory` (specializace/index.html). */
  const oldSpecsByType: Record<string, string[]> = {};
  for (const spec of index.specs) {
    (oldSpecsByType[spec.study_type] ??= []).push(spec.id);
  }
  const oldCommonMandatory = (subj: SubjectNode) =>
    subj.course_type === "mandatory" &&
    Object.values(oldSpecsByType).some(
      (ids) =>
        ids.length > 1 && ids.every((id) => subj.mandatory_in.includes(id)),
    );
  return {
    year,
    field,
    label: `${year}/${field}`,
    nodes,
    links,
    index,
    graphNodes,
    specsByType,
    oldCommonMandatory,
  };
}

/** Všechny kombinace rok × obor z years.json a <rok>/fields.json. */
const realData = years.flatMap((year) =>
  parseFields(readJson(join(dataDir, year, "fields.json"))).map((field) =>
    loadCombination(year, field),
  ),
);

function subject(overrides: Partial<SubjectNode> = {}): SubjectNode {
  return {
    id: "NTST001",
    label: "NTST001 Testovací předmět",
    group: "subj",
    radius: 8,
    shared_count: 1,
    course_type: "elective",
    mandatory_in: [],
    elective_in: [],
    credits: 5,
    semester: "zimní",
    ...overrides,
  };
}

describe("přepínač stupně studia", () => {
  it("má tři tlačítka se starými texty a výchozí bakalářské", () => {
    expect(DEGREE_FILTERS).toEqual([
      { value: "all", label: "Všechny stupně" },
      { value: "bakalarske", label: "Bakalářské" },
      { value: "magisterske", label: "Magisterské" },
    ]);
    expect(DEFAULT_DEGREE_FILTER).toBe("bakalarske");
  });
});

describe("skutečná data", () => {
  it("obsahují všechny roky a obory (2026-2027 má čtyři obory)", () => {
    expect(realData.map((data) => data.label)).toEqual([
      "2024-2025/informatika",
      "2025-2026/informatika",
      "2026-2027/fyzika",
      "2026-2027/informatika",
      "2026-2027/matematika",
      "2026-2027/ucitelstvi",
    ]);
  });
});

describe("filterByDegree", () => {
  const nodes = [
    { id: "s1", study_type: "bakalarske" as const },
    { id: "m1", study_type: "magisterske" as const },
    { id: "A" },
    { id: "B" },
    { id: "C" },
    { id: "D" },
  ];
  const links = [
    { source: "A", target: "s1" },
    { source: "B", target: "s1" },
    { source: "B", target: "m1" },
    { source: "C", target: "m1" },
  ];

  it("filtr all nechá všechny uzly i hrany", () => {
    const result = filterByDegree(nodes, links, "all");
    expect([...result.nodeIds]).toEqual(["s1", "m1", "A", "B", "C", "D"]);
    expect(result.linkVisible).toEqual([true, true, true, true]);
  });

  it("nechá specializace stupně a vše, co je s nimi spojené", () => {
    const bachelor = filterByDegree(nodes, links, "bakalarske");
    expect([...bachelor.nodeIds].sort()).toEqual(["A", "B", "s1"]);
    expect(bachelor.linkVisible).toEqual([true, true, false, false]);

    const master = filterByDegree(nodes, links, "magisterske");
    expect([...master.nodeIds].sort()).toEqual(["B", "C", "m1"]);
    expect(master.linkVisible).toEqual([false, false, true, true]);
  });

  it("specializace bez předmětů zůstane vidět, předmět bez hran ne", () => {
    const result = filterByDegree(
      [{ id: "s9", study_type: "bakalarske" }, { id: "X" }],
      [],
      "bakalarske",
    );
    expect([...result.nodeIds]).toEqual(["s9"]);
    expect(result.linkVisible).toEqual([]);
  });

  describe.each(realData)("skutečná data $label", (data) => {
    it.each(["bakalarske", "magisterske"] as const)(
      "filtr %s",
      (filter: StudyType) => {
        const result = filterByDegree(data.graphNodes, data.links, filter);
        const specIds = data.index.specs
          .filter((spec) => spec.study_type === filter)
          .map((spec) => spec.id);
        const subjectIds = data.index.subjects
          .filter((subj) =>
            data.links.some(
              (link) =>
                link.source === subj.id && specIds.includes(link.target),
            ),
          )
          .map((subj) => subj.id);

        // Fyzika 2026-2027 má jen jednu bakalářskou specializaci.
        expect(specIds.length).toBeGreaterThan(0);
        expect(subjectIds.length).toBeGreaterThan(0);
        expect([...result.nodeIds].sort()).toEqual(
          [...specIds, ...subjectIds].sort(),
        );
        expect(result.linkVisible).toEqual(
          data.links.map((link) => specIds.includes(link.target)),
        );
      },
    );

    it("filtr all = všechny specializace a předměty", () => {
      const result = filterByDegree(data.graphNodes, data.links, "all");
      expect(result.nodeIds.size).toBe(
        data.index.specs.length + data.index.subjects.length,
      );
      expect(result.linkVisible.every(Boolean)).toBe(true);
      expect(result.linkVisible).toHaveLength(data.links.length);
    });
  });
});

describe("specCirclePositions", () => {
  it("první nahoře, dál po směru hodinových ručiček", () => {
    const positions = specCirclePositions(4, 600, 450, 300);
    const expected = [
      { x: 600, y: 150 },
      { x: 900, y: 450 },
      { x: 600, y: 750 },
      { x: 300, y: 450 },
    ];
    expect(positions).toHaveLength(4);
    positions.forEach((position, i) => {
      expect(position.x).toBeCloseTo(expected[i]?.x ?? NaN, 9);
      expect(position.y).toBeCloseTo(expected[i]?.y ?? NaN, 9);
    });
  });

  it("počítá stejně jako starý kód", () => {
    const count = 7;
    const positions = specCirclePositions(count, 600, 450, 300);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      expect(positions[i]).toEqual({
        x: 600 + 300 * Math.cos(angle),
        y: 450 + 300 * Math.sin(angle),
      });
    }
  });

  it("bez specializací vrací prázdný seznam", () => {
    expect(specCirclePositions(0, 600, 450, 300)).toEqual([]);
  });
});

describe("countSpecLinks", () => {
  describe.each(realData)("skutečná data $label", (data) => {
    const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
    const studyTypeOf = (id: string) => {
      const node = nodeById.get(id);
      return node?.group === "spec" ? node.study_type : undefined;
    };

    /** Doslovný přepis výpočtu ze starého handleru `mouseenter`. */
    function oldCount(specId: string, filter: DegreeFilter): number {
      return data.links.filter((link) => {
        const sourceNode = data.nodes.find((n) => n.id === link.source);
        const targetNode = data.nodes.find((n) => n.id === link.target);
        if (filter === "all") return link.target === specId;
        return (
          link.target === specId &&
          ((sourceNode?.group === "spec" && sourceNode.study_type === filter) ||
            (targetNode?.group === "spec" && targetNode.study_type === filter))
        );
      }).length;
    }

    it("dává stejná čísla jako starý tooltip pro všechny specializace a filtry", () => {
      for (const spec of data.index.specs) {
        for (const { value: filter } of DEGREE_FILTERS) {
          expect(countSpecLinks(spec.id, data.links, studyTypeOf, filter)).toBe(
            oldCount(spec.id, filter),
          );
        }
        // Ve filtru svého stupně i ve „všech" je to počet hran specializace.
        const own = data.links.filter((l) => l.target === spec.id).length;
        expect(own).toBeGreaterThan(0);
        expect(
          countSpecLinks(spec.id, data.links, studyTypeOf, spec.study_type),
        ).toBe(own);
        expect(countSpecLinks(spec.id, data.links, studyTypeOf, "all")).toBe(
          own,
        );
      }
    });
  });

  it("specializace jiného stupně má ve filtru nulu", () => {
    const links = [{ source: "A", target: "m1" }];
    const studyTypeOf = (id: string) =>
      id === "m1" ? ("magisterske" as const) : undefined;
    expect(countSpecLinks("m1", links, studyTypeOf, "bakalarske")).toBe(0);
    expect(countSpecLinks("m1", links, studyTypeOf, "magisterske")).toBe(1);
  });
});

describe("kategorie a barvy předmětů", () => {
  it("barvy a texty odpovídají staré stránce", () => {
    expect(MAP_COLORS).toEqual({
      mandatoryAll: "#3b82f6",
      mandatory: "#4ade80",
      elective: "#fb923c",
      mixed: "#facc15",
    });
    expect(SUBJECT_CATEGORIES.map((c) => SUBJECT_CATEGORY_LABELS[c])).toEqual([
      "Společný povinný",
      "Povinný",
      "Povinně volitelný",
      "Smíšený",
    ]);
  });

  it("specIdsByStudyType seskupí specializace podle stupně v pořadí dat", () => {
    const byType = specIdsByStudyType([
      { id: "s1", study_type: "bakalarske" },
      { id: "m1", study_type: "magisterske" },
      { id: "s2", study_type: "bakalarske" },
    ]);
    expect([...byType]).toEqual([
      ["bakalarske", ["s1", "s2"]],
      ["magisterske", ["m1"]],
    ]);
    expect(specIdsByStudyType([])).toEqual(new Map());
  });

  describe("isCommonMandatory", () => {
    const byType = new Map([
      ["bakalarske" as const, ["s1", "s2"]],
      ["magisterske" as const, ["m1"]],
    ]);

    it("povinný ve všech specializacích stupně", () => {
      expect(
        isCommonMandatory(
          { course_type: "mandatory", mandatory_in: ["s2", "s1"] },
          byType,
        ),
      ).toBe(true);
      expect(
        isCommonMandatory(
          { course_type: "mandatory", mandatory_in: ["s1", "m1"] },
          byType,
        ),
      ).toBe(false);
    });

    it("stupeň s jedinou specializací se nepočítá", () => {
      expect(
        isCommonMandatory(
          { course_type: "mandatory", mandatory_in: ["m1"] },
          byType,
        ),
      ).toBe(false);
    });

    it("jen course_type mandatory", () => {
      expect(
        isCommonMandatory(
          { course_type: "mixed", mandatory_in: ["s1", "s2"] },
          byType,
        ),
      ).toBe(false);
    });

    it.each(realData)(
      "skutečná data $label: stejné jako starý výpočet",
      (data) => {
        let common = 0;
        for (const subj of data.index.subjects) {
          const value = isCommonMandatory(subj, data.specsByType);
          expect(value, subj.id).toBe(data.oldCommonMandatory(subj));
          if (value) common++;
        }
        expect(common).toBeGreaterThan(0);
      },
    );
  });

  it("subjectCategory", () => {
    expect(subjectCategory({ course_type: "mandatory" }, true)).toBe(
      "mandatoryAll",
    );
    expect(subjectCategory({ course_type: "mandatory" }, false)).toBe(
      "mandatory",
    );
    expect(subjectCategory({ course_type: "elective" }, false)).toBe(
      "elective",
    );
    expect(subjectCategory({ course_type: "mixed" }, false)).toBe("mixed");
  });

  it("subjectBaseColor", () => {
    expect(subjectBaseColor({ course_type: "mandatory" }, true)).toBe(
      "#3b82f6",
    );
    expect(subjectBaseColor({ course_type: "mandatory" }, false)).toBe(
      "#4ade80",
    );
    expect(subjectBaseColor({ course_type: "elective" }, false)).toBe(
      "#fb923c",
    );
    expect(subjectBaseColor({ course_type: "mixed" }, false)).toBe("#facc15");
  });

  it.each(realData)(
    "skutečná data $label: základní barva = stará baseColor",
    (data) => {
      const oldColor = (subj: SubjectNode) => {
        if (data.oldCommonMandatory(subj)) return "#3b82f6";
        if (subj.course_type === "mandatory") return "#4ade80";
        if (subj.course_type === "elective") return "#fb923c";
        return "#facc15";
      };
      for (const subj of data.index.subjects) {
        expect(
          subjectBaseColor(subj, isCommonMandatory(subj, data.specsByType)),
          subj.id,
        ).toBe(oldColor(subj));
      }
    },
  );

  it.each(realData)("skutečná data $label: všechny kategorie", (data) => {
    const counts = { mandatoryAll: 0, mandatory: 0, elective: 0, mixed: 0 };
    for (const subj of data.index.subjects) {
      counts[
        subjectCategory(subj, isCommonMandatory(subj, data.specsByType))
      ]++;
    }
    expect(counts.mandatoryAll).toBeGreaterThan(0);
    expect(counts.mandatory).toBeGreaterThan(0);
    expect(counts.elective).toBeGreaterThan(0);
    expect(counts.mixed).toBeGreaterThan(0);
    expect(
      counts.mandatoryAll + counts.mandatory + counts.elective + counts.mixed,
    ).toBe(data.index.subjects.length);
  });

  it("subjectTitle odstraní kód z popisku", () => {
    expect(
      subjectTitle({ id: "NAIL002", label: "NAIL002 Neuronové sítě" }),
    ).toBe("Neuronové sítě");
    expect(subjectTitle({ id: "NAIL002", label: "Neuronové sítě" })).toBe(
      "Neuronové sítě",
    );
    for (const data of realData) {
      for (const subj of data.index.subjects) {
        expect(subjectTitle(subj)).toBe(subj.label.replace(subj.id, "").trim());
        expect(subjectTitle(subj)).not.toContain(subj.id);
      }
    }
  });
});

describe("průnik specializací", () => {
  it("buildSubjectToSpecs zachová pořadí hran", () => {
    const map = buildSubjectToSpecs([
      { source: "A", target: "s2" },
      { source: "B", target: "s1" },
      { source: "A", target: "s1" },
    ]);
    expect([...map]).toEqual([
      ["A", ["s2", "s1"]],
      ["B", ["s1"]],
    ]);
  });

  it.each(realData)(
    "skutečná data $label: počet specializací předmětu = shared_count",
    (data) => {
      const map = buildSubjectToSpecs(data.links);
      for (const subj of data.index.subjects) {
        expect(map.get(subj.id) ?? [], subj.id).toHaveLength(subj.shared_count);
      }
    },
  );

  it("matchesAllSelected", () => {
    expect(matchesAllSelected([], [])).toBe(true);
    expect(matchesAllSelected(["s1"], ["s1", "s2"])).toBe(true);
    expect(matchesAllSelected(new Set(["s1", "s2"]), ["s1", "s2"])).toBe(true);
    expect(matchesAllSelected(["s1", "s3"], ["s1", "s2"])).toBe(false);
    expect(matchesAllSelected(["s1"], [])).toBe(false);
  });

  describe("selectionColor", () => {
    const base = "#123456";

    it("společný povinný je vždy modrý", () => {
      const subj = subject({ course_type: "mandatory", mandatory_in: ["s1"] });
      expect(selectionColor(subj, true, ["s1"], base)).toBe(
        MAP_COLORS.mandatoryAll,
      );
      expect(selectionColor(subj, true, ["s9"], base)).toBe(
        MAP_COLORS.mandatoryAll,
      );
    });

    it("barva podle role ve vybraných specializacích", () => {
      const subj = subject({
        course_type: "mixed",
        shared_count: 3,
        mandatory_in: ["s1"],
        elective_in: ["s2", "s3"],
      });
      expect(selectionColor(subj, false, ["s1"], base)).toBe(
        MAP_COLORS.mandatory,
      );
      expect(selectionColor(subj, false, ["s2", "s3"], base)).toBe(
        MAP_COLORS.elective,
      );
      expect(selectionColor(subj, false, ["s1", "s2"], base)).toBe(
        MAP_COLORS.mixed,
      );
    });

    it("mimo vybrané specializace zůstává základní barva", () => {
      const subj = subject({ mandatory_in: ["s1"], elective_in: ["s2"] });
      expect(selectionColor(subj, false, ["s5"], base)).toBe(base);
      expect(selectionColor(subj, false, [], base)).toBe(base);
    });

    it("povinný se sedmi specializacemi, který není společný, se řídí rolí", () => {
      const subj = subject({
        course_type: "mandatory",
        shared_count: 7,
        mandatory_in: ["s1"],
        elective_in: ["s2"],
      });
      expect(selectionColor(subj, false, ["s2"], base)).toBe(
        MAP_COLORS.elective,
      );
    });
  });
});

describe("pullsToCenter", () => {
  it("společný povinný vždy doprostřed", () => {
    expect(pullsToCenter(true, 1, 7)).toBe(true);
    expect(pullsToCenter(true, 1, 1)).toBe(true);
  });

  it("předmět ve všech viditelných specializacích (víc než jedné)", () => {
    expect(pullsToCenter(false, 7, 7)).toBe(true);
    expect(pullsToCenter(false, 11, 11)).toBe(true);
    expect(pullsToCenter(false, 6, 7)).toBe(false);
  });

  it("jediná viditelná specializace (fyzika Bc.) střed nepoužije", () => {
    expect(pullsToCenter(false, 1, 1)).toBe(false);
  });
});

describe("computeSubjectHighlight", () => {
  const subjectToSpecs = new Map([
    ["A", ["s1", "s2", "s3"]],
    ["B", ["s2", "s3", "s4"]],
    ["C", ["s3"]],
    ["E", []],
  ]);

  function highlight(...ids: string[]) {
    const result = computeSubjectHighlight(ids, subjectToSpecs);
    return { and: [...result.and], or: [...result.or] };
  }

  it("bez vybraných předmětů je prázdné", () => {
    expect(highlight()).toEqual({ and: [], or: [] });
  });

  it("jeden předmět: všechny jeho specializace jsou AND", () => {
    expect(highlight("A")).toEqual({ and: ["s1", "s2", "s3"], or: [] });
  });

  it("více předmětů: průnik je AND, zbytek sjednocení OR", () => {
    expect(highlight("A", "B")).toEqual({
      and: ["s2", "s3"],
      or: ["s1", "s4"],
    });
    expect(highlight("A", "B", "C")).toEqual({
      and: ["s3"],
      or: ["s1", "s2", "s4"],
    });
  });

  it("předmět bez specializací (nebo neznámý) vyprázdní průnik", () => {
    expect(highlight("A", "E")).toEqual({ and: [], or: ["s1", "s2", "s3"] });
    expect(highlight("neznamy", "C")).toEqual({ and: [], or: ["s3"] });
  });

  it("přijímá i Set", () => {
    const result = computeSubjectHighlight(new Set(["B", "C"]), subjectToSpecs);
    expect([...result.and]).toEqual(["s3"]);
    expect([...result.or]).toEqual(["s2", "s4"]);
  });
});

describe("tooltip", () => {
  it("subjectTooltip", () => {
    expect(
      subjectTooltip(
        subject({
          id: "NAIL002",
          label: "NAIL002 Neuronové sítě",
          course_type: "mandatory",
          shared_count: 7,
        }),
        true,
      ),
    ).toEqual({
      kind: "subject",
      id: "NAIL002",
      title: "Neuronové sítě",
      color: "#3b82f6",
      badgeLabel: "Společný povinný",
      sharedCount: 7,
    });
    expect(
      subjectTooltip(subject({ course_type: "mixed", shared_count: 3 }), false),
    ).toMatchObject({
      color: "#facc15",
      badgeLabel: "Smíšený",
      sharedCount: 3,
    });
    expect(
      subjectTooltip(subject({ course_type: "mandatory" }), false),
    ).toMatchObject({ color: "#4ade80", badgeLabel: "Povinný" });
  });

  it("specTooltip", () => {
    const spec = realData[0]?.index.specs[0];
    if (!spec) throw new Error("chybí specializace v datech");
    expect(specTooltip(spec, 42)).toEqual({
      kind: "spec",
      label: spec.label,
      color: spec.color,
      count: 42,
    });
  });

  it("tooltipPosition: nad kurzorem, v horních 150 px pod ním", () => {
    expect(tooltipPosition(200, 150)).toEqual({
      left: "200px",
      top: "134px",
      transform: "translate(-50%, -100%)",
    });
    expect(tooltipPosition(200, 149.5)).toEqual({
      left: "200px",
      top: "173.5px",
      transform: "translate(-50%, 0)",
    });
  });
});

describe("wrapWords", () => {
  const byLength = (line: string) => line.length * 10;

  it("krátký text zůstane na jednom řádku", () => {
    expect(wrapWords("Umělá inteligence", 1000, byLength)).toEqual([
      "Umělá inteligence",
    ]);
  });

  it("zalomí, když řádek přesáhne šířku", () => {
    expect(
      wrapWords("Webové a datově orientované programování", 110, byLength),
    ).toEqual(["Webové a", "datově", "orientované", "programování"]);
  });

  it("řádek přesně na šířku se nezalamuje", () => {
    expect(wrapWords("aaaa bbbb", 90, byLength)).toEqual(["aaaa bbbb"]);
    expect(wrapWords("aaaa bbbb", 89, byLength)).toEqual(["aaaa", "bbbb"]);
  });

  it("první slovo širší než řádek nechá první řádek prázdný (jako starý kód)", () => {
    expect(wrapWords("programování her", 50, byLength)).toEqual([
      "",
      "programování",
      "her",
    ]);
  });

  it("prázdný text a text začínající mezerou dají jeden prázdný řádek", () => {
    expect(wrapWords("", 100, byLength)).toEqual([""]);
    expect(wrapWords(" úvodní mezera", 100, byLength)).toEqual([""]);
  });

  it("koncová mezera a vícenásobné mezery nevadí", () => {
    expect(wrapWords("a  b\tc ", 1000, byLength)).toEqual(["a b c"]);
  });

  it("wrapLineDy počítá jako starý kód", () => {
    expect(wrapLineDy(0, 0)).toBe("0em");
    expect(wrapLineDy(1, 0)).toBe("1.1em");
    expect(wrapLineDy(2, 0)).toBe("2.2em");
    expect(wrapLineDy(3, 0)).toBe(`${3 * 1.1 + 0}em`);
    expect(wrapLineDy(1, 0.5)).toBe("1.6em");
  });
});

describe("odkazy v popoveru", () => {
  it("sisUrl a wikiUrl", () => {
    expect(sisUrl("NPRG030")).toBe(
      "https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=NPRG030",
    );
    expect(wikiUrl("NPRG030")).toBe("https://wiki.matfyz.cz/NPRG030");
  });

  it("pro skutečné kódy předmětů jsou stejné jako prosté vložení kódu", () => {
    for (const data of realData) {
      for (const subj of data.index.subjects) {
        expect(sisUrl(subj.id)).toBe(
          `https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=${subj.id}`,
        );
        expect(wikiUrl(subj.id)).toBe(`https://wiki.matfyz.cz/${subj.id}`);
      }
    }
  });
});

describe("placePopover", () => {
  const viewport = { width: 1000, height: 800 };
  const popover = { width: 200, height: 100 };
  const node = (left: number, top: number) => ({
    left,
    top,
    width: 20,
    height: 20,
  });

  it("geometrie odpovídá Bootstrapu", () => {
    expect(POPOVER_GEOMETRY).toEqual({
      offset: 8,
      arrowLength: 16,
      borderWidth: 1,
    });
  });

  it("když je místo, je nahoře a vystředěný k uzlu", () => {
    expect(placePopover(node(490, 400), popover, viewport)).toEqual({
      placement: "top",
      x: 400,
      y: 292,
      // střed uzlu 500 − levý okraj 400 − rámeček 1 − půl šipky 8
      arrowOffset: 91,
    });
  });

  it("u horního okraje se překlopí doprava", () => {
    expect(placePopover(node(490, 60), popover, viewport)).toEqual({
      placement: "right",
      x: 518,
      y: 20,
      arrowOffset: 41,
    });
  });

  it("v pravém horním rohu se překlopí doleva (vpravo ani dole se nevejde celý)", () => {
    expect(placePopover(node(950, 60), popover, viewport)).toMatchObject({
      placement: "left",
      x: 742,
      y: 20,
    });
  });

  it("u pravého okraje s místem nad uzlem volí levou stranu (příčný přesah)", () => {
    expect(placePopover(node(950, 400), popover, viewport)).toMatchObject({
      placement: "left",
      x: 742,
      y: 360,
    });
  });

  it("když se celý nevejde nikam, rozhoduje hlavní směr a popover se posune do okna", () => {
    // Úzké okno: nahoře se vejde na výšku, ale přesahuje do stran.
    const narrow = { width: 180, height: 800 };
    const position = placePopover(node(80, 400), popover, narrow);
    expect(position.placement).toBe("top");
    expect(position.y).toBe(292);
    // Střed uzlu je 90 → vystředěné x = −10; popover se posune k levému okraji okna.
    expect(position.x).toBe(0);
    expect(position.arrowOffset).toBe(90 - 0 - 1 - 8);
  });

  it("posun podél hrany neodtrhne popover od uzlu mimo okno", () => {
    // Uzel je celý za levým okrajem maličkého okna; na výšku se vejde jen nahoru.
    const tiny = { width: 20, height: 150 };
    const position = placePopover(node(-200, 110), popover, tiny);
    expect(position.placement).toBe("top");
    expect(position.y).toBe(2);
    // Pravý okraj uzlu −180, mínus dosah šipky 16 a rámeček 1 (ne levý okraj okna 0).
    expect(position.x).toBe(-197);
    // Šipka zůstává co nejblíž uzlu – na levém kraji popoveru.
    expect(position.arrowOffset).toBe(0);
  });

  it("šipka nevyjede za okraj popoveru", () => {
    // Uzel je vpravo od maličkého okna; popover se drží uzlu (x = levý okraj uzlu −
    // šířka popoveru + dosah šipky) a šipka končí na pravém kraji popoveru.
    const tiny = { width: 20, height: 150 };
    const position = placePopover(node(300, 110), popover, tiny);
    expect(position.placement).toBe("top");
    expect(position.x).toBe(300 - 200 + 16);
    expect(position.arrowOffset).toBe(200 - 2 * 1 - 16);
  });

  it("posun do okna, když uzel zůstává vidět", () => {
    const tiny = { width: 20, height: 150 };
    const position = placePopover(node(100, 110), popover, tiny);
    expect(position).toEqual({
      placement: "top",
      x: 0,
      y: 2,
      arrowOffset: 101,
    });
  });

  it("dole, když nahoře ani vpravo není místo", () => {
    const narrow = { width: 300, height: 800 };
    expect(placePopover(node(140, 60), popover, narrow)).toMatchObject({
      placement: "bottom",
      x: 50,
      y: 88,
    });
  });
});

// ---------------------------------------------------------------------------
// Shoda se starou stránkou: funkce vyříznuté ze specializace/index.html
// ---------------------------------------------------------------------------

const oldPageExists = existsSync(OLD_PAGE_PATH);

/** Vyřízne zdroják funkce `name` ze staré stránky (hledá párovou složenou závorku). */
function extractOldFunction(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`funkce ${name} ve staré stránce není`);
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`funkce ${name}: nenalezen konec`);
}

describe.skipIf(!oldPageExists)("shoda se starou mapou", () => {
  const html = oldPageExists ? readFileSync(OLD_PAGE_PATH, "utf8") : "";

  it("computeSubjectHighlight = staré computeSubjHighlightIntersection", () => {
    const run = new Function(
      "subjToSpecs",
      "subjHighlightSources",
      "subjHighlightSpecsAnd",
      "subjHighlightSpecsOr",
      `${extractOldFunction(html, "computeSubjHighlightIntersection")}\ncomputeSubjHighlightIntersection();`,
    ) as (
      subjToSpecs: Record<string, string[]>,
      sources: Set<string>,
      and: Set<string>,
      or: Set<string>,
    ) => void;

    for (const data of realData) {
      const subjectToSpecs = buildSubjectToSpecs(data.links);
      const oldMap = Object.fromEntries(subjectToSpecs);
      const ids = data.index.subjects.map((subj) => subj.id);
      const selections: string[][] = [[]];
      // Jednotlivé předměty, dvojice a trojice rozložené přes celý seznam.
      for (let i = 0; i < ids.length; i++) {
        const a = ids[i];
        const b = ids[(i * 7 + 3) % ids.length];
        const c = ids[(i * 13 + 11) % ids.length];
        if (!a || !b || !c) continue;
        selections.push([a], [a, b], [a, b, c]);
      }
      selections.push(["neznamy"], [ids[0] ?? "", "neznamy"]);

      for (const selection of selections) {
        const oldAnd = new Set<string>(["zbytek z minula"]);
        const oldOr = new Set<string>(["zbytek z minula"]);
        run(oldMap, new Set(selection), oldAnd, oldOr);
        const result = computeSubjectHighlight(
          new Set(selection),
          subjectToSpecs,
        );
        expect([...result.and], selection.join("+")).toEqual([...oldAnd]);
        expect([...result.or], selection.join("+")).toEqual([...oldOr]);
      }
    }
  });

  it("wrapWords + wrapLineDy = starý wrap", () => {
    interface FakeTspan {
      content: string;
      attrs: Record<string, unknown>;
    }

    /** Minimální náhrada D3 výběru `<text>` pro starou funkci `wrap`. */
    function runOldWrap(
      label: string,
      width: number,
      measure: (line: string) => number,
    ): FakeTspan[] {
      const tspans: FakeTspan[] = [];
      const textAttrs: Record<string, string | null> = {
        x: "0",
        y: "32",
        dy: null,
      };
      let content: string = label;
      const fakeText = {
        text(...args: [] | [string | null]) {
          if (args.length === 0) return content;
          content = args[0] ?? "";
          return fakeText;
        },
        attr(name: string) {
          return textAttrs[name] ?? null;
        },
        append() {
          const tspan: FakeTspan = { content: "", attrs: {} };
          tspans.push(tspan);
          const selection = {
            attr(name: string, value: unknown) {
              tspan.attrs[name] = value;
              return selection;
            },
            text(value: string) {
              tspan.content = value;
              return selection;
            },
            node() {
              return { getComputedTextLength: () => measure(tspan.content) };
            },
          };
          return selection;
        },
      };
      const element = {};
      const fakeD3 = { select: () => fakeText };
      const wrap = new Function(
        "d3",
        `${extractOldFunction(html, "wrap")}\nreturn wrap;`,
      )(fakeD3) as (
        selection: { each(fn: (this: object) => void): void },
        width: number,
      ) => void;
      wrap(
        {
          each(fn) {
            fn.call(element);
          },
        },
        width,
      );
      return tspans;
    }

    const labels = new Set<string>([
      "",
      "Jednoslovné",
      "Velmidlouhéjednoslovnépojmenování specializace",
      " mezera na začátku",
      "mezera na konci ",
    ]);
    for (const data of realData) {
      for (const spec of data.index.specs) labels.add(spec.label);
    }
    const measures = [
      (line: string) => line.length * 7,
      (line: string) => line.length * 3.3,
      (line: string) => line.length * 20,
    ];

    for (const label of labels) {
      for (const measure of measures) {
        for (const width of [110, 60, 400]) {
          const old = runOldWrap(label, width, measure);
          const lines = wrapWords(label, width, measure);
          expect(lines, `${label} @${width}`).toEqual(
            old.map((tspan) => tspan.content),
          );
          expect(
            lines.map((_, i) => wrapLineDy(i, 0)),
            `${label} @${width}`,
          ).toEqual(old.map((tspan) => tspan.attrs.dy));
          for (const tspan of old) {
            expect(tspan.attrs.x).toBe("0");
            expect(tspan.attrs.y).toBe("32");
          }
        }
      }
    }
  });
});
