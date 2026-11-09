/**
 * Datová vrstva: načtení seznamu roků, oborů, uzlů a hran, kontrola tvaru JSON,
 * indexy a validace odkazů. Čisté funkce bez Reactu a bez DOM – jediná vnější
 * závislost je `fetch`, který lze podstrčit parametrem.
 *
 * Výběr roku a oboru je přepis funkcí nactiRoky / vybranyRok / nactiObory /
 * vybranyObor ze starých stránek (kalkulačka/index.html, specializace/index.html).
 * Data oboru leží v `<rok>/<obor>/nodes.json` + `links.json`.
 */
import type {
  AcademicYear,
  CourseType,
  FieldId,
  ProgramRequirementNode,
  PvGroupDef,
  PvGroupId,
  RequirementLevel,
  SpecNode,
  StudyLink,
  StudyNode,
  StudyType,
  SubjectNode,
} from "./types";

// ---------------------------------------------------------------------------
// Konstanty
// ---------------------------------------------------------------------------

/**
 * Záložní seznam roků, když se years.json nepodaří načíst – `ROKY_FALLBACK` staré
 * kalkulačky.
 */
export const YEARS_FALLBACK: readonly AcademicYear[] = ["2026-2027"];

/**
 * `ROKY_FALLBACK` staré mapy (specializace/index.html). Liší se od kalkulačky –
 * ve staré mapě zůstal o rok starší.
 */
export const MAP_YEARS_FALLBACK: readonly AcademicYear[] = ["2025-2026"];

/** Platná položka years.json: RRRR-RRRR. */
export const YEAR_PATTERN = /^\d{4}-\d{4}$/;

/** Název URL parametru s akademickým rokem (`?rok=2025-2026`). */
export const YEAR_URL_PARAM = "rok";

/** Záložní seznam oborů, když se fields.json nepodaří načíst (starý `OBORY_FALLBACK`). */
export const FIELDS_FALLBACK: readonly FieldId[] = ["informatika"];

/** Platná položka fields.json – id oboru je zároveň název složky, proto jen bezpečné znaky. */
export const FIELD_PATTERN = /^[a-z0-9_-]+$/;

/** Název URL parametru s oborem (`?obor=fyzika`). */
export const FIELD_URL_PARAM = "obor";

/**
 * Hodnota `subj.pv_group[spec]` označující předmět doporučený ke specializaci, který
 * nepatří do žádné PV skupiny. Požadavky ji v `pv_groups` nedefinují; stará
 * kalkulačka takový předmět v plánu nezobrazí ani nezapočítá (`planFor` ho nenajde
 * v žádné skupině), mapa ho zobrazuje normálně (hrana v links.json, `elective_in`).
 * V datech: všechny roky a obory.
 */
export const RECOMMENDED_PV_GROUP = "doporucene";

/** Obor, který se vybere, když není v URL ani uložený (pokud ho rok nabízí). */
export const DEFAULT_FIELD: FieldId = "informatika";

export const STUDY_TYPES: readonly StudyType[] = ["bakalarske", "magisterske"];
export const REQUIREMENT_LEVELS: readonly RequirementLevel[] = ["bc", "mgr"];
export const COURSE_TYPES: readonly CourseType[] = [
  "mandatory",
  "elective",
  "mixed",
];

// ---------------------------------------------------------------------------
// Chyby a fetch
// ---------------------------------------------------------------------------

/** Chyba načtení nebo tvaru dat. `message` je česká a dá se zobrazit uživateli. */
export class StudyDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StudyDataError";
  }
}

/** Část `Response`, kterou datová vrstva potřebuje. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Podmnožina `fetch`; globální `fetch` jí vyhovuje. */
export type FetchFn = (
  url: string,
  init?: { cache?: RequestCache },
) => Promise<FetchResponse>;

const defaultFetch: FetchFn = (url, init) => fetch(url, init);

function withTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

/** URL souboru years.json. `baseUrl` je složka s daty (viz `dataBaseUrl()`). */
export function yearsUrl(baseUrl: string): string {
  return `${withTrailingSlash(baseUrl)}years.json`;
}

