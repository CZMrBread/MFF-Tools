// @vitest-environment jsdom
/*
 * Klávesnicový tok na skutečné stránce modulu (UX audit 7. 11. 2026): operace Enterem v poli a hned
 * potom mezerník = přehrát. Dřív fokus po sbalení akce skončil na jejím tlačítku a mezerník akci
 * znovu otevřel (fokus zpět do pole) – přehrát se z klávesnice nedalo.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";

const original = window.matchMedia;
beforeEach(() => {
  // desktop na jednu obrazovku: akce se po provedení sbalí
  window.matchMedia = ((q: string) => ({
    matches: q.includes("1100px"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  window.matchMedia = original;
  window.location.hash = "";
});

const wait = (ms: number) =>
  act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function openPage(hash: string, title: string) {
  window.location.hash = hash;
  const r = render(<AlgoPage />);
  await screen.findAllByText(title);
  await wait(20);
  return r.container;
}

describe("klávesnice: operace Enterem, pak mezerník přehraje", () => {
  it("Zásobník: Push(x) Enter → fokus na tlačítku akce → mezerník spustí přehrávání, akce zůstane zavřená", async () => {
    const c = await openPage("#/ds/stack", "Zásobník");
    const push = [...c.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (b) => b.textContent?.startsWith("Push"),
    )!;
    if (push.getAttribute("aria-expanded") !== "true")
      await act(async () => fireEvent.click(push));
    const field = c.querySelector<HTMLInputElement>(".am-body input")!;
    field.focus();
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    await wait(20);
    expect(c.querySelector(".am-body"), "akce sbalená").toBeNull();
    const focused = document.activeElement as HTMLElement;
    expect(focused.classList.contains("am-action")).toBe(true);

    await act(async () => fireEvent.keyDown(focused, { key: " " }));
    await wait(20);
    expect(c.querySelector(".ctl-play")?.getAttribute("aria-label")).toBe(
      "Pozastavit",
    );
    expect(c.querySelector(".am-body"), "mezerník akci neotevřel").toBeNull();
  });

  it("po mezerníku na tlačítku akce fokus přejde na ▶/⏸ (neztratí se na <body>), další mezerník pozastaví", async () => {
    // validace 7. 11. 2026 (VAL-01): blur() nechal fokus na BODY a další Tab skočil na první vrchol kresby
    const c = await openPage("#/ds/stack", "Zásobník");
    const push = [...c.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (b) => b.textContent?.startsWith("Push"),
    )!;
    if (push.getAttribute("aria-expanded") !== "true")
      await act(async () => fireEvent.click(push));
    const field = c.querySelector<HTMLInputElement>(".am-body input")!;
    // do pole se klikne myší (pak se fokus bere jako „po kliknutí“), dál už jen klávesnice
    fireEvent.pointerDown(field);
    field.focus();
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    await wait(20);
    const focused = document.activeElement as HTMLElement;
    await act(async () => fireEvent.keyDown(focused, { key: " " }));
    await act(async () => fireEvent.keyUp(focused, { key: " " }));
    await wait(20);
    const play = c.querySelector<HTMLButtonElement>(".ctl-play")!;
    expect(play.getAttribute("aria-label")).toBe("Pozastavit");
    expect(document.activeElement, "fokus na ▶/⏸").toBe(play);
    // fokus na ▶ od klávesnice: mezerník tlačítko stiskne (nativně = klik) → pauza, fokus zůstane
    const ev = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => play.dispatchEvent(ev));
    if (!ev.defaultPrevented) await act(async () => fireEvent.click(play));
    await wait(20);
    expect(play.getAttribute("aria-label")).not.toBe("Pozastavit");
    expect(document.activeElement, "fokus zůstal na ▶").toBe(play);
  });

  it("tlačítko akce, na které uživatel došel tabulátorem (bez právě provedené operace), mezerník dál stiskne", async () => {
    const c = await openPage("#/ds/stack", "Zásobník");
    const pop = [...c.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (b) => b.textContent === "Pop",
    )!;
    pop.focus();
    await act(async () => fireEvent.keyDown(pop, { key: " " }));
    await wait(20);
    expect(c.querySelector(".ctl-play")?.getAttribute("aria-label")).not.toBe(
      "Pozastavit",
    );
  });
});

describe("tlačítka přehrávání na kraji neztratí fokus (SORTDS-01)", () => {
  async function runPush(c: HTMLElement) {
    const push = [...c.querySelectorAll<HTMLButtonElement>(".am-action")].find(
      (b) => b.textContent?.startsWith("Push"),
    )!;
    if (push.getAttribute("aria-expanded") !== "true")
      await act(async () => fireEvent.click(push));
    const field = c.querySelector<HTMLInputElement>(".am-body input")!;
    field.focus();
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    await wait(20);
  }
  /** Enter na tlačítku = klik; fokus musí zůstat na použitelném prvku (ne <body>, ne disabled) */
  async function press(c: HTMLElement, label: string) {
    const b = c.querySelector<HTMLButtonElement>(
      `.controls button[aria-label="${label}"]`,
    )!;
    b.focus();
    await act(async () => fireEvent.click(b));
    await wait(10);
    const a = document.activeElement as HTMLButtonElement | null;
    expect(a, `${label}: fokus není na <body>`).not.toBe(document.body);
    expect(a?.disabled, `${label}: fokus není na disabled prvku`).toBe(false);
  }

  it("Na konec, Na začátek a opakovaný Krok vpřed na posledním kroku; nic se nespustí", async () => {
    const c = await openPage("#/ds/stack", "Zásobník");
    await runPush(c);
    await press(c, "Na konec");
    await press(c, "Na začátek");
    await press(c, "Krok zpět");
    await press(c, "Na konec");
    await press(c, "Krok vpřed");
    await press(c, "Krok vpřed");
    expect(c.querySelector(".ctl-play")?.getAttribute("aria-label")).not.toBe(
      "Pozastavit",
    );
    // na kraji je tlačítko označené aria-disabled a klik nic nedělá
    const last = c.querySelector<HTMLButtonElement>(
      '.controls button[aria-label="Na konec"]',
    )!;
    expect(last.getAttribute("aria-disabled")).toBe("true");
    const counter = c.querySelector(".step-counter")!.textContent;
    await act(async () => fireEvent.click(last));
    expect(c.querySelector(".step-counter")!.textContent).toBe(counter);
  });
});

