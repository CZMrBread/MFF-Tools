/**
 * Výpočetní logika Kalkulačky kreditů – čisté funkce bez Reactu, bez DOM a bez
 * globálního stavu (množiny „splněno" / „bez kreditů" se předávají parametrem).
 *
 * Přepis výpočtů ze staré kalkulačky (kalkulačka/index.html ve stavu e0a6ccf:
 * planFor, credits, isMandatoryChoice, groupTitle, planTotals, groupBars,
 * ncCreditsIn, effMin, oborSuffix, renderDashboard, bar, renderSummary). Popis
 * algoritmů je v docs/algo.md; shodu se starým kódem hlídá src/lib/credits.test.ts
 * nad src/lib/__fixtures__/credits-legacy.json.
 *
 * Výpočty týkající se Rozvrhu a přechody stavu jsou v src/lib/schedule.ts.
 */
import { pvGroupOf } from "./data";
import type { StudyIndex } from "./data";
import { fieldLabel } from "./types";
import type {
  FieldId,
  ProgramRequirementNode,
  PvGroupDef,
  SpecNode,
  SubjectNode,
} from "./types";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

/** Je předmět s daným id „hotový"? V Kalkulačce = splněný, v Rozvrhu = zařazený. */
export type IsDone = (subjectId: string) => boolean;

/** Jedna PV skupina plánu se svými předměty. */
export interface PlanGroup {
  /** Definice skupiny z `program_req.pv_groups`. */
  def: PvGroupDef;
  /** Předměty skupiny (`subj.pv_group[spec] === def.group`), seřazené podle názvu. */
  subjects: readonly SubjectNode[];
  /**
   * Předměty, jejichž kredity se počítají do minima skupiny: vlastní předměty a
   * předměty podskupin z `def.includes_groups` (bez duplicit podle id). Bez
   * `includes_groups` je to totéž co `subjects`.
   */
  counted: readonly SubjectNode[];
  /** Názvy započítaných podskupin (v pořadí `includes_groups`); obvykle prázdné. */
  includedLabels: readonly string[];
}

/** Studijní plán jedné specializace (výsledek {@link planFor}). */
export interface StudyPlan {
  req: ProgramRequirementNode;
  /** Povinné předměty seřazené podle názvu. */
  mandatory: readonly SubjectNode[];
  /** PV skupiny v pořadí `req.pv_groups`; skupiny bez předmětů jsou vynechané. */
  groups: readonly PlanGroup[];
}

// ---------------------------------------------------------------------------
// Řazení a kredity
// ---------------------------------------------------------------------------

// Stejné porovnání jako `a.label.localeCompare(b.label, 'cs')` ve starém kódu.
const czechCollator = new Intl.Collator("cs");

/** Porovnání předmětů podle názvu českou kolací (`label.localeCompare(…, 'cs')`). */
export function compareSubjects(
  a: Pick<SubjectNode, "label">,
  b: Pick<SubjectNode, "label">,
): number {
  return czechCollator.compare(a.label, b.label);
}

/** Nové pole předmětů seřazené podle názvu (stabilně – při shodě zůstává pořadí vstupu). */
export function sortSubjects(subjects: readonly SubjectNode[]): SubjectNode[] {
  return [...subjects].sort(compareSubjects);
}

/** Kredity předmětu; chybějící nebo nulová hodnota = 0 (starý `credits(id)`). */
export function subjectCredits(subject: Pick<SubjectNode, "credits">): number {
  return subject.credits || 0;
}

/** Součet kreditů předmětů. */
export function sumCredits(subjects: readonly SubjectNode[]): number {
  return subjects.reduce((sum, subject) => sum + subjectCredits(subject), 0);
}

/** Součet kreditů těch předmětů ze seznamu, které jsou „hotové". */
export function earnedCredits(
  subjects: readonly SubjectNode[],
  isDone: IsDone,
): number {
  return sumCredits(subjects.filter((subject) => isDone(subject.id)));
}

/** Součet kreditů předmětů ze seznamu označených „bez kreditů" (starý `ncCreditsIn`). */
export function noCreditCredits(
  subjects: readonly SubjectNode[],
  noCredit: ReadonlySet<string>,
): number {
  return sumCredits(subjects.filter((subject) => noCredit.has(subject.id)));
}

