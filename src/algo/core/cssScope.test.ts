// Styly algoritmů na stránce /algo/ hlavní aplikace: nesmí prosakovat mimo .algo-root,
// proměnné mají prefix --algo-, lepící a pevné prvky leží pod hlavičkou webu.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIT_MEDIA } from "./layoutMedia";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8")
  .replaceAll("\r\n", "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selector: string;
  body: string;
  /** podmínky obalujících @media (prázdné = žádné) */
  media: string[];
}

/** Jednoduchý parser: pravidla včetně vnořených v @media / @supports, @keyframes přeskočí. */
function parseRules(text: string, media: string[] = []): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    const inner = text.slice(open + 1, j - 1);
    if (head.startsWith("@media") || head.startsWith("@supports")) {
      out.push(...parseRules(inner, [...media, head]));
    } else if (!head.startsWith("@")) {
      out.push({ selector: head, body: inner, media });
    }
    i = j;
  }
  return out;
}

const rules = parseRules(css);
const selectorsOf = (rule: Rule) =>
  rule.selector.split(",").map((part) => part.trim());

/** Pravidla, která smí stát mimo .algo-root (celá stránka /algo/, ne obsah). */
const THEME_ROOT =
  /^:root(\[data-theme="(light|dark)"\]|:not\(\[data-theme="light"\]\))?$/;
const SITE_HEADER =
  /^:root(\[data-theme="dark"\]|:not\(\[data-theme="light"\]\)) \.(site-header|header-logo|main-nav)\b/;

