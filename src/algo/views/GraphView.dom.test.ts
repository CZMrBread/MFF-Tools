// @vitest-environment jsdom
// GraphView v režimu „Upravit graf“ a výběr v₀ klikem – tenká vrstva nad pointer.ts / graphEdit.ts.
// Matice obrazovky se vkládá (jsdom nemá getScreenCTM): jednotková → clientX/Y = px plátna.
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyState, type Graph } from "../algos/graphs/graph";
import { click, key, mount, pointer } from "../core/domTest";
import { GraphView } from "./GraphView";

const ID = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
/** tři vrcholy v řadě: px (60, 200), (300, 200), (540, 200) na plátně 600 × 400; hrana 1–2 */
const G: Graph = {
  directed: false,
  weighted: true,
  nodes: [
    { id: 0, label: "1", x: 0.1, y: 0.5 },
    { id: 1, label: "2", x: 0.5, y: 0.5 },
    { id: 2, label: "3", x: 0.9, y: 0.5 },
  ],
  edges: [{ id: 0, u: 0, v: 1, w: 4 }],
};

async function setup(extra: Record<string, unknown> = {}) {
  const dispatch = vi.fn();
  const onEdgeTap = vi.fn();
  const props = {
    graph: G,
    state: emptyState(),
    width: 600,
    height: 400,
    screenMatrix: ID,
    edit: { selected: null, source: null, dispatch, onEdgeTap },
    ...extra,
  };
  const m = await mount(h(GraphView, props));
  const svg = m.el.querySelector("svg.graph-svg")!;
  const node = (i: number) =>
    m.el.querySelectorAll<SVGGElement>("g.graph-node")[i];
  return { m, svg, node, dispatch, onEdgeTap };
}

const press = async (
  down: Element,
  up: Element,
  from: [number, number],
  to: [number, number],
  ms = 100,
  pointerType = "mouse",
) => {
  await pointer(down, "pointerdown", {
    clientX: from[0],
    clientY: from[1],
    timeStamp: 1000,
    pointerType,
  });
  if (from[0] !== to[0] || from[1] !== to[1])
    await pointer(up, "pointermove", {
      clientX: to[0],
      clientY: to[1],
      timeStamp: 1000 + ms / 2,
      pointerType,
    });
  await pointer(up, "pointerup", {
    clientX: to[0],
    clientY: to[1],
    timeStamp: 1000 + ms,
    pointerType,
  });
};

