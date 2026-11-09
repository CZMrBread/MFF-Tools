import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELD,
  FIELDS_FALLBACK,
  MAP_YEARS_FALLBACK,
  RECOMMENDED_PV_GROUP,
  StudyDataError,
  YEARS_FALLBACK,
  fieldFromSearch,
  fieldsUrl,
  indexNodes,
  linksUrl,
  loadFields,
  loadLinks,
  loadNodes,
  loadStudyData,
  loadYears,
  nodesUrl,
  parseFields,
  parseLinks,
  parseNodes,
  parseYears,
  pickField,
  pickYear,
  pvGroupOf,
  validateStudyData,
  yearFromSearch,
  yearsUrl,
} from "./data";
import type { FetchFn, FetchResponse, StudyDataProblem } from "./data";
import knownDataProblems from "./__fixtures__/known-data-problems.json";
import type { PvGroupId, StudyLink, StudyNode, SubjectNode } from "./types";

const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
const publicDataDir = fileURLToPath(
  new URL("../../public/data/", import.meta.url),
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const realYears = parseYears(readJson(join(dataDir, "years.json")));

function realFields(year: string): string[] {
  return parseFields(readJson(join(dataDir, year, "fields.json")));
}

/** Každá kombinace rok × obor z years.json a fields.json. */
const realPairs = realYears.flatMap((year) =>
  realFields(year).map((field) => ({
    year,
    field,
    name: `${year}/${field}`,
  })),
);

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/** fetch nad skutečnými soubory v data/ – URL musí začínat "data/". */
const fetchFromRepo: FetchFn = (url) => {
  if (!url.startsWith("data/")) {
    return Promise.reject(new Error(`nečekaná URL ${url}`));
  }
  try {
    return Promise.resolve(
      jsonResponse(readJson(join(dataDir, url.slice("data/".length)))),
    );
  } catch {
    return Promise.resolve(jsonResponse(null, 404));
  }
};

/** Odpovědi, po kterých loadYears / loadFields musí použít záložní seznam. */
function failingListFetches(validItem: string): FetchFn[] {
  return [
    () => Promise.reject(new TypeError("síť")),
    () => Promise.resolve(jsonResponse([validItem], 404)),
    () => Promise.resolve(jsonResponse({ a: 1 })),
    () => Promise.resolve(jsonResponse(validItem)),
    () => Promise.resolve(jsonResponse(null)),
    () => Promise.resolve(jsonResponse([])),
    () => Promise.resolve(jsonResponse(["Letos!", 2025, null])),
    () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("není JSON")),
      }),
  ];
}

describe("roky", () => {
  it("data/years.json obsahuje jen platné roky", () => {
    expect(realYears).toEqual(readJson(join(dataDir, "years.json")));
    expect(realYears.length).toBeGreaterThan(0);
  });

  it("parseYears nechá jen řetězce RRRR-RRRR a zachová pořadí", () => {
    expect(
      parseYears([
        "2024-2025",
        2025,
        "2025/2026",
        null,
        "2025-2026",
        " 2026-2027",
        "2026-2027x",
      ]),
    ).toEqual(["2024-2025", "2025-2026"]);
    expect(parseYears({ years: ["2024-2025"] })).toEqual([]);
    expect(parseYears(null)).toEqual([]);
    expect(parseYears("2024-2025")).toEqual([]);
  });

  it("loadYears čte <base>years.json bez cache", async () => {
    const calls: unknown[][] = [];
    const fetchFn: FetchFn = (url, init) => {
      calls.push([url, init]);
      return fetchFromRepo(url);
    };
    expect(await loadYears("data/", undefined, fetchFn)).toEqual(realYears);
    expect(calls).toEqual([["data/years.json", { cache: "no-store" }]]);
  });

  it("záložní seznamy odpovídají starým stránkám (kalkulačka ≠ mapa)", () => {
    expect(YEARS_FALLBACK).toEqual(["2026-2027"]);
    expect(MAP_YEARS_FALLBACK).toEqual(["2025-2026"]);
  });

  it("loadYears vrátí záložní seznam při jakékoli chybě", async () => {
    for (const fetchFn of failingListFetches("2024-2025")) {
      expect(await loadYears("data/", undefined, fetchFn)).toEqual([
        "2026-2027",
      ]);
      expect(await loadYears("data/", MAP_YEARS_FALLBACK, fetchFn)).toEqual([
        "2025-2026",
      ]);
    }
  });

  it("loadYears vrací pokaždé nové pole (záložní seznam nejde omylem změnit)", async () => {
    const failing: FetchFn = () => Promise.reject(new Error());
    const years = await loadYears("data/", undefined, failing);
    years.push("1999-2000");
    expect(YEARS_FALLBACK).toEqual(["2026-2027"]);
    const mapYears = await loadYears("data/", MAP_YEARS_FALLBACK, failing);
    mapYears.push("1999-2000");
    expect(MAP_YEARS_FALLBACK).toEqual(["2025-2026"]);
  });

  it("pickYear: URL → uložený rok → poslední rok", () => {
    const years = ["2023-2024", "2024-2025", "2025-2026"];
    expect(pickYear(years, "2023-2024", "2024-2025")).toBe("2023-2024");
    expect(pickYear(years, null, "2024-2025")).toBe("2024-2025");
    expect(pickYear(years, "1999-2000", "2024-2025")).toBe("2024-2025");
    expect(pickYear(years, "", "")).toBe("2025-2026");
    expect(pickYear(years, null, null)).toBe("2025-2026");
    expect(pickYear(years, undefined, "neplatny")).toBe("2025-2026");
    expect(pickYear([], null, null)).toBe("2026-2027");
  });

  it("yearFromSearch čte parametr rok", () => {
    expect(yearFromSearch("?rok=2024-2025")).toBe("2024-2025");
    expect(yearFromSearch("?a=1&rok=2025-2026#x")).toBe("2025-2026#x");
    expect(yearFromSearch("?obor=fyzika&rok=2025-2026")).toBe("2025-2026");
    expect(yearFromSearch("")).toBeNull();
    expect(yearFromSearch("?year=2024-2025")).toBeNull();
  });
});