/**
 * Efektivní minimum skupiny: `max(0, rawMin − kredity předmětů „bez kreditů")`.
 * `null` (skupina bez limitu) zůstává `null`.
 */
export function effMin(
  rawMin: number | null | undefined,
  subjects: readonly SubjectNode[],
  noCredit: ReadonlySet<string>,
): number | null {
  if (rawMin == null) return null;
  return Math.max(0, rawMin - noCreditCredits(subjects, noCredit));
}

/** `IsDone` nad množinou id (např. množinou splněných předmětů). */
export function doneIn(ids: ReadonlySet<string>): IsDone {
  return (subjectId) => ids.has(subjectId);
}

/** Předměty bez duplicit podle id – pozice prvního výskytu, objekt posledního. */
function uniqueById(subjects: readonly SubjectNode[]): SubjectNode[] {
  return [
    ...new Map(subjects.map((subject) => [subject.id, subject])).values(),
  ];
}

// ---------------------------------------------------------------------------
// Plán specializace
// ---------------------------------------------------------------------------

/**
 * Specializace nabízené po výběru stupně studia (starý `selectDegree`):
 * `spec.study_type === degree`, v pořadí dat.
 */
export function specsForDegree(
  specs: readonly SpecNode[],
  degree: string,
): SpecNode[] {
  return specs.filter((spec) => spec.study_type === degree);
}

/**
 * Sestaví plán z požadavků a seznamu všech předmětů (starý `planFor`):
 * - povinné = předměty s `mandatory_in` obsahujícím `specId`, seřazené podle názvu;
 * - skupiny = `req.pv_groups` v pořadí dat, každá s předměty, kde
 *   `pv_group[specId] === def.group` (striktně, 1 ≠ "1"), seřazenými podle názvu;
 *   skupiny bez předmětů se vynechají;
 * - `counted` = vlastní předměty + předměty skupin z `includes_groups` (jen přímo
 *   uvedené neprázdné skupiny, bez duplicit podle id).
 */
export function buildPlan(
  req: ProgramRequirementNode,
  subjects: readonly SubjectNode[],
  specId: string = req.spec,
): StudyPlan {
  const mandatory = sortSubjects(
    subjects.filter((subject) => subject.mandatory_in.includes(specId)),
  );
  const ownGroups = req.pv_groups
    .map((def) => ({
      def,
      subjects: sortSubjects(
        subjects.filter((subject) => pvGroupOf(subject, specId) === def.group),
      ),
    }))
    .filter((group) => group.subjects.length > 0);

  const groups = ownGroups.map((group): PlanGroup => {
    const included = (group.def.includes_groups ?? [])
      .map((id) => ownGroups.find((other) => other.def.group === id))
      .filter((other) => other !== undefined);
    return {
      def: group.def,
      subjects: group.subjects,
      counted: uniqueById(
        [group, ...included].flatMap((item) => item.subjects),
      ),
      includedLabels: included.map((item) => item.def.label),
    };
  });

  return { req, mandatory, groups };
}

/**
 * Plán specializace z indexu dat (starý `planFor(spec)`). Vrací `null`, když pro
 * specializaci nejsou v datech požadavky (starý kód by v takovém případě spadl;
 * volající má stejně jako starý `init` ověřit, že požadavky existují).
 */
export function planFor(
  index: Pick<StudyIndex, "subjects" | "requirementBySpec">,
  specId: string,
): StudyPlan | null {
  const req = index.requirementBySpec.get(specId);
  return req ? buildPlan(req, index.subjects, specId) : null;
}

/**
 * Všechny předměty plánu podle id (povinné, pak skupiny) – starý `validIds` /
 * `byIdSubj` v Rozvrhu. Jen tyto předměty lze mít zařazené v rozvrhu.
 */
export function planSubjectsById(plan: StudyPlan): Map<string, SubjectNode> {
  const byId = new Map<string, SubjectNode>();
  for (const subject of plan.mandatory) byId.set(subject.id, subject);
  for (const group of plan.groups) {
    for (const subject of group.subjects) byId.set(subject.id, subject);
  }
  return byId;
}

/** Je plán magisterský (`req.level === 'mgr'`)? Jen u něj lze dávat „bez kreditů". */
export function isMasterPlan(plan: StudyPlan): boolean {
  return plan.req.level === "mgr";
}

