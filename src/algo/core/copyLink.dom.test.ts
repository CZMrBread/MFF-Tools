// @vitest-environment jsdom
// E7: „Kopírovat odkaz“ zkopíruje čitelnou adresu (čárky bez %2C) i u stránky, která zapsala zakódovaný dotaz.
import { act, createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "./domTest";
import type { Step } from "./steps";
import type { Player } from "./usePlayer";
import { Visualizer } from "./Visualizer";

const steps: Step<number>[] = [{ state: 0, line: null, message: "start" }];
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

describe("Kopírovat odkaz (E7)", () => {
  const original = window.location.hash;
  afterEach(() => {
    window.location.hash = original;
    vi.restoreAllMocks();
  });

  it("zkopíruje adresu s čitelným dotazem za hashem", async () => {
    window.location.hash = "#/hash/probing?t=4%3Amod%3A1%3A1%2C5%2C9";
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const m = await mount(
      h(Visualizer<number>, {
        title: "Test",
        description: "popis",
        pseudocode: ["x"],
        actions: h("div"),
        player,
        share: true,
        children: h("div"),
      }),
    );
    await act(async () => m.button("Kopírovat odkaz").click());
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(copied.endsWith("#/hash/probing?t=4:mod:1:1,5,9")).toBe(true);
    await m.unmount();
  });
});
