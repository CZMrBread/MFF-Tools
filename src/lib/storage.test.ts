import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FIELD_STORAGE_KEY,
  NO_SPEC_KEY_PART,
  STORAGE_NAMES,
  UNKNOWN_YEAR_SUFFIX,
  UNSUFFIXED_FIELD,
  YEAR_STORAGE_KEY,
  clearSelection,
  createMemoryStorage,
  loadProgress,
  loadSchedule,
  lsKey,
  readStoredField,
  readStoredYear,
  resetAllProgress,
  resolveStorage,
  saveProgress,
  saveSchedule,
  scheduleKey,
  writeStoredField,
  writeStoredYear,
} from "./storage";
import type { KeyValueStorage, Placements } from "./storage";

// ---------------------------------------------------------------------------
// Pomůcky
// ---------------------------------------------------------------------------

interface InspectableStorage extends KeyValueStorage {
  /** Obsah úložiště jako prostý objekt (klíče seřazené). */
  dump(): Record<string, string>;
}

/** Úložiště v paměti, do kterého se dá v testu nahlédnout. */
function inspectableStorage(
  initial: Record<string, string> = {},
): InspectableStorage {
  const items = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
    dump: () =>
      Object.fromEntries(
        [...items].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
  };
}

/** Úložiště, které při každém přístupu vyhodí výjimku (zakázané cookies, plná kvóta). */
const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
};

const YEAR = "2025-2026";
/** Informatika – klíče bez přípony oboru (stejné jako před zavedením oborů). */
const INFO = "informatika";

const FIELD_YEAR = "2026-2027";
/** Jiný obor než informatika – klíče mají příponu `_fyzika`. */
const FIELD = "fyzika";

/**
 * Přesně to, co stará kalkulačka zapíše do localStorage pro rok 2025-2026, obor
 * informatika, specializaci s1 (Bc.), dva splněné předměty, jeden „bez kreditů" a
 * rozvrh na 3 roky. Hodnoty jsou opsané ze starého kódu (saveState, saveSchedState,
 * změna roku). Klíče jsou stejné, jaké zapisovala verze před zavedením oborů –
 * uživatelé informatiky o postup nepřijdou.
 */
const OLD_FORMAT_SNAPSHOT: Record<string, string> = {
  mff_akademicky_rok: "2025-2026",
  "mff_spec_2025-2026": "s1",
  "mff_degree_2025-2026": "bakalarske",
  "mff_completed_2025-2026": '["NPRG030","NDMI002"]',
  "mff_nocredit_2025-2026": '["NTVY014"]',
  "mff_sched_placements_s1_2025-2026":
    '{"NPRG030":{"year":1,"semester":"zimní"},"NDMI002":{"year":2,"semester":"letní"}}',
  "mff_sched_years_s1_2025-2026": "3",
};

const SNAPSHOT_PLACEMENTS: Placements = {
  NPRG030: { year: 1, semester: "zimní" },
  NDMI002: { year: 2, semester: "letní" },
};

/**
 * Totéž pro jiný obor: rok 2026-2027, obor fyzika (zvolený v selectu, proto i
 * `mff_obor`), specializace m3 (Mgr.), rozvrh na 2 roky.
 */
const FIELD_FORMAT_SNAPSHOT: Record<string, string> = {
  mff_akademicky_rok: "2026-2027",
  mff_obor: "fyzika",
  "mff_spec_2026-2027_fyzika": "m3",
  "mff_degree_2026-2027_fyzika": "magisterske",
  "mff_completed_2026-2027_fyzika": '["NMET002","NMAF014","NMET005"]',
  "mff_nocredit_2026-2027_fyzika": '["NMET005"]',
  "mff_sched_placements_m3_2026-2027_fyzika":
    '{"NMET002":{"year":1,"semester":"zimní"},"NMAF014":{"year":1,"semester":"letní"}}',
  "mff_sched_years_m3_2026-2027_fyzika": "2",
};

const FIELD_SNAPSHOT_PLACEMENTS: Placements = {
  NMET002: { year: 1, semester: "zimní" },
  NMAF014: { year: 1, semester: "letní" },
};

// ---------------------------------------------------------------------------
// Klíče
// ---------------------------------------------------------------------------

