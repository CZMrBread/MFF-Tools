// @vitest-environment jsdom
/*
 * Roving tabindex na kresbě (D3): kresba je jedna zastávka Tabu, šipky přesouvají fokus mezi prvky,
 * Home / End na první / poslední, Esc kresbu opustí (fokus na další ovládací prvek za ní). Enter a
 * mezerník hook nechává prvku a přehrávači; Shift+šipky (přesun vrcholu v editoru) také.
 */
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { key, mount, type Mounted } from "./domTest";
import { useRovingFocus } from "./useRovingFocus";

function Drawing({ keys }: { keys: string[] }) {
  const rove = useRovingFocus(keys);
  return (
    <div>
      <button type="button">před</button>
      <svg role="group" aria-label="Kresba" {...rove.group}>
        {keys.map((k) => (
          <g key={k} role="button" aria-label={k} {...rove.item(k)} />
        ))}
      </svg>
      <button type="button">za</button>
    </div>
  );
}

function Switchable() {
  const [keys, setKeys] = useState(["a", "b", "c"]);
  return (
    <>
      <button type="button" onClick={() => setKeys(["b", "c"])}>
        smazat a
      </button>
      <Drawing keys={keys} />
    </>
  );
}

let m: Mounted | null = null;
afterEach(async () => {
  await m?.unmount();
  m = null;
});

const items = () => [...m!.el.querySelectorAll<SVGGElement>("g")];
const stops = () =>
  items()
    .filter((g) => g.getAttribute("tabindex") === "0")
    .map((g) => g.getAttribute("aria-label"));

describe("useRovingFocus", () => {
  it("jedna zastávka Tabu (první prvek), ostatní tabindex -1, prvky označené jako prvky kresby", async () => {
    m = await mount(<Drawing keys={["a", "b", "c"]} />);
    expect(stops()).toEqual(["a"]);
    expect(items().map((g) => g.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
    for (const g of items())
      expect(g.hasAttribute("data-canvas-item")).toBe(true);
  });

  it("šipky přesouvají fokus a zastávka Tabu jde s ním; klávesa se stránce nebere", async () => {
    m = await mount(<Drawing keys={["a", "b", "c"]} />);
    const [a, b, c] = items();
    a!.focus();
    const ev = await key(a!, { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b);
    expect(stops()).toEqual(["b"]);
    await key(b!, { key: "End" });
    expect(document.activeElement).toBe(c);
    await key(c!, { key: "Home" });
    expect(document.activeElement).toBe(a);
    await key(a!, { key: "ArrowLeft" }); // na kraji zůstane
    expect(document.activeElement).toBe(a);
  });

  it("fokus kliknutím / programově přesune zastávku Tabu na ten prvek", async () => {
    m = await mount(<Drawing keys={["a", "b", "c"]} />);
    items()[2]!.focus();
    await key(items()[2]!, { key: "x" }); // jen ať proběhne render
    expect(stops()).toEqual(["c"]);
  });

  it("Shift+šipky, Enter a mezerník hook nebere (přesun vrcholu, výběr, přehrávač)", async () => {
    m = await mount(<Drawing keys={["a", "b", "c"]} />);
    const [a] = items();
    a!.focus();
    for (const init of [
      { key: "ArrowRight", shiftKey: true },
      { key: "Enter" },
      { key: " " },
      { key: "ArrowRight", ctrlKey: true },
    ]) {
      const ev = await key(a!, init);
      expect(ev.defaultPrevented, JSON.stringify(init)).toBe(false);
      expect(document.activeElement).toBe(a);
    }
  });

  it("Esc opustí kresbu – fokus na další ovládací prvek za ní", async () => {
    m = await mount(<Drawing keys={["a", "b", "c"]} />);
    const [, b] = items();
    b!.focus();
    await key(b!, { key: "Escape" });
    expect(document.activeElement?.textContent).toBe("za");
  });

  it("zmizí-li prvek se zastávkou Tabu, převezme ji první prvek (kresba zůstane dosažitelná)", async () => {
    m = await mount(<Switchable />);
    m.el.querySelector<SVGGElement>('g[aria-label="a"]')!.focus();
    await key(m.el.querySelector('g[aria-label="a"]')!, { key: "x" });
    await m.render(<Switchable />);
    m.button("smazat a").click();
    await m.render(<Switchable />);
    expect(stops()).toEqual(["b"]);
  });

  it("zmizí-li prvek, na kterém byl fokus (krok přehrávače), fokus zůstane v kresbě na nové zastávce", async () => {
    m = await mount(<Switchable />);
    m.el.querySelector<SVGGElement>('g[aria-label="a"]')!.focus();
    m.button("smazat a").click(); // klik bez přesunu fokusu (jako krok přehrávače z klávesnice)
    await m.render(<Switchable />);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("b");
  });

  it("zmizí-li prvek, když fokus v kresbě nebyl, fokus se nebere", async () => {
    m = await mount(<Switchable />);
    m.el.querySelector<SVGGElement>('g[aria-label="a"]')!.focus();
    m.button("smazat a").focus();
    m.button("smazat a").click();
    await m.render(<Switchable />);
    expect(document.activeElement?.textContent).toBe("smazat a");
  });

  it("prázdná kresba: žádná zastávka", async () => {
    m = await mount(<Drawing keys={[]} />);
    expect(stops()).toEqual([]);
  });
});
