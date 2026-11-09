// @vitest-environment jsdom
// CircuitEditor (tenká vrstva nad circuitEdit.ts + CircuitView): paleta (klik, tah, klávesnice),
// vodič tahem z výstupního portu na vstupní port, odmítnutý cyklus, výběr + Delete, přesun s mřížkou,
// živá hloubka a velikost, Import / export textem, režim výpočtu (přepínání vstupů klikem a Enterem).
import { createElement as h, useLayoutEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Circuit } from "../algos/parallel/circuit";
import { majority } from "../algos/parallel/circuitPresets";
import { act, click, key, mount, pointer, type } from "../core/domTest";

const mouseClick = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
import { useCircuitEdit, type CircuitEditControl } from "./circuitEdit";
import { CircuitEditor } from "./CircuitEditor";
import { inPort, outPort } from "./circuitLayout";

const ID = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

async function setup(
  start: Circuit = majority(),
  initialMode: "edit" | "run" = "edit",
  props: Record<string, unknown> = {},
) {
  const onRun = vi.fn();
  const onToggleInput = vi.fn();
  const out = {} as { control: CircuitEditControl; mode: "edit" | "run" };
  function Harness() {
    const edit = useCircuitEdit(start);
    const [m, setM] = useState(initialMode);
    useLayoutEffect(() => {
      out.control = edit;
      out.mode = m;
    });
    return h(CircuitEditor, {
      edit,
      mode: m,
      onModeChange: setM,
      onRun,
      onToggleInput,
      bits: { x: 1, y: 0, z: 1 },
      width: 600,
      screenMatrix: ID,
      ...props,
    });
  }
  const m = await mount(h(Harness));
  const svg = () => m.el.querySelector("svg.circuit-svg")!;
  return {
    m,
    svg,
    onRun,
    onToggleInput,
    circuit: () => out.control.circuit,
    mode: () => out.mode,
    node: (id: string) => out.control.circuit.nodes.find((n) => n.id === id),
    status: () => m.el.querySelector(".ce-message")?.textContent ?? "",
    summary: () => m.el.querySelector(".ce-summary")?.textContent ?? "",
  };
}