/** URL souboru fields.json daného roku. */
export function fieldsUrl(baseUrl: string, year: AcademicYear): string {
  return `${withTrailingSlash(baseUrl)}${year}/fields.json`;
}

/** URL souboru nodes.json daného roku a oboru. */
export function nodesUrl(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
): string {
  return `${withTrailingSlash(baseUrl)}${year}/${field}/nodes.json`;
}

/** URL souboru links.json daného roku a oboru. */
export function linksUrl(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
): string {
  return `${withTrailingSlash(baseUrl)}${year}/${field}/links.json`;
}

async function fetchJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  let response: FetchResponse;
  try {
    response = await fetchFn(url);
  } catch (cause) {
    throw new StudyDataError(`Nepodařilo se načíst data (${url}).`, { cause });
  }
  if (!response.ok) {
    throw new StudyDataError(
      `Nepodařilo se načíst data (${url}): HTTP ${response.status}.`,
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new StudyDataError(`Soubor ${url} není platný JSON.`, { cause });
  }
}

/** Z pole nechá jen řetězce vyhovující vzoru (pořadí zachováno); jinak prázdný seznam. */
function filterMatching(raw: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && pattern.test(item),
  );
}

/**
 * Načte seznam řetězců (years.json / fields.json) bez cache. `null` = soubor se
 * nepodařilo načíst, není to pole nebo v něm není žádná platná položka – volající
 * použije záložní seznam.
 */
