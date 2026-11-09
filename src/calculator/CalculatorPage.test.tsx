// @vitest-environment jsdom
/**
 * Kalkulačka kreditů nad skutečnými daty (fetch obsluhuje soubory z data/): průvodce
 * → dashboard pro všechny roky × obory, odškrtávání a „bez kreditů", ukládání pod
 * klíči staré stránky (kalkulačka/index.html, e0a6ccf), obnovení uloženého postupu,
 * „Změnit obor", Rozvrh (zařazení, odebrání, přetažení, výběr ročníku) a přepnutí
 * roku či oboru bez reloadu.
 *
 * Očekávané texty a čísla počítají funkce z src/lib (ty jsou ověřené proti staré
 * stránce fixturou credits-legacy.json); tady se ověřuje, že je UI správně volá a
 * vykresluje.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  degreeHeading,
  doneIn,
  isMandatoryChoice,
  planCategories,
  planFor,
  planStatus,
  planSummary,
} from "../lib/credits";
import type { StudyPlan } from "../lib/credits";
import { indexNodes, parseNodes } from "../lib/data";
import type { FetchResponse, StudyIndex } from "../lib/data";
import { semesterTagText } from "../lib/schedule";
import type { SubjectNode } from "../lib/types";
import { CalculatorPage } from "./CalculatorPage";
import {
  CHANGE_SPEC_CONFIRM,
  INSTRUCTIONS_CALC,
  INSTRUCTIONS_INITIAL,
  INSTRUCTIONS_SCHEDULE,
  LOAD_ERROR_MESSAGE,
  NO_CREDIT_TITLE,
} from "./texts";

const dataDir = resolve(import.meta.dirname, "../../data");
const DATA_URL = "../data/";
const YEAR = "2026-2027";

function readData(path: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, path), "utf8"));
}

const YEARS = readData("years.json") as string[];
const COMBOS = YEARS.flatMap((year) =>
  (readData(`${year}/fields.json`) as string[]).map((field) => ({
    year,
    field,
  })),
);

const indexCache = new Map<string, StudyIndex>();
function studyIndex(year: string, field: string): StudyIndex {
  const key = `${year}/${field}`;
  let index = indexCache.get(key);
  if (!index) {
    index = indexNodes(parseNodes(readData(`${key}/nodes.json`)));
    indexCache.set(key, index);
  }
  return index;
}

function plan(year: string, field: string, spec: string): StudyPlan {
  const result = planFor(studyIndex(year, field), spec);
  if (!result) throw new Error(`chybí plán ${year}/${field}/${spec}`);
  return result;
}

function specLabel(year: string, field: string, spec: string): string {
  const node = studyIndex(year, field).specById.get(spec);
  if (!node) throw new Error(`chybí specializace ${spec}`);
  return node.label;
}

let failNodes = false;
const fetchMock = vi.fn((url: string): Promise<FetchResponse> => {
  if (!url.startsWith(DATA_URL)) {
    return Promise.reject(new Error(`nečekaná URL ${url}`));
  }
  if (failNodes && url.endsWith("nodes.json")) {
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.reject(new Error("404")),
    });
  }
  const body = readData(url.slice(DATA_URL.length));
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
});

const confirmMock = vi.fn((message?: string) => {
  void message;
  return true;
});

beforeEach(() => {
  failNodes = false;
  fetchMock.mockClear();
  confirmMock.mockClear();
  confirmMock.mockReturnValue(true);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockImplementation(confirmMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.documentElement.dataset.siteRoot = "../";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/kalkula%C4%8Dka/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pomůcky
// ---------------------------------------------------------------------------

const ls = {
  get: (key: string) => window.localStorage.getItem(key),
  json: (key: string): unknown => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  },
  set: (key: string, value: string) => window.localStorage.setItem(key, value),
  keys: () => Object.keys(window.localStorage).sort(),
};

function select(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`chybí #${id}`);
  return element;
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name });
}

/** Počká na načtení dat a projde krok 1 (stupeň) – před načtením je krok 1 neaktivní. */
async function chooseDegree(degreeButton: string): Promise<void> {
  await waitFor(() => {
    fireEvent.click(button(degreeButton));
    expect(screen.getByText("Jakou máš specializaci?")).toBeTruthy();
  });
}

