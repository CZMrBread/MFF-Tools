// @vitest-environment jsdom
// usePointerDrag: práh klik/tah, úchop s posunem, meze, zmrazení (frozen) od stisku do puštění,
// zachycení ukazatele, myš / pero / prst. Matice obrazovky se vkládá (jsdom nemá getScreenCTM).
import { act, createElement as h, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount } from "./domTest";
import { usePointerDrag, type DragRelease } from "./usePointerDrag";
import type { P2 } from "./dragMath";

const ID = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

async function fire(
  target: Element,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        button: type === "pointerdown" ? 0 : -1,
        ...extra,
      }),
    );
  });
}

interface Spy {
  moves: P2[];
  releases: DragRelease<number, { scale: number }>[];
  frozenSeen: (number | null)[];
  cancels: number[];
}

function Harness({
  spy,
  scale,
  clamp,
}: {
  spy: Spy;
  scale: number;
  clamp?: (p: P2) => P2;
}) {
  const [c, setC] = useState<P2>({ x: 100, y: 100 });
  const drag = usePointerDrag<number, { scale: number }>({
    screenMatrix: ID,
    clamp: clamp ? (p) => clamp(p) : undefined,
    onMove: (p) => {
      spy.moves.push(p);
      setC(p);
    },
    onRelease: (r) => spy.releases.push(r),
    onCancel: () => {
      spy.cancels.push(1);
    },
  });
  spy.frozenSeen.push(drag.session?.frozen.scale ?? null);
  return h(
    "svg",
    {
      ref: drag.attachSvg,
      className: "drag-svg" + (drag.session?.moved ? " is-dragging" : ""),
      ...drag.handlers,
    },
    h("circle", {
      cx: c.x,
      cy: c.y,
      r: 18,
      className: "dot",
      onPointerDown: (e: React.PointerEvent) =>
        drag.begin(e, 7, { center: c, frozen: { scale } }),
    }),
  );
}

async function setup(scale = 2, clamp?: (p: P2) => P2) {
  const spy: Spy = { moves: [], releases: [], frozenSeen: [], cancels: [] };
  const m = await mount(h(Harness, { spy, scale, clamp }));
  const svg = m.el.querySelector("svg")!;
  const capture = vi.fn();
  const release = vi.fn();
  const dot = () => m.el.querySelector(".dot")!;
  // zachytí se prvek, na kterém tah začal (pohyb pak probublá k <svg>)
  Object.assign(dot(), {
    setPointerCapture: capture,
    releasePointerCapture: release,
    hasPointerCapture: () => true,
  });
  return { m, svg, dot, spy, capture, release };
}