describe("klíče", () => {
  it("lsKey pro informatiku = název + '_' + rok (bez přípony oboru)", () => {
    expect(UNSUFFIXED_FIELD).toBe("informatika");
    expect(lsKey("mff_spec", "2025-2026", "informatika")).toBe(
      "mff_spec_2025-2026",
    );
    expect(lsKey("mff_completed", "2024-2025", "informatika")).toBe(
      "mff_completed_2024-2025",
    );
    expect(lsKey(STORAGE_NAMES.spec, YEAR, INFO)).toBe("mff_spec_2025-2026");
    expect(lsKey(STORAGE_NAMES.degree, YEAR, INFO)).toBe(
      "mff_degree_2025-2026",
    );
    expect(lsKey(STORAGE_NAMES.completed, YEAR, INFO)).toBe(
      "mff_completed_2025-2026",
    );
    expect(lsKey(STORAGE_NAMES.noCredit, YEAR, INFO)).toBe(
      "mff_nocredit_2025-2026",
    );
  });

  it("lsKey pro jiný obor = název + '_' + rok + '_' + obor", () => {
    expect(lsKey("mff_spec", "2026-2027", "fyzika")).toBe(
      "mff_spec_2026-2027_fyzika",
    );
    expect(lsKey("mff_degree", "2026-2027", "matematika")).toBe(
      "mff_degree_2026-2027_matematika",
    );
    expect(lsKey("mff_completed", "2026-2027", "ucitelstvi")).toBe(
      "mff_completed_2026-2027_ucitelstvi",
    );
    expect(lsKey("mff_nocredit", "2026-2027", "novy-obor_2")).toBe(
      "mff_nocredit_2026-2027_novy-obor_2",
    );
    // porovnává se přesně s "informatika"
    expect(lsKey("mff_spec", YEAR, "Informatika")).toBe(
      "mff_spec_2025-2026_Informatika",
    );
  });

  it("bez oboru nemá klíč příponu oboru (starý kód: AKTUALNI_OBOR && …)", () => {
    expect(lsKey("mff_spec", YEAR, null)).toBe("mff_spec_2025-2026");
    expect(lsKey("mff_spec", YEAR, "")).toBe("mff_spec_2025-2026");
  });

  it("bez roku používá příponu 'neznamy' jako starý kód", () => {
    expect(UNKNOWN_YEAR_SUFFIX).toBe("neznamy");
    expect(lsKey("mff_spec", null, INFO)).toBe("mff_spec_neznamy");
    expect(lsKey("mff_spec", "", null)).toBe("mff_spec_neznamy");
    expect(lsKey("mff_spec", null, FIELD)).toBe("mff_spec_neznamy_fyzika");
  });

  it("scheduleKey = mff_sched_<druh>_<spec>_<rok>[_<obor>]", () => {
    expect(scheduleKey("placements", "s1", YEAR, INFO)).toBe(
      "mff_sched_placements_s1_2025-2026",
    );
    expect(scheduleKey("years", "m7", "2024-2025", INFO)).toBe(
      "mff_sched_years_m7_2024-2025",
    );
    expect(scheduleKey("placements", "m3", FIELD_YEAR, FIELD)).toBe(
      "mff_sched_placements_m3_2026-2027_fyzika",
    );
    expect(scheduleKey("years", "m13", FIELD_YEAR, "matematika")).toBe(
      "mff_sched_years_m13_2026-2027_matematika",
    );
    expect(NO_SPEC_KEY_PART).toBe("none");
    expect(scheduleKey("years", null, YEAR, INFO)).toBe(
      "mff_sched_years_none_2025-2026",
    );
    expect(scheduleKey("placements", "", null, null)).toBe(
      "mff_sched_placements_none_neznamy",
    );
    expect(scheduleKey("years", null, FIELD_YEAR, FIELD)).toBe(
      "mff_sched_years_none_2026-2027_fyzika",
    );
  });

  it("globální klíče roku a oboru se nemění", () => {
    expect(YEAR_STORAGE_KEY).toBe("mff_akademicky_rok");
    expect(FIELD_STORAGE_KEY).toBe("mff_obor");
  });
});

// ---------------------------------------------------------------------------
// Akademický rok a obor
// ---------------------------------------------------------------------------

describe("uložený akademický rok", () => {
  it("čte a zapisuje mff_akademicky_rok jako prostý text", () => {
    const storage = inspectableStorage();
    expect(readStoredYear(storage)).toBeNull();
    writeStoredYear(storage, "2024-2025");
    expect(storage.dump()).toEqual({ mff_akademicky_rok: "2024-2025" });
    expect(readStoredYear(storage)).toBe("2024-2025");
  });

  it("vrací surovou hodnotu – platnost ověřuje pickYear", () => {
    expect(
      readStoredYear(inspectableStorage({ mff_akademicky_rok: "cokoli" })),
    ).toBe("cokoli");
  });
});

describe("uložený obor", () => {
  it("čte a zapisuje mff_obor jako prostý text", () => {
    const storage = inspectableStorage();
    expect(readStoredField(storage)).toBeNull();
    writeStoredField(storage, "fyzika");
    expect(storage.dump()).toEqual({ mff_obor: "fyzika" });
    expect(readStoredField(storage)).toBe("fyzika");
    writeStoredField(storage, "informatika");
    expect(storage.dump()).toEqual({ mff_obor: "informatika" });
  });

  it("vrací surovou hodnotu – platnost ověřuje pickField", () => {
    expect(readStoredField(inspectableStorage({ mff_obor: "Cokoli!" }))).toBe(
      "Cokoli!",
    );
  });

  it("rok a obor jsou na sobě nezávislé klíče", () => {
    const storage = inspectableStorage();
    writeStoredYear(storage, "2026-2027");
    writeStoredField(storage, "matematika");
    expect(storage.dump()).toEqual({
      mff_akademicky_rok: "2026-2027",
      mff_obor: "matematika",
    });
  });
});

// ---------------------------------------------------------------------------
// Postup
// ---------------------------------------------------------------------------

