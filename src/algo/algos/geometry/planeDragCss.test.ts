// CSS úprav roviny (konvexní obal, k-d strom): tah myší nesmí označovat text popisků, neviditelný úchop
// bodu, kurzory, k-d rovina bez posunu stránky prstem (tah z prázdna natahuje Q).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
  .replaceAll("\r\n", "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** spojená těla pravidel, jejichž seznam selektorů obsahuje `selector` */
function rules(selector: string): string {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sels = m[1].split(",").map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
  }
  return out.join("\n");
}

describe("CSS – úpravy roviny ukazatelem", () => {
  it("tah v rovině neoznačuje text (popisky bodů)", () => {
    for (const s of [
      ".algo-root .hull-plane.is-editable",
      ".algo-root .kd-plane.is-editable",
    ])
      expect(rules(s), s).toMatch(/user-select:\s*none/);
  });

  it("neviditelný úchop bodu 22 px obrazovky, bod má kurzor grab, během tahu grabbing", () => {
    expect(rules(".algo-root .is-editable circle.plane-hit")).toMatch(
      /r:\s*calc\(22px \* var\(--algo-plane-k, 1\)\)/,
    );
    expect(rules(".algo-root .is-editable .hull-pt")).toMatch(/cursor:\s*grab/);
    expect(rules(".algo-root .kd-plane.is-dragging *")).toMatch(
      /cursor:\s*grabbing/,
    );
  });

  it("k-d rovina: prst stránku neposouvá (tah z prázdna = Q); obal touch-action nemá (posun stránky z prázdna)", () => {
    expect(rules(".algo-root .kd-plane.is-editable")).toMatch(
      /touch-action:\s*none/,
    );
    expect(rules(".algo-root .hull-plane.is-editable")).not.toMatch(
      /touch-action/,
    );
  });
});
