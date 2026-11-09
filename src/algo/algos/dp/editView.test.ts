/*
 * Pohled editační vzdálenosti bez Reactu: třídy buněk tabulky (obr. 12.5), šipky tahů a zarovnání slov
 * podle rekonstruovaných úprav.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { FIG_12_5 } from "./dpBook.fixtures";
import { EDIT_LINE, edit2Steps } from "./editDistance";
import { editSelection } from "./editPageModel";
import {
  editAlignment,
  editCellMarks,
  editCellSize,
  editFitLimits,
  editHeadMarks,
} from "./editView";

const steps = materialize(edit2Steps(FIG_12_5.x, FIG_12_5.y));
const last = steps[steps.length - 1].state;

describe("třídy buněk", () => {
  it("krok δ: aktuální buňka a písmena xᵢ, yⱼ v záhlaví (stejná = dp-match)", () => {
    const s = steps.find(
      (st) => st.line === EDIT_LINE.delta && st.state.delta === 0,
    )!.state;
    const [r, c] = s.cur!;
    expect(editCellMarks(s, null)[r][c].cls).toContain("dp-cur");
    const h = editHeadMarks(s);
    expect(h.x[r]).toContain("dp-match");
    expect(h.y[c]).toContain("dp-match");
  });

  it("krok min: tři čtené sousedé, vybraný soused dp-min a šipka v počítané buňce", () => {
    const s = steps.find(
      (st) =>
        st.line === EDIT_LINE.min &&
        st.state.cur?.[0] === 3 &&
        st.state.cur?.[1] === 3,
    )!.state;
    const m = editCellMarks(s, null);
    expect(m[4][4].cls).toContain("dp-read");
    expect(m[4][3].cls).toContain("dp-read");
    expect(m[3][4].cls).toContain("dp-read");
    // T[4, 4] = min(1 + 1, 1 + 2, 1 + 1): ↘ první ze stejně dobrých
    expect(m[4][4].cls).toContain("dp-min");
    expect(m[3][3].glyph).toBe("↘");
  });

  it("nevyplněné buňky dp-empty; po rekonstrukci cesta dp-path se šipkami tahů", () => {
    expect(editCellMarks(steps[0].state, null)[0][0].cls).toContain("dp-empty");
    const m = editCellMarks(last, null);
    expect(m[0][0].cls).toContain("dp-path");
    expect(m[0][0].glyph).toBe("↘");
    expect(m[4][4].glyph).toBe("→");
    expect(m[7][8].cls).toContain("dp-path");
    expect(m[0][8].cls).not.toContain("dp-path");
  });

  it("výběr podproblému fialově", () => {
    const m = editCellMarks(last, editSelection(last, 4, 5));
    expect(m[4][5].cls).toContain("dp-sel");
    expect(m[7][8].cls).toContain("dp-sel");
  });
});

describe("zarovnání slov podle úprav", () => {
  it("poutník → potemník: sloupec na tah, mezera „–“ u smazání a vložení", () => {
    const a = editAlignment(last.path);
    expect(a.map((k) => k.top).join("")).toBe("pout–ník");
    expect(a.map((k) => k.bottom).join("")).toBe("potemník");
    expect(a.map((k) => k.kind)).toEqual([
      "keep",
      "keep",
      "change",
      "change",
      "insert",
      "keep",
      "keep",
      "keep",
    ]);
  });
});

describe("velikost buněk podle plátna", () => {
  it("1 : 1 = 30 px; delta CanvasFit se rozdělí mezi n + 2 řádků; meze 18 až 64 px a šířka plátna (UX-06: 12 × 12 se vejde do 1280 × 720)", () => {
    expect(editCellSize(0, 7, 8, 2000)).toBe(30);
    expect(editCellSize(90, 7, 8, 2000)).toBe(40);
    expect(editCellSize(-500, 7, 8, 2000)).toBe(18);
    expect(editCellSize(5000, 7, 8, 2000)).toBe(64);
    // úzké plátno: buňka se zmenší do šířky (10 sloupců do 350 px), ne pod 18 px
    expect(editCellSize(90, 7, 8, 350)).toBe(35);
    expect(editCellSize(0, 7, 8, 100)).toBe(18);
    expect(editFitLimits(7)).toEqual({ shrink: 108, grow: 306 });
  });
});