describe("loadProgress / saveProgress", () => {
  it("načte hodnoty ve formátu, který zapisuje starý kód", () => {
    const storage = inspectableStorage(OLD_FORMAT_SNAPSHOT);
    expect(readStoredYear(storage)).toBe("2025-2026");
    expect(loadProgress(storage, YEAR, INFO)).toEqual({
      spec: "s1",
      degree: "bakalarske",
      completed: ["NPRG030", "NDMI002"],
      noCredit: ["NTVY014"],
    });
    expect(loadSchedule(storage, YEAR, INFO, "s1")).toEqual({
      placements: SNAPSHOT_PLACEMENTS,
      yearsCount: 3,
    });
    // čtení nic nezapisuje
    expect(storage.dump()).toEqual(OLD_FORMAT_SNAPSHOT);
  });

  it("zapíše bajtově totéž co starý kód", () => {
    const storage = inspectableStorage();
    writeStoredYear(storage, YEAR);
    saveProgress(storage, YEAR, INFO, {
      spec: "s1",
      degree: "bakalarske",
      completed: new Set(["NPRG030", "NDMI002"]),
      noCredit: new Set(["NTVY014"]),
    });
    saveSchedule(storage, YEAR, INFO, "s1", {
      placements: SNAPSHOT_PLACEMENTS,
      yearsCount: 3,
    });
    expect(storage.dump()).toEqual(OLD_FORMAT_SNAPSHOT);
  });

  it("načte hodnoty ve formátu starého kódu i pro jiný obor než informatiku", () => {
    const storage = inspectableStorage(FIELD_FORMAT_SNAPSHOT);
    expect(readStoredYear(storage)).toBe("2026-2027");
    expect(readStoredField(storage)).toBe("fyzika");
    expect(loadProgress(storage, FIELD_YEAR, FIELD)).toEqual({
      spec: "m3",
      degree: "magisterske",
      completed: ["NMET002", "NMAF014", "NMET005"],
      noCredit: ["NMET005"],
    });
    expect(loadSchedule(storage, FIELD_YEAR, FIELD, "m3")).toEqual({
      placements: FIELD_SNAPSHOT_PLACEMENTS,
      yearsCount: 2,
    });
    expect(storage.dump()).toEqual(FIELD_FORMAT_SNAPSHOT);
  });

  it("pro jiný obor zapíše bajtově totéž co starý kód", () => {
    const storage = inspectableStorage();
    writeStoredYear(storage, FIELD_YEAR);
    writeStoredField(storage, FIELD);
    saveProgress(storage, FIELD_YEAR, FIELD, {
      spec: "m3",
      degree: "magisterske",
      completed: new Set(["NMET002", "NMAF014", "NMET005"]),
      noCredit: new Set(["NMET005"]),
    });
    saveSchedule(storage, FIELD_YEAR, FIELD, "m3", {
      placements: FIELD_SNAPSHOT_PLACEMENTS,
      yearsCount: 2,
    });
    expect(storage.dump()).toEqual(FIELD_FORMAT_SNAPSHOT);
  });

  it("postup je oddělený po oborech; informatika čte klíče bez přípony", () => {
    const storage = inspectableStorage({
      ...FIELD_FORMAT_SNAPSHOT,
      // informatika téhož roku: stejná specializace m3, jiný postup
      "mff_spec_2026-2027": "m3",
      "mff_degree_2026-2027": "magisterske",
      "mff_completed_2026-2027": '["NSWI130"]',
      "mff_nocredit_2026-2027": "[]",
      "mff_sched_placements_m3_2026-2027":
        '{"NSWI130":{"year":2,"semester":"zimní"}}',
      "mff_sched_years_m3_2026-2027": "3",
    });
    const empty = { spec: null, degree: null, completed: [], noCredit: [] };

    expect(loadProgress(storage, FIELD_YEAR, INFO)).toEqual({
      spec: "m3",
      degree: "magisterske",
      completed: ["NSWI130"],
      noCredit: [],
    });
    expect(loadSchedule(storage, FIELD_YEAR, INFO, "m3")).toEqual({
      placements: { NSWI130: { year: 2, semester: "zimní" } },
      yearsCount: 3,
    });
    expect(loadProgress(storage, FIELD_YEAR, FIELD).completed).toEqual([
      "NMET002",
      "NMAF014",
      "NMET005",
    ]);
    expect(loadSchedule(storage, FIELD_YEAR, FIELD, "m3").yearsCount).toBe(2);
    // jiný obor ani jiný rok nic uloženého nemají
    expect(loadProgress(storage, FIELD_YEAR, "matematika")).toEqual(empty);
    expect(loadProgress(storage, YEAR, FIELD)).toEqual(empty);
    expect(loadSchedule(storage, FIELD_YEAR, "matematika", "m3")).toEqual({
      placements: {},
      yearsCount: null,
    });

    // zápis do jednoho oboru se druhého nedotkne
    const before = storage.dump();
    saveProgress(storage, FIELD_YEAR, "matematika", {
      spec: "s2",
      degree: "bakalarske",
      completed: ["NMAG111"],
      noCredit: [],
    });
    expect(storage.dump()).toEqual({
      ...before,
      "mff_spec_2026-2027_matematika": "s2",
      "mff_degree_2026-2027_matematika": "bakalarske",
      "mff_completed_2026-2027_matematika": '["NMAG111"]',
      "mff_nocredit_2026-2027_matematika": "[]",
    });
  });

  it("prázdné úložiště = prázdný postup", () => {
    expect(loadProgress(inspectableStorage(), YEAR, INFO)).toEqual({
      spec: null,
      degree: null,
      completed: [],
      noCredit: [],
    });
  });

  it("postup je oddělený po rocích", () => {
    const storage = inspectableStorage(OLD_FORMAT_SNAPSHOT);
    expect(loadProgress(storage, "2024-2025", INFO)).toEqual({
      spec: null,
      degree: null,
      completed: [],
      noCredit: [],
    });
    saveProgress(storage, "2024-2025", INFO, {
      spec: "m3",
      degree: "magisterske",
      completed: ["NSWI130"],
      noCredit: [],
    });
    expect(loadProgress(storage, "2024-2025", INFO)).toEqual({
      spec: "m3",
      degree: "magisterske",
      completed: ["NSWI130"],
      noCredit: [],
    });
    expect(storage.dump()).toEqual({
      ...OLD_FORMAT_SNAPSHOT,
      "mff_spec_2024-2025": "m3",
      "mff_degree_2024-2025": "magisterske",
      "mff_completed_2024-2025": '["NSWI130"]',
      "mff_nocredit_2024-2025": "[]",
    });
  });

  it("spec a degree zapisuje jen vyplněné, seznamy vždy (i prázdné)", () => {
    const storage = inspectableStorage({
      "mff_spec_2025-2026": "s2",
      "mff_degree_2025-2026": "bakalarske",
      "mff_completed_2025-2026": '["NPRG030"]',
    });
    saveProgress(storage, YEAR, INFO, {
      spec: null,
      degree: null,
      completed: [],
      noCredit: [],
    });
    expect(storage.dump()).toEqual({
      "mff_spec_2025-2026": "s2",
      "mff_degree_2025-2026": "bakalarske",
      "mff_completed_2025-2026": "[]",
      "mff_nocredit_2025-2026": "[]",
    });
  });

  it("zachová pořadí id a hodnoty zapisuje tak, jak je JSON.stringify vydá", () => {
    const storage = inspectableStorage();
    saveProgress(storage, YEAR, INFO, {
      spec: "m1",
      degree: "magisterske",
      completed: new Set(["NDMI010", "NAIL062", "NDMI010"]),
      noCredit: ["NTIN090"],
    });
    expect(storage.getItem("mff_completed_2025-2026")).toBe(
      '["NDMI010","NAIL062"]',
    );
    expect(storage.getItem("mff_nocredit_2025-2026")).toBe('["NTIN090"]');
    expect(loadProgress(storage, YEAR, INFO).completed).toEqual([
      "NDMI010",
      "NAIL062",
    ]);
  });

  it("poškozené hodnoty čte jako prázdné a nikdy nevyhodí", () => {
    const corruptLists = [
      "{oops",
      "",
      "null",
      "true",
      "42",
      '"NPRG030"',
      '{"NPRG030":true}',
      "[",
      "undefined",
    ];
    for (const raw of corruptLists) {
      const storage = inspectableStorage({
        "mff_completed_2025-2026": raw,
        "mff_nocredit_2025-2026": raw,
      });
      expect(loadProgress(storage, YEAR, INFO), raw).toEqual({
        spec: null,
        degree: null,
        completed: [],
        noCredit: [],
      });
    }
  });

  it("z pole vezme jen řetězce a odstraní duplicity", () => {
    const storage = inspectableStorage({
      "mff_completed_2025-2026":
        '[1,"NPRG030",null,"NPRG030",["NDMI002"],{"id":"x"},"NDMI002"]',
      "mff_nocredit_2025-2026": "[]",
    });
    expect(loadProgress(storage, YEAR, INFO).completed).toEqual([
      "NPRG030",
      "NDMI002",
    ]);
  });

  it("neznámý stupeň a prázdná specializace se čtou jako null", () => {
    for (const degree of ["bc", "mgr", "Bakalarske", "", "null"]) {
      expect(
        loadProgress(
          inspectableStorage({ "mff_degree_2025-2026": degree }),
          YEAR,
          INFO,
        ).degree,
        degree,
      ).toBeNull();
    }
    expect(
      loadProgress(
        inspectableStorage({ "mff_degree_2025-2026": "magisterske" }),
        YEAR,
        INFO,
      ).degree,
    ).toBe("magisterske");
    expect(
      loadProgress(inspectableStorage({ "mff_spec_2025-2026": "" }), YEAR, INFO)
        .spec,
    ).toBeNull();
    // existenci specializace v datech ověřuje volající, ne úložiště
    expect(
      loadProgress(
        inspectableStorage({ "mff_spec_2025-2026": "s99" }),
        YEAR,
        INFO,
      ).spec,
    ).toBe("s99");
  });

  it("bez roku čte a zapisuje pod příponou 'neznamy'", () => {
    const storage = inspectableStorage();
    saveProgress(storage, null, INFO, {
      spec: "s1",
      degree: "bakalarske",
      completed: ["NPRG030"],
      noCredit: [],
    });
    expect(storage.dump()).toEqual({
      mff_spec_neznamy: "s1",
      mff_degree_neznamy: "bakalarske",
      mff_completed_neznamy: '["NPRG030"]',
      mff_nocredit_neznamy: "[]",
    });
    expect(loadProgress(storage, null, INFO).completed).toEqual(["NPRG030"]);
  });
});

