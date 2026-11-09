/**
 * Typy dat studijních plánů. Odvozené ze skutečných souborů data/years.json,
 * data/<rok>/fields.json a data/<rok>/<obor>/nodes.json + links.json (všechny roky
 * a obory v repu: 2024-2025 a 2025-2026 informatika; 2026-2027 fyzika, informatika,
 * matematika, ucitelstvi) a z toho, co čte starý kód (kalkulačka/index.html,
 * specializace/index.html).
 *
 * Klíče a hodnoty odpovídají JSON 1:1 (snake_case), aby se nová aplikace dala
 * porovnávat se starou. Runtime kontrolu tvaru dělá src/lib/data.ts.
 */

/** Akademický rok ve tvaru "RRRR-RRRR", např. "2025-2026" (položka years.json). */
export type AcademicYear = string;

/**
 * Id oboru – položka `<rok>/fields.json` a zároveň název složky s daty oboru
 * (`<rok>/<obor>/nodes.json`). V datech: "fyzika", "informatika", "matematika",
 * "ucitelstvi"; platné je jakékoli id z malých písmen, číslic, `_` a `-`.
 */
export type FieldId = string;

/** Názvy oborů pro UI (starý `OBORY_NAZVY`). */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  fyzika: "Fyzika",
  informatika: "Informatika",
  matematika: "Matematika",
  ucitelstvi: "Učitelství",
};

/**
 * Název oboru pro UI; obor bez názvu se zobrazí svým id (starý
 * `OBORY_NAZVY[o] || o`).
 */
export function fieldLabel(field: FieldId): string {
  return (Object.hasOwn(FIELD_LABELS, field) && FIELD_LABELS[field]) || field;
}

/** Stupeň studia specializace – `spec.study_type`. Stejné hodnoty se ukládají do `mff_degree`. */
export type StudyType = "bakalarske" | "magisterske";

/** Úroveň plánu – `program_req.level`. */
export type RequirementLevel = "bc" | "mgr";

/** `subj.course_type` – používá mapa pro barvu uzlu. */
export type CourseType = "mandatory" | "elective" | "mixed";

/** Semestr, do kterého lze předmět zařadit v Rozvrhu (hodnota `placements[id].semester`). */
export type PlacementSemester = "zimní" | "letní";

/** Hodnoty `subj.semester`, které se v datech skutečně vyskytují. */
export type KnownSemester = PlacementSemester | "oba";

/**
 * `subj.semester`. V datech jsou jen hodnoty {@link KnownSemester}; docs/data.md ale
 * připouští i jiný text a starý kód ho snáší (štítek „—", zařadit lze do obou semestrů),
 * proto je typ otevřený.
 */
export type SubjectSemester = KnownSemester | (string & {});

/**
 * Identifikátor PV skupiny – číslo (v datech 0–5) nebo text. V `pv_groups[].group`
 * se vyskytují texty "telocvik", "alt1", "alt2" (fyzika) a "pv", "M_obor", "F_obec",
 * "M_obec", "I_obec", "DG_obec" (ucitelstvi); v `subj.pv_group` navíc "doporucene"
 * (záměrné označení doporučeného předmětu, `RECOMMENDED_PV_GROUP` v data.ts;
 * požadavky žádné specializace ho nedefinují – kalkulačka takové předměty
 * nezobrazuje). Porovnává se striktně (`===`), tedy 1 a "1" jsou různé skupiny.
 */
export type PvGroupId = number | string;

/** Uzel specializace / studijního programu. */
export interface SpecNode {
  /** `s<n>` bakalářské, `m<n>` magisterské (v datech s1–s8, m1–m13). */
  id: string;
  label: string;
  group: "spec";
  study_type: StudyType;
  /** Barva uzlu v mapě, např. "#ff6b6b". */
  color: string;
  /** Poloměr uzlu v mapě (v datech vždy 40). */
  radius: number;
}

/** Definice jedné PV skupiny v `program_req.pv_groups`. */
export interface PvGroupDef {
  group: PvGroupId;
  label: string;
  /**
   * Minimum kreditů skupiny. V datech vždy číslo (0 = bez vlastního limitu). Starý kód
   * rozlišuje i chybějící hodnotu („bez limitu") – ta se načte jako `null`.
   */
  min_credits: number | null;
  /**
   * Nadřazená skupina započítává i kredity těchto podskupin. V datech jen
   * 2026-2027/matematika (pole čísel, např. `[1, 2, 3]`); jinde klíč chybí.
   */
  includes_groups?: PvGroupId[];
  /**
   * Skupina „povinného výběru". V datech jen s hodnotou `true` (informatika, všechny
   * roky); jinde klíč chybí.
   */
  mandatory_choice?: boolean;
}

/** Požadavky studijního plánu pro jednu specializaci. */
export interface ProgramRequirementNode {
  /** `req_<spec>`. */
  id: string;
  group: "program_req";
  /** Id specializace, ke které požadavky patří. */
  spec: string;
  level: RequirementLevel;
  total_credits: number;
  mandatory_credits: number;
  /**
   * Minimum za povinně volitelné celkem. V datech vždy číslo (i 0); chybějící
   * hodnota = `null` (starý kód pak řádek „PV celkem" nezobrazí).
   */
  pv_overall_min: number | null;
  pv_groups: PvGroupDef[];
  /**
   * Starý kód při pravdivé hodnotě zobrazí poznámku, že specializace nemá v PDF
   * samostatný plán. V současných datech se klíč nevyskytuje.
   */
  no_pdf_plan?: boolean;
}

/** Předmět. */
export interface SubjectNode {
  /** Kód předmětu ze SIS, např. "NAIL002". */
  id: string;
  /** Kód a název, např. "NAIL002 Neuronové sítě". */
  label: string;
  group: "subj";
  /** Poloměr uzlu v mapě (v datech 8 nebo 12). */
  radius: number;
  /** Počet specializací, se kterými je předmět spojen (pro mapu). */
  shared_count: number;
  course_type: CourseType;
  /** Specializace, kde je předmět povinný. */
  mandatory_in: string[];
  /** Specializace, kde je předmět povinně volitelný. */
  elective_in: string[];
  /** V datech vždy nezáporné celé číslo. */
  credits: number;
  /**
   * `{ "<id specializace>": <skupina> }`. Klíč v JSON chybí právě u předmětů, které
   * nejsou nikde povinně volitelné (`elective_in` je prázdné); jinak má stejné klíče
   * jako `elective_in`.
   */
  pv_group?: Record<string, PvGroupId>;
  semester: SubjectSemester;
}

/** Uzel z nodes.json – rozlišuje se podle `group`. */
export type StudyNode = SpecNode | ProgramRequirementNode | SubjectNode;

/** Hrana z links.json: předmět (`source`) → specializace (`target`). */
export interface StudyLink {
  source: string;
  target: string;
  /** V datech vždy 1. */
  value: number;
}