describe("usePointerDrag (jsdom, PointerEvent)", () => {
  it("klik pod prahem = ťuknutí: žádný přesun, puštění s moved=false", async () => {
    const t = await setup();
    await fire(t.dot(), "pointerdown", 100, 100);
    await fire(t.svg, "pointermove", 102, 101);
    await fire(t.svg, "pointerup", 102, 101);
    expect(t.spy.moves).toEqual([]);
    expect(t.spy.releases).toHaveLength(1);
    expect(t.spy.releases[0].moved).toBe(false);
    expect(t.spy.releases[0].session.target).toBe(7);
    await t.m.unmount();
  });

  it("tah: prvek jede s ukazatelem o posun z uchopení (nepřeskočí), ukazatel se zachytí na prvku", async () => {
    const t = await setup();
    // uchopení 10 px vpravo a 5 px pod středem
    await fire(t.dot(), "pointerdown", 110, 105);
    expect(t.capture).toHaveBeenCalledWith(1);
    await fire(t.svg, "pointermove", 140, 125);
    await fire(t.svg, "pointermove", 210, 205);
    expect(t.spy.moves).toEqual([
      { x: 130, y: 120 },
      { x: 200, y: 200 },
    ]);
    expect(t.svg.getAttribute("class")).toContain("is-dragging");
    await fire(t.svg, "pointerup", 210, 205);
    const r = t.spy.releases[0];
    expect(r.moved).toBe(true);
    expect(r.center).toEqual({ x: 200, y: 200 });
    expect(r.pointer).toEqual({ x: 210, y: 205 });
    expect(t.svg.getAttribute("class")).not.toContain("is-dragging");
    await t.m.unmount();
  });

  it("meze (clamp) platí pro střed taženého prvku během tahu i při puštění", async () => {
    const box = (p: P2) => ({
      x: Math.min(300, Math.max(20, p.x)),
      y: Math.min(200, Math.max(20, p.y)),
    });
    const t = await setup(2, box);
    await fire(t.dot(), "pointerdown", 100, 100);
    await fire(t.svg, "pointermove", 900, -50);
    await fire(t.svg, "pointerup", 950, -80);
    expect(t.spy.moves.at(-1)).toEqual({ x: 300, y: 20 });
    expect(t.spy.releases[0].center).toEqual({ x: 300, y: 20 });
    await t.m.unmount();
  });

  it("zmrazení: session.frozen je hodnota ze stisku po celý tah, i když se kresba mezitím překreslí", async () => {
    const t = await setup(2);
    await fire(t.dot(), "pointerdown", 100, 100);
    // stránka mezitím přepočítá měřítko (nová props) – tah drží zmrazené
    await t.m.render(
      h(Harness, { spy: t.spy, scale: 0.25 } as Parameters<typeof Harness>[0]),
    );
    await fire(t.svg, "pointermove", 150, 100);
    await fire(t.svg, "pointermove", 180, 100);
    const during = t.spy.frozenSeen.slice(1).filter((v) => v !== null);
    expect(during.length).toBeGreaterThan(0);
    expect(new Set(during)).toEqual(new Set([2]));
    await fire(t.svg, "pointerup", 180, 100);
    expect(t.spy.frozenSeen.at(-1)).toBeNull();
    await t.m.unmount();
  });

  it("prst (touch) a pero táhnou stejně; pravé tlačítko myši tah nezačne", async () => {
    const t = await setup();
    await fire(t.dot(), "pointerdown", 100, 100, { pointerType: "touch" });
    await fire(t.svg, "pointermove", 130, 100, { pointerType: "touch" });
    await fire(t.svg, "pointerup", 130, 100, { pointerType: "touch" });
    expect(t.spy.releases[0].session.pointerType).toBe("touch");
    expect(t.spy.releases[0].moved).toBe(true);

    await fire(t.dot(), "pointerdown", 130, 100, { button: 2 });
    await fire(t.svg, "pointermove", 200, 100);
    await fire(t.svg, "pointerup", 200, 100);
    expect(t.spy.releases).toHaveLength(1);
    await t.m.unmount();
  });

  it("druhý prst tah nepřebírá; pointercancel tah ukončí bez puštění", async () => {
    const t = await setup();
    await fire(t.dot(), "pointerdown", 100, 100, { pointerType: "touch" });
    await fire(t.dot(), "pointerdown", 100, 100, {
      pointerType: "touch",
      pointerId: 2,
    });
    await fire(t.svg, "pointermove", 160, 100, {
      pointerType: "touch",
      pointerId: 2,
    });
    expect(t.spy.moves).toEqual([]);
    await fire(t.svg, "pointercancel", 160, 100, { pointerType: "touch" });
    expect(t.spy.cancels).toHaveLength(1);
    expect(t.spy.releases).toHaveLength(0);
    // po zrušení jde začít nový tah
    await fire(t.dot(), "pointerdown", 100, 100);
    await fire(t.svg, "pointerup", 100, 100);
    expect(t.spy.releases).toHaveLength(1);
    await t.m.unmount();
  });
});

describe("usePointerDrag – prst a posun stránky", () => {
  const touchstart = async (target: Element) => {
    const ev = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      target.dispatchEvent(ev);
    });
    return ev;
  };

  it("touchstart po uchopení prvku prstem zruší posun stránky (Chrome nebere touch-action uvnitř SVG)", async () => {
    const t = await setup();
    await fire(t.dot(), "pointerdown", 100, 100, { pointerType: "touch" });
    expect((await touchstart(t.dot())).defaultPrevented).toBe(true);
    await fire(t.svg, "pointerup", 100, 100, { pointerType: "touch" });
    await t.m.unmount();
  });

  it("dotyk mimo přetahovatelný prvek stránku posouvat nechá", async () => {
    const t = await setup();
    expect((await touchstart(t.svg)).defaultPrevented).toBe(false);
    await t.m.unmount();
  });
});