describe("GraphView – Upravit graf (jsdom)", () => {
  it("klik do prázdna přidá vrchol na místě ukazatele (souřadnice grafu)", async () => {
    const t = await setup();
    const bg = t.m.el.querySelector(".graph-bg")!;
    await press(bg, t.svg, [300, 100], [300, 100]);
    expect(t.dispatch).toHaveBeenCalledWith({
      type: "addVertex",
      x: 0.5,
      y: 0.25,
      moved: false,
    });
    expect(t.svg.getAttribute("class")).toContain("editing");
    await t.m.unmount();
  });

  it("klik do prázdna s vybraným prvkem jen zruší výběr", async () => {
    const d = vi.fn();
    const u = await setup({
      edit: { selected: { kind: "node", id: 0 }, source: 0, dispatch: d },
    });
    await press(
      u.m.el.querySelector(".graph-bg")!,
      u.svg,
      [300, 100],
      [300, 100],
    );
    expect(d).toHaveBeenCalledWith({ type: "select", target: null });
    expect(u.node(0).getAttribute("class")).toContain("is-source");
    await u.m.unmount();
  });

  it("tah z vrcholu na jiný vrchol = hrana; během tahu je vidět náhled", async () => {
    const t = await setup();
    await pointer(t.node(0), "pointerdown", {
      clientX: 60,
      clientY: 200,
      timeStamp: 0,
    });
    await pointer(t.svg, "pointermove", {
      clientX: 535,
      clientY: 205,
      timeStamp: 50,
    });
    expect(t.m.el.querySelector(".graph-preview")).not.toBeNull();
    await pointer(t.svg, "pointerup", {
      clientX: 535,
      clientY: 205,
      timeStamp: 100,
    });
    expect(t.dispatch).toHaveBeenCalledWith({
      type: "connect",
      from: 0,
      to: 2,
    });
    expect(t.m.el.querySelector(".graph-preview")).toBeNull();
    await t.m.unmount();
  });

  it("tah vrcholu do prázdna = jeden přesun při puštění", async () => {
    const t = await setup();
    await press(t.node(2), t.svg, [540, 200], [480, 100]);
    expect(t.dispatch).toHaveBeenCalledTimes(1);
    expect(t.dispatch).toHaveBeenCalledWith({
      type: "move",
      id: 2,
      x: 0.8,
      y: 0.25,
    });
    await t.m.unmount();
  });

  it("ťuknutí na vrchol = tapVertex; dlouhý stisk prstem = smazat", async () => {
    const t = await setup();
    await press(t.node(1), t.svg, [300, 200], [301, 200]);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: "tapVertex", id: 1 });
    await press(t.node(1), t.svg, [300, 200], [300, 200], 700, "touch");
    expect(t.dispatch).toHaveBeenLastCalledWith({
      type: "remove",
      target: { kind: "node", id: 1 },
    });
    await t.m.unmount();
  });

  it("V-3: dlouhý stisk myší nic nesmaže (ani na kruhu, ani vedle něj) – smaže Delete či pravé tlačítko", async () => {
    const t = await setup();
    await press(t.node(1), t.svg, [300, 200], [300, 200], 700);
    await press(t.svg, t.svg, [300, 175], [300, 175], 700);
    await press(t.node(1), t.svg, [300, 200], [302, 200], 650);
    expect(t.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "remove" }),
    );
    await t.m.unmount();
  });

  it("V-3: dlouhý stisk prstem v neviditelném úchopu vedle kruhu vrchol nesmaže", async () => {
    const t = await setup();
    await press(t.svg, t.svg, [300, 170], [300, 170], 700, "touch");
    expect(t.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "remove" }),
    );
    await t.m.unmount();
  });

  it("V-6: o spojení hranou rozhoduje střed taženého vrcholu, ne ukazatel (úchop vedle kruhu)", async () => {
    const t = await setup();
    // vrchol 1 (60, 200) chycen 25 px nad středem, ukazatel puštěn 25 px nad vrcholem 2 → střed na něm
    await press(t.svg, t.svg, [60, 175], [300, 175]);
    expect(t.dispatch).toHaveBeenLastCalledWith({
      type: "connect",
      from: 0,
      to: 1,
    });
    t.dispatch.mockClear();
    // vrchol 3 (540, 200) chycen 25 px pod středem, ukazatel na vrcholu 2 → střed 25 px nad ním: přesun
    await press(t.svg, t.svg, [540, 225], [300, 200]);
    expect(t.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "connect" }),
    );
    expect(t.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "move", id: 2 }),
    );
    await t.m.unmount();
  });

  it("ťuknutí na hranu ji vybere a ohlásí (pole ceny)", async () => {
    const t = await setup();
    const hit = t.m.el.querySelector(".edge-hit")!;
    await press(hit, t.svg, [180, 200], [180, 200]);
    expect(t.dispatch).toHaveBeenCalledWith({
      type: "select",
      target: { kind: "edge", id: 0 },
    });
    expect(t.onEdgeTap).toHaveBeenCalledWith(0);
    await t.m.unmount();
  });

  it("klávesnice: Enter na vrcholu = tapVertex, Delete = smazat; hrana jde vybrat i smazat", async () => {
    const t = await setup();
    await key(t.node(0), { key: "Enter" });
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: "tapVertex", id: 0 });
    await key(t.node(0), { key: "Delete" });
    expect(t.dispatch).toHaveBeenLastCalledWith({
      type: "remove",
      target: { kind: "node", id: 0 },
    });
    const hit = t.m.el.querySelector(".edge-hit")!;
    expect(hit.getAttribute("aria-label")).toBe("Hrana 1–2, cena 4");
    await key(hit, { key: "Backspace" });
    expect(t.dispatch).toHaveBeenLastCalledWith({
      type: "remove",
      target: { kind: "edge", id: 0 },
    });
    await t.m.unmount();
  });

  it("vložené pole ceny u hrany: Enter odešle text, Esc zruší", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const t = await setup({ editWeight: { edge: 0, onSubmit, onCancel } });
    const input = t.m.el.querySelector<HTMLInputElement>(
      "foreignObject input",
    )!;
    expect(input.value).toBe("4");
    expect(input.getAttribute("aria-label")).toBe("Cena hrany 1–2");
    await key(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("4");
    expect(onCancel).not.toHaveBeenCalled();
    await t.m.unmount();
    const u = await setup({ editWeight: { edge: 0, onSubmit, onCancel } });
    await key(u.m.el.querySelector("foreignObject input")!, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await u.m.unmount();
  });

  it("pole ceny ukazuje desetinnou cenu s čárkou (E3) – parseEdgeWeight ji přečte zpět", async () => {
    const onSubmit = vi.fn();
    const graph: Graph = { ...G, edges: [{ id: 0, u: 0, v: 1, w: 2.5 }] };
    const t = await setup({
      graph,
      editWeight: { edge: 0, onSubmit, onCancel: vi.fn() },
    });
    const input = t.m.el.querySelector<HTMLInputElement>(
      "foreignObject input",
    )!;
    expect(input.value).toBe("2,5");
    await key(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("2,5");
    await t.m.unmount();
  });
});

