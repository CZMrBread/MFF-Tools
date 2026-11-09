// Vygeneruje src/lib/__fixtures__/credits-legacy.json – záznam toho, co pro daná data
// a daný postup spočítá a vykreslí STARÁ kalkulačka (kalkulačka/index.html ve stavu
// e0a6ccf, tj. s obory, includes_groups a skupinami povinného výběru).
//
// Skript ze staré stránky vyřízne její <script>, spustí ho beze změny v node:vm
// s náhražkou DOM, localStorage a fetch a pro každý rok × obor (data/years.json ×
// data/<rok>/fields.json) × specializaci × scénář zavolá původní renderDashboard().
// Z náhražky DOM pak přečte, co stránka vykreslila (bloky kategorií, souhrn, stavovou
// hlášku, rozvrh), a uloží to jako text. Čísla („numbers“) bere přímo z původních
// funkcí planTotals, effMin a ncCreditsIn a ověří, že odpovídají vykreslenému souhrnu.
// Druhá část („sequences") přehrává náhodnou posloupnost akcí přes původní funkce
// (toggleDone, placeSubject, changeYears, …) a po každé zapíše stav a co se uložilo
// do localStorage.
//
// Testy src/lib/credits.test.ts a src/lib/schedule.test.ts porovnávají nový kód
// s tímto záznamem. Soubor je v repu, aby testy fungovaly i po smazání staré stránky;
// přegenerovat ho jde jen dokud stará stránka existuje:
//
//   node scripts/gen-credits-fixture.mjs [--html <soubor>] [--data <složka>] [--out <soubor>]
//
// Výchozí hodnoty: kalkulačka/index.html, data/, src/lib/__fixtures__/credits-legacy.json.
// Výstup je deterministický (pseudonáhodné scénáře mají pevné semínko) a jde o
// kompaktní JSON bez odsazení (soubor je velký; neformátovat).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback) {
  const position = process.argv.indexOf(`--${name}`);
  const value = position === -1 ? undefined : process.argv[position + 1];
  return resolve(repoRoot, value ?? fallback);
}

const htmlPath = argument("html", "src/legacy/kalkulačka/index.html");
const dataRoot = argument("data", "data");
const outPath = argument("out", "src/lib/__fixtures__/credits-legacy.json");

const SEMESTERS = ["zimní", "letní"];
const SEQUENCE_STEPS = 60;

/**
 * Barvy pruhu průběhu ze starého bar(): výplň a barva textu „zbývá …“ podle stavu.
 * Do záznamu se místo barev píše jen název stavu; tabulka se uloží jednou („tones“).
 */
const TONES = {
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

function toneOf(fill, text) {
  const tone = Object.keys(TONES).find(
    (name) =>
      TONES[name].fill === fill &&
      (text === undefined || TONES[name].text === text),
  );
  check(tone, `neznámá barva pruhu: ${fill} / ${text}`);
  return tone;
}

// ---------------------------------------------------------------------------
// Pomůcky
// ---------------------------------------------------------------------------

function fail(message) {
  throw new Error(`gen-credits-fixture: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Otisk JSON souboru nezávislý na koncích řádků a odsazení. */
function jsonDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministický generátor pseudonáhodných čísel z intervalu [0, 1). */
function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

function shuffled(random, items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Náhražka DOM
// ---------------------------------------------------------------------------

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.dataset = {};
    this.html = "";
    const element = this;
    this.classList = {
      contains: (name) => element.className.split(/\s+/).includes(name),
      add: (name) => {
        if (!element.classList.contains(name)) {
          element.className = `${element.className} ${name}`.trim();
        }
      },
      remove: (name) => {
        element.className = element.className
          .split(/\s+/)
          .filter((item) => item && item !== name)
          .join(" ");
      },
      toggle: (name, force) => {
        const on =
          force === undefined ? !element.classList.contains(name) : force;
        if (on) element.classList.add(name);
        else element.classList.remove(name);
        return on;
      },
    };
  }

  get innerHTML() {
    return this.html;
  }

  set innerHTML(value) {
    this.html = String(value);
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    return child;
  }

  addEventListener() {}
}

/** Prostředí pro starý skript: document, localStorage, fetch, location… */
function createLegacyContext(search) {
  const elements = new Map();
  const errors = [];
  const storage = new Map();
  const writes = [];

  const document = {
    body: new FakeElement("body"),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement("div"));
      return elements.get(id);
    },
    createElement: (tagName) => new FakeElement(tagName),
    querySelector: () => null,
  };

  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      storage.set(key, String(value));
      writes.push(key);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  };

  async function fetchStub(url) {
    const match = /(?:^|\/)data\/([^?#]+)/.exec(String(url));
    const file = match ? resolve(dataRoot, decodeURIComponent(match[1])) : null;
    if (!file || !existsSync(file)) {
      return {
        ok: false,
        status: 404,
        json: async () => fail(`starý kód čte neexistující soubor ${url}`),
      };
    }
    return { ok: true, status: 200, json: async () => readJson(file) };
  }

  const sandbox = {
    document,
    localStorage,
    fetch: fetchStub,
    location: { search, href: `http://localhost/kalkulačka/${search}` },
    console: {
      log() {},
      warn() {},
      error: (...parts) => errors.push(parts.map(String).join(" ")),
    },
    confirm: () => true,
    URL,
    URLSearchParams,
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  return {
    context,
    element: (id) => document.getElementById(id),
    body: document.body,
    storage,
    writes,
    /** Spustí výraz ve starém prostředí; chyba zapsaná do konzole = selhání. */
    run(code) {
      const result = vm.runInContext(code, context);
      check(
        errors.length === 0,
        `starý kód ohlásil chybu: ${errors.join("; ")}`,
      );
      return result;
    },
    errors,
  };
}

function legacyScript() {
  const html = readFileSync(htmlPath, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1],
  );
  const script = scripts.find((text) => text.includes("function planFor("));
  check(script, `v ${htmlPath} není <script> s funkcí planFor`);
  return { html, script };
}

// ---------------------------------------------------------------------------
// Čtení toho, co stará stránka vykreslila
// ---------------------------------------------------------------------------

/** Bloky kategorií (Kalkulačka: #lists, Rozvrh: #sched-categories). */
function readCategories(container) {
  const categories = [];
  let note = null;
  for (const child of container.children) {
    if (child.tagName === "p") {
      note = child.textContent;
      continue;
    }
    check(child.className === "cat", `nečekaný prvek .${child.className}`);
    const [head, sub, list] = child.children;
    const heading =
      /^<h3>(.*) <span class="pill (\w+)( pill-btn)?"(?: onclick="([^"]*)")?>([^<]*)<\/span><\/h3>$/.exec(
        head.html,
      );
    check(heading, `nečitelný nadpis kategorie: ${head.html}`);
    const rows = list.children.map((row) => {
      const parts = row.children;
      const classes = row.className.split(/\s+/);
      const tag = parts.find(
        (part) =>
          part.className === "sem-tag" || part.className === "placed-at",
      );
      return {
        id: row.dataset.subjectId ?? null,
        label: parts.find((part) => part.className === "name").textContent,
        done: classes.includes("done"),
        noCredit: classes.includes("nocredit"),
        toggle: parts.some((part) => part.className === "nc-toggle"),
        credits: parts.find((part) => part.className === "credits-badge")
          .textContent,
        tagClass: tag ? tag.className : null,
        tagText: tag ? tag.textContent : null,
        checkbox: parts[0],
      };
    });
    categories.push({
      title: heading[1],
      badgeClass: heading[2],
      click: heading[4] ?? null,
      badgeText: heading[5],
      subtitle: sub.textContent,
      rows,
      empty: list.html,
    });
  }
  return { categories, note };
}

