/**
 * Klíče a formát hodnot v localStorage – bajtově kompatibilní se starou kalkulačkou
 * (kalkulačka/index.html: lsKey, saveState/loadState, schedStorageKey,
 * saveSchedState/loadSchedState, resetProgress, resetAllProgress) a s výběrem roku a
 * oboru na obou starých stránkách. Uživatelé mají uložený postup, proto se klíče ani
 * formát hodnot nesmí měnit.
 *
 * Funkce dostávají úložiště parametrem (bez DOM), takže se dají testovat s úložištěm
 * v paměti. Žádná funkce nevyhazuje: poškozené hodnoty se čtou jako prázdné a chyby
 * úložiště (zakázané cookies, plná kvóta) se tiše ignorují.
 *
 * Globální klíče:
 * - `mff_akademicky_rok` – vybraný akademický rok, např. `2026-2027`
 * - `mff_obor` – vybraný obor, např. `fyzika`
 *
 * Klíče per rok a obor – `lsKey(name, rok, obor)` = `name + '_' + rok + přípona`, kde
 * přípona je `'_' + obor`, jen pro informatiku je prázdná (informatika si nechává
 * původní klíče bez oboru, aby se neztratil dřívější postup):
 * - `mff_spec_<rok>[_<obor>]` – id specializace, např. `s1`
 * - `mff_degree_<rok>[_<obor>]` – `bakalarske` | `magisterske`
 * - `mff_completed_<rok>[_<obor>]` – JSON pole id splněných předmětů
 * - `mff_nocredit_<rok>[_<obor>]` – JSON pole id předmětů „bez kreditů"
 * - `mff_sched_placements_<spec>_<rok>[_<obor>]` – JSON
 *   `{ [idPředmětu]: { year, semester } }`, `semester` je `zimní` | `letní`
 * - `mff_sched_years_<spec>_<rok>[_<obor>]` – počet ročníků v rozvrhu jako text, např. `3`
 */
import type {
  AcademicYear,
  FieldId,
  PlacementSemester,
  StudyType,
} from "./types";

/** Část `Storage`, kterou helpery potřebují (`window.localStorage` jí vyhovuje). */
export type KeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/** Globální klíč s vybraným akademickým rokem. */
export const YEAR_STORAGE_KEY = "mff_akademicky_rok";

/** Globální klíč s vybraným oborem. */
export const FIELD_STORAGE_KEY = "mff_obor";

/** Přípona klíče, když rok není známý (starý kód: `AKTUALNI_ROK || 'neznamy'`). */
export const UNKNOWN_YEAR_SUFFIX = "neznamy";

/**
 * Obor, jehož klíče nemají příponu oboru – informatika měla postup uložený už před
 * zavedením oborů (starý kód: `AKTUALNI_OBOR !== 'informatika'`).
 */
export const UNSUFFIXED_FIELD: FieldId = "informatika";

/** Název části klíče, když není zvolená specializace (starý kód: `currentSpec || 'none'`). */
export const NO_SPEC_KEY_PART = "none";

/** Názvy klíčů per rok a obor (bez přípony). */
export const STORAGE_NAMES = {
  spec: "mff_spec",
  degree: "mff_degree",
  completed: "mff_completed",
  noCredit: "mff_nocredit",
} as const;

export type ScheduleKeyKind = "placements" | "years";

// ---------------------------------------------------------------------------
// Klíče
// ---------------------------------------------------------------------------

/**
 * Klíč vázaný na akademický rok a obor (starý `lsKey`):
 * `name + '_' + rok + (obor && obor !== 'informatika' ? '_' + obor : '')`.
 * Bez roku se použije přípona `neznamy`.
 */
export function lsKey(
  name: string,
  year: AcademicYear | null,
  field: FieldId | null,
): string {
  const fieldSuffix = field && field !== UNSUFFIXED_FIELD ? `_${field}` : "";
  return `${name}_${year || UNKNOWN_YEAR_SUFFIX}${fieldSuffix}`;
}

/**
 * Klíč rozvrhu vázaný na specializaci, rok a obor (starý `schedStorageKey`):
 * `lsKey('mff_sched_<kind>_<spec>', rok, obor)`.
 */
export function scheduleKey(
  kind: ScheduleKeyKind,
  spec: string | null,
  year: AcademicYear | null,
  field: FieldId | null,
): string {
  return lsKey(`mff_sched_${kind}_${spec || NO_SPEC_KEY_PART}`, year, field);
}

// ---------------------------------------------------------------------------
// Bezpečný přístup k úložišti
// ---------------------------------------------------------------------------

function readItem(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(storage: KeyValueStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // plná kvóta / zakázané úložiště – postup se jen neuloží
  }
}

