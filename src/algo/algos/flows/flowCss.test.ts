// CSS toků (oddíl „flows“): editor ani rozbalený import textem neskryjí druhou kresbu a nepřidají třetí
// sloupec (F-03, F-07), kresby pod sebou bez ořezu půl na půl (F-04), „Upravit síť“ na telefonu pod lepící
// hlavičkou (F-12).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const all = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
  .replaceAll("\r\n", "\n")
  .replace(/\/\*(?! ===)[\s\S]*?\*\//g, "");
const flows = all.slice(
  all.indexOf("/* === flows === */"),
  all.indexOf("/* === /flows === */"),
);

/** dvojice [selektor, tělo] všech pravidel (i uvnitř @media) */
function rulesOf(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g))
    for (const sel of m[1].split(","))
      out.push([sel.replace(/\s+/g, " ").trim(), m[2]]);
  return out;
}

describe("CSS toků", () => {
  it("oddíl flows existuje", () => {
    expect(flows.length).toBeGreaterThan(1000);
  });

  it("druhá kresba se nikdy neskryje (ani s rozbaleným Import / export textem) – F-07", () => {
    for (const [sel, body] of rulesOf(all))
      if (/flow-panel-res|flow-panel-heights|gb-heights/.test(sel))
        expect(body, sel).not.toMatch(/display:\s*none/);
  });

  it("editor nepřidá třetí sloupec vedle kreseb (žádný .flow-panel-edit) – F-03", () => {
    expect(all).not.toMatch(/\.flow-panel-edit\b/);
  });

  it("kresby pod sebou: panely se neořezávají (overflow: hidden) – F-04", () => {
    for (const [sel, body] of rulesOf(flows))
      if (sel.includes("flow-stack"))
        expect(body, sel).not.toMatch(/overflow:\s*hidden/);
  });

  it("Goldberg, síť párování vedle sebe: kresba výšek (sloupec na vrchol) má víc šířky než síť – X-02", () => {
    const flex = (panel: string) =>
      rulesOf(flows)
        .filter(
          ([s]) =>
            s.includes(".gb-layout.flow-match") &&
            s.includes(":not(.flow-stack)") &&
            s.endsWith(`> .${panel}`),
        )
        .map(([, b]) => /flex:\s*(\d+)/.exec(b)?.[1])
        .find(Boolean);
    expect(Number(flex("flow-panel-res"))).toBeGreaterThan(
      Number(flex("flow-panel-net")),
    );
  });

  it("kresby pod sebou: lišta editoru sítě a proměnné jsou na řádku titulku – kresbám zbude víc výšky (X-01)", () => {
    const body = (re: RegExp) =>
      rulesOf(flows)
        .filter(([s]) => s.includes(".flow-stack") && re.test(s))
        .map(([, b]) => b)
        .join("\n");
    expect(body(/flow-panel-net .*\.ge-toolbar$/)).toMatch(
      /position:\s*absolute/,
    );
    expect(body(/flow-panel-res > \.vars$/)).toMatch(/position:\s*absolute/);
  });

  it("Goldberg, síť párování: lišta editoru v užším panelu sítě je kompaktní (nepřeteče do kresby výšek)", () => {
    const body = rulesOf(flows)
      .filter(
        ([s]) =>
          s.includes(".gb-layout.flow-match") &&
          s.includes(".flow-panel-net") &&
          s.endsWith("> .ge-toolbar > button"),
      )
      .map(([, b]) => b)
      .join("\n");
    expect(body).toMatch(/font-size:\s*0\.75rem/);
  });

  it("„Upravit síť“ se na telefonu po fokusu posune pod lepící hlavičky webu a modulu – F-12", () => {
    const body = rulesOf(flows)
      .filter(([s]) => s === ".algo-root .flow-edit-net")
      .map(([, b]) => b)
      .join("\n");
    expect(body).toMatch(/scroll-margin-top:\s*calc\(/);
    expect(body).toMatch(/--algo-site-header-space/);
  });
});