describe("obory", () => {
  it("každý rok má fields.json jen s platnými obory", () => {
    for (const year of realYears) {
      const fields = realFields(year);
      expect(fields, year).toEqual(
        readJson(join(dataDir, year, "fields.json")),
      );
      expect(fields.length, year).toBeGreaterThan(0);
      expect(new Set(fields).size, year).toBe(fields.length);
    }
  });

  it("obory v repu: starší roky jen informatika, 2026-2027 čtyři obory", () => {
    expect(realPairs.map((pair) => pair.name)).toEqual([
      "2024-2025/informatika",
      "2025-2026/informatika",
      "2026-2027/fyzika",
      "2026-2027/informatika",
      "2026-2027/matematika",
      "2026-2027/ucitelstvi",
    ]);
  });

  it("parseFields nechá jen id z malých písmen, číslic, _ a - a zachová pořadí", () => {
    expect(
      parseFields([
        "fyzika",
        "Fyzika",
        7,
        "informatika",
        null,
        "",
        "obor 2",
        "obor_2-b",
        "../tajne",
        "učitelství",
        "ucitelstvi",
        "a/b",
        "x.json",
        ["matematika"],
      ]),
    ).toEqual(["fyzika", "informatika", "obor_2-b", "ucitelstvi"]);
    expect(parseFields({ fields: ["fyzika"] })).toEqual([]);
    expect(parseFields(null)).toEqual([]);
    expect(parseFields("fyzika")).toEqual([]);
    // pořadí ani duplicity neupravuje (jako starý kód)
    expect(parseFields(["b", "a", "b"])).toEqual(["b", "a", "b"]);
  });

  it("loadFields čte <base><rok>/fields.json bez cache", async () => {
    for (const year of realYears) {
      const calls: unknown[][] = [];
      const fetchFn: FetchFn = (url, init) => {
        calls.push([url, init]);
        return fetchFromRepo(url);
      };
      expect(await loadFields("data/", year, fetchFn)).toEqual(
        realFields(year),
      );
      expect(calls).toEqual([
        [`data/${year}/fields.json`, { cache: "no-store" }],
      ]);
    }
  });

  it("loadFields vrátí záložní seznam při jakékoli chybě", async () => {
    expect(FIELDS_FALLBACK).toEqual(["informatika"]);
    for (const fetchFn of failingListFetches("fyzika")) {
      expect(await loadFields("data/", "2026-2027", fetchFn)).toEqual([
        "informatika",
      ]);
    }
    // rok bez fields.json (HTTP 404)
    expect(await loadFields("data/", "1999-2000", fetchFromRepo)).toEqual([
      "informatika",
    ]);
  });

  it("loadFields vrací pokaždé nové pole (záložní seznam nejde omylem změnit)", async () => {
    const fields = await loadFields("data/", "2026-2027", () =>
      Promise.reject(new Error()),
    );
    fields.push("fyzika");
    expect(FIELDS_FALLBACK).toEqual(["informatika"]);
  });

  it("pickField: URL → uložený obor → informatika → první obor", () => {
    const fields = ["fyzika", "informatika", "matematika", "ucitelstvi"];
    expect(DEFAULT_FIELD).toBe("informatika");
    expect(pickField(fields, "matematika", "fyzika")).toBe("matematika");
    expect(pickField(fields, null, "fyzika")).toBe("fyzika");
    expect(pickField(fields, "chemie", "fyzika")).toBe("fyzika");
    expect(pickField(fields, "", "")).toBe("informatika");
    expect(pickField(fields, null, null)).toBe("informatika");
    expect(pickField(fields, undefined, "chemie")).toBe("informatika");
    expect(pickField(fields, "Fyzika", "FYZIKA")).toBe("informatika");
    // rok bez informatiky → první obor seznamu
    expect(pickField(["matematika", "fyzika"], null, null)).toBe("matematika");
    expect(pickField(["matematika", "fyzika"], "informatika", null)).toBe(
      "matematika",
    );
    expect(pickField(["matematika", "fyzika"], "x", "fyzika")).toBe("fyzika");
    // rok s jediným oborem ignoruje URL i uložený obor jiného roku
    expect(pickField(["informatika"], "fyzika", "matematika")).toBe(
      "informatika",
    );
    expect(pickField([], null, null)).toBe("informatika");
  });

  it("fieldFromSearch čte parametr obor", () => {
    expect(fieldFromSearch("?obor=fyzika")).toBe("fyzika");
    expect(fieldFromSearch("?rok=2026-2027&obor=matematika")).toBe(
      "matematika",
    );
    expect(fieldFromSearch("?obor=")).toBe("");
    expect(fieldFromSearch("")).toBeNull();
    expect(fieldFromSearch("?field=fyzika")).toBeNull();
  });
});

