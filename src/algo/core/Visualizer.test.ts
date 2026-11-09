// Visualizer – rozvržení: s `actions` (ActionMenu) je panel akcí hned pod plátnem vlevo a stav vpravo
// (po vzoru VisuAlgo), panel vstupu nad plátnem zmizí; bez `actions` zůstává dosavadní rozvržení.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Player } from "./usePlayer";
import { Visualizer } from "./Visualizer";
import { KeyHint } from "./Controls";

const steps = [{ state: 0, line: null, message: "klid" }];
const player: Player<number> = {
  steps,
  index: 0,
  current: steps[0],
  playing: false,
  delay: 500,
  setDelay: () => {},
  play: () => {},
  pause: () => {},
  toggle: () => {},
  next: () => {},
  prev: () => {},
  first: () => {},
  last: () => {},
  seek: () => {},
  atStart: true,
  atEnd: true,
};
const structure = {
  opTitle: "",
  opId: 0,
  history: [],
  canUndo: false,
  undo: () => {},
  restoreInitial: () => {},
};

type Props = Parameters<typeof Visualizer<number>>[0];
const render = (extra: Partial<Props>) =>
  renderToStaticMarkup(
    h(Visualizer<number>, {
      title: "Zásobník",
      description: "popis",
      player,
      pseudocode: ["Push(x)"],
      structure,
      tip: "tip",
      ...extra,
      children: h("div", { id: "PLATNO" }),
    }),
  );

const order = (html: string, ...needles: string[]) =>
  needles.map((n) => {
    const i = html.indexOf(n);
    expect(i, n).toBeGreaterThanOrEqual(0);
    return i;
  });

describe("Visualizer – rozvržení s ActionMenu", () => {
  it("akce jsou pod plátnem v doku spolu se stavem; žádný panel vstupu nad plátnem", () => {
    const html = render({ actions: h("div", { id: "AKCE" }) });
    expect(html).not.toContain('class="viz-input"');
    const [canvas, dock, actions, status, controls] = order(
      html,
      'id="PLATNO"',
      'class="viz-dock"',
      'id="AKCE"',
      'class="viz-status"',
      'class="controls"',
    );
    expect(canvas).toBeLessThan(dock);
    expect(dock).toBeLessThan(actions);
    expect(actions).toBeLessThan(status);
    expect(status).toBeLessThan(controls);
    // historie a Vrátit operaci patří k akcím
    const [hist] = order(html, 'class="viz-history"');
    expect(hist).toBeGreaterThan(actions);
    expect(hist).toBeLessThan(status);
    // tip je pod přehráváním, plátno neodsouvá
    expect(html.indexOf('class="viz-tip"')).toBeGreaterThan(controls);
    expect(html).toMatch(/<section class="viz-actions" aria-label="Operace"/);
  });

  it("bez actions: panel vstupu nad plátnem jako dřív", () => {
    const html = render({ input: h("div", { id: "VSTUP" }) });
    const [input, canvas] = order(html, 'id="VSTUP"', 'id="PLATNO"');
    expect(input).toBeLessThan(canvas);
    expect(html).not.toContain("viz-dock");
  });
});

describe("Visualizer – přilepená lišta přehrávání je jeden řádek", () => {
  it("posuvník kroků je v řádku s tlačítky a rychlostí; nápověda ke klávesám je mimo přilepenou lištu", () => {
    const html = render({ actions: h("div", { id: "AKCE" }) });
    const start = html.indexOf('class="controls"');
    // konec lišty = konec jejího prvku (počítání vnoření <div>)
    let depth = 0;
    let end = -1;
    const tag = /<(\/?)div\b[^>]*>/g;
    tag.lastIndex = start - 5;
    for (let m = tag.exec(html); m; m = tag.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    const bar = html.slice(start, end);
    const row = bar.slice(bar.indexOf('class="controls-row"'));
    expect(row).toMatch(/class="seek"/);
    expect(row.indexOf('class="seek"')).toBeLessThan(
      row.indexOf('class="speed"'),
    );
    expect(bar).not.toContain("kbd-hint");
    expect(html).toContain('class="kbd-hint"');
  });
});

/** obsah prvku začínajícího na `start` (počítání vnoření stejné značky) */
function element(html: string, start: number, tagName: string): string {
  let depth = 0;
  const tag = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "g");
  tag.lastIndex = start;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`neuzavřené <${tagName}>`);
}