// ---------------------------------------------------------------------------
// Rozvrh
// ---------------------------------------------------------------------------

describe("loadSchedule / saveSchedule", () => {
  it("rozvrh je vázaný na specializaci i rok", () => {
    const storage = inspectableStorage(OLD_FORMAT_SNAPSHOT);
    const empty = { placements: {}, yearsCount: null };
    expect(loadSchedule(storage, YEAR, INFO, "s2")).toEqual(empty);
    expect(loadSchedule(storage, "2024-2025", INFO, "s1")).toEqual(empty);
    expect(loadSchedule(storage, YEAR, INFO, "s1").yearsCount).toBe(3);
  });

  it("bez specializace nic nečte ani nezapisuje", () => {
    const storage = inspectableStorage({
      "mff_sched_placements_none_2025-2026":
        '{"NPRG030":{"year":1,"semester":"zimní"}}',
      "mff_sched_years_none_2025-2026": "4",
    });
    const before = storage.dump();
    expect(loadSchedule(storage, YEAR, INFO, null)).toEqual({
      placements: {},
      yearsCount: null,
    });
    expect(loadSchedule(storage, YEAR, INFO, "")).toEqual({
      placements: {},
      yearsCount: null,
    });
    saveSchedule(storage, YEAR, INFO, null, {
      placements: SNAPSHOT_PLACEMENTS,
      yearsCount: 2,
    });
    expect(storage.dump()).toEqual(before);
  });

  it("zapisuje vždy oba klíče; neznámý počet ročníků jako text 'null'", () => {
    const storage = inspectableStorage();
    saveSchedule(storage, YEAR, INFO, "m2", {
      placements: {},
      yearsCount: null,
    });
    expect(storage.dump()).toEqual({
      "mff_sched_placements_m2_2025-2026": "{}",
      "mff_sched_years_m2_2025-2026": "null",
    });
    expect(loadSchedule(storage, YEAR, INFO, "m2")).toEqual({
      placements: {},
      yearsCount: null,
    });
  });

  it("do JSON dává jen year a semester, v tomto pořadí", () => {
    const storage = inspectableStorage();
    const placement = { semester: "letní", year: 2, note: "navíc" } as const;
    saveSchedule(storage, YEAR, INFO, "s1", {
      placements: { NDMI002: placement },
      yearsCount: 4,
    });
    expect(storage.getItem("mff_sched_placements_s1_2025-2026")).toBe(
      '{"NDMI002":{"year":2,"semester":"letní"}}',
    );
    expect(storage.getItem("mff_sched_years_s1_2025-2026")).toBe("4");
  });

  it("poškozená zařazení čte jako prázdná a nikdy nevyhodí", () => {
    for (const raw of [
      "{oops",
      "",
      "null",
      "[]",
      '"x"',
      "7",
      "false",
      '[{"year":1,"semester":"zimní"}]',
    ]) {
      const storage = inspectableStorage({
        "mff_sched_placements_s1_2025-2026": raw,
      });
      expect(loadSchedule(storage, YEAR, INFO, "s1").placements, raw).toEqual(
        {},
      );
    }
  });

  it("zahodí jen neplatná zařazení, platná ponechá", () => {
    const storage = inspectableStorage({
      "mff_sched_placements_s1_2025-2026": JSON.stringify({
        A: null,
        B: { year: "1", semester: "zimní" },
        C: { year: 1, semester: "oba" },
        D: { year: 0, semester: "letní" },
        E: { year: 2, semester: "letní", extra: 1 },
        F: 5,
        G: { year: 1.5, semester: "zimní" },
        H: { year: 12, semester: "zimní" },
        I: { semester: "zimní" },
        J: { year: 1 },
        K: [1, "zimní"],
      }),
    });
    expect(loadSchedule(storage, YEAR, INFO, "s1").placements).toEqual({
      E: { year: 2, semester: "letní" },
      H: { year: 12, semester: "zimní" },
    });
  });

  it("počet ročníků čte jako parseInt(…) || null", () => {
    const cases: [string, number | null][] = [
      ["3", 3],
      ["1", 1],
      ["8", 8],
      ["12", 12],
      ["3abc", 3],
      [" 4", 4],
      ["2.9", 2],
      ["", null],
      ["abc", null],
      ["null", null],
      ["NaN", null],
      ["0", null],
      ["-1", null],
    ];
    for (const [raw, expected] of cases) {
      const storage = inspectableStorage({
        "mff_sched_years_s1_2025-2026": raw,
      });
      expect(loadSchedule(storage, YEAR, INFO, "s1").yearsCount, raw).toBe(
        expected,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Resety
// ---------------------------------------------------------------------------

describe("clearSelection (Změnit obor)", () => {
  const otherKeys: Record<string, string> = {
    mff_akademicky_rok: "2025-2026",
    // rozvrh jiné specializace téhož roku
    "mff_sched_placements_s2_2025-2026":
      '{"NPRG031":{"year":1,"semester":"letní"}}',
    "mff_sched_years_s2_2025-2026": "3",
    // jiný rok
    "mff_spec_2024-2025": "s1",
    "mff_degree_2024-2025": "bakalarske",
    "mff_completed_2024-2025": '["NPRG030"]',
    "mff_nocredit_2024-2025": "[]",
    "mff_sched_placements_s1_2024-2025": "{}",
    "mff_sched_years_s1_2024-2025": "3",
    // cizí klíč
    theme: "dark",
  };

  it("smaže výběr, postup a rozvrh zvolené specializace v daném roce", () => {
    const storage = inspectableStorage({
      ...OLD_FORMAT_SNAPSHOT,
      ...otherKeys,
    });
    clearSelection(storage, YEAR, INFO, "s1");
    expect(storage.dump()).toEqual(inspectableStorage(otherKeys).dump());
    expect(loadProgress(storage, YEAR, INFO)).toEqual({
      spec: null,
      degree: null,
      completed: [],
      noCredit: [],
    });
  });

  it("bez zvolené specializace smaže jen čtyři klíče postupu", () => {
    const storage = inspectableStorage({
      ...OLD_FORMAT_SNAPSHOT,
      ...otherKeys,
    });
    clearSelection(storage, YEAR, INFO, null);
    expect(storage.dump()).toEqual(
      inspectableStorage({
        ...otherKeys,
        "mff_sched_placements_s1_2025-2026":
          OLD_FORMAT_SNAPSHOT["mff_sched_placements_s1_2025-2026"] ?? "",
        "mff_sched_years_s1_2025-2026": "3",
      }).dump(),
    );
  });

  it("na prázdném úložišti nic neudělá", () => {
    const storage = inspectableStorage();
    clearSelection(storage, YEAR, INFO, "s1");
    expect(storage.dump()).toEqual({});
  });

  /** Informatika téhož roku jako FIELD_FORMAT_SNAPSHOT, stejná specializace m3. */
  const sameYearInformatics: Record<string, string> = {
    "mff_spec_2026-2027": "m3",
    "mff_degree_2026-2027": "magisterske",
    "mff_completed_2026-2027": '["NSWI130"]',
    "mff_nocredit_2026-2027": "[]",
    "mff_sched_placements_m3_2026-2027": "{}",
    "mff_sched_years_m3_2026-2027": "2",
  };

  it("v jiném oboru smaže jen klíče toho oboru, informatika zůstane", () => {
    const storage = inspectableStorage({
      ...FIELD_FORMAT_SNAPSHOT,
      ...sameYearInformatics,
    });
    clearSelection(storage, FIELD_YEAR, FIELD, "m3");
    expect(storage.dump()).toEqual(
      inspectableStorage({
        mff_akademicky_rok: "2026-2027",
        mff_obor: "fyzika",
        ...sameYearInformatics,
      }).dump(),
    );
  });

  it("v informatice smaže jen klíče bez přípony, jiný obor zůstane", () => {
    const storage = inspectableStorage({
      ...FIELD_FORMAT_SNAPSHOT,
      ...sameYearInformatics,
    });
    clearSelection(storage, FIELD_YEAR, INFO, "m3");
    expect(storage.dump()).toEqual(
      inspectableStorage(FIELD_FORMAT_SNAPSHOT).dump(),
    );
  });
});

describe("resetAllProgress (zrušit vše splněné)", () => {
  it("přepíše postup prázdným, nic nemaže, výběr a počet ročníků zůstanou", () => {
    const storage = inspectableStorage(OLD_FORMAT_SNAPSHOT);
    resetAllProgress(
      storage,
      YEAR,
      INFO,
      { spec: "s1", degree: "bakalarske" },
      3,
    );
    expect(storage.dump()).toEqual({
      mff_akademicky_rok: "2025-2026",
      "mff_spec_2025-2026": "s1",
      "mff_degree_2025-2026": "bakalarske",
      "mff_completed_2025-2026": "[]",
      "mff_nocredit_2025-2026": "[]",
      "mff_sched_placements_s1_2025-2026": "{}",
      "mff_sched_years_s1_2025-2026": "3",
    });
  });

  it("před první návštěvou Rozvrhu zapíše počet ročníků jako 'null'", () => {
    const storage = inspectableStorage({
      "mff_spec_2025-2026": "m1",
      "mff_degree_2025-2026": "magisterske",
      "mff_completed_2025-2026": '["NDMI010"]',
      "mff_nocredit_2025-2026": '["NTIN090"]',
    });
    resetAllProgress(
      storage,
      YEAR,
      INFO,
      { spec: "m1", degree: "magisterske" },
      null,
    );
    expect(storage.dump()).toEqual({
      "mff_spec_2025-2026": "m1",
      "mff_degree_2025-2026": "magisterske",
      "mff_completed_2025-2026": "[]",
      "mff_nocredit_2025-2026": "[]",
      "mff_sched_placements_m1_2025-2026": "{}",
      "mff_sched_years_m1_2025-2026": "null",
    });
  });

  it("v jiném oboru přepíše jen klíče toho oboru", () => {
    const informatics = {
      "mff_completed_2026-2027": '["NSWI130"]',
      "mff_sched_placements_m3_2026-2027":
        '{"NSWI130":{"year":2,"semester":"zimní"}}',
    };
    const storage = inspectableStorage({
      ...FIELD_FORMAT_SNAPSHOT,
      ...informatics,
    });
    resetAllProgress(
      storage,
      FIELD_YEAR,
      FIELD,
      { spec: "m3", degree: "magisterske" },
      2,
    );
    expect(storage.dump()).toEqual(
      inspectableStorage({
        ...FIELD_FORMAT_SNAPSHOT,
        ...informatics,
        "mff_completed_2026-2027_fyzika": "[]",
        "mff_nocredit_2026-2027_fyzika": "[]",
        "mff_sched_placements_m3_2026-2027_fyzika": "{}",
      }).dump(),
    );
  });
});

// ---------------------------------------------------------------------------
// Nedostupné úložiště
// ---------------------------------------------------------------------------

describe("nedostupné úložiště", () => {
  it("čtení vrací prázdné hodnoty, zápis a mazání se tiše ignorují", () => {
    expect(readStoredYear(brokenStorage)).toBeNull();
    expect(loadProgress(brokenStorage, YEAR, INFO)).toEqual({
      spec: null,
      degree: null,
      completed: [],
      noCredit: [],
    });
    expect(loadSchedule(brokenStorage, YEAR, INFO, "s1")).toEqual({
      placements: {},
      yearsCount: null,
    });
    expect(() => {
      writeStoredYear(brokenStorage, YEAR);
      saveProgress(brokenStorage, YEAR, INFO, {
        spec: "s1",
        degree: "bakalarske",
        completed: ["NPRG030"],
        noCredit: [],
      });
      saveSchedule(brokenStorage, YEAR, INFO, "s1", {
        placements: SNAPSHOT_PLACEMENTS,
        yearsCount: 3,
      });
      clearSelection(brokenStorage, YEAR, INFO, "s1");
      resetAllProgress(
        brokenStorage,
        YEAR,
        INFO,
        { spec: "s1", degree: "bakalarske" },
        3,
      );
    }).not.toThrow();
  });

  it("resolveStorage vrátí náhradní úložiště v paměti", () => {
    const real = inspectableStorage();
    expect(resolveStorage(() => real)).toBe(real);

    const fallbacks = [
      resolveStorage(() => {
        throw new DOMException("denied", "SecurityError");
      }),
      resolveStorage(() => null),
      resolveStorage(() => undefined),
    ];
    for (const fallback of fallbacks) {
      writeStoredYear(fallback, YEAR);
      expect(readStoredYear(fallback)).toBe(YEAR);
    }
  });

  it("createMemoryStorage se chová jako Storage", () => {
    const storage = createMemoryStorage({ a: "1" });
    expect(storage.getItem("a")).toBe("1");
    expect(storage.getItem("b")).toBeNull();
    storage.setItem("b", "2");
    expect(storage.getItem("b")).toBe("2");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
    storage.removeItem("neexistuje");
  });
});

// ---------------------------------------------------------------------------
// Porovnání se skutečným starým kódem
// ---------------------------------------------------------------------------

/** Stará kalkulačka v kořeni repa – reference chování (do úklidu v kroku 7). */
const OLD_PAGE_PATH = fileURLToPath(
  new URL("../legacy/kalkulačka/index.html", import.meta.url),
);
const oldPageExists = existsSync(OLD_PAGE_PATH);

interface OldPlacement {
  year: number;
  semester: string;
}

interface OldState {
  year: string | null;
  field: string | null;
  spec: string | null;
  degree: string | null;
  completed: string[];
  noCredit: string[];
  placements: Record<string, OldPlacement>;
  yearsCount: number | null;
}

/** Funkce vyříznuté ze starého skriptu, běžící nad podstrčeným localStorage. */
interface OldCalculator {
  setState(state: OldState): void;
  getState(): Omit<OldState, "year" | "field">;
  lsKey(name: string): string;
  schedStorageKey(kind: string): string;
  saveState(): void;
  saveSchedState(): void;
  /** Start stránky: loadState() a pro uloženou specializaci loadSchedState(). */
  init(): void;
  resetProgress(): void;
  resetAllProgress(): void;
}

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from === -1 || to === -1) {
    throw new Error(`Ve starém kódu chybí úsek "${start}" … "${end}"`);
  }
  return source.slice(from, to);
}

/**
 * Vyřízne ze staré stránky stav a funkce pro localStorage (beze změny textu) a spustí
 * je nad daným úložištěm. `confirm` vždy potvrdí, vykreslování je vypnuté.
 */
function createOldCalculator(storage: KeyValueStorage): OldCalculator {
  const html = readFileSync(OLD_PAGE_PATH, "utf8");
  const stateAndStorage = sliceBetween(
    html,
    "let NODES = [];",
    "function goToStep(step){",
  );
  const resetProgressSource = sliceBetween(
    html,
    "function resetProgress(){",
    "// Zruší",
  );
  const resetAllSource = sliceBetween(
    html,
    "function resetAllProgress(){",
    "// ====",
  );
  const factory = new Function(
    "localStorage",
    "confirm",
    "goToStep",
    "renderDashboard",
    `${stateAndStorage}
${resetProgressSource}
${resetAllSource}
return {
  setState(s){
    AKTUALNI_ROK = s.year; AKTUALNI_OBOR = s.field;
    currentSpec = s.spec; currentDegree = s.degree;
    completed = new Set(s.completed); noCredit = new Set(s.noCredit);
    placements = s.placements; yearsCount = s.yearsCount;
  },
  getState(){
    return { spec: currentSpec, degree: currentDegree, completed: [...completed],
      noCredit: [...noCredit], placements, yearsCount };
  },
  init(){
    const saved = loadState();
    if (saved) { currentSpec = saved; loadSchedState(); }
  },
  lsKey, schedStorageKey, saveState, saveSchedState, resetProgress, resetAllProgress,
};`,
  );
  return factory(
    storage,
    () => true,
    () => undefined,
    () => undefined,
  ) as OldCalculator;
}

const EMPTY_OLD_STATE: OldState = {
  year: null,
  field: null,
  spec: null,
  degree: null,
  completed: [],
  noCredit: [],
  placements: {},
  yearsCount: null,
};

const SCENARIOS: {
  name: string;
  year: string;
  field: string;
  spec: string;
  degree: "bakalarske" | "magisterske";
  completed: string[];
  noCredit: string[];
  placements: Placements;
  yearsCount: number | null;
}[] = [
  {
    name: "informatika Bc. s rozvrhem",
    year: "2025-2026",
    field: "informatika",
    spec: "s1",
    degree: "bakalarske",
    completed: ["NPRG030", "NDMI002", "NTVY014"],
    noCredit: [],
    placements: {
      NPRG030: { year: 1, semester: "zimní" },
      NDMI002: { year: 1, semester: "zimní" },
      NTVY014: { year: 3, semester: "letní" },
    },
    yearsCount: 3,
  },
  {
    name: "informatika Mgr. s předměty bez kreditů, Rozvrh ještě neotevřen",
    year: "2024-2025",
    field: "informatika",
    spec: "m7",
    degree: "magisterske",
    completed: ["NPGR003"],
    noCredit: ["NPGR007", "NPGR010"],
    placements: {},
    yearsCount: null,
  },
  {
    name: "informatika, čerstvě zvolená specializace bez postupu",
    year: "2025-2026",
    field: "informatika",
    spec: "m3",
    degree: "magisterske",
    completed: [],
    noCredit: [],
    placements: {},
    yearsCount: 2,
  },
  {
    name: "fyzika Mgr. s rozvrhem a předmětem bez kreditů",
    year: "2026-2027",
    field: "fyzika",
    spec: "m3",
    degree: "magisterske",
    completed: ["NMET002", "NMAF014", "NMET005"],
    noCredit: ["NMET005"],
    placements: {
      NMET002: { year: 1, semester: "zimní" },
      NMAF014: { year: 1, semester: "letní" },
    },
    yearsCount: 2,
  },
  {
    name: "matematika Bc., Rozvrh ještě neotevřen",
    year: "2026-2027",
    field: "matematika",
    spec: "s8",
    degree: "bakalarske",
    completed: ["NMAG111"],
    noCredit: [],
    placements: {},
    yearsCount: null,
  },
  {
    name: "ucitelstvi Mgr. s rozvrhem na 5 let",
    year: "2026-2027",
    field: "ucitelstvi",
    spec: "m8",
    degree: "magisterske",
    completed: [],
    noCredit: [],
    placements: { NDIN007: { year: 2, semester: "zimní" } },
    yearsCount: 5,
  },
];

/** Jiný obor téhož roku, jehož klíče se operace nad `field` nesmí dotknout. */
function otherField(field: string): string {
  return field === "informatika" ? "fyzika" : "informatika";
}

describe.skipIf(!oldPageExists)("shoda se starou kalkulačkou", () => {
  it("klíče jsou stejné jako ze starých lsKey / schedStorageKey", () => {
    const old = createOldCalculator(inspectableStorage());
    const fields = ["informatika", "fyzika", "matematika", "ucitelstvi", null];
    const seen = new Set<string>();
    for (const year of ["2024-2025", "2025-2026", "2026-2027", null]) {
      for (const field of fields) {
        for (const spec of ["s1", "m7", "m13", null]) {
          old.setState({ ...EMPTY_OLD_STATE, year, field, spec });
          for (const name of Object.values(STORAGE_NAMES)) {
            expect(lsKey(name, year, field)).toBe(old.lsKey(name));
            seen.add(old.lsKey(name));
          }
          expect(scheduleKey("placements", spec, year, field)).toBe(
            old.schedStorageKey("placements"),
          );
          expect(scheduleKey("years", spec, year, field)).toBe(
            old.schedStorageKey("years"),
          );
        }
      }
    }
    // informatika a „bez oboru" sdílejí klíče, ostatní obory mají vlastní
    expect(seen.size).toBe(4 * 4 * 4);
    expect(seen).toContain("mff_spec_2026-2027");
    expect(seen).toContain("mff_spec_2026-2027_ucitelstvi");
  });

  it("starý kód zapíše přesně hodnoty z OLD_FORMAT_SNAPSHOT", () => {
    const storage = inspectableStorage({ mff_akademicky_rok: "2025-2026" });
    const old = createOldCalculator(storage);
    old.setState({
      year: YEAR,
      field: INFO,
      spec: "s1",
      degree: "bakalarske",
      completed: ["NPRG030", "NDMI002"],
      noCredit: ["NTVY014"],
      placements: {
        NPRG030: { year: 1, semester: "zimní" },
        NDMI002: { year: 2, semester: "letní" },
      },
      yearsCount: 3,
    });
    old.saveState();
    old.saveSchedState();
    expect(storage.dump()).toEqual(OLD_FORMAT_SNAPSHOT);
  });

  it("starý kód zapíše pro jiný obor přesně hodnoty z FIELD_FORMAT_SNAPSHOT", () => {
    // mff_akademicky_rok a mff_obor zapisují selecty roku a oboru, ne saveState
    const storage = inspectableStorage({
      mff_akademicky_rok: "2026-2027",
      mff_obor: "fyzika",
    });
    const old = createOldCalculator(storage);
    old.setState({
      year: FIELD_YEAR,
      field: FIELD,
      spec: "m3",
      degree: "magisterske",
      completed: ["NMET002", "NMAF014", "NMET005"],
      noCredit: ["NMET005"],
      placements: {
        NMET002: { year: 1, semester: "zimní" },
        NMAF014: { year: 1, semester: "letní" },
      },
      yearsCount: 2,
    });
    old.saveState();
    old.saveSchedState();
    expect(storage.dump()).toEqual(FIELD_FORMAT_SNAPSHOT);
  });

  it.each(SCENARIOS)("$name: starý zápis → nové čtení", (scenario) => {
    const storage = inspectableStorage();
    const old = createOldCalculator(storage);
    old.setState({ ...scenario, placements: { ...scenario.placements } });
    old.saveState();
    old.saveSchedState();

    expect(loadProgress(storage, scenario.year, scenario.field)).toEqual({
      spec: scenario.spec,
      degree: scenario.degree,
      completed: scenario.completed,
      noCredit: scenario.noCredit,
    });
    expect(
      loadSchedule(storage, scenario.year, scenario.field, scenario.spec),
    ).toEqual({
      placements: scenario.placements,
      yearsCount: scenario.yearsCount,
    });
  });

  it.each(SCENARIOS)(
    "$name: nový zápis je bajtově shodný se starým a starý kód ho přečte",
    (scenario) => {
      const oldStorage = inspectableStorage();
      const old = createOldCalculator(oldStorage);
      old.setState({ ...scenario, placements: { ...scenario.placements } });
      old.saveState();
      old.saveSchedState();

      const newStorage = inspectableStorage();
      saveProgress(newStorage, scenario.year, scenario.field, scenario);
      saveSchedule(
        newStorage,
        scenario.year,
        scenario.field,
        scenario.spec,
        scenario,
      );
      expect(newStorage.dump()).toEqual(oldStorage.dump());

      const reader = createOldCalculator(newStorage);
      reader.setState({
        ...EMPTY_OLD_STATE,
        year: scenario.year,
        field: scenario.field,
      });
      reader.init();
      expect(reader.getState()).toEqual({
        spec: scenario.spec,
        degree: scenario.degree,
        completed: scenario.completed,
        noCredit: scenario.noCredit,
        placements: scenario.placements,
        yearsCount: scenario.yearsCount,
      });
    },
  );

  it.each(SCENARIOS)(
    "$name: clearSelection smaže totéž co starý resetProgress",
    (scenario) => {
      const seed = (storage: InspectableStorage) => {
        // postup jiné specializace, jiného roku a jiného oboru, který musí zůstat
        const other = otherField(scenario.field);
        saveProgress(storage, scenario.year, other, {
          spec: scenario.spec,
          degree: scenario.degree,
          completed: ["NXXX002"],
          noCredit: ["NXXX002"],
        });
        saveSchedule(storage, scenario.year, other, scenario.spec, {
          placements: { NXXX002: { year: 1, semester: "zimní" } },
          yearsCount: 6,
        });
        saveSchedule(storage, scenario.year, scenario.field, "s5", {
          placements: { NAIL120: { year: 2, semester: "letní" } },
          yearsCount: 4,
        });
        saveProgress(storage, "2023-2024", scenario.field, {
          spec: scenario.spec,
          degree: scenario.degree,
          completed: ["NXXX001"],
          noCredit: [],
        });
        saveSchedule(storage, "2023-2024", scenario.field, scenario.spec, {
          placements: {},
          yearsCount: 3,
        });
        saveProgress(storage, scenario.year, scenario.field, scenario);
        saveSchedule(
          storage,
          scenario.year,
          scenario.field,
          scenario.spec,
          scenario,
        );
      };

      const oldStorage = inspectableStorage();
      seed(oldStorage);
      const old = createOldCalculator(oldStorage);
      old.setState({
        ...EMPTY_OLD_STATE,
        year: scenario.year,
        field: scenario.field,
      });
      old.init();
      old.resetProgress();

      const newStorage = inspectableStorage();
      seed(newStorage);
      clearSelection(newStorage, scenario.year, scenario.field, scenario.spec);

      expect(newStorage.dump()).toEqual(oldStorage.dump());
      expect(Object.keys(newStorage.dump())).not.toHaveLength(0);
    },
  );

  it.each(SCENARIOS)(
    "$name: resetAllProgress zapíše totéž co starý resetAllProgress",
    (scenario) => {
      const oldStorage = inspectableStorage();
      const other = otherField(scenario.field);
      saveProgress(oldStorage, scenario.year, other, {
        spec: scenario.spec,
        degree: scenario.degree,
        completed: ["NXXX002"],
        noCredit: ["NXXX002"],
      });
      saveSchedule(oldStorage, scenario.year, other, scenario.spec, {
        placements: { NXXX002: { year: 1, semester: "zimní" } },
        yearsCount: 6,
      });
      saveProgress(oldStorage, scenario.year, scenario.field, scenario);
      saveSchedule(
        oldStorage,
        scenario.year,
        scenario.field,
        scenario.spec,
        scenario,
      );
      const newStorage = inspectableStorage(oldStorage.dump());

      const old = createOldCalculator(oldStorage);
      old.setState({
        ...EMPTY_OLD_STATE,
        year: scenario.year,
        field: scenario.field,
      });
      old.init();
      old.resetAllProgress();

      const loaded = loadSchedule(
        newStorage,
        scenario.year,
        scenario.field,
        scenario.spec,
      );
      resetAllProgress(
        newStorage,
        scenario.year,
        scenario.field,
        { spec: scenario.spec, degree: scenario.degree },
        loaded.yearsCount,
      );

      expect(newStorage.dump()).toEqual(oldStorage.dump());
    },
  );
});