describe("URL datových souborů", () => {
  it("skládá relativní cesty z předané složky", () => {
    expect(yearsUrl("../data/")).toBe("../data/years.json");
    expect(fieldsUrl("../data/", "2026-2027")).toBe(
      "../data/2026-2027/fields.json",
    );
    expect(nodesUrl("../data/", "2025-2026", "informatika")).toBe(
      "../data/2025-2026/informatika/nodes.json",
    );
    expect(linksUrl("./data", "2026-2027", "fyzika")).toBe(
      "./data/2026-2027/fyzika/links.json",
    );
    expect(fieldsUrl("./data", "2024-2025")).toBe(
      "./data/2024-2025/fields.json",
    );
  });
});

describe.each(realPairs)("skutečná data $name", ({ year, field }) => {
  const rawNodes = readJson(join(dataDir, year, field, "nodes.json"));
  const rawLinks = readJson(join(dataDir, year, field, "links.json"));

  it("parseNodes přijme nodes.json a nic neztratí ani nezmění", () => {
    const nodes = parseNodes(rawNodes);
    expect(nodes).toStrictEqual(rawNodes);
    // stejné klíče ve stejném pořadí
    expect(JSON.stringify(nodes)).toBe(JSON.stringify(rawNodes));
  });

  it("parseLinks přijme links.json a nic neztratí ani nezmění", () => {
    const links = parseLinks(rawLinks);
    expect(links).toStrictEqual(rawLinks);
    expect(JSON.stringify(links)).toBe(JSON.stringify(rawLinks));
  });

  it("loadNodes / loadLinks / loadStudyData načtou soubory roku a oboru", async () => {
    const nodes = await loadNodes("data/", year, field, fetchFromRepo);
    const links = await loadLinks("data/", year, field, fetchFromRepo);
    expect(nodes).toStrictEqual(rawNodes);
    expect(links).toStrictEqual(rawLinks);

    const withLinks = await loadStudyData(
      "data/",
      year,
      field,
      { links: true },
      fetchFromRepo,
    );
    expect(withLinks.year).toBe(year);
    expect(withLinks.field).toBe(field);
    expect(withLinks.nodes).toStrictEqual(rawNodes);
    expect(withLinks.links).toStrictEqual(rawLinks);
    expect(withLinks.index.nodes).toBe(withLinks.nodes);

    const calls: unknown[][] = [];
    const nodesOnly = await loadStudyData(
      "data/",
      year,
      field,
      {},
      (url, init) => {
        calls.push([url, init]);
        return fetchFromRepo(url);
      },
    );
    // jen nodes.json, s výchozí cache (jako starý kód)
    expect(calls).toEqual([[`data/${year}/${field}/nodes.json`, undefined]]);
    expect(nodesOnly.year).toBe(year);
    expect(nodesOnly.field).toBe(field);
    expect(nodesOnly).not.toHaveProperty("links");
  });

  it("indexNodes rozdělí uzly a každá specializace má požadavky", () => {
    const nodes = parseNodes(rawNodes);
    const index = indexNodes(nodes);

    expect(index.nodes).toBe(nodes);
    expect(
      index.specs.length + index.subjects.length + index.requirements.length,
    ).toBe(nodes.length);
    expect(index.specs).toEqual(nodes.filter((node) => node.group === "spec"));
    expect(index.subjects).toEqual(
      nodes.filter((node) => node.group === "subj"),
    );
    expect(index.requirements).toEqual(
      nodes.filter((node) => node.group === "program_req"),
    );

    // id jsou v datech jedinečná, takže mapy mají stejně položek jako seznamy
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    expect(index.specById.size).toBe(index.specs.length);
    expect(index.subjectById.size).toBe(index.subjects.length);
    expect(index.requirementBySpec.size).toBe(index.requirements.length);
    expect(index.requirements.length).toBe(index.specs.length);

    expect(index.specs.length).toBeGreaterThan(0);
    for (const spec of index.specs) {
      // s<n> bakalářské, m<n> magisterské
      expect(spec.id).toMatch(
        spec.study_type === "bakalarske" ? /^s[1-9]\d*$/ : /^m[1-9]\d*$/,
      );
      expect(index.specById.get(spec.id)).toBe(spec);
      const requirement = index.requirementBySpec.get(spec.id);
      expect(requirement?.id).toBe(`req_${spec.id}`);
      expect(requirement?.level).toBe(
        spec.study_type === "bakalarske" ? "bc" : "mgr",
      );
    }
    for (const subject of index.subjects) {
      expect(index.subjectById.get(subject.id)).toBe(subject);
    }
  });

  it("hodnoty výčtů a nepovinné klíče odpovídají typům", () => {
    const { subjects, requirements } = indexNodes(parseNodes(rawNodes));
    expect(new Set(subjects.map((subject) => subject.semester))).toEqual(
      new Set(["zimní", "letní", "oba"]),
    );
    expect(new Set(subjects.map((subject) => subject.course_type))).toEqual(
      new Set(["mandatory", "elective", "mixed"]),
    );
    for (const subject of subjects) {
      // pv_group chybí právě u předmětů, které nejsou nikde povinně volitelné
      expect(Object.keys(subject.pv_group ?? {}).sort()).toEqual(
        [...subject.elective_in].sort(),
      );
      expect("pv_group" in subject).toBe(subject.elective_in.length > 0);
      expect(Number.isInteger(subject.credits)).toBe(true);
      expect(subject.credits).toBeGreaterThanOrEqual(0);
    }
    for (const requirement of requirements) {
      // nepovinný klíč, který starý kód zná, se v současných datech nevyskytuje
      expect(requirement).not.toHaveProperty("no_pdf_plan");
      expect(requirement.pv_overall_min).not.toBeNull();
      const groups = requirement.pv_groups.map((def) => def.group);
      expect(new Set(groups).size, requirement.id).toBe(groups.length);
      for (const def of requirement.pv_groups) {
        const optional = Object.keys(def).slice(3);
        expect(Object.keys(def).slice(0, 3)).toEqual([
          "group",
          "label",
          "min_credits",
        ]);
        expect(def.min_credits).not.toBeNull();
        expect([[], ["includes_groups"], ["mandatory_choice"]]).toContainEqual(
          optional,
        );
        // mandatory_choice je v datech jen true; includes_groups ukazuje na
        // skupiny téhož plánu
        if ("mandatory_choice" in def) expect(def.mandatory_choice).toBe(true);
        for (const included of def.includes_groups ?? []) {
          expect(groups, `${requirement.id} includes_groups`).toContain(
            included,
          );
          expect(included).not.toBe(def.group);
        }
      }
    }
  });
});