/*
 * Roving tabindex na kresbě (D3, 7. 11. 2026): kresba je jedna zastávka Tabu, šipky v ní přesouvají fokus
 * (přehrávač nekrokuje), Enter vybere prvek, mezerník vždy přehrává / pozastaví, Shift+šipky posunou
 * vrchol. Mimo kresbu a pole šipky dál krokují.
 */
describe("klávesnice na kresbě (roving tabindex)", () => {
  const counter = (c: HTMLElement) =>
    c.querySelector(".step-counter")?.textContent;
  const playLabel = (c: HTMLElement) =>
    c.querySelector(".ctl-play")?.getAttribute("aria-label");
  const stop = (svg: Element) =>
    [...svg.querySelectorAll<SVGElement>("[tabindex]")].filter(
      (e) => e.getAttribute("tabindex") === "0",
    );

  it("BFS: Tab na kresbu = jeden vrchol; šipka přesune fokus na jiný vrchol a nekrokuje; mezerník přehraje", async () => {
    const c = await openPage("#/graph/bfs", "Prohledávání do šířky (BFS)");
    const svg = c.querySelector("svg.graph-svg")!;
    expect(stop(svg).length).toBe(1);
    const first = stop(svg)[0]!;
    first.focus();
    const before = counter(c);
    await act(async () => fireEvent.keyDown(first, { key: "ArrowRight" }));
    expect(document.activeElement).not.toBe(first);
    expect(svg.contains(document.activeElement)).toBe(true);
    expect(counter(c), "šipka na kresbě nekrokuje").toBe(before);
    expect(stop(svg)).toEqual([document.activeElement]);

    await act(async () =>
      fireEvent.keyDown(document.activeElement!, { key: " " }),
    );
    await wait(20);
    expect(playLabel(c), "mezerník na kresbě přehrává").toBe("Pozastavit");
    await act(async () =>
      fireEvent.keyDown(document.activeElement!, { key: " " }),
    );
    expect(playLabel(c)).not.toBe("Pozastavit");
  });

  it("BFS: Shift+šipka posune vrchol (krok přehrávání zůstane), obyčejná šipka ne", async () => {
    const c = await openPage("#/graph/bfs", "Prohledávání do šířky (BFS)");
    const svg = c.querySelector("svg.graph-svg")!;
    const v = stop(svg)[0]!;
    v.focus();
    const was = v.style.transform;
    const before = counter(c);
    await act(async () =>
      fireEvent.keyDown(v, { key: "ArrowDown", shiftKey: true }),
    );
    expect(v.style.transform).not.toBe(was);
    expect(counter(c)).toBe(before);
    expect(document.activeElement).toBe(v);
  });

  it("třídění: šipky a End chodí po sloupcích a nekrokují, mimo kresbu šipka krokuje", async () => {
    const c = await openPage("#/sort/bubble", "Bubblesort");
    const svg = c.querySelector("svg.array-svg")!;
    const bars = [...svg.querySelectorAll<SVGGElement>("g.bar")];
    expect(stop(svg)).toEqual([bars[0]]);
    bars[0]!.focus();
    const before = counter(c);
    await act(async () => fireEvent.keyDown(bars[0]!, { key: "ArrowRight" }));
    expect(document.activeElement).toBe(bars[1]);
    await act(async () => fireEvent.keyDown(bars[1]!, { key: "End" }));
    expect(document.activeElement).toBe(bars[bars.length - 1]);
    expect(counter(c)).toBe(before);

    (document.activeElement as HTMLElement).blur();
    await act(async () =>
      fireEvent.keyDown(document.body, { key: "ArrowRight" }),
    );
    expect(counter(c), "mimo kresbu šipka krokuje").not.toBe(before);
  });
});
