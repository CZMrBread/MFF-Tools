/**
 * Stavebnice ručně sestavených dat pro testy výpočtů (credits.test.ts,
 * schedule.test.ts): předměty a požadavky ve stejném tvaru jako v nodes.json.
 */
import type {
  ProgramRequirementNode,
  PvGroupDef,
  PvGroupId,
  SubjectNode,
} from "../types";

/** Specializace, ke které patří ručně sestavené předměty a požadavky. */
export const TEST_SPEC = "x1";

/** Předmět, který není nikde povinný ani povinně volitelný. */
export function subject(
  id: string,
  credits: number,
  extra: Partial<SubjectNode> = {},
): SubjectNode {
  return {
    id,
    label: `${id} předmět`,
    group: "subj",
    radius: 8,
    shared_count: 1,
    course_type: "elective",
    mandatory_in: [],
    elective_in: [],
    credits,
    semester: "zimní",
    ...extra,
  };
}

/** Povinný předmět specializace. */
export function mandatory(
  id: string,
  credits: number,
  extra: Partial<SubjectNode> = {},
  spec: string = TEST_SPEC,
): SubjectNode {
  return subject(id, credits, {
    mandatory_in: [spec],
    course_type: "mandatory",
    ...extra,
  });
}

/** Povinně volitelný předmět ve skupině `group` specializace. */
export function elective(
  id: string,
  credits: number,
  group: PvGroupId,
  extra: Partial<SubjectNode> = {},
  spec: string = TEST_SPEC,
): SubjectNode {
  return subject(id, credits, {
    elective_in: [spec],
    pv_group: { [spec]: group },
    ...extra,
  });
}

/** Požadavky bakalářského plánu specializace {@link TEST_SPEC}. */
export function requirement(
  pvGroups: PvGroupDef[],
  extra: Partial<ProgramRequirementNode> = {},
): ProgramRequirementNode {
  return {
    id: `req_${TEST_SPEC}`,
    group: "program_req",
    spec: TEST_SPEC,
    level: "bc",
    total_credits: 60,
    mandatory_credits: 8,
    pv_overall_min: 12,
    pv_groups: pvGroups,
    ...extra,
  };
}

/** Prvek pole, který v testu určitě existuje. */
export function at<T>(items: readonly T[], position: number): T {
  const item = items[position];
  if (item === undefined) throw new Error(`Chybí prvek č. ${position}`);
  return item;
}

/** Id předmětů v pořadí pole. */
export function ids(subjects: readonly SubjectNode[]): string[] {
  return subjects.map((item) => item.id);
}