describe("Visualizer – celá stránka modulu na jednu obrazovku (po vzoru VisuAlgo)", () => {
  const full = () =>
    render({
      actions: h("div", { id: "AKCE" }),
      legend: [{ cls: "sw-x", label: "LEGENDA" }],
      notes: h("p", { id: "POZNAMKY" }, "podrobnosti"),
      options: h("label", { id: "VOLBY" }, "styl knihy"),
    });

  it("levý sloupec: plátno, dok s akcemi a přehrávání; vpravo pseudokód, volby, legenda a sbalená nápověda", () => {
    const html = full();
    const colStart = html.indexOf('class="viz-canvas-col"');
    const col = element(html, html.lastIndexOf("<div", colStart), "div");
    for (const n of [
      'id="PLATNO"',
      'id="AKCE"',
      'class="viz-status"',
      'class="controls"',
    ])
      expect(col, n).toContain(n);
    const side = element(
      html,
      html.indexOf('<aside class="viz-code"'),
      "aside",
    );
    const [code, options, legend, more] = order(
      side,
      'class="pseudocode',
      'id="VOLBY"',
      'class="legend"',
      '<details class="viz-more"',
    );
    expect(code).toBeLessThan(options);
    expect(options).toBeLessThan(legend);
    expect(legend).toBeLessThan(more);
    expect(col).not.toContain('class="legend"');
    expect(col).not.toContain("viz-tip");
  });

  it("tip „Zkuste:“, poznámky ke vstupu a klávesy jsou ve sbaleném <details> (nic se neztratí)", () => {
    const html = full();
    const more = element(
      html,
      html.indexOf('<details class="viz-more"'),
      "details",
    );
    expect(more).not.toMatch(/<details[^>]*\bopen\b/);
    expect(more).toMatch(/<summary[^>]*>/);
    for (const n of [
      'class="viz-tip"',
      "Zkuste:",
      'id="POZNAMKY"',
      'class="kbd-hint"',
    ])
      expect(more, n).toContain(n);
    // klávesy jen jednou (už ne pod lištou přehrávání)
    expect(html.split('class="kbd-hint"').length).toBe(2);
  });

  it("bez tipu, poznámek i kláves… nápověda zůstává jen s klávesami; bez legendy žádný prázdný seznam", () => {
    const html = render({ actions: h("div", { id: "AKCE" }), tip: undefined });
    const more = element(
      html,
      html.indexOf('<details class="viz-more"'),
      "details",
    );
    expect(more).toContain('class="kbd-hint"');
    expect(more).not.toContain("viz-tip");
    expect(html).not.toContain('class="legend"');
  });

  it("popis je sbalený na dva řádky s tlačítkem „více“ na každé šířce", () => {
    const html = full();
    const desc = element(html, html.indexOf('<div class="viz-desc'), "div");
    expect(desc).toMatch(/^<div class="viz-desc">/);
    const [body, toggle] = order(
      desc,
      'class="viz-desc-body"',
      'class="viz-desc-toggle"',
    );
    expect(body).toBeLessThan(toggle);
    expect(desc).toMatch(
      /class="viz-desc-toggle"[^>]*aria-expanded="false"[^>]*>více</,
    );
  });
});

describe("KeyHint – nápověda ke klávesám (D3)", () => {
  it("přehrávač i kresba: mezerník vždy přehrává, šipky na kresbě chodí po prvcích, Enter vybere, Shift+šipky posun, Esc ven", () => {
    const text = renderToStaticMarkup(h(KeyHint)).replace(/<[^>]+>/g, "");
    expect(text).toContain("mezerník přehrát / pozastavit (i na kresbě)");
    expect(text).toContain("← → krok");
    expect(text).toContain("Kresba: Tab");
    expect(text).toContain("šipky pohyb po prvcích");
    expect(text).toContain("Enter vybrat");
    expect(text).toContain("Shift+šipky posun vrcholu");
    expect(text).toContain("Esc ven");
  });
});

describe("nápověda ke kresbě podle modulu (UX-13)", () => {
  it("výchozí řádek o kresbě; modul ho smí přepsat (tabulka DP nemá vrcholy, v rovině obalu Enter maže)", () => {
    const plain = render({}).replace(/<[^>]+>/g, "");
    expect(plain).toContain("Shift+šipky posun vrcholu");
    const own = render({
      drawingKeys:
        "Tabulka: Tab na ni, šipky po buňkách, Enter ukáže řešení, Esc ven",
    }).replace(/<[^>]+>/g, "");
    expect(own).toContain("Tabulka: Tab na ni, šipky po buňkách");
    expect(own).not.toContain("posun vrcholu");
    expect(own).toContain("přehrát / pozastavit");
  });
});