async function fetchList(
  url: string,
  parse: (raw: unknown) => string[],
  fetchFn: FetchFn,
): Promise<string[] | null> {
  try {
    const response = await fetchFn(url, { cache: "no-store" });
    if (response.ok) {
      const items = parse(await response.json());
      if (items.length > 0) return items;
    }
  } catch {
    // ignoruj, použije se záložní seznam
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roky
// ---------------------------------------------------------------------------

/**
 * Z načteného years.json vybere platné roky (řetězce ve tvaru RRRR-RRRR, pořadí
 * zachováno). Pro cokoli jiného než pole vrací prázdný seznam.
 */
export function parseYears(raw: unknown): AcademicYear[] {
  return filterMatching(raw, YEAR_PATTERN);
}

/**
 * Načte seznam akademických roků (poslední = nejnovější/výchozí; starý `nactiRoky`).
 * Nikdy nevyhazuje: při chybě sítě, HTTP chybě, neplatném JSON nebo seznamu bez
 * platné položky vrátí kopii `fallback`.
 *
 * @param fallback záložní seznam – kalkulačka {@link YEARS_FALLBACK} (výchozí),
 *   mapa {@link MAP_YEARS_FALLBACK}
 */
export async function loadYears(
  baseUrl: string,
  fallback: readonly AcademicYear[] = YEARS_FALLBACK,
  fetchFn: FetchFn = defaultFetch,
): Promise<AcademicYear[]> {
  const years = await fetchList(yearsUrl(baseUrl), parseYears, fetchFn);
  return years ?? [...fallback];
}

/** Hodnota parametru `?rok=` z `location.search` (nebo `null`). */
export function yearFromSearch(search: string): string | null {
  return new URLSearchParams(search).get(YEAR_URL_PARAM);
}

/**
 * Vybere akademický rok (starý `vybranyRok`): rok z URL (pokud je v seznamu), jinak
 * uložený rok (pokud je v seznamu), jinak POSLEDNÍ rok seznamu.
 */
export function pickYear(
  years: readonly AcademicYear[],
  fromUrl: string | null | undefined,
  fromStorage: string | null | undefined,
): AcademicYear {
  if (fromUrl && years.includes(fromUrl)) return fromUrl;
  if (fromStorage && years.includes(fromStorage)) return fromStorage;
  // Prázdný seznam z loadYears nikdy nepřijde; záloha je tu jen kvůli typu.
  return years.at(-1) ?? YEARS_FALLBACK.at(-1) ?? "2026-2027";
}

// ---------------------------------------------------------------------------
// Obory
// ---------------------------------------------------------------------------

/**
 * Z načteného fields.json vybere platná id oborů (řetězce z malých písmen, číslic,
 * `_` a `-`; pořadí zachováno). Pro cokoli jiného než pole vrací prázdný seznam.
 */
export function parseFields(raw: unknown): FieldId[] {
  return filterMatching(raw, FIELD_PATTERN);
}

/**
 * Načte obory dostupné v daném roce z `<baseUrl><rok>/fields.json` (starý
 * `nactiObory`). Nikdy nevyhazuje: při chybě sítě, HTTP chybě, neplatném JSON nebo
 * seznamu bez platné položky vrátí kopii {@link FIELDS_FALLBACK}.
 */
export async function loadFields(
  baseUrl: string,
  year: AcademicYear,
  fetchFn: FetchFn = defaultFetch,
): Promise<FieldId[]> {
  const fields = await fetchList(
    fieldsUrl(baseUrl, year),
    parseFields,
    fetchFn,
  );
  return fields ?? [...FIELDS_FALLBACK];
}

/** Hodnota parametru `?obor=` z `location.search` (nebo `null`). */
export function fieldFromSearch(search: string): string | null {
  return new URLSearchParams(search).get(FIELD_URL_PARAM);
}

/**
 * Vybere obor (starý `vybranyObor`): obor z URL (pokud je v seznamu), jinak uložený
 * obor (pokud je v seznamu), jinak informatika (pokud je v seznamu), jinak PRVNÍ obor
 * seznamu.
 */
export function pickField(
  fields: readonly FieldId[],
  fromUrl: string | null | undefined,
  fromStorage: string | null | undefined,
): FieldId {
  if (fromUrl && fields.includes(fromUrl)) return fromUrl;
  if (fromStorage && fields.includes(fromStorage)) return fromStorage;
  if (fields.includes(DEFAULT_FIELD)) return DEFAULT_FIELD;
  // Prázdný seznam z loadFields nikdy nepřijde; záloha je tu jen kvůli typu.
  return fields[0] ?? DEFAULT_FIELD;
}

// ---------------------------------------------------------------------------
// Kontrola tvaru JSON
// ---------------------------------------------------------------------------

type RawObject = Record<string, unknown>;

function isRawObject(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Český popis toho, co v datech skutečně je (pro chybové hlášky). */
function describeValue(value: unknown): string {
  if (value === undefined) return "hodnota chybí";
  if (value === null) return "null";
  if (Array.isArray(value)) return "pole";
  if (typeof value === "object") return "objekt";
  if (typeof value === "string") return `řetězec ${JSON.stringify(value)}`;
  if (typeof value === "number") return `číslo ${value}`;
  return String(value);
}

function fail(where: string, problem: string): never {
  throw new StudyDataError(`${where}: ${problem}`);
}

function failField(
  where: string,
  key: string,
  expected: string,
  value: unknown,
): never {
  fail(
    where,
    `pole "${key}" musí být ${expected}, nalezeno: ${describeValue(value)}.`,
  );
}

function readString(object: RawObject, key: string, where: string): string {
  const value = object[key];
  if (typeof value !== "string") failField(where, key, "řetězec", value);
  return value;
}

function readNumber(object: RawObject, key: string, where: string): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failField(where, key, "číslo", value);
  }
  return value;
}

/** Číslo, nebo `null` když klíč chybí / je `null`. */
function readNullableNumber(
  object: RawObject,
  key: string,
  where: string,
): number | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  return readNumber(object, key, where);
}

function readOptionalBoolean(
  object: RawObject,
  key: string,
  where: string,
): boolean | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") failField(where, key, "true/false", value);
  return value;
}

function readStringArray(
  object: RawObject,
  key: string,
  where: string,
): string[] {
  const value = object[key];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    failField(where, key, "pole řetězců", value);
  }
  return [...value];
}

function readOneOf<T extends string>(
  object: RawObject,
  key: string,
  allowed: readonly T[],
  where: string,
): T {
  const value = object[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    failField(where, key, `jedna z hodnot ${allowed.join(", ")}`, value);
  }
  return match;
}

