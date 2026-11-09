// @vitest-environment jsdom
/*
 * Stránka třídicích sítí v jsdom: kresba podle knihy (vodiče, šipky komparátorů, bloky M₁/M₂/M₄),
 * krokování po vrstvách, klik na šipku vyplní Vynechat(c), příklady z knihy (hora a údolí separátoru),
 * režim 0-1 (klik na vstup přepne bit, ověření všech 2ⁿ vstupů), odkaz v adrese. Přehrávač vždy stojí.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { SortNetPage } from "./SortNetPage";

const all = (el: HTMLElement, sel: string) => [...el.querySelectorAll(sel)];
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const paused = (el: HTMLElement) =>
  el.querySelector(".ctl-play")!.getAttribute("aria-label") !== "Pozastavit";
const variant = (el: HTMLElement, text: string) => {
  const b = all(el, ".am-variant").find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`varianta „${text}“ nenalezena`);
  return b as HTMLButtonElement;
};

describe("SortNetPage (jsdom)", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url = "/parallel/sortnet") =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(
          Routes,
          null,
          h(Route, { path: "/parallel/sortnet", element: h(SortNetPage) }),
        ),
        h(Spy),
      ),
    );

  it("výchozí T₈ jako obr. 15.9: 8 vodičů, 24 šipek, bloky M₁ M₂ M₄; krok 1, pozastaveno", async () => {
    const p = await open();
    expect(p.el.querySelector("h1")?.textContent).toBe("Třídicí sítě");
    expect(all(p.el, ".sn-wire")).toHaveLength(8);
    expect(all(p.el, ".sn-comp")).toHaveLength(24);
    expect(all(p.el, ".sn-block-label").map((t) => t.textContent)).toEqual([
      "M₁",
      "M₁",
      "M₁",
      "M₁",
      "M₂",
      "M₂",
      "M₄",
    ]);
    expect(all(p.el, ".sn-token")).toHaveLength(8);
    expect(counter(p.el)).toBe("krok 1 / 8");
    expect(paused(p.el)).toBe(true);
    expect(p.el.querySelector(".legend")?.textContent).toContain("prohodil");
    expect(p.el.textContent).toContain(
      "Třídička T₈: hloubka 6, komparátorů 24",
    );
    await p.unmount();
  });

  it("Další: vrstva 1 je aktivní, všechny 4 komparátory prohodí; na konci setříděný výstup", async () => {
    const p = await open();
    await click(p.button("Další"));
    expect(all(p.el, ".sn-comp.active")).toHaveLength(4);
    expect(all(p.el, ".sn-comp.active.swap")).toHaveLength(4);
    expect(p.el.querySelector(".sn-band")).not.toBeNull();
    // hodnoty předchozí mezery zůstanou vidět
    expect(all(p.el, ".sn-past")).toHaveLength(8);
    await click(p.button("Na konec"));
    expect(all(p.el, ".sn-token.sorted")).toHaveLength(8);
    expect(paused(p.el)).toBe(true);
    await p.unmount();
  });

  it("klik na šipku vyplní Vynechat(c); vynechaný komparátor je čárkovaný a v adrese", async () => {
    const p = await open();
    const fifth = all(p.el, ".sn-comp")[4] as SVGElement;
    await click(fifth);
    expect(p.input("c =").value).toBe("5");
    await click(p.button("Vynechat / vrátit"));
    expect(all(p.el, ".sn-comp")[4].classList.contains("removed")).toBe(true);
    expect(new URLSearchParams(search).get("x")).toBe("5");
    expect(counter(p.el)).toBe("krok 1 / 8");
    expect(paused(p.el)).toBe(true);
    await p.unmount();
  });

  it("Příklady z knihy ▸ Obr. 15.10: separátor S₈, hora (4 žetony) a údolí", async () => {
    const p = await open();
    await click(p.button("Příklady z knihy"));
    await click(variant(p.el, "Obr. 15.10 Separátor S₈"));
    expect(all(p.el, ".sn-comp")).toHaveLength(4);
    expect(all(p.el, ".sn-token.hora")).toHaveLength(4);
    expect(all(p.el, ".sn-token.udoli")).toHaveLength(4);
    expect(p.el.textContent).toContain("Hora (4 největší): x₁ … x₄, k = 1.");
    expect(new URLSearchParams(search).get("net")).toBe("sep");
    expect(counter(p.el)).toBe("krok 1 / 3");
    await p.unmount();
  });

  it("režim 0-1: klik na vstup přepne bit (nový běh), Ověřit 0-1 principem projde 2⁸ vstupů", async () => {
    const p = await open();
    await click(p.button("Příklady z knihy"));
    await click(variant(p.el, "Cv. 15.3.6 0-1 princip"));
    expect(all(p.el, ".sn-token.z1").length).toBeGreaterThan(0);
    expect(new URLSearchParams(search).get("a")).toBe("1,0,1,1,0,0,1,0");
    await click(p.button("Další"));
    const first = p.el.querySelector<SVGElement>(".sn-input")!;
    await click(first);
    expect(new URLSearchParams(search).get("a")).toBe("0,0,1,1,0,0,1,0");
    expect(counter(p.el)).toBe("krok 1 / 8");
    expect(paused(p.el)).toBe(true);
    await click(p.button("Ověřit 0-1 principem"));
    expect(p.el.textContent).toContain("256 / 256");
    await p.unmount();
  });

  it("výsledek ověření 0-1 principem je na plátně (pruh prošlých vstupů), zmizí po změně sítě", async () => {
    const p = await open();
    expect(p.el.querySelector(".viz-canvas .sn-check")).toBeNull();
    await click(p.button("Ověřit 0-1 principem"));
    const box = p.el.querySelector(".viz-canvas .sn-check")!;
    expect(box).not.toBeNull();
    expect(box.textContent).toMatch(/256 \/ 256/);
    expect(box.textContent).toMatch(/setřídí každý vstup/);
    const bar = box.querySelector("meter, progress, [role=meter]")!;
    expect(bar).not.toBeNull();
    expect(
      Number(bar.getAttribute("value") ?? bar.getAttribute("aria-valuenow")),
    ).toBe(256);
    expect(counter(p.el)).toBe("krok 1 / 8");
    // vynechaný komparátor → protipříklad, na plátně počet prošlých < 256 a nesetříděný výstup
    await click(all(p.el, ".sn-comp")[0] as SVGElement);
    await click(p.button("Vynechat / vrátit"));
    expect(p.el.querySelector(".viz-canvas .sn-check")).toBeNull();
    await click(p.button("Ověřit 0-1 principem"));
    const bad = p.el.querySelector(".viz-canvas .sn-check")!;
    expect(bad.classList.contains("fail")).toBe(true);
    expect(bad.textContent).toMatch(/Protipříklad/);
    expect(bad.textContent).not.toMatch(/256 \/ 256/);
    await p.unmount();
  });

  it("Vytvořit ▸ Vlastní se 7 čísly pro T₈: hláška u pole, formulář zůstane, síť se nezmění", async () => {
    const p = await open();
    const steps = counter(p.el);
    await click(p.button("Vytvořit"));
    await click(variant(p.el, "Vlastní"));
    const field = p.input("P =");
    await type(field, "5, 2, 7, 1, 8, 3, 6");
    const msg = () => p.el.querySelector(".am-body .am-msg");
    expect(msg()?.textContent).toMatch(/2, 4, 8 nebo 16 čísel.*zadáno 7/);
    await key(field, { key: "Enter" });
    expect(msg()?.getAttribute("role")).toBe("alert");
    expect(p.el.querySelector(".am-body")).not.toBeNull();
    expect(counter(p.el)).toBe(steps);
    expect(new URLSearchParams(search).get("a")).not.toBe("5,2,7,1,8,3,6");
    await p.unmount();
  });

  it("rozbitá síť: 0-1 princip najde protipříklad a načte ho jako vstup", async () => {
    const p = await open("/parallel/sortnet?net=t&a=5,2,7,1,8,3,6,4&x=1");
    await click(p.button("Ověřit 0-1 principem"));
    expect(p.el.textContent).toMatch(/Protipříklad/);
    const a = new URLSearchParams(search).get("a")!;
    expect(a.split(",").every((v) => v === "0" || v === "1")).toBe(true);
    expect(counter(p.el)).toBe("krok 1 / 8");
    await p.unmount();
  });

  it("odkaz na bublinku jak je zapsaná (obr. 15.6): 10 šipek, tečkované průchody, vodiče od 1", async () => {
    const p = await open("/parallel/sortnet?net=bubble&a=5,2,4,1,3&lay=seq");
    expect(all(p.el, ".sn-comp")).toHaveLength(10);
    expect(all(p.el, ".sn-pass-sep")).toHaveLength(3);
    expect(all(p.el, ".sn-wire-label").map((t) => t.textContent)).toContain(
      "x₁",
    );
    expect(counter(p.el)).toBe("krok 1 / 12");
    // přepínač zápisu je vidět a přepne na skutečný průběh (obr. 15.7)
    await click(p.input("jak je zapsaná"));
    expect(new URLSearchParams(search).get("lay")).toBeNull();
    expect(counter(p.el)).toBe("krok 1 / 9");
    await p.unmount();
  });

  it("přepínač kresby: vodiče vodorovně (o=h)", async () => {
    const p = await open();
    expect(p.el.querySelector(".sortnet-svg.orient-v")).not.toBeNull();
    await click(p.input("vodiče svisle"));
    expect(p.el.querySelector(".sortnet-svg.orient-h")).not.toBeNull();
    expect(new URLSearchParams(search).get("o")).toBe("h");
    await p.unmount();
  });
});