function removeItem(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // viz writeItem
  }
}

/** Úložiště v paměti – pro testy a jako náhrada, když localStorage není dostupné. */
export function createMemoryStorage(
  initial: Readonly<Record<string, string>> = {},
): KeyValueStorage {
  const items = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/**
 * Vrátí úložiště z `getStorage`, nebo úložiště v paměti, když přístup k němu vyhodí
 * výjimku či vrátí prázdnou hodnotu (např. `() => window.localStorage` při zakázaných
 * cookies).
 */
export function resolveStorage(
  getStorage: () => KeyValueStorage | null | undefined,
): KeyValueStorage {
  try {
    return getStorage() ?? createMemoryStorage();
  } catch {
    return createMemoryStorage();
  }
}

// ---------------------------------------------------------------------------
// Akademický rok a obor
// ---------------------------------------------------------------------------

/** Uložený akademický rok (surová hodnota; platnost ověřuje `pickYear`). */
export function readStoredYear(storage: KeyValueStorage): string | null {
  return readItem(storage, YEAR_STORAGE_KEY);
}

/** Uloží vybraný akademický rok. */
export function writeStoredYear(
  storage: KeyValueStorage,
  year: AcademicYear,
): void {
  writeItem(storage, YEAR_STORAGE_KEY, year);
}

/** Uložený obor (surová hodnota; platnost pro daný rok ověřuje `pickField`). */
export function readStoredField(storage: KeyValueStorage): string | null {
  return readItem(storage, FIELD_STORAGE_KEY);
}

/** Uloží vybraný obor. */
export function writeStoredField(
  storage: KeyValueStorage,
  field: FieldId,
): void {
  writeItem(storage, FIELD_STORAGE_KEY, field);
}

// ---------------------------------------------------------------------------
// Postup v kalkulačce (starý saveState / loadState)
// ---------------------------------------------------------------------------

/** Postup uložený pro jeden akademický rok a obor. */
export interface StoredProgress {
  /** Id zvolené specializace; `null` když není uložená. Existenci v datech ověřuje volající. */
  spec: string | null;
  /** Zvolený stupeň studia; `null` když chybí nebo je hodnota neznámá. */
  degree: StudyType | null;
  /** Id splněných předmětů (bez duplicit, v uloženém pořadí). */
  completed: string[];
  /** Id předmětů „bez kreditů" (bez duplicit, v uloženém pořadí). */
  noCredit: string[];
}

/** Stav k uložení – množiny lze předat přímo (`Set<string>`). */
export interface ProgressToSave {
  spec: string | null;
  degree: StudyType | null;
  completed: Iterable<string>;
  noCredit: Iterable<string>;
}

function isStudyType(value: unknown): value is StudyType {
  return value === "bakalarske" || value === "magisterske";
}

/** JSON pole id → pole řetězců bez duplicit. Cokoli poškozeného = prázdné pole. */
function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [
    ...new Set(
      parsed.filter((item): item is string => typeof item === "string"),
    ),
  ];
}

/**
 * Načte postup pro daný rok a obor (starý `loadState`). Chybějící nebo poškozené
 * hodnoty se čtou jako prázdné; nikdy nevyhazuje.
 */
export function loadProgress(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
): StoredProgress {
  const read = (name: string) => readItem(storage, lsKey(name, year, field));
  const degree = read(STORAGE_NAMES.degree);
  return {
    spec: read(STORAGE_NAMES.spec) || null,
    degree: isStudyType(degree) ? degree : null,
    completed: parseIdList(read(STORAGE_NAMES.completed)),
    noCredit: parseIdList(read(STORAGE_NAMES.noCredit)),
  };
}

/**
 * Uloží postup pro daný rok a obor (starý `saveState`): `mff_spec` a `mff_degree` se
 * zapíší jen když jsou vyplněné (jinak zůstane dřívější hodnota), `mff_completed` a
 * `mff_nocredit` se zapíší vždy – i jako `[]`.
 */
export function saveProgress(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
  progress: ProgressToSave,
): void {
  const write = (name: string, value: string) =>
    writeItem(storage, lsKey(name, year, field), value);
  if (progress.spec) write(STORAGE_NAMES.spec, progress.spec);
  if (progress.degree) write(STORAGE_NAMES.degree, progress.degree);
  write(STORAGE_NAMES.completed, JSON.stringify([...progress.completed]));
  write(STORAGE_NAMES.noCredit, JSON.stringify([...progress.noCredit]));
}

// ---------------------------------------------------------------------------
// Rozvrh (starý saveSchedState / loadSchedState)
// ---------------------------------------------------------------------------

