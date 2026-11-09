// @vitest-environment jsdom
// GraphEditor (tenká vrstva nad graphEdit.ts + GraphView): přepínání Upravit graf / Hotovo, kreslení,
// Zpět, orientace a ceny, pole ceny na plátně, Import / export textem oběma směry, v₀ klikem.
import { createElement as h, useLayoutEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyState, type Graph } from "../algos/graphs/graph";
import { click, key, mount, pointer, type } from "../core/domTest";
import { GraphEditor, GraphEditorPanel } from "./GraphEditor";
import { useGraphEdit, type GraphEditControl } from "./useGraphEdit";

const ID = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
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

async function setup(
  props: Record<string, unknown> = {},
  initialMode: "edit" | "run" = "edit",
) {
  const onRun = vi.fn();
  const onPickVertex = vi.fn();
  const out = {} as { control: GraphEditControl; mode: "edit" | "run" };
  function Harness() {
    const edit = useGraphEdit(G);
    const [m, setM] = useState(initialMode);
    useLayoutEffect(() => {
      out.control = edit;
      out.mode = m;
    });
    return h(GraphEditor, {
      edit,
      mode: m,
      onModeChange: setM,
      state: emptyState(),
      onRun,
      onPickVertex,
      width: 600,
      height: 400,
      screenMatrix: ID,
      ...props,
    });
  }
  const m = await mount(h(Harness));
  const svg = () => m.el.querySelector("svg.graph-svg")!;
  const textarea = () => m.el.querySelector<HTMLTextAreaElement>("textarea")!;
  return {
    m,
    svg,
    textarea,
    onRun,
    onPickVertex,
    graph: () => out.control.graph,
    mode: () => out.mode,
  };
}

const tap = async (target: Element, svg: Element, x: number, y: number) => {
  await pointer(target, "pointerdown", {
    clientX: x,
    clientY: y,
    timeStamp: 0,
  });
  await pointer(svg, "pointerup", { clientX: x, clientY: y, timeStamp: 50 });
};