/** Počká, až je vidět dashboard s danou specializací. */
async function dashboard(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name: title });
  const panel = heading.closest("div")?.parentElement?.parentElement;
  if (!panel) throw new Error("chybí panel");
  return panel;
}

/** Řádek předmětu (`<label>`) v kontejneru podle názvu – první výskyt. */
function row(container: HTMLElement, subject: SubjectNode): HTMLLabelElement {
  const names = within(container).getAllByText(subject.label, {
    selector: "span",
  });
  const label = names[0]?.closest("label");
  if (!label) throw new Error(`chybí řádek ${subject.label}`);
  return label;
}

function mainCheckbox(rowElement: HTMLElement): HTMLInputElement {
  const input = rowElement.querySelector("input");
  if (!input) throw new Error("chybí zaškrtávátko");
  return input;
}

/** Blok kategorie podle nadpisu (nadpis obsahuje i štítek). */
function category(title: string): HTMLElement {
  const heading = screen
    .getAllByRole("heading", { level: 3 })
    .find((element) => element.textContent?.startsWith(`${title} `));
  const block = heading?.parentElement?.parentElement;
  if (!block) throw new Error(`chybí kategorie ${title}`);
  return block;
}

function categorySubtitle(title: string): string {
  return category(title).children[1]?.textContent ?? "";
}

function statusTexts(): string[] {
  return screen
    .getAllByText(/^(✓ Všechny podmínky|Zbývá (splnit|zařadit):)/)
    .map((element) => element.textContent ?? "");
}

function firstSubjectWithCredits(
  subjects: readonly SubjectNode[],
): SubjectNode {
  const subject = subjects.find((item) => item.credits > 0);
  if (!subject) throw new Error("chybí předmět s kredity");
  return subject;
}

const bcInformatics = () => plan(YEAR, "informatika", "s1");

// ---------------------------------------------------------------------------
// Testy
// ---------------------------------------------------------------------------