/** stisk a puštění (bez pohybu = ťuknutí, s pohybem = tah) */
async function drag(
  target: Element,
  release: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await pointer(target, "pointerdown", {
    clientX: from.x,
    clientY: from.y,
    timeStamp: 0,
  });
  await pointer(release, "pointermove", {
    clientX: (from.x + to.x) / 2,
    clientY: (from.y + to.y) / 2,
  });
  await pointer(release, "pointermove", { clientX: to.x, clientY: to.y });
  await pointer(release, "pointerup", {
    clientX: to.x,
    clientY: to.y,
    timeStamp: 80,
  });
}
const tap = async (
  target: Element,
  svg: Element,
  p: { x: number; y: number },
) => {
  await pointer(target, "pointerdown", {
    clientX: p.x,
    clientY: p.y,
    timeStamp: 0,
  });
  await pointer(svg, "pointerup", {
    clientX: p.x,
    clientY: p.y,
    timeStamp: 40,
  });
};
const nodeEl = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-node="${id}"]`)!;

describe("CircuitEditor – režim výpočtu", () => {
  it("bez palety; vstupy jsou přepínače (klik i Enter), Upravit síť přepne režim", async () => {
    const t = await setup(majority(), "run");
    expect(t.m.el.querySelector(".ce-palette")).toBeNull();
    const x = nodeEl(t.m.el, "x");
    expect(x.getAttribute("role")).toBe("button");
    expect(x.getAttribute("aria-pressed")).toBe("true");
    expect(nodeEl(t.m.el, "y").getAttribute("aria-pressed")).toBe("false");
    expect(x.getAttribute("aria-label")).toBe("Vstup x = 1, přepnout");
    await click(x as HTMLElement);
    expect(t.onToggleInput).toHaveBeenCalledWith("x");
    const ev = await key(nodeEl(t.m.el, "z"), { key: "Enter" });
    expect(t.onToggleInput).toHaveBeenCalledWith("z");
    expect(ev.defaultPrevented).toBe(true);
    // hradla v režimu výpočtu nejsou ovladatelná
    expect(nodeEl(t.m.el, "A1").getAttribute("tabindex")).toBeNull();
    await click(t.m.button("Upravit síť"));
    expect(t.mode()).toBe("edit");
    expect(t.m.el.querySelector(".ce-palette")).not.toBeNull();
    await t.m.unmount();
  });

  it("hloubka a velikost sítě jsou vidět i při výpočtu", async () => {
    const t = await setup(majority(), "run");
    expect(t.summary()).toBe("hloubka 5 vrstev (S₀…S₄) · velikost 5 hradel");
    await t.m.unmount();
  });
});

describe("CircuitEditor – paleta", () => {
  it("klávesnice (Enter na tlačítku palety) přidá hradlo na volné místo a vybere ho; živý souhrn", async () => {
    const t = await setup();
    await click(t.m.button("AND"));
    expect(t.node("A4")).toMatchObject({
      kind: "gate",
      fn: "and",
      inputs: [null, null],
    });
    expect(t.summary()).toContain("velikost 6 hradel");
    expect(nodeEl(t.m.el, "A4").getAttribute("class")).toContain("selected");
    await t.m.unmount();
  });

  it("klik myší vybere nástroj, klik do plátna přidá vrchol přichycený k mřížce", async () => {
    const t = await setup({ nodes: [], flow: "right" });
    const or = t.m.button("OR");
    await pointer(or, "pointerdown", { clientX: 5, clientY: 5 });
    await pointer(or, "pointerup", { clientX: 5, clientY: 5 });
    await mouseClick(or);
    expect(t.m.button("OR").getAttribute("aria-pressed")).toBe("true");
    const bg = t.m.el.querySelector(".circuit-bg")!;
    await tap(bg, t.svg(), { x: 203, y: 117 });
    expect(t.circuit().nodes).toHaveLength(1);
    expect(t.node("O1")).toMatchObject({ x: 200, y: 120 });
    await t.m.unmount();
  });

  it("tah z palety do plátna položí vrchol na místo puštění", async () => {
    const t = await setup({ nodes: [], flow: "right" });
    const not = t.m.button("NOT");
    await pointer(not, "pointerdown", { clientX: 40, clientY: -30 });
    await pointer(not, "pointermove", { clientX: 200, clientY: 20 });
    await pointer(not, "pointerup", { clientX: 302, clientY: 38 });
    await mouseClick(not);
    expect(t.node("N1")).toMatchObject({ fn: "not", x: 300, y: 40 });
    expect(t.m.button("NOT").getAttribute("aria-pressed")).toBe("false");
    await t.m.unmount();
  });
});

describe("CircuitEditor – vodiče, výběr, mazání, přesun", () => {
  it("vodič tahem z výstupního portu na vstupní port; obsazený port se přepojí", async () => {
    const c = majority();
    c.nodes = c.nodes.map((n) =>
      n.id === "O2" ? { ...n, inputs: ["O1", null] } : n,
    );
    const t = await setup(c);
    expect(t.m.el.querySelectorAll(".cport-in.free")).toHaveLength(1);
    const from = outPort(t.node("A3")!)!;
    const to = inPort(t.node("O2")!, 1);
    const handle = t.m.el.querySelector('[data-port="A3"]')!;
    await drag(handle, t.svg(), from, { x: to.x + 3, y: to.y - 2 });
    expect(t.node("O2")!.inputs).toEqual(["O1", "A3"]);
    expect(t.m.el.querySelectorAll(".cport-in.free")).toHaveLength(0);
    await t.m.unmount();
  });

  it("vodič, který by uzavřel cyklus, se nepřidá a editor řekne proč", async () => {
    const t = await setup();
    const before = t.circuit();
    const from = outPort(t.node("O2")!)!;
    const to = inPort(t.node("A1")!, 0);
    await drag(t.m.el.querySelector('[data-port="O2"]')!, t.svg(), from, to);
    expect(t.circuit()).toBe(before);
    expect(t.status()).toMatch(/by vytvořil cyklus A1 → O1 → O2 → A1/);
    await t.m.unmount();
  });

  it("ťuknutí vybere vrchol, Delete ho smaže (i jeho vodiče); vodič jde vybrat a smazat", async () => {
    const t = await setup();
    const a1 = t.node("A1")!;
    await tap(nodeEl(t.m.el, "A1"), t.svg(), { x: a1.x, y: a1.y });
    expect(nodeEl(t.m.el, "A1").getAttribute("class")).toContain("selected");
    await key(nodeEl(t.m.el, "A1"), { key: "Delete" });
    expect(t.node("A1")).toBeUndefined();
    expect(t.node("O1")!.inputs).toEqual([null, "A2"]);
    const hit = t.m.el.querySelector('[data-wire="O2#1"]')!;
    await tap(hit, t.svg(), { x: 300, y: 132 });
    expect(hit.getAttribute("class")).toContain("selected");
    await click(t.m.button("Smazat"));
    expect(t.node("O2")!.inputs).toEqual(["O1", null]);
    await click(t.m.button("↶ Zpět"));
    expect(t.node("O2")!.inputs).toEqual(["O1", "A3"]);
    await t.m.unmount();
  });

  it("tah vrcholu ho přesune a přichytí k mřížce; Shift+šipky posouvají o krok mřížky", async () => {
    const t = await setup();
    const o1 = t.node("O1")!;
    await drag(
      nodeEl(t.m.el, "O1"),
      t.svg(),
      { x: o1.x, y: o1.y },
      { x: o1.x + 47, y: o1.y + 31 },
    );
    expect(t.node("O1")).toMatchObject({ x: 260, y: 80 });
    // přesun z klávesnice = Shift+šipky (D3); samotná šipka jen přesune fokus
    await key(nodeEl(t.m.el, "O1"), { key: "ArrowLeft", shiftKey: true });
    expect(t.node("O1")).toMatchObject({ x: 240, y: 80 });
    await key(nodeEl(t.m.el, "O1"), { key: "ArrowLeft" });
    expect(t.node("O1")).toMatchObject({ x: 240, y: 80 });
    await t.m.unmount();
  });

  it("klávesnice: Enter na vrcholu = začátek vodiče, Enter na druhém = spojení", async () => {
    const c = majority();
    c.nodes = c.nodes.map((n) =>
      n.id === "O2" ? { ...n, inputs: ["O1", null] } : n,
    );
    const t = await setup(c);
    await key(nodeEl(t.m.el, "A3"), { key: "Enter" });
    expect(t.status()).toMatch(/Spojit výstup A3 s…/);
    await key(nodeEl(t.m.el, "O2"), { key: "Enter" });
    expect(t.node("O2")!.inputs).toEqual(["O1", "A3"]);
    await t.m.unmount();
  });

  it("změna funkce vybraného hradla a Uspořádat", async () => {
    const t = await setup();
    const a1 = t.node("A1")!;
    await tap(nodeEl(t.m.el, "A1"), t.svg(), { x: a1.x, y: a1.y });
    await type(t.m.input("funkce") as unknown as HTMLSelectElement, "xor");
    expect(t.node("A1")!.fn).toBe("xor");
    await click(t.m.button("Uspořádat"));
    expect(t.node("A1")!.x).toBe(t.node("A3")!.x);
    await t.m.unmount();
  });

  it("▶ Spočítat přepne do režimu výpočtu a zavolá onRun; úpravy samy nic nespouštějí", async () => {
    const t = await setup();
    await click(t.m.button("AND"));
    expect(t.onRun).not.toHaveBeenCalled();
    await click(t.m.button("▶ Spočítat"));
    expect(t.onRun).toHaveBeenCalledTimes(1);
    expect(t.mode()).toBe("run");
    await t.m.unmount();
  });
});

describe("CircuitEditor – Import / export textem", () => {
  it("text sleduje kresbu; upravený text se použije, chybný ohlásí a síť nezmění", async () => {
    const t = await setup();
    const ta = () =>
      t.m.el.querySelector<HTMLTextAreaElement>(".ce-text textarea")!;
    expect(ta().value).toContain("O2 = or(O1, A3)");
    await type(ta(), ta().value.replace("O2 = or(O1, A3)", "O2 = xor(O1, A3)"));
    await click(t.m.button("Použít text"));
    expect(t.node("O2")).toMatchObject({ fn: "xor", x: 318, y: 120 });
    await type(ta(), "in a\nG1 = and(a, G2)\nG2 = not(G1)\nout q = G2");
    await click(t.m.button("Použít text"));
    expect(t.m.el.querySelector('[role="alert"]')!.textContent).toMatch(
      /cyklus G1 → G2 → G1/,
    );
    expect(t.node("O2")!.fn).toBe("xor");
    await t.m.unmount();
  });
});

/** matice obrazovky podle skutečného viewBoxu a šířky SVG (výřez se mění → klik jinam) */
const realMatrix = () => {
  const s = document.querySelector("svg.circuit-svg");
  if (!s) return null;
  const [x, y, w] = s.getAttribute("viewBox")!.split(" ").map(Number);
  const k = Number(s.getAttribute("width")) / w;
  return { a: k, b: 0, c: 0, d: k, e: -x * k, f: -y * k };
};
const onScreen = (p: { x: number; y: number }) => {
  const m = realMatrix()!;
  return { x: m.a * p.x + m.e, y: m.d * p.y + m.f };
};

describe("CircuitEditor – výřez drží, klik položí prvek pod kurzor", () => {
  it("první i další prvky leží u místa kliku a dříve položené se neposunou", async () => {
    const t = await setup({ nodes: [], flow: "right" }, "edit", {
      screenMatrix: realMatrix,
    });
    const and = t.m.button("AND");
    await mouseClick(and);
    const bg = () => t.m.el.querySelector(".circuit-bg")!;
    const clicks = [
      { x: 470, y: 260 },
      { x: 120, y: 90 },
      { x: 560, y: 60 },
    ];
    const placed: { id: string; at: { x: number; y: number } }[] = [];
    for (const c of clicks) {
      await tap(bg(), t.svg(), c);
      const n = t.circuit().nodes[t.circuit().nodes.length - 1];
      const s = onScreen(n);
      // do velikosti hradla (posun dovnitř u okraje) – ne stovky px
      expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeLessThan(80);
      placed.push({ id: n.id, at: s });
      for (const p of placed) {
        const now = onScreen(t.node(p.id)!);
        expect(Math.hypot(now.x - p.at.x, now.y - p.at.y)).toBeLessThan(1);
      }
    }
    await t.m.unmount();
  });
});

describe("CircuitEditor – fokus po smazání a Ctrl+Z", () => {
  it("po Delete zůstane fokus v plátně a Ctrl+Z smazání vrátí", async () => {
    const t = await setup();
    const a1 = nodeEl(t.m.el, "A1") as unknown as HTMLElement;
    a1.focus();
    await key(a1, { key: "Delete" });
    expect(t.node("A1")).toBeUndefined();
    const f = document.activeElement!;
    expect(f).not.toBe(document.body);
    expect(t.m.el.querySelector(".circuit-editor")!.contains(f)).toBe(true);
    await key(f, { key: "z", ctrlKey: true });
    expect(t.node("A1")).toBeDefined();
    await t.m.unmount();
  });

  it("tlačítko Smazat nenechá fokus na <body>; Ctrl+Z funguje i po kliku do pozadí", async () => {
    const t = await setup();
    const a1 = t.node("A1")!;
    await tap(nodeEl(t.m.el, "A1"), t.svg(), { x: a1.x, y: a1.y });
    const del = t.m.button("Smazat");
    del.focus();
    await click(del);
    expect(t.node("A1")).toBeUndefined();
    expect(document.activeElement).not.toBe(document.body);
    // klik do pozadí plátna fokusuje editor
    await tap(t.m.el.querySelector(".circuit-bg")!, t.svg(), { x: 5, y: 5 });
    const f = document.activeElement!;
    expect(t.m.el.querySelector(".circuit-editor")!.contains(f)).toBe(true);
    await key(f, { key: "z", ctrlKey: true });
    expect(t.node("A1")).toBeDefined();
    // Ctrl+Z i z <body> (mimo textová pole) – posluchač na dokumentu
    await click(t.m.button("Smazat")); // nic vybrané → nic
    await tap(nodeEl(t.m.el, "A2"), t.svg(), t.node("A2")!);
    await key(nodeEl(t.m.el, "A2"), { key: "Delete" });
    (document.activeElement as HTMLElement | null)?.blur?.();
    await key(document.body, { key: "z", ctrlKey: true });
    expect(t.node("A2")).toBeDefined();
    // v textovém poli Ctrl+Z patří poli
    const ta = t.m.el.querySelector("textarea")!;
    await tap(nodeEl(t.m.el, "A2"), t.svg(), t.node("A2")!);
    await key(nodeEl(t.m.el, "A2"), { key: "Delete" });
    await key(ta, { key: "z", ctrlKey: true });
    expect(t.node("A2")).toBeUndefined();
    await t.m.unmount();
  });
});

describe("CircuitEditor – fokus (NEWMODS-08)", () => {
  it("po ▶ Spočítat je fokus na „Upravit síť“ (tlačítko Spočítat zmizí)", async () => {
    const t = await setup();
    const go = [...t.m.el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Spočítat"),
    )!;
    go.focus();
    await click(go);
    expect(t.mode()).toBe("run");
    expect(document.activeElement?.className).toContain("ge-mode");
    expect(document.activeElement?.textContent).toBe("Upravit síť");
    await t.m.unmount();
  });
});

/*
 * Roving tabindex (D3): kresba sítě je jedna zastávka Tabu v obou režimech; šipky přesouvají fokus mezi
 * vrcholy (a v úpravách i vodiči), Shift+šipky posunou hradlo, Enter = vodič / přepnutí vstupu, mezerník
 * zůstane přehrávači.
 */
describe("CircuitEditor – klávesnice na kresbě (roving tabindex)", () => {
  const stops = (svg: Element) =>
    [...svg.querySelectorAll("[tabindex]")].filter(
      (e) => e.getAttribute("tabindex") === "0",
    );

  it("režim výpočtu: jedna zastávka (vstup), šipka na další vstup, mezerník vstup nepřepne", async () => {
    const t = await setup(majority(), "run");
    expect(stops(t.svg())).toEqual([nodeEl(t.m.el, "x")]);
    const x = nodeEl(t.m.el, "x") as SVGGElement;
    x.focus();
    const ev = await key(x, { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nodeEl(t.m.el, "y"));
    expect(stops(t.svg())).toEqual([nodeEl(t.m.el, "y")]);
    const space = await key(document.activeElement!, { key: " " });
    expect(space.defaultPrevented).toBe(false);
    expect(t.onToggleInput).not.toHaveBeenCalled();
    await t.m.unmount();
  });

  it("režim úprav: jedna zastávka pro vrcholy i vodiče; šipka hradlo neposune, Shift+šipka ano", async () => {
    const t = await setup();
    expect(stops(t.svg()).length).toBe(1);
    const a2 = nodeEl(t.m.el, "A2") as SVGGElement;
    const was = { ...t.node("A2")! };
    a2.focus();
    // jsdom nemá rozvržení – šipka vpravo jde na další prvek v pořadí kresby
    await key(a2, { key: "ArrowRight" });
    expect(t.node("A2")).toMatchObject({ x: was.x, y: was.y });
    expect(document.activeElement).not.toBe(a2);
    expect(t.svg().contains(document.activeElement)).toBe(true);
    a2.focus();
    await key(a2, { key: "ArrowDown", shiftKey: true });
    expect(t.node("A2")!.y).toBeGreaterThan(was.y);
    expect(document.activeElement).toBe(a2);
    expect(stops(t.svg())).toEqual([a2]);
    await t.m.unmount();
  });
});