describe("zvláštnosti jednotlivých oborů (podklad pro typy v types.ts)", () => {
  /** Hodnoty, které se v datech roku a oboru skutečně vyskytují. */
  function occurrences(name: string) {
    const pair = realPairs.find((candidate) => candidate.name === name);
    if (!pair) throw new Error(`V datech chybí ${name}`);
    const { subjects, requirements, specs } = indexNodes(
      parseNodes(readJson(join(dataDir, pair.year, pair.field, "nodes.json"))),
    );
    const defs = requirements.flatMap((requirement) => requirement.pv_groups);
    const sorted = (values: Iterable<PvGroupId>) =>
      [...new Set(values)].sort((a, b) =>
        String(a).localeCompare(String(b), "en"),
      );
    return {
      specs: specs.length,
      defGroups: sorted(defs.map((def) => def.group)),
      subjectGroups: sorted(
        subjects.flatMap((subject) => Object.values(subject.pv_group ?? {})),
      ),
      includes: defs.filter((def) => def.includes_groups !== undefined).length,
      mandatoryChoice: defs.filter((def) => def.mandatory_choice !== undefined)
        .length,
    };
  }

  it("pro každou kombinaci rok × obor je tu zapsaný očekávaný výskyt", () => {
    expect(realPairs).toHaveLength(6);
  });

  it.each(["2024-2025", "2025-2026", "2026-2027"])(
    "%s/informatika: číselné skupiny 0–5, telocvik, mandatory_choice",
    (year) => {
      expect(occurrences(`${year}/informatika`)).toEqual({
        specs: 14,
        defGroups: [0, 1, 2, 3, 4, 5, "telocvik"],
        subjectGroups: [0, 1, 2, 3, 4, 5, "doporucene", "telocvik"],
        includes: 0,
        mandatoryChoice: 2,
      });
    },
  );

  it("2026-2027/fyzika: alternativy alt1 / alt2", () => {
    expect(occurrences("2026-2027/fyzika")).toEqual({
      specs: 12,
      defGroups: [1, 2, 3, "alt1", "alt2", "telocvik"],
      subjectGroups: [1, 2, 3, "alt1", "alt2", "doporucene", "telocvik"],
      includes: 0,
      mandatoryChoice: 0,
    });
  });

  it("2026-2027/matematika: nadřazené skupiny s includes_groups", () => {
    expect(occurrences("2026-2027/matematika")).toEqual({
      specs: 21,
      defGroups: [0, 1, 2, 3, "telocvik"],
      subjectGroups: [0, 1, 2, 3, "doporucene", "telocvik"],
      includes: 7,
      mandatoryChoice: 0,
    });
  });

  it("2026-2027/ucitelstvi: jen textové skupiny", () => {
    expect(occurrences("2026-2027/ucitelstvi")).toEqual({
      specs: 16,
      defGroups: [
        "DG_obec",
        "F_obec",
        "I_obec",
        "M_obec",
        "M_obor",
        "pv",
        "telocvik",
      ],
      subjectGroups: [
        "DG_obec",
        "doporucene",
        "F_obec",
        "I_obec",
        "M_obec",
        "M_obor",
        "pv",
        "telocvik",
      ],
      includes: 0,
      mandatoryChoice: 0,
    });
  });
});

describe("validateStudyData nad skutečnými daty", () => {
  // Data se v testu neopravují. Přesný seznam známých porušení pravidel z
  // docs/data.md je ve fixture (problémy bez hlášky), aby se poznala každá nová chyba
  // v datech. Skupina "doporucene" chybou není (RECOMMENDED_PV_GROUP) – fixture
  // u ní jen zapisuje počet výskytů, aby si změny dat někdo všiml.
  const known = knownDataProblems as {
    problems: Record<string, Omit<StudyDataProblem, "message">[]>;
    recommendedCounts: Record<string, number>;
  };

  it("fixture má záznam pro každou kombinaci rok × obor", () => {
    const names = realPairs.map((pair) => pair.name);
    expect(Object.keys(known.problems)).toEqual(names);
    expect(Object.keys(known.recommendedCounts)).toEqual(names);
  });

  it.each(realPairs)(
    "$name má přesně známé nálezy",
    ({ year, field, name }) => {
      const nodes = parseNodes(
        readJson(join(dataDir, year, field, "nodes.json")),
      );
      const links = parseLinks(
        readJson(join(dataDir, year, field, "links.json")),
      );
      const problems = validateStudyData(nodes, links).map(
        ({ message, ...rest }) => {
          expect(message).not.toBe("");
          return rest;
        },
      );
      expect(problems).toEqual(known.problems[name]);
    },
  );

  it.each(realPairs)(
    "$name: skupina doporucene se nehlásí a vyskytuje se v očekávaném počtu",
    ({ year, field, name }) => {
      const nodes = parseNodes(
        readJson(join(dataDir, year, field, "nodes.json")),
      );
      let count = 0;
      for (const node of nodes) {
        if (node.group === "program_req") {
          // nikde není definovaná jako skutečná PV skupina
          expect(node.pv_groups.map((def) => def.group)).not.toContain(
            RECOMMENDED_PV_GROUP,
          );
        }
        if (node.group !== "subj") continue;
        for (const [spec, group] of Object.entries(node.pv_group ?? {})) {
          if (group !== RECOMMENDED_PV_GROUP) continue;
          count++;
          // doporučený předmět je u specializace veden jako povinně volitelný
          expect(node.elective_in).toContain(spec);
        }
      }
      expect(count).toBe(known.recommendedCounts[name]);
    },
  );
});