function isPvGroupId(value: unknown): value is PvGroupId {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function parsePvGroupDef(raw: unknown, where: string): PvGroupDef {
  if (!isRawObject(raw)) {
    fail(where, `očekáván objekt, nalezeno: ${describeValue(raw)}.`);
  }
  const group = raw.group;
  if (!isPvGroupId(group)) {
    failField(where, "group", "číslo nebo řetězec", group);
  }
  const def: PvGroupDef = {
    group,
    label: readString(raw, "label", where),
    min_credits: readNullableNumber(raw, "min_credits", where),
  };
  const includes = raw.includes_groups;
  if (includes !== undefined) {
    if (!Array.isArray(includes) || !includes.every(isPvGroupId)) {
      failField(where, "includes_groups", "pole čísel nebo řetězců", includes);
    }
    def.includes_groups = [...includes];
  }
  const mandatoryChoice = readOptionalBoolean(raw, "mandatory_choice", where);
  if (mandatoryChoice !== undefined) def.mandatory_choice = mandatoryChoice;
  return def;
}

function parseSpec(raw: RawObject, where: string): SpecNode {
  return {
    id: readString(raw, "id", where),
    label: readString(raw, "label", where),
    group: "spec",
    study_type: readOneOf(raw, "study_type", STUDY_TYPES, where),
    color: readString(raw, "color", where),
    radius: readNumber(raw, "radius", where),
  };
}

function parseRequirement(
  raw: RawObject,
  where: string,
): ProgramRequirementNode {
  const pvGroups = raw.pv_groups;
  if (!Array.isArray(pvGroups)) {
    failField(where, "pv_groups", "pole", pvGroups);
  }
  const node: ProgramRequirementNode = {
    id: readString(raw, "id", where),
    group: "program_req",
    spec: readString(raw, "spec", where),
    level: readOneOf(raw, "level", REQUIREMENT_LEVELS, where),
    total_credits: readNumber(raw, "total_credits", where),
    mandatory_credits: readNumber(raw, "mandatory_credits", where),
    pv_overall_min: readNullableNumber(raw, "pv_overall_min", where),
    pv_groups: pvGroups.map((def: unknown, index) =>
      parsePvGroupDef(def, `${where}, pv_groups[${index}]`),
    ),
  };
  const noPdfPlan = readOptionalBoolean(raw, "no_pdf_plan", where);
  if (noPdfPlan !== undefined) node.no_pdf_plan = noPdfPlan;
  return node;
}

/** `subj.pv_group` – mapa specializace → skupina; `undefined`, když klíč v JSON chybí. */
function readPvGroupMap(
  object: RawObject,
  where: string,
): Record<string, PvGroupId> | undefined {
  const value = object.pv_group;
  if (value === undefined) return undefined;
  if (!isRawObject(value)) failField(where, "pv_group", "objekt", value);
  const entries: [string, PvGroupId][] = [];
  for (const [specId, group] of Object.entries(value)) {
    if (!isPvGroupId(group)) {
      failField(where, `pv_group.${specId}`, "číslo nebo řetězec", group);
    }
    entries.push([specId, group]);
  }
  return Object.fromEntries(entries);
}

function parseSubject(raw: RawObject, where: string): SubjectNode {
  // Pořadí klíčů jako v JSON (pv_group před semester), aby se načtený uzel dal
  // porovnat se souborem i po JSON.stringify.
  const head = {
    id: readString(raw, "id", where),
    label: readString(raw, "label", where),
    group: "subj" as const,
    radius: readNumber(raw, "radius", where),
    shared_count: readNumber(raw, "shared_count", where),
    course_type: readOneOf(raw, "course_type", COURSE_TYPES, where),
    mandatory_in: readStringArray(raw, "mandatory_in", where),
    elective_in: readStringArray(raw, "elective_in", where),
    credits: readNumber(raw, "credits", where),
  };
  const pvGroup = readPvGroupMap(raw, where);
  const semester = readString(raw, "semester", where);
  return pvGroup === undefined
    ? { ...head, semester }
    : { ...head, pv_group: pvGroup, semester };
}

/**
 * Zkontroluje tvar načteného nodes.json a vrátí typované uzly (nové objekty jen se
 * známými klíči, pořadí zachováno). Při chybném tvaru vyhodí {@link StudyDataError}
 * s českou hláškou, která říká který uzel a které pole je špatně.
 *
 * Kontroluje jen TVAR (typy polí, povolené hodnoty výčtů). Odkazy mezi uzly a
 * nezápornost kreditů hlídá {@link validateStudyData}.
 *
 * @param source název souboru do chybové hlášky
 */
export function parseNodes(raw: unknown, source = "nodes.json"): StudyNode[] {
  if (!Array.isArray(raw)) {
    fail(source, `očekáváno pole uzlů, nalezeno: ${describeValue(raw)}.`);
  }
  return raw.map((item: unknown, index): StudyNode => {
    const position = `${source}: uzel č. ${index + 1}`;
    if (!isRawObject(item)) {
      fail(position, `očekáván objekt, nalezeno: ${describeValue(item)}.`);
    }
    const where =
      typeof item.id === "string" ? `${position} (${item.id})` : position;
    switch (item.group) {
      case "spec":
        return parseSpec(item, where);
      case "program_req":
        return parseRequirement(item, where);
      case "subj":
        return parseSubject(item, where);
      default:
        return failField(
          where,
          "group",
          "jedna z hodnot spec, program_req, subj",
          item.group,
        );
    }
  });
}

/**
 * Zkontroluje tvar načteného links.json a vrátí typované hrany. Při chybném tvaru
 * vyhodí {@link StudyDataError}.
 */
export function parseLinks(raw: unknown, source = "links.json"): StudyLink[] {
  if (!Array.isArray(raw)) {
    fail(source, `očekáváno pole hran, nalezeno: ${describeValue(raw)}.`);
  }
  return raw.map((item: unknown, index): StudyLink => {
    const where = `${source}: hrana č. ${index + 1}`;
    if (!isRawObject(item)) {
      fail(where, `očekáván objekt, nalezeno: ${describeValue(item)}.`);
    }
    return {
      source: readString(item, "source", where),
      target: readString(item, "target", where),
      value: readNumber(item, "value", where),
    };
  });
}

// ---------------------------------------------------------------------------
// Načtení uzlů a hran
// ---------------------------------------------------------------------------

/**
 * Načte a zkontroluje `<baseUrl><rok>/<obor>/nodes.json`. Vyhazuje
 * {@link StudyDataError} (síť, HTTP status, neplatný JSON, chybný tvar).
 */
export async function loadNodes(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
  fetchFn: FetchFn = defaultFetch,
): Promise<StudyNode[]> {
  const url = nodesUrl(baseUrl, year, field);
  return parseNodes(
    await fetchJson(url, fetchFn),
    `${year}/${field}/nodes.json`,
  );
}

/**
 * Načte a zkontroluje `<baseUrl><rok>/<obor>/links.json`. Vyhazuje
 * {@link StudyDataError}.
 */
export async function loadLinks(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
  fetchFn: FetchFn = defaultFetch,
): Promise<StudyLink[]> {
  const url = linksUrl(baseUrl, year, field);
  return parseLinks(
    await fetchJson(url, fetchFn),
    `${year}/${field}/links.json`,
  );
}

// ---------------------------------------------------------------------------
// Indexy
// ---------------------------------------------------------------------------

/** Uzly jednoho roku a oboru rozdělené podle druhu a zaindexované. */
export interface StudyIndex {
  /** Všechny uzly v pořadí souboru. */
  nodes: readonly StudyNode[];
  /** Specializace v pořadí souboru (starý `SPECS`). */
  specs: readonly SpecNode[];
  /** Předměty v pořadí souboru (starý `SUBJ`). */
  subjects: readonly SubjectNode[];
  /** Požadavky plánů v pořadí souboru. */
  requirements: readonly ProgramRequirementNode[];
  /** Specializace podle id (při duplicitě vyhrává první, jako `SPECS.find`). */
  specById: ReadonlyMap<string, SpecNode>;
  /** Předmět podle id (starý `byId`; při duplicitě vyhrává poslední). */
  subjectById: ReadonlyMap<string, SubjectNode>;
  /** Požadavky podle id specializace (starý `REQS`; při duplicitě vyhrává poslední). */
  requirementBySpec: ReadonlyMap<string, ProgramRequirementNode>;
}

/** Rozdělí uzly podle `group` a postaví vyhledávací mapy. */
export function indexNodes(nodes: readonly StudyNode[]): StudyIndex {
  const specs: SpecNode[] = [];
  const subjects: SubjectNode[] = [];
  const requirements: ProgramRequirementNode[] = [];
  const specById = new Map<string, SpecNode>();
  const subjectById = new Map<string, SubjectNode>();
  const requirementBySpec = new Map<string, ProgramRequirementNode>();

  for (const node of nodes) {
    switch (node.group) {
      case "spec":
        specs.push(node);
        if (!specById.has(node.id)) specById.set(node.id, node);
        break;
      case "subj":
        subjects.push(node);
        subjectById.set(node.id, node);
        break;
      case "program_req":
        requirements.push(node);
        requirementBySpec.set(node.spec, node);
        break;
    }
  }

  return {
    nodes,
    specs,
    subjects,
    requirements,
    specById,
    subjectById,
    requirementBySpec,
  };
}

/** PV skupina předmětu v dané specializaci (`subj.pv_group[spec]`), nebo `undefined`. */
export function pvGroupOf(
  subject: SubjectNode,
  specId: string,
): PvGroupId | undefined {
  const groups = subject.pv_group;
  if (!groups || !Object.hasOwn(groups, specId)) return undefined;
  return groups[specId];
}

// ---------------------------------------------------------------------------
// Data jednoho roku a oboru pohromadě
// ---------------------------------------------------------------------------

/** Načtená data jednoho akademického roku a oboru. */
export interface StudyData {
  year: AcademicYear;
  field: FieldId;
  nodes: readonly StudyNode[];
  index: StudyIndex;
}

/** Data roku a oboru včetně hran (pro mapu). */
export interface StudyDataWithLinks extends StudyData {
  links: readonly StudyLink[];
}

/**
 * Načte nodes.json (a s `links: true` souběžně i links.json) daného roku a oboru
 * a postaví index. Vyhazuje {@link StudyDataError}.
 */
export function loadStudyData(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
  options: { links: true },
  fetchFn?: FetchFn,
): Promise<StudyDataWithLinks>;
export function loadStudyData(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
  options?: { links?: boolean },
  fetchFn?: FetchFn,
): Promise<StudyData>;
export async function loadStudyData(
  baseUrl: string,
  year: AcademicYear,
  field: FieldId,
  options: { links?: boolean } = {},
  fetchFn: FetchFn = defaultFetch,
): Promise<StudyData | StudyDataWithLinks> {
  if (options.links) {
    const [nodes, links] = await Promise.all([
      loadNodes(baseUrl, year, field, fetchFn),
      loadLinks(baseUrl, year, field, fetchFn),
    ]);
    return { year, field, nodes, index: indexNodes(nodes), links };
  }
  const nodes = await loadNodes(baseUrl, year, field, fetchFn);
  return { year, field, nodes, index: indexNodes(nodes) };
}

// ---------------------------------------------------------------------------
// Validace (docs/data.md, oddíl „Validace")
// ---------------------------------------------------------------------------

export type StudyDataProblemCode =
  /** `program_req.spec` neukazuje na existující `spec` */
  | "requirement-unknown-spec"
  /** položka `subj.mandatory_in` není existující `spec` */
  | "mandatory-in-unknown-spec"
  /** položka `subj.elective_in` není existující `spec` */
  | "elective-in-unknown-spec"
  /** klíč v `subj.pv_group` není existující `spec` */
  | "pv-group-unknown-spec"
  /**
   * hodnota `pv_group[spec]` není v `pv_groups[].group` požadavků té specializace
   * (kromě {@link RECOMMENDED_PV_GROUP})
   */
  | "pv-group-unknown-group"
  /** `links[].source` není v nodes */
  | "link-unknown-source"
  /** `links[].target` není v nodes */
  | "link-unknown-target"
  /** `subj.credits` není nezáporné číslo */
  | "credits-invalid";

/** Jeden nález validace. */
export interface StudyDataProblem {
  code: StudyDataProblemCode;
  /** Id uzlu, kterého se nález týká (u hran `source` hrany). */
  nodeId: string;
  /** Id specializace, které se nález týká (u hran `target` hrany). */
  spec?: string;
  /** Skupina, která v požadavcích specializace chybí (jen `pv-group-unknown-group`). */
  group?: PvGroupId;
  /** Česká hláška. */
  message: string;
}

/**
 * Zkontroluje odkazy v datech podle docs/data.md. Nevyhazuje – vrací seznam nálezů
 * v pořadí uzlů v souboru a pak hran (prázdný seznam = data jsou v pořádku).
 *
 * Kontroly:
 * - každý `program_req.spec` ukazuje na existující `spec`
 * - každý `subj.mandatory_in[]`, `elective_in[]` a klíč v `pv_group` je existující `spec`
 * - hodnota `pv_group[spec]` odpovídá (`===`) některé `pv_groups[].group` požadavků
 *   té specializace (kontroluje se jen u existujících specializací). Výjimka je
 *   {@link RECOMMENDED_PV_GROUP} (`"doporucene"`): záměrné označení doporučeného
 *   předmětu mimo PV skupiny – stará kalkulačka ho v plánu vynechá, mapa ho ukazuje,
 *   proto to není chyba dat.
 * - `links[].source` / `target` existují v nodes
 * - `credits` je nezáporné číslo
 */
export function validateStudyData(
  nodes: readonly StudyNode[],
  links: readonly StudyLink[] = [],
): StudyDataProblem[] {
  const problems: StudyDataProblem[] = [];
  const { specById, requirementBySpec } = indexNodes(nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    if (node.group === "program_req") {
      if (!specById.has(node.spec)) {
        problems.push({
          code: "requirement-unknown-spec",
          nodeId: node.id,
          spec: node.spec,
          message: `Požadavky ${node.id}: specializace "${node.spec}" neexistuje.`,
        });
      }
      continue;
    }
    if (node.group !== "subj") continue;

    if (!Number.isFinite(node.credits) || node.credits < 0) {
      problems.push({
        code: "credits-invalid",
        nodeId: node.id,
        message: `Předmět ${node.id}: credits musí být nezáporné číslo, nalezeno ${node.credits}.`,
      });
    }
    for (const spec of node.mandatory_in) {
      if (!specById.has(spec)) {
        problems.push({
          code: "mandatory-in-unknown-spec",
          nodeId: node.id,
          spec,
          message: `Předmět ${node.id}: mandatory_in obsahuje neexistující specializaci "${spec}".`,
        });
      }
    }
    for (const spec of node.elective_in) {
      if (!specById.has(spec)) {
        problems.push({
          code: "elective-in-unknown-spec",
          nodeId: node.id,
          spec,
          message: `Předmět ${node.id}: elective_in obsahuje neexistující specializaci "${spec}".`,
        });
      }
    }
    for (const [spec, group] of Object.entries(node.pv_group ?? {})) {
      if (!specById.has(spec)) {
        problems.push({
          code: "pv-group-unknown-spec",
          nodeId: node.id,
          spec,
          message: `Předmět ${node.id}: klíč pv_group "${spec}" není existující specializace.`,
        });
        continue;
      }
      if (group === RECOMMENDED_PV_GROUP) continue;
      const defs = requirementBySpec.get(spec)?.pv_groups ?? [];
      if (!defs.some((def) => def.group === group)) {
        problems.push({
          code: "pv-group-unknown-group",
          nodeId: node.id,
          spec,
          group,
          message: `Předmět ${node.id}: skupina ${JSON.stringify(group)} z pv_group["${spec}"] není v pv_groups požadavků specializace ${spec}.`,
        });
      }
    }
  }

  for (const link of links) {
    if (!nodeIds.has(link.source)) {
      problems.push({
        code: "link-unknown-source",
        nodeId: link.source,
        spec: link.target,
        message: `Hrana ${link.source} → ${link.target}: "${link.source}" není v nodes.json.`,
      });
    }
    if (!nodeIds.has(link.target)) {
      problems.push({
        code: "link-unknown-target",
        nodeId: link.source,
        spec: link.target,
        message: `Hrana ${link.source} → ${link.target}: "${link.target}" není v nodes.json.`,
      });
    }
  }

  return problems;
}
