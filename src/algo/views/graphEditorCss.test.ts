// Pravidla index.css pro editor grafu (oprava 8. 11. 2026): sloupec výsledku se při „Import / export
// textem“ neschovává (G-02), lišta editoru má v běhu i v editoru jeden řádek (G-03).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8")
  .replaceAll("\r\n", "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** pravidla (selektor → tělo), jejichž selektor obsahuje `part` */
function rules(part: string): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const sel = m[1].trim();
    if (sel.includes(part)) out.push({ sel, body: m[2] });
  }
  return out;
}

describe("index.css – editor grafu", () => {
  it("otevřený Import / export textem neschová sloupec výsledku grafu (G-02)", () => {
    for (const r of rules(".graph-result"))
      for (const sel of r.sel.split(",").map((s) => s.trim()))
        // cílem pravidla je sám sloupec (ne návod uvnitř něj)
        if (sel.includes("ge-text") && /\.graph-result$/.test(sel))
          expect(r.body, sel).not.toMatch(/display:\s*none/);
  });

  it("hradla: sloupec výsledku obvodu při otevřeném textu dál ustupuje (část pro CircuitEditor beze změny)", () => {
    expect(
      rules(".circuit-result").some(
        (r) =>
          r.sel.includes(".ce-text[open]") && /display:\s*none/.test(r.body),
      ),
    ).toBe(true);
  });

  it("lišta editoru grafu se nezalamuje (stejná výška v běhu i v editoru) a na telefonu nezajede pod hlavičku (G-03)", () => {
    const bar = rules(".graph-editor > .ge-toolbar");
    expect(bar.some((r) => /flex-wrap:\s*nowrap/.test(r.body))).toBe(true);
    expect(
      bar.some((r) =>
        /scroll-margin-top:[^;]*--algo-site-header-space/.test(r.body),
      ),
    ).toBe(true);
  });
  it("panel editoru nemění šířku sloupce ani u prázdného grafu (bez výsledku) – první vrchol kresbu neroztáhne (G-01)", () => {
    expect(
      rules(".ge-panel-slot").some(
        (r) =>
          /\.graph-result\s*>\s*\.ge-panel-slot$/.test(r.sel) &&
          /contain:\s*inline-size/.test(r.body),
      ),
    ).toBe(true);
    expect(
      rules(".graph-result").some(
        (r) =>
          /\.algo-root \.graph-result$/.test(r.sel) &&
          /min-width:\s*\d/.test(r.body),
      ),
    ).toBe(true);
  });
});