/** Stupeň studia podle plánu: „Magisterské studium" / „Bakalářské studium". */
export function degreeLabel(plan: StudyPlan): string {
  return isMasterPlan(plan) ? "Magisterské studium" : "Bakalářské studium";
}

/**
 * Přípona oboru za stupněm studia (starý `oborSuffix`): „ · Fyzika", u oboru bez
 * známého názvu „ · <id>"; bez oboru prázdný řetězec.
 */
export function fieldSuffix(field: FieldId | null | undefined): string {
  return field ? ` · ${fieldLabel(field)}` : "";
}

/**
 * Nadpis nad názvem specializace v Kalkulačce i v Rozvrhu (`#dash-degree`,
 * `#sched-degree`), např. „Bakalářské studium · Informatika".
 */
export function degreeHeading(
  plan: StudyPlan,
  field: FieldId | null | undefined,
): string {
  return degreeLabel(plan) + fieldSuffix(field);
}

/** Text štítku s kredity u předmětu, např. „5 kr.". */
export function creditsBadgeText(
  subject: Pick<SubjectNode, "credits">,
): string {
  return `${subjectCredits(subject)} kr.`;
}

/** Poznámka pod seznamem skupin, když má plán `no_pdf_plan`. */
export const NO_PDF_PLAN_NOTE =
  "Pozn.: pro tuto specializaci není v PDF samostatný studijní plán, povinně volitelné se zobrazují jako jeden seznam bez dílčích limitů.";

// ---------------------------------------------------------------------------
// Skupiny povinného výběru
// ---------------------------------------------------------------------------

/**
 * Je skupina „povinným výběrem"? `mandatory_choice === true`, nebo skupina
 * `"telocvik"`, nebo skupina odpovídající `/^alt\d*$/` (alt, alt1, alt2, …; číselné
 * id se převede na text, takže nikdy). Taková skupina má nadpis „Povinné — …", vlastní
 * minimum patří k podmínce „povinné", kredity se počítají do celku, ale ne do „PV
 * celkem".
 */
export function isMandatoryChoice(def: PvGroupDef): boolean {
  return (
    def.mandatory_choice === true ||
    def.group === "telocvik" ||
    /^alt\d*$/.test(String(def.group))
  );
}

/** Nadpis bloku skupiny: „Povinně volitelné — …", u povinného výběru „Povinné — …". */
export function groupTitle(def: PvGroupDef): string {
  return (
    (isMandatoryChoice(def) ? "Povinné — " : "Povinně volitelné — ") + def.label
  );
}

// ---------------------------------------------------------------------------
// Součty
// ---------------------------------------------------------------------------

/** Průběh jedné skupiny. */
export interface GroupProgress {
  group: PlanGroup;
  /** Získané kredity: hotové předměty z `group.counted`. */
  earned: number;
  /** Minimum z dat (`def.min_credits`); `null` = bez limitu, 0 = bez vlastního limitu. */
  rawMin: number | null;
  /** Efektivní minimum ({@link effMin} nad `group.counted`); `null` když `rawMin` je `null`. */
  min: number | null;
  /** Kredity předmětů „bez kreditů" v `group.counted` – o tolik je minimum snížené. */
  noCreditCredits: number;
  /** Minimum splněné: nepravda jen když je `min` kladné a `earned < min`. */
  satisfied: boolean;
  /** Má skupina pruh v souhrnu? Jen když je `rawMin` nenulové. */
  hasBar: boolean;
}

/** Průběh skupiny: získané kredity, minimum a jeho snížení o „bez kreditů". */
export function groupProgress(
  group: PlanGroup,
  isDone: IsDone,
  noCredit: ReadonlySet<string>,
): GroupProgress {
  const rawMin = group.def.min_credits;
  const earned = earnedCredits(group.counted, isDone);
  const min = effMin(rawMin, group.counted, noCredit);
  return {
    group,
    earned,
    rawMin,
    min,
    noCreditCredits: noCreditCredits(group.counted, noCredit),
    satisfied: !(min && earned < min),
    hasBar: Boolean(rawMin),
  };
}