describe("validateStudyData – jednotlivá pravidla", () => {
  const spec: StudyNode = {
    id: "s1",
    label: "Obecná informatika",
    group: "spec",
    study_type: "bakalarske",
    color: "#ff6b6b",
    radius: 40,
  };
  const requirement: StudyNode = {
    id: "req_s1",
    group: "program_req",
    spec: "s1",
    level: "bc",
    total_credits: 180,
    mandatory_credits: 116,
    pv_overall_min: 45,
    pv_groups: [
      { group: "telocvik", label: "Tělocvik", min_credits: 4 },
      { group: 1, label: "Skupina 1", min_credits: 30 },
    ],
  };
  function subject(overrides: Partial<SubjectNode> = {}): SubjectNode {
    return {
      id: "NTST001",
      label: "NTST001 Testovací předmět",
      group: "subj",
      radius: 8,
      shared_count: 1,
      course_type: "elective",
      mandatory_in: [],
      elective_in: ["s1"],
      credits: 5,
      pv_group: { s1: 1 },
      semester: "zimní",
      ...overrides,
    };
  }
  const link: StudyLink = { source: "NTST001", target: "s1", value: 1 };

  function codes(nodes: StudyNode[], links: StudyLink[] = []) {
    return validateStudyData(nodes, links).map((problem) => problem.code);
  }

  it("správná data nemají žádný nález", () => {
    expect(validateStudyData([spec, requirement, subject()], [link])).toEqual(
      [],
    );
    expect(
      codes([
        spec,
        requirement,
        subject({ pv_group: { s1: "telocvik" }, credits: 0 }),
      ]),
    ).toEqual([]);
  });

  it("program_req.spec musí být existující specializace", () => {
    const problems = validateStudyData([
      spec,
      { ...requirement, id: "req_s9", spec: "s9" },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      code: "requirement-unknown-spec",
      nodeId: "req_s9",
      spec: "s9",
    });
    expect(problems[0]?.message).toContain("s9");
  });

  it("mandatory_in, elective_in a klíče pv_group musí být existující specializace", () => {
    expect(
      validateStudyData([
        spec,
        requirement,
        subject({
          mandatory_in: ["s1", "x1"],
          elective_in: ["x2"],
          pv_group: { x3: 1 },
        }),
      ]).map((problem) => [problem.code, problem.nodeId, problem.spec]),
    ).toEqual([
      ["mandatory-in-unknown-spec", "NTST001", "x1"],
      ["elective-in-unknown-spec", "NTST001", "x2"],
      ["pv-group-unknown-spec", "NTST001", "x3"],
    ]);
    // odkaz na uzel jiného druhu než spec se nepočítá
    expect(
      codes([spec, requirement, subject({ mandatory_in: ["req_s1"] })]),
    ).toEqual(["mandatory-in-unknown-spec"]);
  });

  it("hodnota pv_group musí být skupina z požadavků specializace (striktní shoda)", () => {
    expect(
      validateStudyData([spec, requirement, subject({ pv_group: { s1: 2 } })]),
    ).toMatchObject([
      {
        code: "pv-group-unknown-group",
        nodeId: "NTST001",
        spec: "s1",
        group: 2,
      },
    ]);
    expect(
      codes([spec, requirement, subject({ pv_group: { s1: "1" } })]),
    ).toEqual(["pv-group-unknown-group"]);
    // specializace bez program_req nemá žádné skupiny
    expect(codes([spec, subject()])).toEqual(["pv-group-unknown-group"]);
  });

  it("skupina doporucene není chyba, klíč ale musí být existující specializace", () => {
    expect(RECOMMENDED_PV_GROUP).toBe("doporucene");
    expect(
      codes([spec, requirement, subject({ pv_group: { s1: "doporucene" } })]),
    ).toEqual([]);
    // i u specializace bez program_req
    expect(codes([spec, subject({ pv_group: { s1: "doporucene" } })])).toEqual(
      [],
    );
    expect(
      codes([
        spec,
        requirement,
        subject({ pv_group: { s1: 1, m9: "doporucene" } }),
      ]),
    ).toEqual(["pv-group-unknown-spec"]);
    // jiný text, ani jiná velikost písmen, výjimku nemá
    expect(
      codes([spec, requirement, subject({ pv_group: { s1: "Doporucene" } })]),
    ).toEqual(["pv-group-unknown-group"]);
  });

  it("zdroj i cíl hrany musí být v nodes", () => {
    expect(
      validateStudyData(
        [spec, requirement, subject()],
        [
          link,
          { source: "NXXX000", target: "s1", value: 1 },
          { source: "NTST001", target: "s9", value: 1 },
          { source: "NXXX000", target: "s9", value: 1 },
        ],
      ).map((problem) => [problem.code, problem.nodeId, problem.spec]),
    ).toEqual([
      ["link-unknown-source", "NXXX000", "s1"],
      ["link-unknown-target", "NTST001", "s9"],
      ["link-unknown-source", "NXXX000", "s9"],
      ["link-unknown-target", "NXXX000", "s9"],
    ]);
  });

  it("credits musí být nezáporné číslo", () => {
    expect(codes([spec, requirement, subject({ credits: -1 })])).toEqual([
      "credits-invalid",
    ]);
    expect(codes([spec, requirement, subject({ credits: NaN })])).toEqual([
      "credits-invalid",
    ]);
  });

  it("bez hran kontroluje jen uzly", () => {
    expect(validateStudyData([spec, requirement, subject()])).toEqual([]);
  });
});