const SECTION = /<div class="sec-title"(?: style="[^"]*")?>([^<]*)<\/div>/y;
const BAR =
  /<div class="progress-box">\s*<div class="progress-info"><span>([^<]*)<\/span><span>([^<]*)<\/span><\/div>\s*<div class="progress-bar"><div class="progress-fill" style="width:([^%;"]*)%;background:([^"]*)"><\/div><\/div>\s*(?:<div class="progress-info" style="margin-top:\.2rem"><span><\/span><span class="rem" style="color:([^"]*)">([^<]*)<\/span><\/div>)?\s*<\/div>/y;
const NOTE =
  /<div class="progress-info" style="font-size:\.7[28]rem;color:var\(--muted\)">\s*<span>([^<]*)<\/span><span>([^<]*)<\/span><\/div>/y;
const DIVIDER = /<hr class="divider">/y;
const TOTAL_OPEN = /<div class="total-line">/y;
const TOTAL_CLOSE = /<\/div>/y;

/**
 * Převede HTML souhrnu na řádky textu (`lines`) a na položky (`entries`), ze kterých se
 * čtou čísla; nic nesmí zůstat nepřečtené.
 */
function readSummary(html) {
  const lines = [];
  const entries = [];
  let section = null;
  let position = 0;
  const take = (pattern) => {
    pattern.lastIndex = position;
    const match = pattern.exec(html);
    if (match) position = pattern.lastIndex;
    return match;
  };
  const barLine = (kind, match) => {
    const parts = [
      kind,
      match[1],
      match[2],
      `${match[3]}%`,
      toneOf(match[4], match[5]),
    ];
    if (match[6] !== undefined) parts.push(match[6]);
    entries.push({ kind, section, label: match[1], value: match[2] });
    return parts.join(" | ");
  };

  for (;;) {
    position += /^\s*/.exec(html.slice(position))[0].length;
    if (position >= html.length) break;
    let match;
    if ((match = take(SECTION))) {
      section = match[1];
      lines.push(`section | ${match[1]}`);
    } else if ((match = take(BAR))) {
      lines.push(barLine("bar", match));
    } else if ((match = take(NOTE))) {
      entries.push({ kind: "note", section, label: match[1], value: match[2] });
      lines.push(`note | ${match[1]} | ${match[2]}`);
    } else if (take(DIVIDER)) {
      section = null;
      lines.push("divider");
    } else if (take(TOTAL_OPEN)) {
      match = take(BAR);
      check(match && take(TOTAL_CLOSE), "nečitelný pruh „Celkem kreditů“");
      lines.push(barLine("total", match));
    } else {
      fail(`nečitelný souhrn od: ${html.slice(position, position + 120)}`);
    }
  }
  return { lines, entries };
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
const CREDIT_PAIR = new RegExp(String.raw`^(${NUMBER}) / (${NUMBER}) kr\.$`);
const EARNED_IN_SUBTITLE = new RegExp(String.raw`[Zz]ískáno (${NUMBER}) kr\.`);
const MANDATORY_SUBTITLE = new RegExp(
  String.raw`• (${NUMBER})/(${NUMBER}) kr\.$`,
);
const REDUCTION_NOTE = new RegExp(
  String.raw`^−(${NUMBER}) kr\. \(z (${NUMBER})\)$`,
);
const FREE_NOTE = new RegExp(String.raw`^~(${NUMBER}) kr\.$`);

function numbersIn(pattern, text, what) {
  const match = pattern.exec(text);
  check(match, `nečitelné číslo (${what}): ${text}`);
  return match.slice(1).map(Number);
}

/**
 * Čísla jednoho souhrnu. `groups` a `totals` jsou výsledky původních funkcí (effMin,
 * ncCreditsIn, planTotals) pro aktuální stav; z vykresleného souhrnu (`entries`,
 * `status`) se čtou povinné, celkem, odhad volitelných a splněno a zároveň se ověří,
 * že pruhy skupin, „PV celkem“ i „Celkem kreditů“ ukazují totéž co původní funkce.
 * `categories` (jen Kalkulačka) jsou vykreslené bloky: z podtitulků se čtou získané
 * kredity skupin (i těch bez pruhu).
 *
 * Kalkulačka: { mand: [získané, celkem], groups: [[získané, effMin, bez kreditů]…],
 *   choice: [choiceEarned, choiceMin], pv: [pvEarned, effOverall, ncTotal],
 *   total: totalEarned, free: odhad volitelných | null, ok }
 * Rozvrh (minima a snížení jsou stejná jako v Kalkulačce, proto se neukládají):
 *   { mand: získané, groups: [získané | null (skupina bez pruhu)…],
 *   choice: choiceEarned, pv: pvEarned, total: totalEarned, ok }
 */
function readNumbers(entries, status, groups, totals, categories, req) {
  const bars = entries.filter((entry) => entry.kind === "bar");
  const mandatoryBar = bars[0];
  check(
    mandatoryBar?.label === "Povinné předměty" &&
      mandatoryBar.section === "Povinné",
    "souhrn nezačíná pruhem povinných předmětů",
  );
  const [mandEarned, mandTotal] = numbersIn(
    CREDIT_PAIR,
    mandatoryBar.value,
    "povinné",
  );

  const overallBar = bars.find((bar) => bar.section === "PV celkem");
  check(
    Boolean(overallBar) === (req.pv_overall_min != null),
    "pruh „PV celkem“ nečekaně chybí nebo je navíc",
  );
  const groupBars = bars.filter(
    (bar) => bar !== mandatoryBar && bar !== overallBar,
  );
  // Pruh mají jen skupiny s nenulovým minimem; skupiny povinného výběru jsou pod
  // „Povinné“, ostatní pod „Povinně volitelné — skupiny“.
  const withBar = [
    ...groups.filter((group) => group.choice && group.rawMin),
    ...groups.filter((group) => !group.choice && group.rawMin),
  ];
  check(
    groupBars.length === withBar.length,
    "jiný počet pruhů skupin, než se čekalo",
  );
  const earnedInBar = new Map();
  withBar.forEach((group, index) => {
    const bar = groupBars[index];
    const [earned, target] = numbersIn(CREDIT_PAIR, bar.value, group.label);
    check(
      bar.label === group.label &&
        bar.section ===
          (group.choice ? "Povinné" : "Povinně volitelné — skupiny") &&
        target === group.min,
      `pruh skupiny ${group.label} neodpovídá effMin`,
    );
    earnedInBar.set(group, earned);
  });

  if (categories) {
    check(
      categories.length === groups.length + 1,
      "jiný počet kategorií než skupin",
    );
    const [earned, total] = numbersIn(
      MANDATORY_SUBTITLE,
      categories[0].subtitle,
      "podtitulek povinných",
    );
    check(
      earned === mandEarned && total === mandTotal,
      "povinné: podtitulek se liší od souhrnu",
    );
  }

  const totalBar = entries.find((entry) => entry.kind === "total");
  check(totalBar?.label === "Celkem kreditů", "chybí pruh „Celkem kreditů“");
  const [totalEarned, totalCredits] = numbersIn(
    CREDIT_PAIR,
    totalBar.value,
    "celkem",
  );
  check(
    totalCredits === req.total_credits &&
      totalEarned === mandEarned + totals.choiceEarned + totals.pvEarned,
    "„Celkem kreditů“ neodpovídá planTotals",
  );

  const notes = entries.filter((entry) => entry.kind === "note");
  const reduction = notes.find((note) => note.label.startsWith("sníženo"));
  const free = notes.find((note) => note.label.startsWith("z toho volitelné"));
  check(
    notes.length === (reduction ? 1 : 0) + (free ? 1 : 0) &&
      (!reduction || overallBar),
    "nečekaná poznámka v souhrnu",
  );
  if (overallBar) {
    const [pvEarned, effOverall] = numbersIn(
      CREDIT_PAIR,
      overallBar.value,
      "PV celkem",
    );
    const ncTotal = reduction
      ? numbersIn(REDUCTION_NOTE, reduction.value, "snížení")[0]
      : 0;
    check(
      pvEarned === totals.pvEarned &&
        effOverall === totals.effOverall &&
        ncTotal === totals.ncTotal,
      "„PV celkem“ neodpovídá planTotals",
    );
  } else {
    check(totals.effOverall === null, "effOverall bez pv_overall_min");
  }

  const groupEarned = groups.map((group, index) => {
    let earned = earnedInBar.has(group) ? earnedInBar.get(group) : null;
    if (categories) {
      const [inSubtitle] = numbersIn(
        EARNED_IN_SUBTITLE,
        categories[index + 1].subtitle,
        `podtitulek skupiny ${group.label}`,
      );
      check(
        earned === null || earned === inSubtitle,
        `${group.label}: podtitulek se liší od pruhu`,
      );
      earned = inSubtitle;
    }
    return earned;
  });
  const ok = status.startsWith("ok | ");

  if (!categories) {
    return {
      mand: mandEarned,
      groups: groupEarned,
      choice: totals.choiceEarned,
      pv: totals.pvEarned,
      total: totalEarned,
      ok,
    };
  }
  return {
    mand: [mandEarned, mandTotal],
    groups: groups.map((group, index) => [
      groupEarned[index],
      group.min,
      group.noCredit,
    ]),
    choice: [totals.choiceEarned, totals.choiceMin],
    pv: [totals.pvEarned, totals.effOverall, totals.ncTotal],
    total: totalEarned,
    free: free ? numbersIn(FREE_NOTE, free.value, "volitelné")[0] : null,
    ok,
  };
}

function readStatus(element) {
  const tone = /^status (ok|todo)$/.exec(element.className);
  check(tone, `nečekaná třída stavu: ${element.className}`);
  return `${tone[1]} | ${element.textContent}`;
}

/** Ročníky v pravém sloupci Rozvrhu. */
function readYearBlocks(container) {
  return container.children.map((block) => {
    const [heading, row] = block.children;
    const [title, reset] = heading.children;
    const parsed =
      /^(\d+\. ročník) <span class="year-credits">([^<]*)<\/span>$/.exec(
        title.html,
      );
    check(parsed, `nečitelný nadpis ročníku: ${title.html}`);
    const slots = row.children.map((slot) => {
      const [label, list] = slot.children;
      const ids = list.children.map((item) => item.dataset.subjectId);
      return `${label.textContent}: ${ids.length ? ids.join(" ") : "–"}`;
    });
    return [
      parsed[1],
      parsed[2],
      reset ? reset.textContent : "–",
      ...slots,
    ].join(" | ");
  });
}

// ---------------------------------------------------------------------------
// Zápis stavu jako text
// ---------------------------------------------------------------------------

function placementsText(placements) {
  return Object.entries(placements)
    .map(([id, placement]) => `${id}:${placement.year}:${placement.semester}`)
    .join(" ");
}

function stateText(state) {
  return [
    `completed=${state.completed.join(" ")}`,
    `noCredit=${state.noCredit.join(" ")}`,
    `placements=${placementsText(state.placements)}`,
    `years=${state.yearsCount}`,
  ].join("; ");
}

// ---------------------------------------------------------------------------
// Jeden datový soubor (rok, případně rok/obor)
// ---------------------------------------------------------------------------

async function generateDataset(dataset, script) {
  const [year, field] = dataset.split("/");
  const nodes = readJson(resolve(dataRoot, dataset, "nodes.json"));
  const subjects = nodes.filter((node) => node.group === "subj");
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const idByLabel = new Map(
    subjects.map((subject) => [subject.label, subject.id]),
  );
  check(
    idByLabel.size === subjects.length,
    `${dataset}: názvy předmětů nejsou jedinečné`,
  );
  for (const subject of subjects) {
    check(/^[\w-]+$/.test(subject.id), `${dataset}: nečekané id ${subject.id}`);
  }
  const specs = nodes.filter((node) => node.group === "spec");
  const requirementSpecs = new Set(
    nodes
      .filter((node) => node.group === "program_req")
      .map((node) => node.spec),
  );

  check(field, `${dataset}: chybí obor`);
  const search = `?rok=${year}&obor=${field}`;
  const legacy = createLegacyContext(search);
  vm.runInContext(script, legacy.context, {
    filename: "kalkulačka/index.html",
  });
  await legacy.run("init()");
  check(
    legacy.run("AKTUALNI_ROK") === year &&
      legacy.run("AKTUALNI_OBOR") === field &&
      legacy.run("SUBJ.length") === subjects.length,
    `${dataset}: starý kód načetl jiná data`,
  );

  const applyState = legacy.run(`(function (input) {
    currentSpec = input.spec;
    currentDegree = input.degree;
    completed = new Set(input.completed);
    noCredit = new Set(input.noCredit);
    placements = JSON.parse(input.placements);
    yearsCount = input.yearsCount;
  })`);
  const readState = () =>
    JSON.parse(
      legacy.run(`JSON.stringify({
        completed: [...completed],
        noCredit: [...noCredit],
        placements,
        yearsCount,
        degree: currentDegree,
      })`),
    );
  const legacyPlan = (specId) =>
    JSON.parse(
      legacy.run(`JSON.stringify((function (plan) {
        return {
          level: plan.req.level,
          mandatory: plan.mandatory.map((s) => s.id),
          groups: plan.groups.map((g) => g.subjects.map((s) => s.id)),
        };
      })(planFor(${JSON.stringify(specId)})))`),
    );

  /** Skupiny plánu a jejich minima přímo z původních funkcí (pro aktuální stav). */
  const legacyGroups = () =>
    JSON.parse(
      legacy.run(`JSON.stringify(planFor(currentSpec).groups.map(function (g) {
        return {
          label: g.def.label,
          rawMin: g.def.min_credits == null ? null : g.def.min_credits,
          min: effMin(g.def.min_credits, g.counted),
          noCredit: ncCreditsIn(g.counted),
          choice: isMandatoryChoice(g.def),
        };
      }))`),
    );

  /** Výsledek původního planTotals (bez funkce earnedIn a seznamů skupin). */
  const legacyTotals = (isDone) =>
    JSON.parse(
      legacy.run(`JSON.stringify((function (t) {
        return {
          pvEarned: t.pvEarned,
          choiceEarned: t.choiceEarned,
          choiceMin: t.choiceMin,
          ncTotal: t.ncTotal,
          effOverall: t.effOverall,
        };
      })(planTotals(planFor(currentSpec), ${isDone})))`),
    );

  /** Vykreslí starou stránku pro daný stav a přečte výsledek. */
  function render(specId, input) {
    applyState({
      spec: specId,
      degree: null,
      completed: input.completed,
      noCredit: input.noCredit,
      placements: JSON.stringify(input.placements),
      yearsCount: input.yearsCount,
    });
    legacy.run("renderDashboard()");
    const after = readState();
    // Vykreslení Rozvrhu zahodí zařazení předmětů mimo plán; ostatní nechá, jak byla.
    const pruned = Object.keys(input.placements).filter(
      (id) => !Object.hasOwn(after.placements, id),
    );
    check(
      placementsText(after.placements) ===
        placementsText(
          Object.fromEntries(
            Object.entries(input.placements).filter(
              ([id]) => !pruned.includes(id),
            ),
          ),
        ),
      "vykreslení změnilo zařazení jinak než odebráním",
    );
    const calc = readCategories(legacy.element("lists"));
    const sched = readCategories(legacy.element("sched-categories"));
    const completed = new Set(input.completed);
    const noCredit = new Set(input.noCredit);

    // Co se do záznamu neukládá, se aspoň ověří: řádky předmětů a shoda obou záložek.
    check(
      calc.categories.length === sched.categories.length,
      "jiný počet kategorií",
    );
    calc.categories.forEach((category, index) => {
      const other = sched.categories[index];
      check(
        category.title === other.title &&
          category.subtitle === other.subtitle &&
          category.badgeText === other.badgeText &&
          category.badgeClass === other.badgeClass &&
          other.click === null,
        `kategorie ${category.title}: Kalkulačka a Rozvrh se liší`,
      );
      check(category.rows.length === other.rows.length, "jiný počet předmětů");
      category.rows.forEach((row, position) => {
        const id = idByLabel.get(row.label);
        const twin = other.rows[position];
        check(
          id === twin.id &&
            row.credits === twin.credits &&
            row.toggle === twin.toggle &&
            row.done === completed.has(id) &&
            row.noCredit === noCredit.has(id) &&
            twin.noCredit === noCredit.has(id) &&
            twin.done === Object.hasOwn(after.placements, id),
          `předmět ${row.label}: nečekaný řádek`,
        );
        const placement = after.placements[id];
        check(
          twin.tagClass === (placement ? "placed-at" : "sem-tag"),
          `předmět ${row.label}: nečekaný štítek semestru`,
        );
      });
    });

    const minus = legacy.element("years-minus").disabled;
    const plus = legacy.element("years-plus").disabled;
    check(
      legacy.element("dash-degree").textContent ===
        legacy.element("sched-degree").textContent &&
        legacy.element("dash-title").textContent ===
          legacy.element("sched-title").textContent,
      "nadpisy Kalkulačky a Rozvrhu se liší",
    );

    const groups = legacyGroups();
    const req = JSON.parse(
      legacy.run(`JSON.stringify(REQS[${JSON.stringify(specId)}])`),
    );
    const calcTotals = legacyTotals(
      "function (id) { return completed.has(id); }",
    );
    const schedTotals = legacyTotals(
      "function (id) { return !!placements[id]; }",
    );
    const summary = readSummary(legacy.element("summary-body").html);
    const status = readStatus(legacy.element("status"));
    const schedSummary = readSummary(
      legacy.element("sched-plan-summary-body").html,
    );
    const schedStatus = readStatus(legacy.element("sched-status"));

    return {
      after,
      calc,
      sched,
      degreeLabel: legacy.element("dash-degree").textContent,
      title: legacy.element("dash-title").textContent,
      record: {
        categories: calc.categories.map(
          (category) =>
            `${category.title} | ${category.badgeText} [${category.badgeClass}${
              category.click ? `, klik ${category.click}` : ""
            }] | ${category.subtitle}`,
        ),
        summary: summary.lines,
        status,
        numbers: readNumbers(
          summary.entries,
          status,
          groups,
          calcTotals,
          calc.categories,
          req,
        ),
        schedule: {
          pruned: pruned.join(" "),
          yearsCount: after.yearsCount,
          stepper: `${legacy.element("years-count").textContent} | − ${
            minus ? "vypnuto" : "zapnuto"
          } | + ${plus ? "vypnuto" : "zapnuto"}`,
          placed: sched.categories
            .flatMap((category) => category.rows)
            .filter((row) => row.tagClass === "placed-at")
            .map((row) => `${row.id}=${row.tagText}`)
            .join("; "),
          years: readYearBlocks(legacy.element("year-blocks")),
          summary: schedSummary.lines,
          status: schedStatus,
          numbers: readNumbers(
            schedSummary.entries,
            schedStatus,
            groups,
            schedTotals,
            null,
            req,
          ),
        },
      },
    };
  }

  const result = { nodesDigest: jsonDigest(nodes), specs: {} };

  for (const spec of specs) {
    check(
      requirementSpecs.has(spec.id),
      `${dataset}: ${spec.id} nemá program_req`,
    );
    const plan = legacyPlan(spec.id);
    const planIds = [...plan.mandatory, ...plan.groups.flat()];
    const pvIds = plan.groups.flat();
    const inPlan = new Set(planIds);
    const foreignIds = subjects
      .map((s) => s.id)
      .filter((id) => !inPlan.has(id));
    const defaultYears = spec.study_type === "magisterske" ? 2 : 3;
    const fixedSemester = (id) => {
      const semester = subjectById.get(id).semester;
      return SEMESTERS.includes(semester) ? semester : null;
    };

    // --- scénáře -----------------------------------------------------------
    const scenarios = [];
    scenarios.push({
      name: "nic",
      completed: [],
      noCredit: [],
      placements: {},
      yearsCount: null,
    });
    scenarios.push({
      name: "vše",
      completed: planIds,
      noCredit: [],
      placements: Object.fromEntries(
        planIds.map((id, index) => [
          id,
          {
            year: (index % defaultYears) + 1,
            semester: fixedSemester(id) ?? SEMESTERS[index % 2],
          },
        ]),
      ),
      yearsCount: null,
    });
    scenarios.push({
      name: "PV bez kreditů",
      completed: plan.mandatory,
      noCredit: pvIds,
      placements: Object.fromEntries(
        plan.mandatory
          .filter((_, index) => index % 2 === 0)
          .map((id, index) => [
            id,
            { year: (index % 4) + 1, semester: fixedSemester(id) ?? "letní" },
          ]),
      ),
      yearsCount: 4,
    });
    [0.3, 0.55, 0.8].forEach((share, index) => {
      const number = index + 1;
      const random = mulberry32(
        hashSeed(`${dataset}/${spec.id}/náhodný-${number}`),
      );
      const yearsCount = [null, 5, 2][index];
      const years = yearsCount ?? defaultYears;
      const completed = shuffled(random, planIds).filter(
        () => random() < share,
      );
      const done = new Set(completed);
      const noCredit = pvIds.filter((id) => !done.has(id) && random() < 0.25);
      const placements = {};
      for (const id of completed) {
        if (random() >= 0.6) continue;
        // 3. scénář: občas ročník nad rozsahem (v souhrnu se počítá, v ročnících není vidět)
        const beyond = number === 3 && random() < 0.15;
        placements[id] = {
          year: beyond ? years + 1 : 1 + Math.floor(random() * years),
          semester: fixedSemester(id) ?? pick(random, SEMESTERS),
        };
      }
      if (number >= 2 && foreignIds.length > 0) {
        // předměty mimo plán: nesmí nic ovlivnit, zařazení se při vykreslení zahodí
        const foreign = pick(random, foreignIds);
        const second = pick(random, foreignIds);
        completed.push(foreign);
        if (!completed.includes(second)) completed.push(second);
        if (!noCredit.includes(second)) noCredit.push(second);
        placements[foreign] = {
          year: 1,
          semester: fixedSemester(foreign) ?? "zimní",
        };
      }
      if (number === 3) {
        // stav, který stará stránka sama nevytvoří: splněno i „bez kreditů“ zároveň
        const overlap = completed
          .filter((id) => pvIds.includes(id))
          .slice(0, 2);
        for (const id of overlap) if (!noCredit.includes(id)) noCredit.push(id);
      }
      scenarios.push({
        name: `náhodný ${number}`,
        completed,
        noCredit,
        placements,
        yearsCount,
      });
    });

    // --- plán (nezávislý na scénáři) ---------------------------------------
    const first = render(spec.id, scenarios[0]);
    const planRecord = {
      degreeLabel: first.degreeLabel,
      title: first.title,
      note: first.calc.note,
      categories: first.calc.categories.map((category, index) => ({
        title: category.title,
        noCreditToggle: category.rows.some((row) => row.toggle),
        subjects: category.rows.map((row, position) => {
          const twin = first.sched.categories[index].rows[position];
          return `${twin.id} | ${row.credits} | ${twin.tagText}`;
        }),
      })),
    };
    check(
      JSON.stringify(
        first.calc.categories.map((c) =>
          c.rows.map((r) => idByLabel.get(r.label)),
        ),
      ) === JSON.stringify([plan.mandatory, ...plan.groups]),
      `${dataset}/${spec.id}: vykreslené pořadí neodpovídá planFor`,
    );

    // Výběr ročníku a zvýraznění při přetahování – pro jeden předmět od každého semestru.
    const samples = [];
    for (const id of planIds) {
      const semester = subjectById.get(id).semester;
      if (!samples.some((item) => item.semester === semester)) {
        samples.push({ id, semester });
      }
    }
    const firstYearSlots =
      legacy.element("year-blocks").children[0].children[1].children;
    const setDragged = legacy.run("(function (id) { dragSubjectId = id; })");
    planRecord.pickers = samples.map(({ id, semester }) => {
      legacy.run(`openYearPicker(${JSON.stringify(id)})`);
      const backdrop = legacy.body.children.at(-1);
      const options = backdrop.children[0].children[1].children.map(
        (button) => button.textContent,
      );
      legacy.body.removeChild(backdrop);
      setDragged(id);
      const drops = SEMESTERS.map((slotSemester, index) => {
        const slot = firstYearSlots[index];
        slot.ondragover({ preventDefault() {}, dataTransfer: {} });
        const allowed = slot.classList.contains("drag-over");
        check(
          allowed !== slot.classList.contains("drag-denied"),
          "nejasné zvýraznění cíle",
        );
        slot.ondragleave();
        return `${slotSemester} ${allowed ? "ano" : "ne"}`;
      });
      setDragged(null);
      return `${id} (${semester}) | ${options.join("; ")} | přetažení: ${drops.join(", ")}`;
    });

    // --- vykreslení scénářů -------------------------------------------------
    const scenarioRecords = scenarios.map((scenario) => {
      const rendered = render(spec.id, scenario);
      check(
        rendered.degreeLabel === planRecord.degreeLabel &&
          rendered.title === planRecord.title &&
          rendered.calc.note === planRecord.note,
        "nadpisy se mezi scénáři liší",
      );
      rendered.calc.categories.forEach((category, index) => {
        const expected = planRecord.categories[index];
        check(
          category.title === expected.title &&
            category.rows.length === expected.subjects.length &&
            category.rows.every((row, position) =>
              expected.subjects[position].startsWith(
                `${idByLabel.get(row.label)} | ${row.credits} | `,
              ),
            ),
          "řádky předmětů se mezi scénáři liší",
        );
      });
      return {
        name: scenario.name,
        completed: scenario.completed.join(" "),
        noCredit: scenario.noCredit.join(" "),
        placements: placementsText(scenario.placements),
        yearsCount: scenario.yearsCount,
        ...rendered.record,
      };
    });

    result.specs[spec.id] = { plan: planRecord, scenarios: scenarioRecords };
  }

  // --- posloupnosti akcí: první bakalářská a první magisterská specializace ---
  result.sequences = {};
  for (const studyType of ["bakalarske", "magisterske"]) {
    const spec = specs.find((item) => item.study_type === studyType);
    if (!spec) continue;
    const plan = legacyPlan(spec.id);
    const categories = [plan.mandatory, ...plan.groups];
    const planIds = categories.flat();
    const pvIds = plan.groups.flat();
    const inPlan = new Set(planIds);
    const foreignIds = subjects
      .map((s) => s.id)
      .filter((id) => !inPlan.has(id));
    const random = mulberry32(hashSeed(`${dataset}/${spec.id}/posloupnost`));

    legacy.storage.clear();
    applyState({
      spec: null,
      degree: studyType,
      completed: [],
      noCredit: [],
      placements: "{}",
      yearsCount: null,
    });
    legacy.run(`selectSpec(${JSON.stringify(spec.id)})`);
    const start = stateText(readState());

    const call = (name, ...args) =>
      legacy.run(
        `${name}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`,
      );
    const idsOf = (index) => categories[index];
    /** Zaškrtávátko u předmětu v levém sloupci Rozvrhu – spustí původní obsluhu. */
    const scheduleCheckbox = (id) => {
      const row = readCategories(legacy.element("sched-categories"))
        .categories.flatMap((category) => category.rows)
        .find((item) => item.id === id);
      row.checkbox.checked = !row.checkbox.checked;
      row.checkbox.onchange();
      check(
        legacy.errors.length === 0,
        `starý kód ohlásil chybu: ${legacy.errors.join("; ")}`,
      );
    };
    const actions = {
      toggleDone: (id) => call("toggleDone", id),
      toggleNoCredit: (id) => call("toggleNoCredit", id),
      completeAllMandatory: () => call("completeAllMandatory"),
      resetCategory: (index) => call("resetCategory", idsOf(Number(index))),
      resetAllProgress: () => call("resetAllProgress"),
      changeYears: (delta) => call("changeYears", Number(delta)),
      placeSubject: (id, placeYear, semester) =>
        call("placeSubject", id, Number(placeYear), semester),
      scheduleCheckbox,
      unplaceFromSchedule: (id) => call("unplaceFromSchedule", id),
      resetYear: (resetYear) => call("resetYear", Number(resetYear)),
      resetAllSchedule: () => call("resetAllSchedule"),
      resetSchedCategory: (index) =>
        call("resetSchedCategory", idsOf(Number(index))),
    };

    // Pevný úvod pokrývá hrany (meze počtu ročníků, prázdné resety), zbytek je náhodný.
    const firstMandatory = plan.mandatory[0];
    const lastYear = studyType === "magisterske" ? 2 : 3;
    const firstSemester =
      SEMESTERS.find((s) => s === subjectById.get(firstMandatory).semester) ??
      "letní";
    const opening = [
      "resetYear 1",
      "resetAllSchedule",
      `placeSubject ${firstMandatory} ${lastYear} ${firstSemester}`,
      ...Array(3).fill("changeYears -1"),
      ...Array(8).fill("changeYears 1"),
      ...Array(5).fill("changeYears -1"),
      // každá akce aspoň jednou, i ty, na které by náhoda nemusela přijít
      "completeAllMandatory",
      `toggleNoCredit ${pvIds[0]}`,
      `scheduleCheckbox ${pvIds.at(-1)}`,
      `scheduleCheckbox ${pvIds.at(-1)}`,
      `placeSubject ${firstMandatory} 1 ${firstSemester}`,
      "resetSchedCategory 1",
      "resetCategory 0",
      "resetAllProgress",
      "resetAllProgress",
    ];

    function randomAction() {
      const state = readState();
      const years = state.yearsCount;
      const placedIds = Object.keys(state.placements);
      const anyYear = () => 1 + Math.floor(random() * years);
      const r = random();
      if (r < 0.22) return `toggleDone ${pick(random, planIds)}`;
      if (r < 0.32) return `toggleNoCredit ${pick(random, pvIds)}`;
      if (r < 0.6) {
        return `placeSubject ${pick(random, planIds)} ${anyYear()} ${pick(random, SEMESTERS)}`;
      }
      if (r < 0.66) return `scheduleCheckbox ${pick(random, planIds)}`;
      if (r < 0.74) {
        const id =
          placedIds.length > 0 && random() < 0.8
            ? pick(random, placedIds)
            : pick(random, planIds);
        return `unplaceFromSchedule ${id}`;
      }
      if (r < 0.81) return `changeYears ${random() < 0.5 ? 1 : -1}`;
      if (r < 0.85) return `resetYear ${anyYear()}`;
      if (r < 0.88) {
        return `resetCategory ${Math.floor(random() * categories.length)}`;
      }
      if (r < 0.91) {
        return `resetSchedCategory ${Math.floor(random() * categories.length)}`;
      }
      if (r < 0.93) return "completeAllMandatory";
      if (r < 0.945) return "resetAllSchedule";
      if (r < 0.955) return "resetAllProgress";
      if (r < 0.98 && foreignIds.length > 0) {
        return `placeSubject ${pick(random, foreignIds)} ${anyYear()} ${pick(random, SEMESTERS)}`;
      }
      return "placeSubject NEEXISTUJE 1 zimní";
    }

    const steps = [];
    for (let step = 0; step < opening.length + SEQUENCE_STEPS; step++) {
      const action = step < opening.length ? opening[step] : randomAction();
      const [name, ...args] = action.split(" ");
      legacy.writes.length = 0;
      actions[name](...args);
      const saved = [
        legacy.writes.some((key) => key.startsWith("mff_completed")) &&
          "postup",
        legacy.writes.some((key) => key.startsWith("mff_sched_placements")) &&
          "rozvrh",
      ].filter(Boolean);
      steps.push(
        `${action} => uloženo: ${saved.join("+") || "nic"} => ${stateText(readState())}`,
      );
    }
    result.sequences[spec.id] = { start, steps };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hlavní běh
// ---------------------------------------------------------------------------

const { html, script } = legacyScript();
const years = readJson(resolve(dataRoot, "years.json")).filter(
  (item) => typeof item === "string" && /^\d{4}-\d{4}$/.test(item),
);
const datasets = years.flatMap((year) => {
  const fieldsFile = resolve(dataRoot, year, "fields.json");
  check(existsSync(fieldsFile), `chybí ${fieldsFile}`);
  return readJson(fieldsFile).map((field) => `${year}/${field}`);
});

const fixture = {
  description:
    "Záznam výpočtů a vykreslení staré kalkulačky. Negenerováno ručně – viz scripts/gen-credits-fixture.mjs.",
  source: relative(repoRoot, htmlPath).replaceAll("\\", "/"),
  sourceSha256: createHash("sha256")
    .update(html.replaceAll("\r\n", "\n"))
    .digest("hex"),
  tones: TONES,
  datasets: {},
};
for (const dataset of datasets) {
  fixture.datasets[dataset] = await generateDataset(dataset, script);
}

const formatted = `${JSON.stringify(fixture)}\n`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, formatted);

const scenarioCount = Object.values(fixture.datasets).reduce(
  (sum, dataset) =>
    sum +
    Object.values(dataset.specs).reduce(
      (count, spec) => count + spec.scenarios.length,
      0,
    ),
  0,
);
console.log(
  `gen-credits-fixture: ${relative(repoRoot, outPath)} – ${datasets.length} datových sad, ${scenarioCount} scénářů, ${formatted.length} znaků`,
);