describe("GraphView – režim algoritmu (jsdom)", () => {
  it("klik na vrchol vybere v₀; tah vrchol posouvá (onMove), v₀ se pak nemění", async () => {
    const onPickVertex = vi.fn();
    const onMove = vi.fn();
    const t = await setup({ edit: undefined, onPickVertex, onMove });
    await press(t.node(2), t.svg, [540, 200], [540, 200]);
    expect(onPickVertex).toHaveBeenCalledWith(2);
    await press(t.node(1), t.svg, [300, 200], [300, 120]);
    expect(onMove).toHaveBeenCalled();
    // celý tah nese jedno id gesta (Zpět ho vrátí najednou), další tah jiné
    const g1 = onMove.mock.calls[0][3];
    expect(typeof g1).toBe("number");
    await press(t.node(1), t.svg, [300, 120], [300, 60]);
    expect(onMove.mock.calls.at(-1)![3]).not.toBe(g1);
    expect(onPickVertex).toHaveBeenCalledTimes(1);
    expect(t.node(0).getAttribute("aria-label")).toContain(
      "Enter = počáteční vrchol",
    );
    await key(t.node(0), { key: "Enter" });
    expect(onPickVertex).toHaveBeenLastCalledWith(0);
    await t.m.unmount();
  });

  it("bez onPickVertex a onMove je graf obrázek (role img), bez úchopů", async () => {
    const t = await setup({ edit: undefined });
    expect(t.svg.getAttribute("role")).toBe("img");
    expect(t.m.el.querySelector(".node-hit")).toBeNull();
    await click(t.node(0) as unknown as HTMLElement);
    await t.m.unmount();
  });
});

describe("GraphView – hrana pod úchopem vrcholu (oprava 8. 11. 2026)", () => {
  it("v editoru ťuknutí na hranu, přes kterou leží neviditelný úchop sousedního vrcholu, vybere hranu (pole ceny)", async () => {
    const t = await setup();
    const hit = t.node(1).querySelector(".node-hit")!;
    const edgeHit = t.m.el.querySelector(".edge-hit")!;
    const doc = document as unknown as {
      elementsFromPoint?: (x: number, y: number) => Element[];
    };
    const original = doc.elementsFromPoint;
    doc.elementsFromPoint = () => [hit, edgeHit, t.svg];
    try {
      await press(hit, t.svg, [274, 200], [274, 200], 60, "touch");
    } finally {
      doc.elementsFromPoint = original;
    }
    expect(t.dispatch).toHaveBeenCalledWith({
      type: "select",
      target: { kind: "edge", id: 0 },
    });
    expect(t.onEdgeTap).toHaveBeenCalledWith(0);
    await t.m.unmount();
  });
});
