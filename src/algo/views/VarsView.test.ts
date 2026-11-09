// VarsView (řádek proměnných pod kresbou): čísla s českou desetinnou čárkou (E3), FFT s tečkou (`point`).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VarsView } from "./ArrayView";

const values = (html: string) =>
  [...html.matchAll(/class="var-value">([^<]*)</g)].map((m) => m[1]);

describe("VarsView – formát čísel (E3)", () => {
  it("desetinná čísla s čárkou, celá a texty beze změny", () => {
    const html = renderToStaticMarkup(
      h(VarsView, { vars: { α: 0.7, n: 12, Φ: -1.5, s: "0.5 (text)" } }),
    );
    expect(values(html)).toEqual(["0,7", "12", "-1,5", "0.5 (text)"]);
  });

  it("point (FFT) ponechá desetinnou tečku", () => {
    const html = renderToStaticMarkup(
      h(VarsView, { vars: { x: 0.25 }, point: true }),
    );
    expect(values(html)).toEqual(["0.25"]);
  });
});