/** Součty plánu (starý `planTotals` + součty povinných z `renderSummary`). */
export interface PlanTotals {
  /** Kredity hotových povinných předmětů. */
  mandEarned: number;
  /** Kredity všech povinných předmětů. */
  mandTotal: number;
  /** Skupiny povinného výběru ({@link isMandatoryChoice}) v pořadí plánu. */
  choiceGroups: readonly PlanGroup[];
  /** Ostatní (povinně volitelné) skupiny v pořadí plánu. */
  pvGroups: readonly PlanGroup[];
  /** Kredity hotových předmětů ze všech `pvGroups` (každý předmět jednou). */
  pvEarned: number;
  /**
   * Kredity hotových předmětů ze skupin povinného výběru – součet přes skupiny jejich
   * vlastních předmětů (`subjects`, ne `counted`).
   */
  choiceEarned: number;
  /** Součet `min_credits` skupin povinného výběru (nesnížený). */
  choiceMin: number;
  /** Kredity „bez kreditů" napříč všemi `pvGroups` – snížení „PV celkem". */
  ncTotal: number;
  /** Efektivní „PV celkem": `max(0, pv_overall_min − ncTotal)`; `null` bez `pv_overall_min`. */
  effOverall: number | null;
  /** `mandEarned + choiceEarned + pvEarned`. */
  totalEarned: number;
}

/**
 * Součty plánu. `isDone` určuje, co se počítá jako získané (Kalkulačka: splněné
 * předměty, Rozvrh: zařazené předměty); „bez kreditů" se bere vždy z `noCredit`.
 */
export function planTotals(
  plan: StudyPlan,
  isDone: IsDone,
  noCredit: ReadonlySet<string>,
): PlanTotals {
  const choiceGroups = plan.groups.filter((group) =>
    isMandatoryChoice(group.def),
  );
  const pvGroups = plan.groups.filter((group) => !isMandatoryChoice(group.def));
  const allPv = uniqueById(pvGroups.flatMap((group) => group.subjects));

  const mandEarned = earnedCredits(plan.mandatory, isDone);
  const mandTotal = sumCredits(plan.mandatory);
  const pvEarned = earnedCredits(allPv, isDone);
  const choiceEarned = choiceGroups.reduce(
    (sum, group) => sum + earnedCredits(group.subjects, isDone),
    0,
  );
  const choiceMin = choiceGroups.reduce(
    (sum, group) => sum + (group.def.min_credits || 0),
    0,
  );
  const ncTotal = noCreditCredits(allPv, noCredit);
  const overallMin = plan.req.pv_overall_min;
  const effOverall =
    overallMin != null ? Math.max(0, overallMin - ncTotal) : null;

  return {
    mandEarned,
    mandTotal,
    choiceGroups,
    pvGroups,
    pvEarned,
    choiceEarned,
    choiceMin,
    ncTotal,
    effOverall,
    totalEarned: mandEarned + choiceEarned + pvEarned,
  };
}

/** Souhrn plnění plánu – vše, co potřebuje panel „Kontrola plnění". */
export interface PlanSummary extends PlanTotals {
  req: ProgramRequirementNode;
  /** Průběh skupin povinného výběru (pořadí plánu). */
  choiceProgress: readonly GroupProgress[];
  /** Průběh povinně volitelných skupin (pořadí plánu). */
  pvProgress: readonly GroupProgress[];
  /**
   * Odhad volitelných kreditů: `total_credits − mandTotal − choiceMin − effOverall`
   * (`effOverall` `null` = 0). Zobrazuje se jen když je kladný.
   */
  structuralFree: number;
  /** Povinné: `mandTotal > 0`, všechny povinné hotové a minima povinného výběru splněná. */
  mandOk: boolean;
  /** Minima všech povinně volitelných skupin splněná. */
  groupsOk: boolean;
  /** „PV celkem" splněné (nebo plán `pv_overall_min` nemá). */
  overallOk: boolean;
  /** `totalEarned >= total_credits`. */
  totalOk: boolean;
  /** Všechny čtyři podmínky splněné. */
  fulfilled: boolean;
  /** Co zbývá, v pořadí: „povinné", „minima PV skupin", „PV celkem", „N kr. do T". */
  missing: readonly string[];
}

