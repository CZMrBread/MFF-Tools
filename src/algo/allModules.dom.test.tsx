// @vitest-environment jsdom
/*
 * Přehrávání se nikdy nespouští samo – ve všech modulech z registry.ts: po otevření stránky i po
 * první operaci z nabídky stojí přehrávač (tlačítko „Přehrát“, krok 1 nebo „připraveno“).
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";
import { MODULES } from "./registry";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const wait = (ms: number) =>
  act(() => new Promise<void>((r) => setTimeout(r, ms)));

function playerState(c: HTMLElement) {
  const play = c.querySelector(".ctl-play");
  return {
    label: play?.getAttribute("aria-label"),
    counter: c.querySelector(".step-counter")?.textContent,
  };
}

const STOPPED = /^(krok 1 \/ \d+|připraveno)$/;

describe("všechny moduly – přehrávání stojí, dokud uživatel nestiskne ▶", () => {
  it("registr má všech 52 modulů (33 + 8 z fáze 2 + 10 z fáze 4 + Goldberg)", () => {
    expect(MODULES.length).toBe(52);
  });

  for (const m of MODULES) {
    it(`${m.path}: po otevření i po první operaci stojí na kroku 1`, async () => {
      window.location.hash = "#" + m.path;
      const { container } = render(<AlgoPage />);
      await screen.findAllByText(m.title);
      // stránky fáze 2 se načítají líně (React.lazy) – počkat, až je nabídka operací v DOM
      await waitFor(
        () => expect(container.querySelector(".am-action")).not.toBeNull(),
        { timeout: 10000 },
      );
      await wait(30);
      const opened = playerState(container);
      expect(opened.label, "po otevření").not.toBe("Pozastavit");
      expect(opened.counter, "po otevření").toMatch(STOPPED);

      // první povolená operace z nabídky (s výchozími argumenty)
      const action = [
        ...container.querySelectorAll<HTMLButtonElement>(".am-action"),
      ].find((b) => b.getAttribute("aria-disabled") !== "true");
      expect(action, "modul má nabídku operací").toBeTruthy();
      await act(async () => fireEvent.click(action!));
      const go = container.querySelector<HTMLButtonElement>(".am-go");
      if (go && go.getAttribute("aria-disabled") !== "true")
        await act(async () => fireEvent.click(go));
      await wait(30);
      const after = playerState(container);
      expect(after.label, "po operaci").not.toBe("Pozastavit");
      expect(after.counter, "po operaci").toMatch(STOPPED);
    });
  }
});

/*
 * Jednotné akce a nadpisy (UX test fáze 3, CROSS-04/05/14): „Výchozí příklad“ je ve všech modulech jedno
 * tlačítko v řádku pod akcemi (Visualizer: structure / inputHistory / onRestoreInitial), ne varianta
 * v nabídce; „Vytvořit“ je první akce; nadpis stránky = název modulu v registru.
 */
describe("všechny moduly – jednotné akce a nadpis", () => {
  async function open(m: (typeof MODULES)[number]) {
    window.location.hash = "#" + m.path;
    const r = render(<AlgoPage />);
    await screen.findAllByText(m.title);
    await waitFor(
      () => expect(r.container.querySelector(".am-action")).not.toBeNull(),
      { timeout: 10000 },
    );
    await wait(30);
    return r.container;
  }
  const isRestore = (b: Element) => b.textContent?.trim() === "Výchozí příklad";

  for (const m of MODULES) {
    it(`${m.path}: H1 = název v registru, „Výchozí příklad“ jednou pod akcemi, Vytvořit první`, async () => {
      const c = await open(m);
      expect(c.querySelector("h1")?.textContent, "nadpis").toBe(m.title);

      const actions = [...c.querySelectorAll<HTMLButtonElement>(".am-action")];
      const create = actions.findIndex((b) =>
        b.textContent?.startsWith("Vytvořit"),
      );
      if (create >= 0) expect(create, "Vytvořit je první akce").toBe(0);

      if (m.path === "/parallel/lockfree") return; // scénáře, ne vstup – výjimka
      const outside = [...c.querySelectorAll("button")].filter(
        (b) => isRestore(b) && !b.closest(".action-menu"),
      );
      expect(outside.length, "právě jedno tlačítko Výchozí příklad").toBe(1);
      expect(
        outside[0].closest(".viz-history"),
        "v řádku pod akcemi",
      ).not.toBeNull();
      // v nabídce akcí (ani ve variantách) „Výchozí příklad“ není
      for (const b of actions) {
        if (!b.hasAttribute("aria-expanded")) continue;
        if (b.getAttribute("aria-disabled") === "true") continue;
        const wasOpen = b.getAttribute("aria-expanded") === "true";
        if (!wasOpen) await act(async () => fireEvent.click(b));
        const inMenu = [
          ...c.querySelectorAll(".action-menu button, .action-menu option"),
        ].filter(isRestore);
        expect(inMenu.length, `${b.textContent}: žádné Výchozí příklad`).toBe(
          0,
        );
        if (!wasOpen) await act(async () => fireEvent.click(b));
      }
    });
  }
});