/** Zařazení předmětu do rozvrhu. */
export interface Placement {
  /** Ročník, 1 = první. */
  year: number;
  semester: PlacementSemester;
}

/** Zařazení podle id předmětu. */
export type Placements = Readonly<Record<string, Placement>>;

/** Rozvrh uložený pro jednu specializaci, rok a obor. */
export interface StoredSchedule {
  placements: Placements;
  /** Počet ročníků; `null` = neuloženo (volající použije výchozí 3 Bc / 2 Mgr). */
  yearsCount: number | null;
}

function isPlacementSemester(value: unknown): value is PlacementSemester {
  return value === "zimní" || value === "letní";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePlacements(raw: string | null): Placements {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const entries: [string, Placement][] = [];
  for (const [id, value] of Object.entries(parsed)) {
    if (!isRecord(value)) continue;
    const { year, semester } = value;
    if (
      typeof year === "number" &&
      Number.isInteger(year) &&
      year >= 1 &&
      isPlacementSemester(semester)
    ) {
      entries.push([id, { year, semester }]);
    }
  }
  return Object.fromEntries(entries);
}

function parseYearsCount(raw: string | null): number | null {
  if (!raw) return null;
  const count = parseInt(raw, 10);
  return Number.isNaN(count) || count < 1 ? null : count;
}

/**
 * Načte rozvrh specializace (starý `loadSchedState`). Bez specializace, při chybějící
 * nebo poškozené hodnotě vrací prázdný rozvrh; neplatná zařazení (ročník není celé
 * číslo ≥ 1, semestr není zimní/letní) se zahodí. Nikdy nevyhazuje.
 */
export function loadSchedule(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
  spec: string | null,
): StoredSchedule {
  if (!spec) return { placements: {}, yearsCount: null };
  return {
    placements: parsePlacements(
      readItem(storage, scheduleKey("placements", spec, year, field)),
    ),
    yearsCount: parseYearsCount(
      readItem(storage, scheduleKey("years", spec, year, field)),
    ),
  };
}

/**
 * Uloží rozvrh specializace (starý `saveSchedState`). Bez specializace nedělá nic.
 * Zapisuje vždy oba klíče; `yearsCount: null` se zapíše jako text `null` (stejně jako
 * `String(yearsCount)` ve starém kódu) a při načtení se čte jako „neuloženo".
 */
export function saveSchedule(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
  spec: string | null,
  schedule: StoredSchedule,
): void {
  if (!spec) return;
  // Pořadí klíčů { year, semester } jako ve starém kódu.
  const placements = Object.fromEntries(
    Object.entries(schedule.placements).map(([id, placement]) => [
      id,
      { year: placement.year, semester: placement.semester },
    ]),
  );
  writeItem(
    storage,
    scheduleKey("placements", spec, year, field),
    JSON.stringify(placements),
  );
  writeItem(
    storage,
    scheduleKey("years", spec, year, field),
    String(schedule.yearsCount),
  );
}

// ---------------------------------------------------------------------------
// Resety
// ---------------------------------------------------------------------------

/**
 * „Změnit obor" (starý `resetProgress` po potvrzení): pro daný rok a obor smaže
 * `mff_spec`, `mff_degree`, `mff_completed`, `mff_nocredit` a – pokud byla zvolená
 * specializace – i její rozvrh (`mff_sched_placements_<spec>`, `mff_sched_years_<spec>`).
 * Rozvrhy jiných specializací a data jiných roků a oborů zůstávají.
 */
export function clearSelection(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
  spec: string | null,
): void {
  for (const name of Object.values(STORAGE_NAMES)) {
    removeItem(storage, lsKey(name, year, field));
  }
  if (spec) {
    removeItem(storage, scheduleKey("placements", spec, year, field));
    removeItem(storage, scheduleKey("years", spec, year, field));
  }
}

/**
 * „Reset celkový (zrušit vše splněné)" (starý `resetAllProgress`): nic nemaže, jen
 * přepíše postup prázdným – `mff_sched_placements_<spec>` = `{}`, počet ročníků
 * zůstává, `mff_completed` = `[]`, `mff_nocredit` = `[]`; specializace a stupeň
 * zůstávají uložené.
 */
export function resetAllProgress(
  storage: KeyValueStorage,
  year: AcademicYear | null,
  field: FieldId | null,
  selection: { spec: string | null; degree: StudyType | null },
  yearsCount: number | null,
): void {
  saveSchedule(storage, year, field, selection.spec, {
    placements: {},
    yearsCount,
  });
  saveProgress(storage, year, field, {
    ...selection,
    completed: [],
    noCredit: [],
  });
}