describe("CalculatorPage – průvodce a dashboard", () => {
  it.each(COMBOS)(
    "$year / $field: stupeň → specializace → dashboard (Bc. i Mgr.)",
    async ({ year, field }) => {
      window.history.replaceState(
        null,
        "",
        `/kalkula%C4%8Dka/?rok=${year}&obor=${field}`,
      );
      const index = studyIndex(year, field);
      for (const degree of ["bakalarske", "magisterske"] as const) {
        const spec = index.specs.find((item) => item.study_type === degree);
        if (!spec) continue;
        window.localStorage.clear();
        render(<CalculatorPage />);
        await chooseDegree(
          degree === "bakalarske"
            ? "Bakalářské studium"
            : "Magisterské studium",
        );
        // Krok 2: specializace daného stupně v pořadí dat.
        const specButtons = index.specs
          .filter((item) => item.study_type === degree)
          .map((item) => item.label);
        const grid = screen.getByText("Jakou máš specializaci?").parentElement;
        if (!grid) throw new Error("chybí krok 2");
        expect(
          within(grid)
            .getAllByRole("button")
            .map((element) => element.textContent),
        ).toEqual([...specButtons, "← Zpět na výběr studia"]);

        fireEvent.click(button(spec.label));
        const panel = await dashboard(spec.label);
        const specPlan = plan(year, field, spec.id);
        expect(panel.textContent).toContain(degreeHeading(specPlan, field));
        const views = planCategories(specPlan, new Set(), new Set());
        for (const view of views) {
          expect(categorySubtitle(view.title)).toBe(view.subtitle);
        }
        expect(statusTexts()).toEqual([
          planStatus(
            planSummary(specPlan, doneIn(new Set()), new Set()),
            "calculator",
          ).text,
        ]);
        const suffix = field === "informatika" ? "" : `_${field}`;
        expect(ls.get(`mff_spec_${year}${suffix}`)).toBe(spec.id);
        expect(ls.get(`mff_degree_${year}${suffix}`)).toBe(degree);
        expect(ls.get(`mff_completed_${year}${suffix}`)).toBe("[]");
        expect(ls.get(`mff_nocredit_${year}${suffix}`)).toBe("[]");
        cleanup();
      }
    },
  );

  it("výběr roku a oboru, návod a krok 2 s návratem", async () => {
    render(<CalculatorPage />);
    expect(screen.getByText(INSTRUCTIONS_INITIAL)).toBeTruthy();
    await waitFor(() =>
      expect(select("obor-select").value).toBe("informatika"),
    );
    expect(select("year-select").closest("label")?.textContent).toMatch(
      /^Akademický rok /,
    );
    expect(select("obor-select").closest("label")?.textContent).toMatch(
      /^Obor /,
    );
    expect(select("year-select").value).toBe(YEAR);

    await chooseDegree("Magisterské studium");
    fireEvent.click(button("← Zpět na výběr studia"));
    expect(screen.getByText("Zvol stupeň studia")).toBeTruthy();
    await chooseDegree("Bakalářské studium");
    fireEvent.click(button(specLabel(YEAR, "informatika", "s1")));
    await dashboard(specLabel(YEAR, "informatika", "s1"));
    // selectSpec volá switchTab('calc') – návod se přepíše.
    expect(screen.getByText(INSTRUCTIONS_CALC)).toBeTruthy();
    fireEvent.click(button("Rozvrh"));
    expect(screen.getByText(INSTRUCTIONS_SCHEDULE)).toBeTruthy();
    expect(screen.getByText("Předměty dle kategorií")).toBeTruthy();
  });

  it("odškrtnutí předmětu přepočítá čísla a zapíše klíče bez přípony oboru", async () => {
    render(<CalculatorPage />);
    await chooseDegree("Bakalářské studium");
    fireEvent.click(button(specLabel(YEAR, "informatika", "s1")));
    const panel = await dashboard(specLabel(YEAR, "informatika", "s1"));
    const specPlan = bcInformatics();
    const subject = firstSubjectWithCredits(specPlan.mandatory);

    fireEvent.click(mainCheckbox(row(panel, subject)));
    const completed = new Set([subject.id]);
    const [mandatory] = planCategories(specPlan, completed, new Set());
    expect(categorySubtitle("Povinné předměty")).toBe(mandatory?.subtitle);
    expect(mainCheckbox(row(panel, subject)).checked).toBe(true);
    expect(statusTexts()).toEqual([
      planStatus(
        planSummary(specPlan, doneIn(completed), new Set()),
        "calculator",
      ).text,
    ]);
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([subject.id]);
    expect(ls.get(`mff_spec_${YEAR}`)).toBe("s1");
    expect(ls.get(`mff_degree_${YEAR}`)).toBe("bakalarske");
    expect(ls.keys().some((key) => key.endsWith("_informatika"))).toBe(false);

    // Klik na celý řádek (label) předmět zase odškrtne.
    fireEvent.click(row(panel, subject).querySelector("span") as HTMLElement);
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);

    // „splnit vše" splní všechny povinné.
    fireEvent.click(screen.getByText("splnit vše"));
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual(
      specPlan.mandatory.map((item) => item.id),
    );
    expect(screen.getByText("hotovo")).toBeTruthy();
  });

  it("obor s příponou: fyzika ukládá pod _fyzika", async () => {
    window.history.replaceState(null, "", "/kalkula%C4%8Dka/?obor=fyzika");
    render(<CalculatorPage />);
    await chooseDegree("Magisterské studium");
    const spec = studyIndex(YEAR, "fyzika").specs.find(
      (item) => item.study_type === "magisterske",
    );
    if (!spec) throw new Error("chybí Mgr. fyzika");
    fireEvent.click(button(spec.label));
    const panel = await dashboard(spec.label);
    expect(panel.textContent).toContain("Magisterské studium · Fyzika");
    const specPlan = plan(YEAR, "fyzika", spec.id);
    const subject = firstSubjectWithCredits(specPlan.mandatory);
    fireEvent.click(mainCheckbox(row(panel, subject)));
    expect(ls.json(`mff_completed_${YEAR}_fyzika`)).toEqual([subject.id]);
    expect(ls.get(`mff_spec_${YEAR}_fyzika`)).toBe(spec.id);
    expect(ls.get(`mff_degree_${YEAR}_fyzika`)).toBe("magisterske");
    expect(ls.get(`mff_completed_${YEAR}`)).toBeNull();
  });

  it("postup uložený ve starém formátu se po načtení obnoví", async () => {
    const specPlan = bcInformatics();
    const done = firstSubjectWithCredits(specPlan.mandatory);
    const placed = specPlan.mandatory.find(
      (item) => item.id !== done.id && item.semester === "letní",
    );
    if (!placed) throw new Error("chybí letní povinný předmět");
    ls.set(`mff_spec_${YEAR}`, "s1");
    ls.set(`mff_degree_${YEAR}`, "bakalarske");
    ls.set(`mff_completed_${YEAR}`, JSON.stringify([done.id, placed.id]));
    ls.set(`mff_nocredit_${YEAR}`, "[]");
    ls.set(
      `mff_sched_placements_s1_${YEAR}`,
      JSON.stringify({ [placed.id]: { year: 2, semester: "letní" } }),
    );
    ls.set(`mff_sched_years_s1_${YEAR}`, "4");
    const before = ls.keys().map((key) => [key, ls.get(key)]);

    render(<CalculatorPage />);
    const panel = await dashboard(specLabel(YEAR, "informatika", "s1"));
    // Starý init bez switchTab – návod zůstává ze statického HTML.
    expect(screen.getByText(INSTRUCTIONS_INITIAL)).toBeTruthy();
    expect(mainCheckbox(row(panel, done)).checked).toBe(true);
    expect(mainCheckbox(row(panel, placed)).checked).toBe(true);
    // Samotné načtení nic nezapisuje.
    expect(ls.keys().map((key) => [key, ls.get(key)])).toEqual(before);

    fireEvent.click(button("Rozvrh"));
    expect(document.getElementById("years-count")?.textContent).toBe("4");
    expect(screen.getByText("2. r. / LS")).toBeTruthy();
    const scheduled = screen
      .getAllByText(placed.label)
      .find((element) => element.closest("[data-semester]"));
    expect(
      scheduled?.closest("[data-semester]")?.getAttribute("data-year"),
    ).toBe("2");
  });

  it("„bez kreditů“ u magisterské PV skupiny sníží minimum skupiny", async () => {
    const index = studyIndex(YEAR, "informatika");
    const candidates = index.specs
      .filter((spec) => spec.study_type === "magisterske")
      .map((spec) => ({ spec, plan: plan(YEAR, "informatika", spec.id) }));
    const found = candidates
      .flatMap(({ spec, plan: specPlan }) =>
        specPlan.groups
          .filter(
            (group) =>
              !isMandatoryChoice(group.def) &&
              (group.def.min_credits ?? 0) > 0 &&
              group.subjects.some((subject) => subject.credits > 0),
          )
          .map((group) => ({ spec, specPlan, group })),
      )
      .at(0);
    if (!found) throw new Error("chybí Mgr. PV skupina s minimem");
    const { spec, specPlan, group } = found;
    const subject = firstSubjectWithCredits(group.subjects);

    render(<CalculatorPage />);
    await chooseDegree("Magisterské studium");
    fireEvent.click(button(spec.label));
    await dashboard(spec.label);
    const block = category(`Povinně volitelné — ${group.def.label}`);
    const subjectRow = row(block, subject);
    // Bez kreditů a zároveň splněno nejde – zaškrtnutí nejdřív, pak „bez kreditů".
    fireEvent.click(mainCheckbox(subjectRow));
    const toggle = subjectRow.querySelector(`span[title="${NO_CREDIT_TITLE}"]`);
    if (!(toggle instanceof HTMLElement)) throw new Error("chybí přepínač");
    fireEvent.click(toggle);

    const noCredit = new Set([subject.id]);
    const view = planCategories(specPlan, new Set(), noCredit).find(
      (item) => item.title === `Povinně volitelné — ${group.def.label}`,
    );
    expect(view?.subtitle).toContain(
      `(sníženo o ${subject.credits} kr. „bez kreditů“ z ${group.def.min_credits})`,
    );
    expect(categorySubtitle(`Povinně volitelné — ${group.def.label}`)).toBe(
      view?.subtitle,
    );
    expect(mainCheckbox(row(block, subject)).checked).toBe(false);
    expect(row(block, subject).className).toMatch(/nocredit/);
    expect(ls.json(`mff_nocredit_${YEAR}`)).toEqual([subject.id]);
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);

    // Klik přímo na vnitřní zaškrtávátko „bez kreditů" ho vypne, hlavní nezmění.
    const inner = row(block, subject).querySelector(
      `span[title="${NO_CREDIT_TITLE}"] input`,
    );
    if (!(inner instanceof HTMLInputElement)) throw new Error("chybí input");
    fireEvent.click(inner);
    expect(ls.json(`mff_nocredit_${YEAR}`)).toEqual([]);
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);

    // U povinných předmětů přepínač „bez kreditů" není.
    const mandatory = category("Povinné předměty");
    expect(
      mandatory.querySelector(`span[title="${NO_CREDIT_TITLE}"]`),
    ).toBeNull();
  });

  it("„Změnit obor“ po potvrzení smaže klíče kombinace, bez potvrzení nic", async () => {
    const specPlan = bcInformatics();
    const subject = firstSubjectWithCredits(specPlan.mandatory);
    ls.set(`mff_spec_${YEAR}`, "s1");
    ls.set(`mff_degree_${YEAR}`, "bakalarske");
    ls.set(`mff_completed_${YEAR}`, JSON.stringify([subject.id]));
    ls.set(`mff_nocredit_${YEAR}`, "[]");
    ls.set(`mff_sched_placements_s1_${YEAR}`, "{}");
    ls.set(`mff_sched_years_s1_${YEAR}`, "3");
    // Jiné specializace a kombinace zůstávají.
    ls.set(`mff_sched_placements_s2_${YEAR}`, "{}");
    ls.set(`mff_spec_${YEAR}_fyzika`, "m1");
    ls.set("mff_spec_2025-2026", "s1");

    render(<CalculatorPage />);
    await dashboard(specLabel(YEAR, "informatika", "s1"));

    confirmMock.mockReturnValue(false);
    fireEvent.click(button("Změnit obor"));
    expect(confirmMock).toHaveBeenCalledWith(CHANGE_SPEC_CONFIRM);
    expect(ls.get(`mff_spec_${YEAR}`)).toBe("s1");
    expect(screen.queryByText("Zvol stupeň studia")).toBeNull();

    confirmMock.mockReturnValue(true);
    fireEvent.click(button("Změnit obor"));
    expect(screen.getByText("Zvol stupeň studia")).toBeTruthy();
    expect(ls.keys()).toEqual(
      [
        `mff_sched_placements_s2_${YEAR}`,
        `mff_spec_${YEAR}_fyzika`,
        "mff_spec_2025-2026",
      ].sort(),
    );

    // Nový výběr začíná s prázdným postupem.
    await chooseDegree("Bakalářské studium");
    fireEvent.click(button(specLabel(YEAR, "informatika", "s2")));
    const panel = await dashboard(specLabel(YEAR, "informatika", "s2"));
    expect(within(panel).queryAllByRole("checkbox", { checked: true })).toEqual(
      [],
    );
  });

  it("„Reset celkový“ a „Reset kategorie“ v Kalkulačce", async () => {
    const specPlan = bcInformatics();
    const subject = firstSubjectWithCredits(specPlan.mandatory);
    ls.set(`mff_spec_${YEAR}`, "s1");
    ls.set(`mff_degree_${YEAR}`, "bakalarske");
    ls.set(`mff_completed_${YEAR}`, JSON.stringify([subject.id]));
    ls.set(
      `mff_sched_placements_s1_${YEAR}`,
      JSON.stringify({ [subject.id]: { year: 1, semester: "zimní" } }),
    );
    render(<CalculatorPage />);
    await dashboard(specLabel(YEAR, "informatika", "s1"));

    fireEvent.click(
      within(category("Povinné předměty")).getByRole("button", {
        name: "Reset kategorie",
      }),
    );
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    // Počet ročníků se doplnil při vykreslení (3 Bc.) a uložil se s rozvrhem.
    expect(ls.get(`mff_sched_years_s1_${YEAR}`)).toBe("3");

    fireEvent.click(mainCheckbox(row(category("Povinné předměty"), subject)));
    fireEvent.click(button("Reset celkový (zrušit vše splněné)"));
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);
    expect(ls.json(`mff_nocredit_${YEAR}`)).toEqual([]);
    expect(ls.get(`mff_spec_${YEAR}`)).toBe("s1");
  });
});