/** Souhrn plnění plánu (výpočetní část starého `renderSummary` / `renderSchedSummary`). */
export function planSummary(
  plan: StudyPlan,
  isDone: IsDone,
  noCredit: ReadonlySet<string>,
): PlanSummary {
  const totals = planTotals(plan, isDone, noCredit);
  const { req } = plan;
  const choiceProgress = totals.choiceGroups.map((group) =>
    groupProgress(group, isDone, noCredit),
  );
  const pvProgress = totals.pvGroups.map((group) =>
    groupProgress(group, isDone, noCredit),
  );

  const choiceOk = choiceProgress.every((progress) => progress.satisfied);
  const mandOk =
    totals.mandTotal > 0 && totals.mandEarned >= totals.mandTotal && choiceOk;
  const groupsOk = pvProgress.every((progress) => progress.satisfied);
  const overallOk =
    totals.effOverall == null || totals.pvEarned >= totals.effOverall;
  const totalOk = totals.totalEarned >= req.total_credits;

  const missing: string[] = [];
  if (!mandOk) missing.push("povinné");
  if (!groupsOk) missing.push("minima PV skupin");
  if (!overallOk) missing.push("PV celkem");
  if (!totalOk) {
    missing.push(
      `${req.total_credits - totals.totalEarned} kr. do ${req.total_credits}`,
    );
  }

  return {
    ...totals,
    req,
    choiceProgress,
    pvProgress,
    structuralFree:
      req.total_credits -
      totals.mandTotal -
      totals.choiceMin -
      (totals.effOverall || 0),
    mandOk,
    groupsOk,
    overallOk,
    totalOk,
    fulfilled: mandOk && groupsOk && overallOk && totalOk,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Pruh průběhu
// ---------------------------------------------------------------------------

/** Barevný stav pruhu: splněno / nezačato / aspoň 75 % / rozpracováno. */
export type ProgressTone = "done" | "empty" | "near" | "progress";

/** Barvy pruhu (`fill`) a textu „zbývá …" (`text`) podle stavu – hodnoty ze staré stránky. */
export const PROGRESS_COLORS: Readonly<
  Record<ProgressTone, { fill: string; text: string }>
> = {
  done: { fill: "#1f9d55", text: "#1f9d55" },
  empty: {
    fill: "var(--primary--primary-red)",
    text: "var(--primary--primary-red)",
  },
  near: { fill: "var(--col-mixed)", text: "#8a6d00" },
  progress: {
    fill: "var(--primary--primary-blue)",
    text: "var(--primary--primary-blue)",
  },
};

/** Model jednoho pruhu průběhu (starý `bar(label, earned, target)` bez HTML). */
export interface ProgressBar {
  earned: number;
  target: number | null;
  /** Procenta splnění 0–100 (nezaokrouhlená). */
  percent: number;
  /** Šířka výplně v procentech: jako `percent`, ale nezačatý pruh s cílem má 3. */
  widthPercent: number;
  /** Kolik kreditů zbývá (≥ 0); `null` bez cíle. */
  remaining: number | null;
  /** Cíl je dosažený (`earned >= target`). */
  done: boolean;
  tone: ProgressTone;
  /** Barva výplně (`PROGRESS_COLORS[tone].fill`). */
  fillColor: string;
  /** Barva textu „zbývá …" (`PROGRESS_COLORS[tone].text`). */
  textColor: string;
  /** Text vpravo: „12 / 110 kr.", bez cíle „12 kr.". */
  valueText: string;
  /** „zbývá 98", „✓ splněno", bez cíle prázdný řetězec (řádek se nevykreslí). */
  remainingText: string;
}

/**
 * Model pruhu průběhu. Hrany jako ve starém kódu:
 * - bez cíle nebo s cílem 0 je `percent` 100 při `earned > 0`, jinak 0;
 * - cíl 0 je vždy splněný (zelený), i když `earned` je 0 – šířka pak zůstává 0;
 * - nezačatý pruh s kladným cílem má šířku 3 %, aby byla vidět červená barva.
 */
export function progressBar(
  earned: number,
  target: number | null | undefined,
): ProgressBar {
  const percent = target
    ? Math.min((earned / target) * 100, 100)
    : earned > 0
      ? 100
      : 0;
  const remaining = target != null ? Math.max(0, target - earned) : null;
  const done = target != null && earned >= target;

  let tone: ProgressTone;
  if (done) tone = "done";
  else if (percent === 0) tone = "empty";
  else if (percent >= 75) tone = "near";
  else tone = "progress";

  let remainingText = "";
  if (remaining != null) {
    remainingText = remaining > 0 ? `zbývá ${remaining}` : "✓ splněno";
  }

  return {
    earned,
    target: target ?? null,
    percent,
    widthPercent: percent === 0 && target ? 3 : percent,
    remaining,
    done,
    tone,
    fillColor: PROGRESS_COLORS[tone].fill,
    textColor: PROGRESS_COLORS[tone].text,
    valueText: target != null ? `${earned} / ${target} kr.` : `${earned} kr.`,
    remainingText,
  };
}

// ---------------------------------------------------------------------------
// Souhrn: položky panelu „Kontrola plnění" a stavová hláška
// ---------------------------------------------------------------------------

/** Kde se souhrn zobrazuje – liší se textem hlášky a řádkem s odhadem volitelných. */
export type SummaryContext = "calculator" | "schedule";

/** Jedna položka panelu „Kontrola plnění", v pořadí vykreslení. */
export type SummaryItem =
  | { type: "section"; title: string }
  | {
      type: "bar";
      label: string;
      bar: ProgressBar;
      /** Pruh „Celkem kreditů" (starý obal `.total-line`). */
      total: boolean;
    }
  | {
      type: "note";
      /** `noCredit` = snížení „PV celkem", `freeElective` = odhad volitelných. */
      kind: "noCredit" | "freeElective";
      label: string;
      value: string;
    }
  | { type: "divider" };

/**
 * Položky panelu „Kontrola plnění" v pořadí, v jakém je vykresluje stará stránka:
 * oddíl „Povinné" (pruh povinných + pruhy skupin povinného výběru), oddíl
 * „Povinně volitelné — skupiny" (pruhy skupin s nenulovým minimem), oddíl
 * „PV celkem" (jen když plán má `pv_overall_min`; s poznámkou o snížení „bez
 * kreditů"), čára, pruh „Celkem kreditů" a – jen v Kalkulačce – odhad volitelných.
 *
 * Nadpis „Povinně volitelné — skupiny" se vykreslí jen tehdy, když pod ním je aspoň
 * jeden pruh.
 */
export function summaryItems(
  summary: PlanSummary,
  context: SummaryContext,
): SummaryItem[] {
  const items: SummaryItem[] = [];
  const groupBar = (progress: GroupProgress): SummaryItem => ({
    type: "bar",
    label: progress.group.def.label,
    bar: progressBar(progress.earned, progress.min),
    total: false,
  });

  items.push({ type: "section", title: "Povinné" });
  items.push({
    type: "bar",
    label: "Povinné předměty",
    bar: progressBar(summary.mandEarned, summary.mandTotal),
    total: false,
  });
  for (const progress of summary.choiceProgress) {
    if (progress.hasBar) items.push(groupBar(progress));
  }

  const pvBars = summary.pvProgress.filter((progress) => progress.hasBar);
  if (pvBars.length > 0) {
    items.push({ type: "section", title: "Povinně volitelné — skupiny" });
    items.push(...pvBars.map(groupBar));
  }

  const overallMin = summary.req.pv_overall_min;
  if (overallMin != null) {
    items.push({ type: "section", title: "PV celkem" });
    items.push({
      type: "bar",
      label: "Povinně volitelné celkem",
      bar: progressBar(summary.pvEarned, summary.effOverall),
      total: false,
    });
    if (summary.ncTotal) {
      items.push({
        type: "note",
        kind: "noCredit",
        label: "sníženo „bez kreditů“",
        value: `−${summary.ncTotal} kr. (z ${overallMin})`,
      });
    }
  }

  items.push({ type: "divider" });
  items.push({
    type: "bar",
    label: "Celkem kreditů",
    bar: progressBar(summary.totalEarned, summary.req.total_credits),
    total: true,
  });

  if (context === "calculator" && summary.structuralFree > 0) {
    items.push({
      type: "note",
      kind: "freeElective",
      label: "z toho volitelné (libovolné předměty)",
      value: `~${summary.structuralFree} kr.`,
    });
  }

  return items;
}

/** Stavová hláška pod souhrnem. */
export interface PlanStatus {
  fulfilled: boolean;
  /** `ok` = stará třída `status ok`, `todo` = `status todo`. */
  tone: "ok" | "todo";
  text: string;
}

/**
 * Stavová hláška: při splnění všech podmínek „✓ Všechny podmínky studijního plánu
 * jsou splněné.", jinak „Zbývá splnit: …." (Kalkulačka) / „Zbývá zařadit: …." (Rozvrh)
 * s výčtem `summary.missing`.
 */
export function planStatus(
  summary: PlanSummary,
  context: SummaryContext,
): PlanStatus {
  if (summary.fulfilled) {
    return {
      fulfilled: true,
      tone: "ok",
      text: "✓ Všechny podmínky studijního plánu jsou splněné.",
    };
  }
  const prefix = context === "schedule" ? "Zbývá zařadit: " : "Zbývá splnit: ";
  return {
    fulfilled: false,
    tone: "todo",
    text: `${prefix}${summary.missing.join(", ")}.`,
  };
}

// ---------------------------------------------------------------------------
// Bloky kategorií (seznam předmětů s nadpisem, štítkem a podtitulkem)
// ---------------------------------------------------------------------------

/** Štítek u nadpisu kategorie; `tone` odpovídá staré třídě `pill ok|req|todo`. */
export interface CategoryBadge {
  text: string;
  tone: "ok" | "req" | "todo";
}

/** Jeden blok kategorie v Kalkulačce i v levém sloupci Rozvrhu. */
export interface CategoryView {
  kind: "mandatory" | "group";
  /** Stabilní klíč bloku (pro React). */
  key: string;
  title: string;
  subtitle: string;
  badge: CategoryBadge;
  /** Předměty bloku v pořadí zobrazení (i pro „Reset kategorie"). */
  subjects: readonly SubjectNode[];
  /** Zobrazit u předmětů přepínač „bez kreditů" (jen skupiny magisterského plánu). */
  allowNoCredit: boolean;
  /**
   * Štítek „splnit vše" u povinných – v Kalkulačce je klikací a splní všechny povinné
   * předměty; v Rozvrhu je to jen štítek.
   */
  canCompleteAll: boolean;
  /** Průběh skupiny; u povinných `null`. */
  progress: GroupProgress | null;
}

/**
 * Bloky kategorií: „Povinné předměty" a pak skupiny plánu. Stejné texty používá
 * Kalkulačka i levý sloupec Rozvrhu – v obou se počítá nad množinou splněných
 * předmětů (`completed`), ne nad zařazením do rozvrhu.
 */
export function planCategories(
  plan: StudyPlan,
  completed: ReadonlySet<string>,
  noCredit: ReadonlySet<string>,
): CategoryView[] {
  const isDone = doneIn(completed);
  const allowNoCredit = isMasterPlan(plan);

  const mandEarned = earnedCredits(plan.mandatory, isDone);
  const mandTotal = sumCredits(plan.mandatory);
  const mandDone = mandEarned >= mandTotal && mandTotal > 0;
  const views: CategoryView[] = [
    {
      kind: "mandatory",
      key: "mandatory",
      title: "Povinné předměty",
      subtitle: `Nutné splnit všechny • ${mandEarned}/${mandTotal} kr.`,
      badge: mandDone
        ? { text: "hotovo", tone: "ok" }
        : { text: "splnit vše", tone: "req" },
      subjects: plan.mandatory,
      allowNoCredit: false,
      canCompleteAll: !mandDone,
      progress: null,
    },
  ];

  plan.groups.forEach((group, position) => {
    const progress = groupProgress(group, isDone, noCredit);
    const { earned, rawMin, min } = progress;

    let badge: CategoryBadge;
    if (rawMin == null) {
      badge = { text: "bez limitu", tone: "todo" };
    } else if (rawMin === 0) {
      badge = { text: "bez vlastního limitu", tone: "todo" };
    } else if (earned >= (min ?? 0)) {
      badge = { text: "splněno", tone: "ok" };
    } else {
      badge = { text: `min. ${min} kr.`, tone: "req" };
    }

    let subtitle: string;
    if (rawMin) {
      const included = group.includedLabels.length
        ? ` (včetně skupin: ${group.includedLabels.join(", ")})`
        : "";
      const reduced = progress.noCreditCredits
        ? ` (sníženo o ${progress.noCreditCredits} kr. „bez kreditů“ z ${rawMin})`
        : "";
      subtitle = `Minimum ${min} kr.${included}${reduced} • získáno ${earned} kr.`;
    } else {
      subtitle = `Získáno ${earned} kr. (počítá se do celku PV)`;
    }

    views.push({
      kind: "group",
      key: `group-${position}-${String(group.def.group)}`,
      title: groupTitle(group.def),
      subtitle,
      badge,
      subjects: group.subjects,
      allowNoCredit,
      canCompleteAll: false,
      progress,
    });
  });

  return views;
}