describe("indexNodes a pvGroupOf", () => {
  it("při duplicitních id se chová jako starý kód", () => {
    const nodes = parseNodes([
      {
        id: "s1",
        label: "První",
        group: "spec",
        study_type: "bakalarske",
        color: "#000",
        radius: 40,
      },
      {
        id: "s1",
        label: "Druhá",
        group: "spec",
        study_type: "bakalarske",
        color: "#000",
        radius: 40,
      },
      {
        id: "NTST001",
        label: "NTST001 První",
        group: "subj",
        radius: 8,
        shared_count: 1,
        course_type: "mandatory",
        mandatory_in: ["s1"],
        elective_in: [],
        credits: 5,
        semester: "zimní",
      },
      {
        id: "NTST001",
        label: "NTST001 Druhý",
        group: "subj",
        radius: 8,
        shared_count: 1,
        course_type: "mandatory",
        mandatory_in: ["s1"],
        elective_in: [],
        credits: 5,
        semester: "zimní",
      },
    ]);
    const index = indexNodes(nodes);
    expect(index.specs).toHaveLength(2);
    expect(index.specById.get("s1")?.label).toBe("První"); // SPECS.find
    expect(index.subjectById.get("NTST001")?.label).toBe("NTST001 Druhý"); // byId[id] = s
    expect(index.subjectById.get("NXXX000")).toBeUndefined();
    expect(index.requirementBySpec.get("constructor")).toBeUndefined();
  });

  it("pvGroupOf vrací skupinu předmětu ve specializaci", () => {
    const [withGroups, withoutGroups] = parseNodes([
      {
        id: "NTST001",
        label: "NTST001 Test",
        group: "subj",
        radius: 8,
        shared_count: 3,
        course_type: "elective",
        mandatory_in: [],
        elective_in: ["s4", "m1", "s1"],
        credits: 5,
        pv_group: { s4: 0, m1: "doporucene", s1: "alt1" },
        semester: "oba",
      },
      {
        id: "NTST002",
        label: "NTST002 Test",
        group: "subj",
        radius: 8,
        shared_count: 1,
        course_type: "mandatory",
        mandatory_in: ["s1"],
        elective_in: [],
        credits: 5,
        semester: "letní",
      },
    ]) as [SubjectNode, SubjectNode];
    expect(pvGroupOf(withGroups, "s4")).toBe(0);
    expect(pvGroupOf(withGroups, "m1")).toBe("doporucene");
    expect(pvGroupOf(withGroups, "s1")).toBe("alt1");
    expect(pvGroupOf(withGroups, "s2")).toBeUndefined();
    expect(pvGroupOf(withGroups, "toString")).toBeUndefined();
    expect(pvGroupOf(withoutGroups, "s1")).toBeUndefined();
  });
});