describe("CalculatorPage – Rozvrh", () => {
  async function openSchedule(): Promise<StudyPlan> {
    ls.set(`mff_spec_${YEAR}`, "s1");
    ls.set(`mff_degree_${YEAR}`, "bakalarske");
    render(<CalculatorPage />);
    await dashboard(specLabel(YEAR, "informatika", "s1"));
    fireEvent.click(button("Rozvrh"));
    return bcInformatics();
  }

  function slot(year: number, semester: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(
      `[data-year="${year}"][data-semester="${semester}"]`,
    );
    if (!element) throw new Error(`chybí slot ${year}/${semester}`);
    return element;
  }

  /** Vysouvací výběr ročníku (nadpis h4 = název předmětu), nebo undefined. */
  function pickerPanel(label: string): HTMLElement | undefined {
    const heading = Array.from(document.body.querySelectorAll("h4")).find(
      (element) => element.textContent === label,
    );
    return heading?.parentElement ?? undefined;
  }

  function categories(): HTMLElement {
    const element = screen.getByText("Předměty dle kategorií").parentElement;
    if (!element) throw new Error("chybí sloupec kategorií");
    return element;
  }

  it("zaškrtnutí zařadí do 1. ročníku a označí splněné; odškrtnutí v Kalkulačce zařazení odebere", async () => {
    const specPlan = await openSchedule();
    const subject = specPlan.mandatory.find(
      (item) => item.semester === "letní" && item.credits > 0,
    );
    if (!subject) throw new Error("chybí letní předmět");
    const schedRow = row(categories(), subject);
    expect(schedRow.textContent).toContain(semesterTagText(subject.semester));
    fireEvent.click(mainCheckbox(schedRow));

    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({
      [subject.id]: { year: 1, semester: "letní" },
    });
    expect(ls.get(`mff_sched_years_s1_${YEAR}`)).toBe("3");
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([subject.id]);
    expect(within(slot(1, "letní")).getByText(subject.label)).toBeTruthy();
    // Nadpis ročníku: „1. ročník <span class="year-credits">N kr.</span>".
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent === `1. ročník ${subject.credits} kr.`,
      ),
    ).toBeTruthy();
    const summary = planSummary(
      specPlan,
      doneIn(new Set([subject.id])),
      new Set(),
    );
    expect(statusTexts()).toEqual([planStatus(summary, "schedule").text]);

    fireEvent.click(button("Kalkulačka"));
    const panel = await dashboard(specLabel(YEAR, "informatika", "s1"));
    const calcRow = row(panel, subject);
    expect(mainCheckbox(calcRow).checked).toBe(true);
    fireEvent.click(mainCheckbox(calcRow));
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);

    fireEvent.click(button("Rozvrh"));
    expect(
      within(slot(1, "letní")).getByText("Přetáhni sem předmět"),
    ).toBeTruthy();
  });

  it("přetažení respektuje semestr; ✕ a „Reset“ ročníku předmět odeberou", async () => {
    const specPlan = await openSchedule();
    const winter = specPlan.mandatory.find((item) => item.semester === "zimní");
    if (!winter) throw new Error("chybí zimní předmět");
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    const source = row(categories(), winter);
    expect(source.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(source, { dataTransfer });
    expect(source.className).toMatch(/dragging/);
    // Zimní předmět do letního semestru: cíl je zakázaný a puštění nic nezmění.
    fireEvent.dragOver(slot(2, "letní"), { dataTransfer });
    expect(slot(2, "letní").className).toMatch(/dragDenied/);
    fireEvent.drop(slot(2, "letní"), { dataTransfer });
    expect(ls.get(`mff_sched_placements_s1_${YEAR}`)).toBeNull();
    fireEvent.dragOver(slot(2, "zimní"), { dataTransfer });
    expect(slot(2, "zimní").className).toMatch(/dragOver/);
    fireEvent.drop(slot(2, "zimní"), { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({
      [winter.id]: { year: 2, semester: "zimní" },
    });
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([winter.id]);
    expect(screen.getByText("2. r. / ZS")).toBeTruthy();

    fireEvent.click(within(slot(2, "zimní")).getByTitle("Odebrat z rozvrhu"));
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);

    fireEvent.click(mainCheckbox(row(categories(), winter)));
    fireEvent.click(screen.getByTitle("Vyprázdnit 1. ročník"));
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);
    expect(screen.queryByTitle("Vyprázdnit 1. ročník")).toBeNull();
  });

  it("výběr ročníku klepnutím, počet ročníků a Reset rozvrhu", async () => {
    const specPlan = await openSchedule();
    const both =
      specPlan.mandatory.find((item) => item.semester === "oba") ??
      specPlan.groups
        .flatMap((group) => group.subjects)
        .find((item) => item.semester === "oba");
    if (!both) throw new Error("chybí celoroční předmět");

    fireEvent.click(
      within(row(categories(), both)).getByTitle(
        "Klikni pro zařazení do ročníku/semestru",
      ),
    );
    const picker = pickerPanel(both.label);
    if (!picker) throw new Error("chybí výběr ročníku");
    expect(
      within(picker)
        .getAllByRole("button")
        .map((element) => element.textContent),
    ).toEqual([
      "1. ročník — zimní semestr",
      "1. ročník — letní semestr",
      "2. ročník — zimní semestr",
      "2. ročník — letní semestr",
      "3. ročník — zimní semestr",
      "3. ročník — letní semestr",
      "Zrušit",
    ]);
    fireEvent.click(within(picker).getByText("3. ročník — letní semestr"));
    expect(pickerPanel(both.label)).toBeUndefined();
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({
      [both.id]: { year: 3, semester: "letní" },
    });

    // Snížení počtu ročníků zahodí zařazení nad novým počtem (splněno zůstane).
    fireEvent.click(button("−"));
    expect(document.getElementById("years-count")?.textContent).toBe("2");
    expect(ls.get(`mff_sched_years_s1_${YEAR}`)).toBe("2");
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([both.id]);
    fireEvent.click(button("−"));
    expect(button("−").disabled).toBe(true);

    // Zařazený předmět: výběr nabízí i „Odebrat z rozvrhu".
    // Splněný, ale nezařazený předmět má v Rozvrhu zaškrtávátko prázdné; klik ho
    // zařadí do 1. ročníku (u „oba" do zimního semestru).
    expect(mainCheckbox(row(categories(), both)).checked).toBe(false);
    fireEvent.click(mainCheckbox(row(categories(), both)));
    expect(mainCheckbox(row(categories(), both)).checked).toBe(true);
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({
      [both.id]: { year: 1, semester: "zimní" },
    });
    fireEvent.click(within(slot(1, "zimní")).getByText(both.label));
    const picker2 = pickerPanel(both.label);
    if (!picker2) throw new Error("chybí výběr ročníku");
    fireEvent.click(within(picker2).getByText("Odebrat z rozvrhu"));
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});

    fireEvent.click(mainCheckbox(row(categories(), both)));
    fireEvent.click(button("Reset celkový (vyprázdnit celý rozvrh)"));
    expect(ls.json(`mff_sched_placements_s1_${YEAR}`)).toEqual({});
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([]);
  });
});

