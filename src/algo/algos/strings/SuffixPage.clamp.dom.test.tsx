// @vitest-environment jsdom
/*
 * Dlouhé α na malém plátně (Otevřené body, dávka 2): tabulka sufixového pole s omezenou výškou se
 * posouvá uvnitř (třída sa-clamped pro lepící záhlaví, max-height z saClamp); bez omezení beze změny.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mount, type Mounted } from "../../core/domTest";
import { initialSuffix, withLcp } from "./pageModel";
import { suffixSteps } from "./suffix";
import { SATable } from "./SuffixViews";

let m: Mounted | null = null;
afterEach(async () => {
  await m?.unmount();
  m = null;
});

const stateFor = (alpha: string) => {
  const run = initialSuffix(alpha, null);
  return suffixSteps(run.applied, run.phase, withLcp(run))[0].state;
};

describe("SATable – omezená výška", () => {
  it("bez omezení: obal bez max-height a bez sa-clamped", async () => {
    m = await mount(<SATable st={stateFor("barokoarokoko")} />);
    const wrap = m.el.querySelector<HTMLDivElement>(".table-scroll")!;
    expect(wrap.classList.contains("sa-clamped")).toBe(false);
    expect(wrap.style.maxHeight).toBe("");
  });

  it("s omezením: obal se posouvá svisle (max-height, overflow-y) a nese sa-clamped; tabulka má všechny řádky", async () => {
    m = await mount(
      <SATable st={stateFor("abcdefghijklmnopqrstuvwx")} maxHeight={180} />,
    );
    const wrap = m.el.querySelector<HTMLDivElement>(".table-scroll")!;
    expect(wrap.classList.contains("sa-clamped")).toBe(true);
    expect(wrap.style.maxHeight).toBe("180px");
    expect(wrap.style.overflowY).toBe("auto");
    expect(m.el.querySelectorAll("tbody tr")).toHaveLength(25);
  });
});