describe("chybná data", () => {
  const validSubject = {
    id: "NTST001",
    label: "NTST001 Test",
    group: "subj",
    radius: 8,
    shared_count: 1,
    course_type: "elective",
    mandatory_in: [],
    elective_in: ["s1"],
    credits: 5,
    pv_group: { s1: 1 },
    semester: "zimní",
  };
  const validSpec = {
    id: "s1",
    label: "Obecná informatika",
    group: "spec",
    study_type: "bakalarske",
    color: "#ff6b6b",
    radius: 40,
  };
  const validRequirement = {
    id: "req_s1",
    group: "program_req",
    spec: "s1",
    level: "bc",
    total_credits: 180,
    mandatory_credits: 116,
    pv_overall_min: 45,
    pv_groups: [{ group: 1, label: "Skupina 1", min_credits: 30 }],
  };

  function messageOf(run: () => unknown): string {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(StudyDataError);
      return (error as Error).message;
    }
    throw new Error("očekávána chyba");
  }

  it("vzorové uzly jsou samy o sobě platné", () => {
    expect(parseNodes([validSpec, validRequirement, validSubject])).toEqual([
      validSpec,
      validRequirement,
      validSubject,
    ]);
  });

  it("nodes.json musí být pole objektů se známou hodnotou group", () => {
    expect(messageOf(() => parseNodes({ nodes: [] }))).toBe(
      "nodes.json: očekáváno pole uzlů, nalezeno: objekt.",
    );
    expect(
      messageOf(() => parseNodes(null, "2025-2026/informatika/nodes.json")),
    ).toBe(
      "2025-2026/informatika/nodes.json: očekáváno pole uzlů, nalezeno: null.",
    );
    expect(messageOf(() => parseNodes([validSpec, "x"]))).toBe(
      'nodes.json: uzel č. 2: očekáván objekt, nalezeno: řetězec "x".',
    );
    expect(messageOf(() => parseNodes([{ ...validSpec, group: "obor" }]))).toBe(
      'nodes.json: uzel č. 1 (s1): pole "group" musí být jedna z hodnot spec, program_req, subj, nalezeno: řetězec "obor".',
    );
    expect(messageOf(() => parseNodes([{ id: "x" }]))).toContain(
      'pole "group" musí být jedna z hodnot spec, program_req, subj, nalezeno: hodnota chybí.',
    );
  });

  it("hlásí chybné pole specializace", () => {
    expect(
      messageOf(() => parseNodes([{ ...validSpec, study_type: "doktorske" }])),
    ).toBe(
      'nodes.json: uzel č. 1 (s1): pole "study_type" musí být jedna z hodnot bakalarske, magisterske, nalezeno: řetězec "doktorske".',
    );
    expect(messageOf(() => parseNodes([{ ...validSpec, id: 5 }]))).toBe(
      'nodes.json: uzel č. 1: pole "id" musí být řetězec, nalezeno: číslo 5.',
    );
    expect(
      messageOf(() => parseNodes([{ ...validSpec, radius: "40" }])),
    ).toContain('pole "radius" musí být číslo, nalezeno: řetězec "40".');
    expect(
      messageOf(() => parseNodes([{ ...validSpec, color: undefined }])),
    ).toContain('pole "color" musí být řetězec, nalezeno: hodnota chybí.');
  });

  it("hlásí chybné pole požadavků", () => {
    expect(
      messageOf(() => parseNodes([{ ...validRequirement, level: "phd" }])),
    ).toContain('pole "level" musí být jedna z hodnot bc, mgr');
    expect(
      messageOf(() => parseNodes([{ ...validRequirement, pv_groups: {} }])),
    ).toContain('pole "pv_groups" musí být pole, nalezeno: objekt.');
    expect(
      messageOf(() =>
        parseNodes([{ ...validRequirement, total_credits: null }]),
      ),
    ).toContain('pole "total_credits" musí být číslo, nalezeno: null.');
    expect(
      messageOf(() =>
        parseNodes([
          validSpec,
          {
            ...validRequirement,
            pv_groups: [{ group: true, label: "X", min_credits: 1 }],
          },
        ]),
      ),
    ).toBe(
      'nodes.json: uzel č. 2 (req_s1), pv_groups[0]: pole "group" musí být číslo nebo řetězec, nalezeno: true.',
    );
    expect(
      messageOf(() =>
        parseNodes([
          {
            ...validRequirement,
            pv_groups: [{ group: 1, label: "X", min_credits: "30" }],
          },
        ]),
      ),
    ).toContain('pv_groups[0]: pole "min_credits" musí být číslo');
    expect(
      messageOf(() =>
        parseNodes([
          {
            ...validRequirement,
            pv_groups: [
              { group: 1, label: "X", min_credits: 1, includes_groups: 2 },
            ],
          },
        ]),
      ),
    ).toContain('pole "includes_groups" musí být pole čísel nebo řetězců');
    expect(
      messageOf(() =>
        parseNodes([
          {
            ...validRequirement,
            pv_groups: [
              { group: 1, label: "X", min_credits: 1, mandatory_choice: 1 },
            ],
          },
        ]),
      ),
    ).toContain('pole "mandatory_choice" musí být true/false');
    expect(
      messageOf(() => parseNodes([{ ...validRequirement, pv_groups: [7] }])),
    ).toContain("pv_groups[0]: očekáván objekt, nalezeno: číslo 7.");
  });

  it("přijme nepovinné klíče, které zná starý kód a docs/data.md", () => {
    const [requirement] = parseNodes([
      {
        ...validRequirement,
        pv_overall_min: null,
        no_pdf_plan: true,
        pv_groups: [
          { group: "alt1", label: "Alternativa", mandatory_choice: true },
          {
            group: 0,
            label: "Povinně volitelné",
            min_credits: 38,
            includes_groups: [1, "alt1"],
          },
        ],
      },
    ]);
    expect(requirement).toEqual({
      ...validRequirement,
      pv_overall_min: null,
      no_pdf_plan: true,
      pv_groups: [
        {
          group: "alt1",
          label: "Alternativa",
          min_credits: null,
          mandatory_choice: true,
        },
        {
          group: 0,
          label: "Povinně volitelné",
          min_credits: 38,
          includes_groups: [1, "alt1"],
        },
      ],
    });

    const withoutOverall: Record<string, unknown> = { ...validRequirement };
    delete withoutOverall.pv_overall_min;
    expect(parseNodes([withoutOverall])[0]).toMatchObject({
      pv_overall_min: null,
    });
  });

  it("hlásí chybné pole předmětu", () => {
    expect(
      messageOf(() =>
        parseNodes([validSpec, { ...validSubject, credits: "5" }]),
      ),
    ).toBe(
      'nodes.json: uzel č. 2 (NTST001): pole "credits" musí být číslo, nalezeno: řetězec "5".',
    );
    expect(
      messageOf(() => parseNodes([{ ...validSubject, mandatory_in: "s1" }])),
    ).toContain('pole "mandatory_in" musí být pole řetězců');
    expect(
      messageOf(() => parseNodes([{ ...validSubject, elective_in: [1] }])),
    ).toContain('pole "elective_in" musí být pole řetězců, nalezeno: pole.');
    expect(
      messageOf(() => parseNodes([{ ...validSubject, course_type: "free" }])),
    ).toContain(
      'pole "course_type" musí být jedna z hodnot mandatory, elective, mixed',
    );
    expect(
      messageOf(() => parseNodes([{ ...validSubject, pv_group: [1] }])),
    ).toContain('pole "pv_group" musí být objekt, nalezeno: pole.');
    expect(
      messageOf(() =>
        parseNodes([{ ...validSubject, pv_group: { s1: null } }]),
      ),
    ).toContain(
      'pole "pv_group.s1" musí být číslo nebo řetězec, nalezeno: null.',
    );
    expect(
      messageOf(() => parseNodes([{ ...validSubject, semester: 1 }])),
    ).toContain('pole "semester" musí být řetězec, nalezeno: číslo 1.');
  });

  it("přijme záporné kredity a neznámý semestr (řeší validace / UI)", () => {
    const nodes = parseNodes([
      validSpec,
      validRequirement,
      { ...validSubject, credits: -3, semester: "blokově" },
    ]);
    expect(nodes[2]).toMatchObject({ credits: -3, semester: "blokově" });
    expect(validateStudyData(nodes).map((problem) => problem.code)).toEqual([
      "credits-invalid",
    ]);
  });

  it("neznámé klíče zahodí", () => {
    expect(parseNodes([{ ...validSpec, fx: 10, fy: 20 }])).toEqual([validSpec]);
  });

  it("links.json musí být pole objektů source/target/value", () => {
    expect(messageOf(() => parseLinks("x"))).toBe(
      'links.json: očekáváno pole hran, nalezeno: řetězec "x".',
    );
    expect(messageOf(() => parseLinks([null]))).toBe(
      "links.json: hrana č. 1: očekáván objekt, nalezeno: null.",
    );
    expect(
      messageOf(() =>
        parseLinks([
          { source: "NTST001", target: "s1", value: 1 },
          { source: "NTST001", target: 7, value: 1 },
        ]),
      ),
    ).toBe(
      'links.json: hrana č. 2: pole "target" musí být řetězec, nalezeno: číslo 7.',
    );
    expect(
      messageOf(() => parseLinks([{ source: "NTST001", target: "s1" }])),
    ).toContain('pole "value" musí být číslo, nalezeno: hodnota chybí.');
  });

  it("loadNodes / loadLinks hlásí chybu sítě, HTTP chybu, neplatný JSON i tvar", async () => {
    await expect(
      loadNodes("data/", "2026-2027", "fyzika", () =>
        Promise.reject(new TypeError("x")),
      ),
    ).rejects.toThrow(
      "Nepodařilo se načíst data (data/2026-2027/fyzika/nodes.json).",
    );

    // neexistující rok i neexistující obor existujícího roku
    await expect(
      loadNodes("data/", "1999-2000", "informatika", fetchFromRepo),
    ).rejects.toThrow(
      "Nepodařilo se načíst data (data/1999-2000/informatika/nodes.json): HTTP 404.",
    );
    await expect(
      loadNodes("data/", "2025-2026", "fyzika", fetchFromRepo),
    ).rejects.toThrow(
      "Nepodařilo se načíst data (data/2025-2026/fyzika/nodes.json): HTTP 404.",
    );

    await expect(
      loadLinks("data/", "2025-2026", "informatika", () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError("Unexpected token <")),
        }),
      ),
    ).rejects.toThrow(
      "Soubor data/2025-2026/informatika/links.json není platný JSON.",
    );

    const wrongShape = loadNodes("data/", "2026-2027", "matematika", () =>
      Promise.resolve(jsonResponse({ nodes: [] })),
    );
    await expect(wrongShape).rejects.toBeInstanceOf(StudyDataError);
    await expect(wrongShape).rejects.toThrow(
      "2026-2027/matematika/nodes.json: očekáváno pole uzlů, nalezeno: objekt.",
    );
    await expect(
      loadLinks("data/", "2026-2027", "matematika", () =>
        Promise.resolve(jsonResponse({ links: [] })),
      ),
    ).rejects.toThrow(
      "2026-2027/matematika/links.json: očekáváno pole hran, nalezeno: objekt.",
    );

    // s hranami selže celé načtení, i když nodes.json je v pořádku
    await expect(
      loadStudyData(
        "data/",
        "2026-2027",
        "ucitelstvi",
        { links: true },
        (url) =>
          url.endsWith("links.json")
            ? Promise.resolve(jsonResponse(null, 500))
            : fetchFromRepo(url),
      ),
    ).rejects.toThrow("HTTP 500");
  });
});

describe("public/data", () => {
  function listFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
      )
      .sort();
  }

  it("data/ obsahuje právě soubory roků a oborů z years.json a fields.json", () => {
    expect(listFiles(dataDir)).toEqual(
      [
        "years.json",
        ...realYears.map((year) => `${year}/fields.json`),
        ...realPairs.flatMap(({ name }) => [
          `${name}/nodes.json`,
          `${name}/links.json`,
        ]),
      ].sort(),
    );
  });

  it("je bajtově shodná kopie data/ (vyrábí ji scripts/sync-data.mjs)", () => {
    const files = listFiles(dataDir);
    expect(files).toContain("years.json");
    expect(listFiles(publicDataDir)).toEqual(files);
    for (const file of files) {
      const original = readFileSync(join(dataDir, file));
      const copy = readFileSync(join(publicDataDir, file));
      expect(copy.equals(original), `public/data/${file}`).toBe(true);
    }
  });
});