describe("GraphEditor (jsdom)", () => {
  it("režim algoritmu: graf se neupravuje, klik na vrchol = v₀; Upravit graf přepne režim", async () => {
    const t = await setup({}, "run");
    expect(t.svg().getAttribute("class")).not.toContain("editing");
    const edit = t.m.button("Upravit graf");
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    const n2 = t.m.el.querySelectorAll("g.graph-node")[2];
    await tap(n2, t.svg(), 540, 200);
    expect(t.onPickVertex).toHaveBeenCalledWith(2);
    await click(edit);
    expect(t.mode()).toBe("edit");
    expect(t.svg().getAttribute("class")).toContain("editing");
    await t.m.unmount();
  });

  it("kreslení: klik do prázdna = vrchol, text se sám aktualizuje, Zpět ho vrátí; nic se nespouští", async () => {
    const t = await setup();
    expect(t.textarea().value).toBe("1 2 4\n3");
    await tap(t.m.el.querySelector(".graph-bg")!, t.svg(), 300, 100);
    expect(t.graph().nodes.map((n) => n.label)).toEqual(["1", "2", "3", "4"]);
    expect(t.textarea().value).toBe("1 2 4\n3\n4");
    await click(t.m.button("Zpět"));
    expect(t.graph().nodes).toHaveLength(3);
    expect(t.onRun).not.toHaveBeenCalled();
    await t.m.unmount();
  });

  it("Ctrl+Z vrátí úpravu, Delete smaže vybraný vrchol", async () => {
    const t = await setup();
    await tap(t.m.el.querySelectorAll("g.graph-node")[2], t.svg(), 540, 200);
    await key(t.svg(), { key: "Delete" });
    expect(t.graph().nodes.map((n) => n.label)).toEqual(["1", "2"]);
    await key(t.svg(), { key: "z", ctrlKey: true });
    expect(t.graph().nodes).toHaveLength(3);
    await t.m.unmount();
  });

  it("klik na hranu ohodnoceného grafu otevře pole ceny na plátně; Enter ji uloží", async () => {
    const t = await setup();
    await tap(t.m.el.querySelector(".edge-hit")!, t.svg(), 180, 200);
    const input = t.m.el.querySelector<HTMLInputElement>(
      "foreignObject input",
    )!;
    expect(document.activeElement).toBe(input);
    input.value = "9";
    await key(input, { key: "Enter" });
    expect(t.graph().edges[0].w).toBe(9);
    expect(t.m.el.querySelector("foreignObject")).toBeNull();
    await t.m.unmount();
  });

  it("klik na číslo ceny (popisek hrany i jeho podklad) otevře pole ceny – nejzřejmější cíl (UX-02)", async () => {
    for (const sel of [".edge-label", ".edge-label-bg"]) {
      const t = await setup();
      const label = t.m.el.querySelector(sel)!;
      await tap(label, t.svg(), 180, 200);
      expect(
        t.m.el.querySelector("foreignObject input"),
        `${sel}: pole ceny`,
      ).not.toBeNull();
      expect(t.graph().nodes, `${sel}: nevznikl vrchol`).toHaveLength(3);
      // kurzor ruky jako nad hranou (CSS .edge-label-hit)
      expect(label.getAttribute("class"), sel).toContain("edge-label-hit");
      await t.m.unmount();
    }
  });

  it("přepínače orientovaný / ohodnocený; zamčený přepínač vysvětlí proč", async () => {
    const t = await setup({ lockWeighted: "Dijkstra potřebuje ceny hran" });
    await click(t.m.input("orientovaný"));
    expect(t.graph().directed).toBe(true);
    const w = t.m.input("ohodnocený");
    expect(w.disabled).toBe(true);
    expect(w.closest("label")!.title).toBe("Dijkstra potřebuje ceny hran");
    await t.m.unmount();
  });

  it("Import textem: Použít text přestaví graf a zachová polohu známých vrcholů; chyba se ukáže", async () => {
    const t = await setup();
    await type(t.textarea(), "1 2 4\n2 3 1\n3 7 2");
    expect(t.m.el.textContent).toContain("Text se liší od kresby");
    await click(t.m.button("Použít text"));
    const g = t.graph();
    expect(g.nodes.map((n) => n.label)).toEqual(["1", "2", "3", "7"]);
    expect(g.nodes[0]).toMatchObject({ x: 0.1, y: 0.5 });
    expect(t.textarea().value).toBe("1 2 4\n2 3 1\n3 7 2");
    await type(t.textarea(), "1 2 x");
    await key(t.textarea(), { key: "Enter", ctrlKey: true });
    expect(
      t.m.el.querySelector(".ge-text [role='alert']")?.textContent,
    ).toContain("Řádek 1");
    expect(t.graph().nodes).toHaveLength(4);
    await t.m.unmount();
  });

  it("Hotovo (bez ▶ – nic se nepřehrává) přepne do režimu algoritmu a zavolá onRun jednou", async () => {
    const t = await setup();
    await click(t.m.button("Hotovo"));
    expect(t.onRun).toHaveBeenCalledTimes(1);
    expect(t.mode()).toBe("run");
    await t.m.unmount();
  });

  it("hláška editoru (odmítnutá smyčka) se ukáže ve stavovém řádku", async () => {
    const t = await setup();
    const nodes = t.m.el.querySelectorAll("g.graph-node");
    await key(nodes[0], { key: "Enter" });
    await key(nodes[1], { key: "Enter" });
    expect(t.m.el.querySelector(".ge-message")?.textContent).toBe(
      "Hrana 1–2 už v grafu je.",
    );
    await t.m.unmount();
  });

  it("panel mimo editor (GRAPH-10): lišta editoru má jen Upravit graf, Hotovo, Zpět, Smazat; přepínače, návod a hláška jsou v GraphEditorPanel", async () => {
    const t = await setup({ panel: "outside" });
    const bar = t.m.el.querySelector(".ge-toolbar")!;
    // přístupná jména (Zpět a Smazat jsou kompaktní ikony s aria-label a title – G-03)
    expect(
      [...bar.querySelectorAll("button")].map(
        (b) => b.getAttribute("aria-label") ?? b.textContent,
      ),
    ).toEqual(["Upravit graf", "Hotovo", "Zpět", "Smazat"]);
    expect(bar.querySelector("input[type=checkbox]")).toBeNull();
    expect(t.m.el.querySelector(".ge-hint")).toBeNull();
    await t.m.unmount();
    function P() {
      const edit = useGraphEdit(G);
      return h(GraphEditorPanel, { edit });
    }
    const p = await mount(h(P));
    expect(p.el.querySelector(".ge-hint")?.textContent).toContain(
      "Klik do prázdna",
    );
    expect(p.el.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
    expect(p.el.querySelector(".ge-message")).not.toBeNull();
    await p.unmount();
  });
});

describe("GraphEditor – lišta stejně vysoká v běhu i v editoru (G-03)", () => {
  it("Zpět a Smazat jsou kompaktní ikony s přístupným jménem a title", async () => {
    const t = await setup({ panel: "outside" });
    for (const name of ["Zpět", "Smazat"]) {
      const b = t.m.button(name);
      expect(b.getAttribute("aria-label"), name).toBe(name);
      expect(b.title, name).not.toBe("");
      expect((b.textContent ?? "").trim().length, name).toBeLessThanOrEqual(1);
    }
    await t.m.unmount();
  });
});

describe("GraphEditor – stav kresby v editoru (editState, F-10)", () => {
  it("s editState s prázdnými edgeText nemá kresba v editoru popisky hran a klik na hranu otevře pole ceny", async () => {
    const t = await setup({
      editState: { ...emptyState(), edgeText: { 0: "" } },
    });
    expect(t.m.el.querySelector(".edge-label")).toBeNull();
    await tap(t.m.el.querySelector(".edge-hit")!, t.svg(), 180, 200);
    expect(t.m.el.querySelector("foreignObject input")).not.toBeNull();
    await t.m.unmount();
  });

  it("bez editState jsou v editoru popisky cen jako dřív", async () => {
    const t = await setup();
    expect(t.m.el.querySelector(".edge-label")?.textContent).toBe("4");
    await t.m.unmount();
  });
});

describe("GraphEditor – přesun v režimu algoritmu pro ↶ Vrátit operaci (V-4)", () => {
  it("tah vrcholu ohlásí onRunMove s id tahu (všechna volání stejné), Shift+šipka bez něj", async () => {
    const onRunMove = vi.fn();
    const t = await setup({ onRunMove }, "run");
    const n1 = t.m.el.querySelectorAll("g.graph-node")[1];
    await pointer(n1, "pointerdown", { clientX: 300, clientY: 200 });
    await pointer(t.svg(), "pointermove", { clientX: 320, clientY: 220 });
    await pointer(t.svg(), "pointermove", { clientX: 340, clientY: 240 });
    await pointer(t.svg(), "pointerup", { clientX: 340, clientY: 240 });
    expect(onRunMove.mock.calls.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(onRunMove.mock.calls.map((c) => c[1]));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toEqual(expect.any(Number));
    expect(onRunMove.mock.calls[0][0]).toBe(1);
    onRunMove.mockClear();
    await key(t.m.el.querySelectorAll("g.graph-node")[1], {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(onRunMove).toHaveBeenCalledWith(1, undefined);
    await t.m.unmount();
  });
});

describe("GraphEditor – fokus a klávesy v editoru (G-06)", () => {
  it("klik do prázdna přidá vrchol a Ctrl+Z ho vrátí, i když fokus zůstal na <body>", async () => {
    const t = await setup();
    await tap(t.m.el.querySelector(".graph-bg")!, t.svg(), 300, 100);
    expect(t.graph().nodes).toHaveLength(4);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await key(document.body, { key: "z", ctrlKey: true });
    expect(t.graph().nodes).toHaveLength(3);
    await t.m.unmount();
  });

  it("klik na hranu → Esc zavře pole ceny, hrana zůstane vybraná s fokusem → Delete ji smaže", async () => {
    const t = await setup();
    await tap(t.m.el.querySelector(".edge-hit")!, t.svg(), 180, 200);
    const input = t.m.el.querySelector<HTMLInputElement>(
      "foreignObject input",
    )!;
    await key(input, { key: "Escape" });
    expect(t.m.el.querySelector("foreignObject")).toBeNull();
    expect(document.activeElement?.closest?.("svg.graph-svg")).not.toBeNull();
    await key(document.activeElement ?? document.body, { key: "Delete" });
    expect(t.graph().edges).toHaveLength(0);
    await t.m.unmount();
  });

  it("Delete s vybraným vrcholem funguje i s fokusem na <body>", async () => {
    const t = await setup();
    await tap(t.m.el.querySelectorAll("g.graph-node")[2], t.svg(), 540, 200);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await key(document.body, { key: "Delete" });
    expect(t.graph().nodes).toHaveLength(2);
    await t.m.unmount();
  });

  it("po Hotovo je fokus na tlačítku Upravit graf, ne na <body>", async () => {
    const t = await setup();
    const done = t.m.button("Hotovo");
    done.focus();
    await click(done);
    expect(t.mode()).toBe("run");
    expect(document.activeElement).toBe(t.m.button("Upravit graf"));
    await t.m.unmount();
  });

  it("v režimu algoritmu Delete ani Ctrl+Z na <body> graf nemění", async () => {
    const t = await setup({}, "run");
    await key(document.body, { key: "Delete" });
    await key(document.body, { key: "z", ctrlKey: true });
    expect(t.graph().nodes).toHaveLength(3);
    await t.m.unmount();
  });
});