describe("index.css – rozsah stylů na stránce /algo/", () => {
  it("parser našel pravidla (kontrola testu samotného)", () => {
    expect(rules.length).toBeGreaterThan(300);
  });

  it("každé pravidlo obsahu je pod .algo-root", () => {
    const leaking: string[] = [];
    for (const rule of rules) {
      for (const selector of selectorsOf(rule)) {
        if (THEME_ROOT.test(selector) || SITE_HEADER.test(selector)) continue;
        if (selector === "body") continue;
        if (!/^\.algo-root(\s|$|[.:[])/.test(selector)) leaking.push(selector);
      }
    }
    expect(leaking).toEqual([]);
  });

  it(":root a body nastavují jen proměnné, color-scheme, pozadí, okraj a písmo stránky", () => {
    const allowed =
      /^(--algo-[\w-]+|color-scheme|background|margin|font-family|color)$/;
    for (const rule of rules) {
      if (!selectorsOf(rule).some((s) => THEME_ROOT.test(s) || s === "body"))
        continue;
      for (const m of rule.body.matchAll(/([\w-]+)\s*:/g)) {
        expect(m[1], rule.selector).toMatch(allowed);
      }
    }
  });

  it("vlastní proměnné mají prefix --algo- (kromě výšky hlavičky webu)", () => {
    const defined = [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(defined.length).toBeGreaterThan(30);
    expect(defined.filter((name) => !name.startsWith("--algo-"))).toEqual([]);
  });

  it("každé var() v CSS i v kódu algo míří na definovanou --algo-* proměnnou nebo --site-header-h", () => {
    const defined = new Set(
      [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    );
    const sources = [css];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
          sources.push(readFileSync(path, "utf8"));
      }
    };
    walk(fileURLToPath(new URL("..", import.meta.url)));
    const bad = new Set<string>();
    for (const text of sources)
      for (const m of text.matchAll(/var\((--[\w-]+)/g))
        if (m[1] !== "--site-header-h" && !defined.has(m[1])) bad.add(m[1]);
    expect([...bad]).toEqual([]);
  });
});

describe("index.css – pod hlavičkou webu (sticky, z-index 1000)", () => {
  const find = (selector: string, mediaPart?: string) =>
    rules.filter(
      (rule) =>
        selectorsOf(rule).includes(selector) &&
        (mediaPart === undefined
          ? rule.media.length === 0
          : rule.media.some((m) => m.includes(mediaPart))),
    );
  const top = (rule: Rule) => /(?:^|[;\s])top:\s*([^;]+);/.exec(rule.body)?.[1];

  it("lepící menu a pseudokód začínají pod hlavičkou (--site-header-h)", () => {
    for (const [selector, mediaPart] of [
      [".algo-root .sidebar", undefined],
      [".algo-root .viz-code", undefined],
      [".algo-root .topbar", "max-width: 900px"],
      [".algo-root .sidebar", "max-width: 900px"],
      [".algo-root .backdrop", "max-width: 900px"],
    ] as const) {
      const withTop = find(selector, mediaPart).filter((rule) => top(rule));
      expect(withTop.length, selector).toBeGreaterThan(0);
      for (const rule of withTop)
        expect(top(rule), `${selector} @ ${mediaPart}`).toContain(
          "var(--site-header-h",
        );
    }
  });

  it("výška menu a pseudokódu odečítá hlavičku", () => {
    const sidebar = find(".algo-root .sidebar")[0]!;
    expect(sidebar.body).toMatch(
      /height:\s*calc\(100dvh - var\(--site-header-h/,
    );
    const code = find(".algo-root .pseudocode")[0]!;
    expect(code.body).toMatch(
      /max-height:\s*calc\(100vh - 2rem - var\(--site-header-h/,
    );
  });

  it("plátno posunuté do záběru po operaci (telefon) nezajede pod hlavičku ani pod horní lištu", () => {
    // posun nahoru k plátnu hlavičku zase ukáže (auto-hide) – počítat s její plnou výškou, ne s
    // --site-header-h, které je ve chvíli posunu (schovaná hlavička) 0
    const canvas = find(".algo-root .viz-canvas", "max-width: 900px")
      .map((r) => r.body)
      .join(";");
    expect(canvas).toMatch(
      /scroll-margin-top:\s*calc\(3\.5rem \+ var\(--algo-site-header-space, 0px\)\)/,
    );
  });

  it("žádný prvek algo nemá z-index nad hlavičkou webu", () => {
    for (const m of css.matchAll(/z-index:\s*(\d+)/g))
      expect(Number(m[1])).toBeLessThan(1000);
  });
});

describe("index.css – tmavá varianta hlavičky webu jen na stránce /algo/", () => {
  const headerRules = rules.filter((rule) =>
    selectorsOf(rule).some((s) => SITE_HEADER.test(s)),
  );

  it("ruční tmavé téma i tmavé téma systému mají stejnou hlavičku", () => {
    const manual = headerRules
      .filter((r) => r.media.length === 0)
      .map((r) => [
        r.selector.replace(/^:root\[data-theme="dark"\] /, ""),
        r.body.replace(/\s+/g, " ").trim(),
      ]);
    const system = headerRules
      .filter((r) =>
        r.media.some((m) => m.includes("prefers-color-scheme: dark")),
      )
      .map((r) => [
        r.selector.replace(/^:root:not\(\[data-theme="light"\]\) /, ""),
        r.body.replace(/\s+/g, " ").trim(),
      ]);
    expect(manual.length).toBeGreaterThan(0);
    expect(system).toEqual(manual);
    expect(
      manual.find(([selector]) => selector === ".site-header")?.[1],
    ).toMatch(/background-color:\s*[^;]*var\(--algo-/);
  });
});

describe("index.css – panel akcí, přehrávání a úpravy na plátně", () => {
  const body = (selector: string, mediaPart?: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          (mediaPart === undefined
            ? rule.media.length === 0
            : rule.media.some((m) => m.includes(mediaPart))),
      )
      .map((r) => r.body)
      .join(";");

  it("přehrávání je přilepené dole na každé šířce (nejen na mobilu) a pod hlavičkou webu", () => {
    const b = body(".algo-root .controls");
    expect(b).toMatch(/position:\s*sticky/);
    expect(b).toMatch(/bottom:\s*0/);
    expect(b).toMatch(/z-index:\s*\d/);
  });

  it("dok pod plátnem: akce vlevo, stav vpravo; na úzké obrazovce pod sebou (stav nad akcemi)", () => {
    expect(body(".algo-root .viz-dock")).toMatch(/display:\s*grid/);
    expect(body(".algo-root .viz-dock")).toMatch(
      /grid-template-columns:[^;]*minmax/,
    );
    const narrow = body(".algo-root .viz-dock", "max-width: 700px");
    expect(narrow).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(
      body(".algo-root .viz-dock .viz-status", "max-width: 700px"),
    ).toMatch(/order:\s*-1/);
  });

  it("ActionMenu: akce, pole a Provést; dotykové cíle aspoň 44 px", () => {
    for (const s of [
      ".algo-root .action-menu",
      ".algo-root .am-action",
      ".algo-root .am-body",
      ".algo-root .am-go",
      ".algo-root .am-msg.error",
    ])
      expect(body(s), s).not.toBe("");
    expect(body(".algo-root .am-action", "pointer: coarse")).toMatch(
      /min-height:\s*(2\.75rem|44px)/,
    );
    expect(body('.algo-root .am-action[aria-disabled="true"]')).toMatch(
      /opacity/,
    );
  });

  it("úpravy grafu: pozadí chytá klik, široký neviditelný úchop hran, náhled hrany, bez posouvání stránky prstem", () => {
    expect(body(".algo-root .graph-bg")).toMatch(/pointer-events:\s*all/);
    expect(body(".algo-root .edge-hit")).toMatch(/stroke-width:\s*1[4-9]/);
    expect(body(".algo-root .graph-preview")).toMatch(/stroke-dasharray/);
    expect(body(".algo-root .graph-svg.editing")).toMatch(
      /touch-action:\s*none/,
    );
    expect(
      body(".algo-root .graph-node.is-selected circle:not(.node-hit)"),
    ).toMatch(/stroke/);
  });

  it("přilepená lišta je nízká: posuvník kroků roste v řádku s tlačítky, na úzké obrazovce je s rychlostí ve druhém řádku", () => {
    expect(body(".algo-root .controls")).toMatch(/padding:\s*0\.4rem/);
    // řádek se láme podle flex-basis – malý základ, aby se lišta vešla do jednoho řádku i na 1366 px
    expect(body(".algo-root .controls .seek")).toMatch(/flex:\s*1 1 4rem/);
    // slovo „rychlost“ jen pro čtečky (posuvník má aria-label i hodnotu „1×“) – řádek se vejde i na 1366 px
    expect(body(".algo-root .speed-label")).toMatch(
      /clip-path:\s*inset\(50%\)/,
    );
    expect(body(".algo-root .controls .seek")).toMatch(/min-width:\s*4rem/);
    // telefon: 1. řádek tlačítka + počítadlo, 2. řádek posuvník kroků + rychlost (ne tři řádky)
    expect(body(".algo-root .controls .seek", "max-width: 600px")).toMatch(
      /order:\s*10/,
    );
    expect(body(".algo-root .controls .speed", "max-width: 600px")).toMatch(
      /order:\s*11/,
    );
    expect(body(".algo-root .controls .seek", "max-width: 600px")).not.toMatch(
      /flex-basis:\s*100%/,
    );
  });

  it("široký pohled, který se posouvá do strany (telefon), má u kraje stín – je vidět, že pokračuje", () => {
    for (const sel of [".algo-root .view-wrap", ".algo-root .boxlist-wrap"]) {
      const body = rules
        .filter((r) => selectorsOf(r).includes(sel) && r.media.length === 0)
        .map((r) => r.body)
        .join(";");
      // „scroll shadows“: kryt v barvě plátna jede s obsahem (local), stín drží okraj (scroll)
      expect(body, sel).toMatch(/background:[^;]*\blocal\b/);
      expect(body, sel).toMatch(
        /background:[^;]*radial-gradient[^;]*\bscroll\b/,
      );
    }
  });

  it("bez přesahu stín neprosvítá: neprůhledná část krytu je aspoň tak široká jako stín", () => {
    const body = rules
      .filter(
        (r) =>
          selectorsOf(r).includes(".algo-root .view-wrap") &&
          r.media.length === 0,
      )
      .map((r) => r.body)
      .join(";");
    const cover =
      /linear-gradient\(to right, var\(--algo-panel\) (\d+)%, transparent\)[^/]*\/\s*([\d.]+)rem/.exec(
        body,
      );
    const shadow =
      /farthest-side at 0 50%[\s\S]*?left center \/ ([\d.]+)rem/.exec(body);
    expect(cover, "kryt").not.toBeNull();
    expect(shadow, "stín").not.toBeNull();
    const opaque = (Number(cover![1]) / 100) * Number(cover![2]);
    expect(opaque).toBeGreaterThanOrEqual(Number(shadow![1]));
  });

  it("tip „Zkuste:“ nemá záporný horní okraj (nepřekryje zalomenou legendu)", () => {
    const tips = rules.filter((rule) =>
      selectorsOf(rule).some((s) => /\.viz-tip\b/.test(s)),
    );
    expect(tips.length).toBeGreaterThan(0);
    for (const rule of tips) {
      expect(rule.body, rule.selector).not.toMatch(/margin(-top)?:\s*-/);
    }
  });

  it("prvky k výběru klikem mají kurzor a viditelný fokus", () => {
    expect(body(".algo-root .pickable")).toMatch(/cursor:\s*pointer/);
    expect(body(".algo-root .pickable:focus-visible")).toMatch(/outline/);
  });
});

// Jen pravidla v CSS (regexy nad textem, ne rozložení). Že se modul opravdu vejde na obrazovku, měří
// ručně scripts/measure-algo-fit.mjs v prohlížeči (docs/vizualizace.md).
describe("index.css – pravidla rozložení stránky modulu na jednu obrazovku (desktop)", () => {
  /** podmínka „desktop“: dost široké i vysoké okno, aby se plátno, akce i pseudokód vešly vedle sebe */
  const FIT = "(min-width: 1100px) and (min-height: 600px)";
  const fit = (selector: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          rule.media.some((m) => m.includes(FIT)),
      )
      .map((r) => r.body)
      .join(";");
  const base = (selector: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) && rule.media.length === 0,
      )
      .map((r) => r.body)
      .join(";");

  it("pravidla: kostra má výšku okna bez hlavičky webu, plátno vyplní zbytek (flex) a posouvá se uvnitř sebe", () => {
    const viz = fit(".algo-root .viz");
    // místo hlavičky v toku (i schované) – s --site-header-h (schovaná = 0) by kostra narostla
    // a stránka by se o výšku hlavičky posouvala
    expect(viz).toMatch(
      /height:\s*calc\(100dvh - var\(--algo-site-header-space, 0px\)/,
    );
    expect(viz).not.toMatch(/--site-header-h/);
    // obal stránky (menu + obsah) stejně – jinak by šlo stránku posunout o výšku schované hlavičky
    expect(fit(".algo-root .layout")).toMatch(
      /min-height:\s*calc\(100dvh - var\(--algo-site-header-space, 0px\)\)/,
    );
    // levá lišta na stránce modulu neanimuje výšku: při načtení by přechod z plné výšky okna na chvíli
    // přetekl stránku (a posun by schoval hlavičku)
    expect(fit(".algo-root .layout:has(.viz) .sidebar")).toMatch(
      /transition:\s*none/,
    );
    // výchozí hodnota pro var() (inline styl na <html> z siteHeader.ts ji přepíše)
    expect(
      rules.some(
        (r) =>
          selectorsOf(r).includes(":root") &&
          /--algo-site-header-space:\s*0px/.test(r.body),
      ),
    ).toBe(true);
    expect(viz).toMatch(/display:\s*flex/);
    expect(viz).toMatch(/flex-direction:\s*column/);
    const main = fit(".algo-root .viz-main");
    expect(main).toMatch(/flex:\s*1 1 0/);
    expect(main).toMatch(/min-height:\s*0/);
    // řádky mřížky viz další blok (stav nad pseudokódem, akce a přehrávání pod plátnem)
    expect(main).toMatch(/minmax\(0,\s*1fr\)/);
    const canvas = fit(".algo-root .viz-canvas");
    expect(canvas).toMatch(/flex:\s*1 1 0/);
    expect(canvas).toMatch(/overflow:\s*auto/);
    // obsah stránky modulu bez spodního odsazení 3rem, které by stránku posunulo
    expect(fit(".algo-root .content:has(> .viz)")).toMatch(/padding/);
  });

  it("pravidla: SVG pohledů se smí zmenšit do výšky plátna se zachovaným poměrem stran (pojistka za canvasFit.ts)", () => {
    const wrap = fit(".algo-root .viz-canvas .view-wrap");
    expect(wrap).toMatch(/display:\s*flex/);
    expect(wrap).toMatch(/min-height:\s*0/);
    const svg = fit(".algo-root .viz-canvas .view-wrap > svg");
    expect(svg).toMatch(/min-height:\s*0/);
    expect(svg).toMatch(/height:\s*auto/);
    expect(svg).toMatch(/width:\s*auto/);
    expect(svg).toMatch(/max-width:\s*100%/);
    expect(svg).toMatch(/flex:\s*0 1 auto/);
  });

  it("pravidla: pás textu (KMP, AC, RK) se nesmršťuje – dlouhý se posouvá vodorovně v plné velikosti", () => {
    const wrap = fit(".algo-root .viz-canvas .strip-view.view-wrap");
    expect(wrap).toMatch(/overflow-x:\s*auto/);
    const svg = fit(".algo-root .viz-canvas .strip-view.view-wrap > svg");
    expect(svg).toMatch(/max-width:\s*none/);
    expect(svg).toMatch(/flex:\s*none/);
  });

  it("pravidla: pravý sloupec je sloupec flexu, pseudokód v něm roste a posouvá se uvnitř sebe", () => {
    expect(base(".algo-root .viz-code") + fit(".algo-root .viz-code")).toMatch(
      /flex-direction:\s*column/,
    );
    expect(fit(".algo-root .viz-code")).toMatch(/min-height:\s*0/);
    const code = fit(".algo-root .viz-code .pseudocode");
    expect(code).toMatch(/max-height:\s*none/);
    expect(code).toMatch(/flex:\s*1 1 auto/);
  });

  it("pravidla: pseudokód má nejmenší výšku, rozbalená nápověda, popis i pravý sloupec se posouvají uvnitř sebe", () => {
    // pseudokód si drží aspoň několik řádků (dřív ho rozbalená nápověda smrskla na jeden)
    expect(fit(".algo-root .viz-code .pseudocode")).toMatch(
      /min-height:\s*min\(\d+(\.\d+)?rem/,
    );
    // co se do pravého sloupce nevejde, posouvá se uvnitř sloupce, ne celá stránka
    expect(fit(".algo-root .viz-code")).toMatch(/overflow-y:\s*auto/);
    const help = fit(".algo-root .viz-more[open] .viz-more-body");
    expect(help).toMatch(/max-height:\s*\d+vh/);
    expect(help).toMatch(/overflow-y:\s*auto/);
    // rozbalený popis („více“) se posouvá uvnitř sebe – plátno a lišta zůstanou na obrazovce
    const desc = fit(".algo-root .viz-desc.open .viz-desc-body");
    expect(desc).toMatch(/max-height:/);
    expect(desc).toMatch(/overflow-y:\s*auto/);
  });

  it("popis je sbalený na dva řádky (line-clamp) a nápověda je <details>", () => {
    const desc = base(".algo-root .viz-desc:not(.open) .viz-desc-body");
    expect(desc).toMatch(/-webkit-line-clamp:\s*2/);
    expect(desc).toMatch(/overflow:\s*hidden/);
    expect(base(".algo-root .viz-desc-toggle")).not.toMatch(/display:\s*none/);
    expect(base(".algo-root .viz-more > summary")).toMatch(/cursor:\s*pointer/);
  });

  it("nabídka akcí je v řádcích vedle sebe; otevřená akce (pole + Provést) pod tlačítky přes celou šířku", () => {
    const list = base(".algo-root .am-list");
    expect(list).toMatch(/flex-direction:\s*row/);
    expect(list).toMatch(/flex-wrap:\s*wrap/);
    // tělo otevřené akce je v DOM za seznamem (ActionMenu.tsx) – žádné display: contents ani order,
    // které by rozházely pořadí tabulátoru a roli položek seznamu
    expect(base(".algo-root .am-item")).not.toMatch(/display:\s*contents/);
    expect(base(".algo-root .am-body")).not.toMatch(/order:/);
  });
});

describe("index.css – mřížka stránky modulu na desktopu (stav nad pseudokódem, akce přes šířku plátna)", () => {
  const FIT = "(min-width: 1100px) and (min-height: 600px)";
  const fit = (selector: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          rule.media.some((m) => m.includes(FIT)),
      )
      .map((r) => r.body)
      .join(";");

  it("levý sloupec a dok nevytvářejí box; plátno, akce, stav, přehrávání a pravý sloupec mají vlastní oblasti", () => {
    const main = fit(".algo-root .viz-main");
    expect(main).toMatch(/grid-template-areas:/);
    for (const a of [
      '"canvas status"',
      '"canvas side"',
      '"actions side"',
      '"controls side"',
    ])
      expect(main, a).toContain(a);
    expect(main).toMatch(
      /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto/,
    );
    expect(fit(".algo-root .viz-canvas-col")).toMatch(/display:\s*contents/);
    expect(fit(".algo-root .viz-dock")).toMatch(/display:\s*contents/);
    for (const [s, area] of [
      [".algo-root .viz-canvas", "canvas"],
      [".algo-root .viz-actions", "actions"],
      [".algo-root .viz-status", "status"],
      [".algo-root .controls", "controls"],
      [".algo-root .viz-code", "side"],
    ] as const)
      expect(fit(s), s).toMatch(new RegExp(`grid-area:\\s*${area}`));
    // aktivní řádek pod zprávou je zbytečný – pseudokód je hned pod stavem
    expect(fit(".algo-root .viz-line")).toMatch(/display:\s*none/);
  });
});

describe("index.css – stránky s druhým pohledem (grafy, k-d strom) na desktopu vedle sebe", () => {
  const FIT = "(min-width: 1100px) and (min-height: 600px)";
  const fit = (selector: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          rule.media.some((m) => m.includes(FIT)),
      )
      .map((r) => r.body)
      .join(";");

  it("graf | tabulka výsledku a rovina | k-d strom v řádku; vedlejší sloupec se posouvá uvnitř", () => {
    // jen s tabulkou; samotné proměnné (T = 0…) zůstávají pod grafem
    expect(fit(".algo-root .viz-canvas > .graph-layout:has(.gtable)")).toMatch(
      /flex-direction:\s*row/,
    );
    expect(fit(".algo-root .viz-canvas > .graph-layout")).toMatch(
      /min-height:\s*0/,
    );
    expect(fit(".algo-root .graph-result")).toMatch(/overflow(-y)?:\s*auto/);
    expect(fit(".algo-root .viz-canvas > .kd-layout")).toMatch(
      /flex-direction:\s*row/,
    );
    expect(fit(".algo-root .kd-tree-col")).toMatch(/min-height:\s*0/);
  });
});

describe("index.css – drobnosti rozložení na jednu obrazovku", () => {
  const FIT = "(min-width: 1100px) and (min-height: 600px)";
  const fit = (selector: string) =>
    rules
      .filter(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          rule.media.some((m) => m.includes(FIT)),
      )
      .map((r) => r.body)
      .join(";");

  it("kód (sbalení akce, přizpůsobení plátnu) používá stejný dotaz jako CSS (layoutMedia.ts)", () => {
    expect(FIT_MEDIA).toBe(FIT);
    expect(css).toContain(`@media ${FIT}`);
  });

  it("počítadlo kroků se nezalamuje; pomocné pole (Z, počítadla) ustoupí hlavnímu poli", () => {
    expect(fit(".algo-root .viz-main .step-counter")).toMatch(
      /white-space:\s*nowrap/,
    );
    expect(fit(".algo-root .viz-canvas > .array-view + .array-view")).toMatch(
      /flex-shrink:\s*(1\.[1-9]|[2-9])/,
    );
  });
});

describe("index.css – kontrast drobností (UX audit 7. 11. 2026)", () => {
  const body = (selector: string) =>
    rules
      .filter((r) => r.media.length === 0 && selectorsOf(r).includes(selector))
      .map((r) => r.body)
      .join(";");

  it("svislý ukazatel zásobníku (text v g.pointer) má barvu akcentu (A-01)", () => {
    expect(body(".algo-root .pointer text")).toMatch(
      /fill:\s*var\(--algo-accent\)/,
    );
  });

  it("zpracované požadavky stránkování: ztlumená barva místo průhlednosti (A-02, AA 4,5 : 1)", () => {
    const done = body(".algo-root .paging-seq .pg.done");
    expect(done).not.toMatch(/opacity/);
    expect(done).toMatch(/color:\s*var\(--algo-muted\)/);
    expect(done).toMatch(/text-decoration|border-style/);
  });

  it("popisek ve zvýrazněném uzlu lock-free zásobníku nebere ztlumenou barvu (A-03)", () => {
    const small = [".lf-read", ".lf-own", ".lf-new"].map((c) =>
      body(`.algo-root .lf-node${c} small`),
    );
    for (const b of small)
      expect(b).toMatch(/color:\s*(inherit|var\(--algo-text\))/);
  });
});

describe("index.css – panel výsledku grafů (V-03)", () => {
  it("dlouhá proměnná (závorky DFS) se v panelu zalamuje, panel se neposouvá do strany", () => {
    const body = rules
      .filter((r) => selectorsOf(r).includes(".algo-root .graph-result .var"))
      .map((r) => r.body)
      .join(";");
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("proměnné neurčují šířku panelu (VAL-04): závorky DFS ke konci panel nerozšíří a graf se nezúží", () => {
    // šířku panelu dává tabulka; řádek proměnných se jen vejde do ní (width: 0 + min-width: 100 %)
    const body = rules
      .filter((r) => selectorsOf(r).includes(".algo-root .graph-result .vars"))
      .map((r) => r.body)
      .join(";");
    expect(body).toMatch(/(^|;)\s*width:\s*0/);
    expect(body).toMatch(/min-width:\s*100%/);
  });
});

describe("index.css – cílová plocha posuvníků (V-07, WCAG 2.5.8)", () => {
  it("posuvník kroků i rychlosti je vysoký aspoň 24 px", () => {
    for (const sel of [
      ".algo-root .controls .seek",
      ".algo-root .speed input",
    ]) {
      const body = rules
        .filter((r) => r.media.length === 0 && selectorsOf(r).includes(sel))
        .map((r) => r.body)
        .join(";");
      expect(body, sel).toMatch(/min-height:\s*24px/);
    }
  });
});

describe("index.css – prázdný pseudokód (H-04)", () => {
  it("na desktopu je zástupný text jeden nízký řádek, ne čárkovaný box přes většinu sloupce", () => {
    const body = rules
      .filter(
        (r) =>
          selectorsOf(r).includes(".algo-root .viz-code .pseudocode.empty") &&
          r.media.some((m) => m.includes("1100px")),
      )
      .map((r) => r.body)
      .join(";");
    expect(body).toMatch(/flex:\s*none/);
    expect(body).toMatch(/min-height:\s*0/);
  });
});