describe("CalculatorPage – změna roku a oboru", () => {
  it("přepnutí oboru i roku načte postup dané kombinace bez míchání klíčů", async () => {
    const informatics = bcInformatics();
    const infSubject = firstSubjectWithCredits(informatics.mandatory);
    ls.set(`mff_spec_${YEAR}`, "s1");
    ls.set(`mff_degree_${YEAR}`, "bakalarske");
    ls.set(`mff_completed_${YEAR}`, JSON.stringify([infSubject.id]));

    const physicsSpec = studyIndex(YEAR, "fyzika").specs[0];
    if (!physicsSpec) throw new Error("chybí fyzika");
    const physics = plan(YEAR, "fyzika", physicsSpec.id);
    const physSubject = firstSubjectWithCredits(physics.mandatory);
    ls.set(`mff_spec_${YEAR}_fyzika`, physicsSpec.id);
    ls.set(`mff_completed_${YEAR}_fyzika`, JSON.stringify([physSubject.id]));

    render(<CalculatorPage />);
    let panel = await dashboard(specLabel(YEAR, "informatika", "s1"));
    expect(mainCheckbox(row(panel, infSubject)).checked).toBe(true);
    fireEvent.click(button("Rozvrh"));

    fireEvent.change(select("obor-select"), { target: { value: "fyzika" } });
    panel = await dashboard(physicsSpec.label);
    expect(ls.get("mff_obor")).toBe("fyzika");
    expect(window.location.search).toContain("obor=fyzika");
    // Jako po reloadu: záložka Kalkulačka a návod ze statického HTML.
    expect(screen.getByText(INSTRUCTIONS_INITIAL)).toBeTruthy();
    expect(panel.textContent).toContain(degreeHeading(physics, "fyzika"));
    expect(mainCheckbox(row(panel, physSubject)).checked).toBe(true);
    // Stupeň chyběl – doplnil se ze specializace a uloží se s další změnou.
    fireEvent.click(mainCheckbox(row(panel, physSubject)));
    expect(ls.json(`mff_completed_${YEAR}_fyzika`)).toEqual([]);
    expect(ls.get(`mff_degree_${YEAR}_fyzika`)).toBe(physicsSpec.study_type);
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([infSubject.id]);

    fireEvent.change(select("obor-select"), {
      target: { value: "informatika" },
    });
    panel = await dashboard(specLabel(YEAR, "informatika", "s1"));
    expect(mainCheckbox(row(panel, infSubject)).checked).toBe(true);

    // Rok 2025-2026 má jen informatiku a žádný uložený postup.
    fireEvent.change(select("year-select"), {
      target: { value: "2025-2026" },
    });
    await waitFor(() => expect(select("year-select").value).toBe("2025-2026"));
    await waitFor(() => {
      expect(select("obor-select").disabled).toBe(true);
    });
    await chooseDegree("Bakalářské studium");
    expect(ls.get("mff_akademicky_rok")).toBe("2025-2026");
    expect(ls.get("mff_spec_2025-2026")).toBeNull();
    fireEvent.click(button(specLabel("2025-2026", "informatika", "s1")));
    await dashboard(specLabel("2025-2026", "informatika", "s1"));
    expect(ls.get("mff_spec_2025-2026")).toBe("s1");
    expect(ls.json(`mff_completed_${YEAR}`)).toEqual([infSubject.id]);
  });

  it("chyba načtení nodes.json nahradí stránku hláškou", async () => {
    failNodes = true;
    render(<CalculatorPage />);
    expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("Zvol stupeň studia")).toBeNull();
  });
});
