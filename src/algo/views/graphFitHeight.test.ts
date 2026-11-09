import { describe, expect, it } from "vitest";
import { fitGraphHeight } from "./graphFitHeight";

describe("fitGraphHeight (GRAPH-03)", () => {
  it("volné místo v mezích, zaokrouhlené dolů", () => {
    expect(fitGraphHeight(512.7, 150, 616, null)).toBe(512);
    expect(fitGraphHeight(90, 150, 616, null)).toBe(150);
    expect(fitGraphHeight(900, 150, 616, null)).toBe(616);
  });
  it("změna o méně než 2 px nechá starou výšku (žádné kmitání)", () => {
    expect(fitGraphHeight(401, 150, 616, 400)).toBe(400);
    expect(fitGraphHeight(403, 150, 616, 400)).toBe(403);
  });
});
